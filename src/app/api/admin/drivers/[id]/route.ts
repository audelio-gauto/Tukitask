import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user, error: userErr } = await (sbAdmin() as any)
      .from('users')
      .select('id, email, role, created_at')
      .eq('id', id)
      .maybeSingle();

    if (userErr || !user) return NextResponse.json({ error: 'Driver no encontrado' }, { status: 404 });

    const [profileRes, ordersRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('driver_profiles')
        .select('email, first_name, last_name, transport_mode, profile_photo, avg_rating, total_ratings, verification_status, verified, verified_at, subscription_active, subscription_plan, subscription_expires_at, custom_commission_pct, custom_commission_fixed')
        .eq('email', user.email)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('orders')
        .select('id, status, offer, suggested_price, created_at')
        .eq('accepted_by', user.email)
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
