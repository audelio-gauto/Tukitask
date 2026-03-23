import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(url, key);
};

/** GET /api/client-profile?email=... */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('client_profiles')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/** POST /api/client-profile — upsert profile fields (display_name, phone, photo_url) */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, ...fields } = body;
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    // Only allow safe fields (prevent overwriting avg_rating/total_ratings via this endpoint)
    const { display_name, phone, photo_url } = fields;
    const update: Record<string, unknown> = { email: email.toLowerCase(), updated_at: new Date().toISOString() };
    if (display_name !== undefined) update.display_name = display_name;
    if (phone !== undefined) update.phone = phone;
    if (photo_url !== undefined) update.photo_url = photo_url;

    const sb = getSupabase();
    const { error } = await sb.from('client_profiles').upsert(update, { onConflict: 'email' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
