import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/** GET — look up a user by email, return id + role + profile info */
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const email = (searchParams.get('email') || '').trim().toLowerCase().slice(0, 200);

  if (!email) {
    return NextResponse.json({ error: 'email requerido' }, { status: 400 });
  }

  try {
    const db = sbAdmin();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user, error: userErr } = await (db as any)
      .from('users')
      .select('id, email, role, created_at')
      .eq('email', email)
      .maybeSingle();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Try to get profile info
    let profile: Record<string, unknown> | null = null;
    if (user.role === 'driver') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db as any)
        .from('driver_profiles')
        .select('first_name, last_name, profile_photo, transport_mode, avg_rating, verified')
        .eq('email', email)
        .maybeSingle();
      profile = data;
    } else if (user.role === 'tecnico') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db as any)
        .from('driver_profiles')
        .select('first_name, last_name, profile_photo')
        .eq('email', email)
        .maybeSingle();
      profile = data;
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      first_name: profile?.first_name || null,
      last_name: profile?.last_name || null,
      profile_photo: profile?.profile_photo || null,
      display_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
    });
  } catch (err) {
    console.error('[admin/users/lookup]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
