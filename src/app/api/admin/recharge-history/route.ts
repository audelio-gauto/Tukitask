import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const role     = searchParams.get('role')      || 'all';   // all | driver | tecnico
  const status   = searchParams.get('status')    || 'all';   // all | pending | approved | rejected
  const dateFrom = searchParams.get('date_from') || null;
  const dateTo   = searchParams.get('date_to')   || null;
  const search   = searchParams.get('search')    || '';
  const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const offset = (page - 1) * limit;

  const db = sbAdmin();

  try {
    // ── 1. If role filter is set, resolve matching emails first ──────────────
    let emailFilter: string[] | null = null;
    if (role !== 'all') {
      const { data: roleUsers, error: roleErr } = await db
        .from('users')
        .select('email')
        .eq('role', role);
      if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
      const emails = (roleUsers || []).map((u: any) => u.email.toLowerCase());
      if (emails.length === 0) {
        return NextResponse.json({ data: [], total: 0, page, limit, stats: { total: 0, pending: 0, approved: 0, rejected: 0, total_amount_approved: 0, total_amount_pending: 0 } });
      }
      emailFilter = emails;
    }

    // ── 2. Query recharge_requests with filters ──────────────────────────────
    let query = (db as any)
      .from('recharge_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   query = query.lte('created_at', `${dateTo}T23:59:59`);
    if (search)   query = query.ilike('driver_email', `%${search}%`);
    if (emailFilter) query = query.in('driver_email', emailFilter);

    const { data: requests, error: reqErr, count } = await query;
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });

    if (!requests || requests.length === 0) {
      return NextResponse.json({ data: [], total: count ?? 0, page, limit, stats: { total: 0, pending: 0, approved: 0, rejected: 0, total_amount_approved: 0, total_amount_pending: 0 } });
    }

    // ── 3. Fetch summary stats (full count, not paginated) ───────────────────
    let statsQuery = (db as any).from('recharge_requests').select('status, amount');
    if (emailFilter) statsQuery = statsQuery.in('driver_email', emailFilter);
    if (dateFrom) statsQuery = statsQuery.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   statsQuery = statsQuery.lte('created_at', `${dateTo}T23:59:59`);
    if (search)   statsQuery = statsQuery.ilike('driver_email', `%${search}%`);
    const { data: statsRows } = await statsQuery;

    const stats = (statsRows || []).reduce((acc: any, r: any) => {
      acc.total++;
      if (r.status === 'approved') { acc.approved++; acc.total_amount_approved += Number(r.amount); }
      else if (r.status === 'pending') { acc.pending++; acc.total_amount_pending += Number(r.amount); }
      else if (r.status === 'rejected') acc.rejected++;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, total_amount_approved: 0, total_amount_pending: 0 });

    // ── 4. Enrich with profile data ──────────────────────────────────────────
    const emails = [...new Set((requests as any[]).map((r: any) => r.driver_email.toLowerCase()))];

    const [usersRes, driverRes, tecnicoRes] = await Promise.all([
      db.from('users').select('email, role').in('email', emails),
      db.from('driver_profiles').select('email, first_name, last_name, phone').in('email', emails),
      db.from('tecnico_settings').select('email, first_name, last_name, phone').in('email', emails),
    ]);

    const roleMap: Record<string, string> = {};
    ((usersRes as any).data || []).forEach((u: any) => { roleMap[u.email.toLowerCase()] = u.role; });

    const driverMap: Record<string, any> = {};
    ((driverRes as any).data || []).forEach((p: any) => { driverMap[p.email.toLowerCase()] = p; });

    const tecnicoMap: Record<string, any> = {};
    ((tecnicoRes as any).data || []).forEach((p: any) => { tecnicoMap[p.email.toLowerCase()] = p; });

    const enriched = (requests as any[]).map((r: any) => {
      const emailLower = r.driver_email.toLowerCase();
      const userRole = roleMap[emailLower] || 'driver';
      const profile = userRole === 'tecnico' ? tecnicoMap[emailLower] : driverMap[emailLower];
      return {
        ...r,
        role: userRole,
        first_name: profile?.first_name ?? null,
        last_name:  profile?.last_name  ?? null,
        phone:      profile?.phone      ?? null,
      };
    });

    return NextResponse.json({ data: enriched, total: count ?? 0, page, limit, stats });
  } catch (err) {
    console.error('[recharge-history]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
