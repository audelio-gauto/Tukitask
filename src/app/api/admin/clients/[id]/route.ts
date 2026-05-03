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

    if (userErr || !user) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const [profileRes, ordersRes, totalOrdersRes, ratingsGivenRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('client_profiles')
        .select('email, display_name, phone, photo_url, avg_rating, total_ratings')
        .eq('email', user.email)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('orders')
        .select('id, status, offer, suggested_price, pickup_address, dropoff_address, accepted_by, created_at')
        .eq('client_email', user.email)
        .order('created_at', { ascending: false })
        .limit(10),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_email', user.email),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sbAdmin() as any)
        .from('ratings')
        .select('score, comment, rated_email, created_at')
        .eq('rater_email', user.email)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      user,
      profile: profileRes.data ?? null,
      recent_orders: ordersRes.data ?? [],
      total_orders: totalOrdersRes.count ?? 0,
      ratings_given: ratingsGivenRes.data ?? [],
    });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  let body: { display_name?: string; phone?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Get user email first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user } = await (sbAdmin() as any)
    .from('users')
    .select('email')
    .eq('id', id)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  const updates: Record<string, string> = {};
  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.phone !== undefined) updates.phone = body.phone;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sbAdmin() as any)
    .from('client_profiles')
    .update(updates)
    .eq('email', user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
