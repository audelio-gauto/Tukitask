import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase env vars for tecnico settings API');
}

const sb = createClient(supabaseUrl ?? '', serviceKey ?? '');

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email') || '';
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    const emailNormalized = email.toLowerCase();
    const { data, error } = await sb.from('tecnico_settings').select('*').eq('email', emailNormalized).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ settings: null });
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('GET /api/tecnico/settings error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    const emailNormalized = String(email).toLowerCase();
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
    const { data, error } = await sb.from('tecnico_settings').upsert(payload, { onConflict: 'email' }).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error('POST /api/tecnico/settings error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
