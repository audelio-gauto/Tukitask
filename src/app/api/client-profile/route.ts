import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';

/** GET /api/client-profile?email=... — abierto */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    const { data, error } = await sbAdmin()
      .from('client_profiles')
      .select('email, display_name, phone, photo_url, avg_rating, total_ratings, is_verified, created_at, updated_at')
      .ilike('email', email)
      .maybeSingle();

    if (error) return NextResponse.json({ profile: null });
    return NextResponse.json({ profile: data });
  } catch {
    return NextResponse.json({ profile: null });
  }
}

/** POST /api/client-profile — solo el cliente autenticado puede editar su propio perfil */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { email, ...fields } = body;
    const emailNormalized = (email || '').toLowerCase();
    if (!emailNormalized) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    if (emailNormalized !== user.email) return forbidden();

    // Solo campos seguros — no se puede sobrescribir avg_rating/total_ratings
    const { display_name, phone, photo_url } = fields;
    const update: Record<string, unknown> = { email: emailNormalized, updated_at: new Date().toISOString() };
    if (display_name !== undefined) update.display_name = display_name;
    if (phone !== undefined) update.phone = phone;
    if (photo_url !== undefined) update.photo_url = photo_url;

    const { error } = await sbAdmin().from('client_profiles').upsert(update, { onConflict: 'email' });
    if (error) return serverError(error);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
