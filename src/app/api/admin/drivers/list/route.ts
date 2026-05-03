import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page         = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit        = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const search       = (searchParams.get('search') || '').trim().slice(0, 100);
  const inactiveDays = parseInt(searchParams.get('inactive_days') || '0');
  const offset       = (page - 1) * limit;

  try {
    const db = sbAdmin() as any;

    // If inactive_days filter: find emails with no driver_location update in that window
    let inactiveEmails: string[] | null = null;
    if (inactiveDays > 0) {
      const cutoff = new Date(Date.now() - inactiveDays * 86400000).toISOString();
      // Drivers that have a location record but it's older than cutoff, OR have no record at all
      const { data: recentLocs } = await db
        .from('driver_locations')
        .select('driver_email')
        .gte('updated_at', cutoff);
      const activeSet = new Set((recentLocs || []).map((r: any) => r.driver_email));

      // Also check via orders: drivers who accepted an order recently
      const { data: recentOrders } = await db
        .from('orders')
        .select('accepted_by')
        .not('accepted_by', 'is', null)
        .gte('updated_at', cutoff);
      (recentOrders || []).forEach((o: any) => { if (o.accepted_by) activeSet.add(o.accepted_by); });

      // We'll get all driver emails first and exclude active ones
      const { data: allDriverUsers } = await db
        .from('users')
        .select('email')
        .eq('role', 'driver');
      inactiveEmails = (allDriverUsers || []).map((u: any) => u.email).filter((e: string) => !activeSet.has(e));
      if ((inactiveEmails as string[]).length === 0) {
        return NextResponse.json({ data: [], total: 0, page, limit });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = db
      .from('users')
      .select('id,email,role,created_at', { count: 'exact' })
      .eq('role', 'driver')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }
    if (inactiveEmails) {
      query = query.in('email', inactiveEmails);
    }

    const { data: users, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with driver_profiles
    const emails = (users || []).map((u: any) => u.email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>();
    if (emails.length > 0) {
      const { data: profiles } = await db
        .from('driver_profiles')
        .select('email, first_name, last_name, transport_mode, profile_photo, verification_status, verified, avg_rating')
        .in('email', emails);
      (profiles || []).forEach((p: any) => profileMap.set(p.email, p));
    }

    const data = (users || []).map((u: any) => ({ ...u, ...(profileMap.get(u.email) ?? {}) }));
    return NextResponse.json({ data, total: count ?? 0, page, limit });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
