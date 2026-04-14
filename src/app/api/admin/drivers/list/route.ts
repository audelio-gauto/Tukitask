import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const offset = (page - 1) * limit;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sbAdmin() as any)
      .from('users')
      .select('id,email,role,created_at', { count: 'exact' })
      .eq('role', 'driver')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data: users, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with driver_profiles
    const emails = (users || []).map((u: any) => u.email);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileMap = new Map<string, any>();
    if (emails.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles } = await (sbAdmin() as any)
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
