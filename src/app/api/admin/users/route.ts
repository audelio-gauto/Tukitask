import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const search = (searchParams.get('search') || '').trim().slice(0, 100);
  const role   = (searchParams.get('role') || '').trim();
  const offset = (page - 1) * limit;
  const validRoles = ['admin', 'super_admin', 'owner', 'driver', 'vendedor', 'servicio', 'hoteleria', 'cliente', 'tecnico'];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sbAdmin() as any)
      .from('users')
      .select('id,email,role,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }
    if (role && validRoles.includes(role)) {
      query = query.eq('role', role);
    }

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    
    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit });
  } catch (err) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
