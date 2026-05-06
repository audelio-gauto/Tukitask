import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email') || '';
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    const emailNormalized = email.toLowerCase();
    const { data, error } = await sbAdmin()
      .from('tecnico_settings')
      .select('*')
      .eq('email', emailNormalized)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return NextResponse.json({ settings: null });
    return NextResponse.json({ settings: data });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    const emailNormalized = String(email).toLowerCase();
    if (emailNormalized !== user.email) return forbidden();

    const payload: Record<string, unknown> = {
      email: emailNormalized,
      updated_at: new Date().toISOString(),
    };
    // Extended profile fields
    const fields: Record<string, string> = {
      gender: 'gender',
      first_name: 'first_name',
      last_name: 'last_name',
      phone: 'phone',
      company: 'company',
      address: 'address',
      city: 'city',
      profile_photo: 'profile_photo',
      theme_mode: 'theme_mode',
      nav_app: 'nav_app',
      transport_mode: 'transport_mode',
      vehicle_type: 'vehicle_type',
      license_plate: 'license_plate',
    };
    for (const [bodyKey, colKey] of Object.entries(fields)) {
      if (body[bodyKey] !== undefined) payload[colKey] = body[bodyKey];
    }
    if (body.pickup_range !== undefined) payload.pickup_range = body.pickup_range !== null ? Number(body.pickup_range) : null;
    if (body.accepts_packages !== undefined) payload.accepts_packages = Boolean(body.accepts_packages);
    if (body.accepted_services !== undefined && typeof body.accepted_services === 'object') payload.accepted_services = body.accepted_services;
    const { data, error } = await sbAdmin().from('tecnico_settings').upsert(payload, { onConflict: 'email' }).select().maybeSingle();
    if (error) return serverError(error);
    return NextResponse.json({ settings: data });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
