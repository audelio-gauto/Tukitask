import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';

// GET — abierto (perfil público del driver)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    const { data, error } = await sbAdmin()
      .from('driver_profiles')
      .select('email, first_name, last_name, phone, profile_photo, avg_rating, total_ratings, transport_mode, vehicle_type, license_plate, acceptance_rate, avg_response_seconds, service_filters, pickup_range, delivery_range, nav_app, verified')
      .ilike('email', email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// POST — solo el driver autenticado puede editar su propio perfil
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { email, ...profile } = body;
    const emailNormalized = (email || '').toLowerCase();
    if (!emailNormalized) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    if (emailNormalized !== user.email) return forbidden();

    const { error } = await sbAdmin()
      .from('driver_profiles')
      .upsert({ email: emailNormalized, ...profile }, { onConflict: 'email' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
