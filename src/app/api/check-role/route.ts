import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    let parsed: any;
    try {
      parsed = JSON.parse(bodyText);
    } catch (parseErr) {
      console.error('Invalid JSON body received:', bodyText);
      return NextResponse.json({ role: null, error: 'Invalid JSON', body: bodyText }, { status: 400 });
    }
    const { email } = parsed;
    let parsed: any;
    try {
      parsed = JSON.parse(bodyText);
    } catch (parseErr) {
      console.error('Invalid JSON body received:', bodyText);
      return NextResponse.json({ role: null, error: 'Invalid JSON', body: bodyText }, { status: 400 });
    }
    const { email } = parsed;
    if (!email) return NextResponse.json({ role: null, error: 'Missing email in body' }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
      return NextResponse.json({ role: null, error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
    }
    if (!serviceKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json({ role: null, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    try {
      const sb = createClient(supabaseUrl, serviceKey);
      const emailNormalized = String(email).toLowerCase();
      const { data, error } = await sb.from('users').select('role').ilike('email', emailNormalized).maybeSingle();
      if (error) {
        console.error('Supabase query error:', error);
        return NextResponse.json({ role: null, error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ role: null, error: 'User not found' }, { status: 200 });
      }
      return NextResponse.json({ role: data.role });
    } catch (dbErr) {
      console.error('Supabase client error:', dbErr);
      return NextResponse.json({ role: null, error: String(dbErr) }, { status: 500 });
    }
  } catch (err) {
    console.error('Route error:', err);
    return NextResponse.json({ role: null, error: String(err) }, { status: 500 });
  }
}
