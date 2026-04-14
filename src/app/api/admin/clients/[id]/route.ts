import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { id } = params;
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user, error: userErr } = await (sbAdmin() as any)
      .from('users')
      .select('id, email, role, created_at')
      .eq('id', id)
      .maybeSingle();

    if (userErr || !user) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const [profileRes, ordersRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('client_profiles')
        .select('email, display_name, phone, photo_url, avg_rating, total_ratings')
        .eq('email', user.email)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('orders')
        .select('id, status, accepted_price, offer_price, suggested_price, pickup_address, dropoff_address, created_at')
        .eq('client_email', user.email)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({
      user,
      profile: profileRes.data ?? null,
      recent_orders: ordersRes.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
