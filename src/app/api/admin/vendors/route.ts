import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET /api/admin/vendors?page=1&limit=25&search=email&status=all
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')   || '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '25'));
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const offset = (page - 1) * limit;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = sbAdmin() as any;

    let query = db
      .from('users')
      .select('id, email, role, created_at', { count: 'exact' })
      .eq('role', 'vendedor')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data: vendors, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Weekly stat: vendors registered in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newThisWeek } = await db
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'vendedor')
      .gte('created_at', weekAgo);

    // Suspension status for these vendors
    const ids = (vendors || []).map((v: any) => v.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suspMap = new Map<string, any>();
    if (ids.length > 0) {
      const { data: suspRows } = await db
        .from('user_suspensions')
        .select('user_id, is_suspended, is_blocked, is_active, suspension_reason, banned_until')
        .in('user_id', ids);
      (suspRows || []).forEach((s: any) => suspMap.set(s.user_id, s));
    }

    const data = (vendors || []).map((v: any) => ({
      ...v,
      ...(suspMap.get(v.id) ?? { is_suspended: false, is_blocked: false, is_active: true }),
    }));

    return NextResponse.json({
      data,
      total: count ?? 0,
      newThisWeek: newThisWeek ?? 0,
      page,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
