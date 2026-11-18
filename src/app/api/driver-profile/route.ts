import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';

// GET — requires auth: own profile or a driver the user has an order with
export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const email = (searchParams.get('email') || '').toLowerCase();
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    if (email !== user.email) {
      const { data: related } = await sbAdmin()
        .from('orders')
        .select('id')
        .eq('client_email', user.email)
        .ilike('accepted_by', email)
        .limit(1);
      if (!related?.length) return forbidden('No autorizado');
    }

    const { data, error } = await sbAdmin()
      .from('driver_profiles')
      .select('email, first_name, last_name, phone, tigo_money_alias, profile_photo, avg_rating, total_ratings, transport_mode, vehicle_type, license_plate, acceptance_rate, avg_response_seconds, service_filters, pickup_range, nav_app, verified')
      .ilike('email', email)
      .maybeSingle();
    if (error) return serverError(error);
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
    const emailNormalized = (body.email || '').toLowerCase();
    if (!emailNormalized) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    if (emailNormalized !== user.email) return forbidden();

    // Whitelist: never accept verified, avg_rating, total_ratings or other
    // trust fields from the client — those are admin/system managed.
    const str = (v: unknown, max = 120): string | null =>
      typeof v === 'string' ? v.trim().slice(0, max) : null;
    const profile: Record<string, unknown> = {};
    if (body.first_name !== undefined)      profile.first_name = str(body.first_name, 80);
    if (body.last_name !== undefined)       profile.last_name = str(body.last_name, 80);
    if (body.phone !== undefined)           profile.phone = str(body.phone, 30);
    if (body.tigo_money_alias !== undefined) profile.tigo_money_alias = str(body.tigo_money_alias, 80);
    if (body.profile_photo !== undefined)   profile.profile_photo = str(body.profile_photo, 1000);
    if (body.transport_mode !== undefined)  profile.transport_mode = str(body.transport_mode, 30);
    if (body.vehicle_type !== undefined)    profile.vehicle_type = str(body.vehicle_type, 2000);
    if (body.license_plate !== undefined)   profile.license_plate = str(body.license_plate, 20);
    if (body.nav_app !== undefined)         profile.nav_app = str(body.nav_app, 30);
    if (body.pickup_range !== undefined) {
      const range = Number(body.pickup_range);
      profile.pickup_range = Number.isFinite(range) ? Math.min(500, Math.max(0, range)) : null;
    }
    if (body.service_filters !== undefined) {
      const raw = body.service_filters;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const filters: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(raw).slice(0, 50)) {
          if (typeof k === 'string' && typeof v === 'boolean') filters[k.slice(0, 40)] = v;
        }
        profile.service_filters = filters;
      }
    }

    if (Object.keys(profile).length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
    }

    const { error } = await sbAdmin()
      .from('driver_profiles')
      .upsert({ email: emailNormalized, ...profile }, { onConflict: 'email' });
    if (error) return serverError(error);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
