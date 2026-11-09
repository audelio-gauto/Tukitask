import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('available' in body) || typeof body.available !== 'boolean') {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }
  const db = sbAdmin();
  const { data: role, error: roleError } = await db.from('users').select('role').eq('email', user.email).maybeSingle();
  if (roleError) return serverError(roleError, 'driver-availability role');
  if (role?.role !== 'driver') return forbidden();
  const { error } = await db.from('driver_profiles')
    .upsert({ email: user.email, accepting_orders: body.available }, { onConflict: 'email' });
  if (error) return serverError(error, 'driver-availability');
  return NextResponse.json({ available: body.available });
}
