import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ admin: false }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ admin: false }, { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey);
    const emailNormalized = String(email).toLowerCase();
    // Use case-insensitive match (ilike) to avoid failures from email casing differences
    const { data, error } = await sb.from('users').select('role').ilike('email', emailNormalized).maybeSingle();
    if (error) return NextResponse.json({ admin: false }, { status: 200 });
    return NextResponse.json({ admin: data?.role === 'admin' });
  } catch (err) {
    return NextResponse.json({ admin: false }, { status: 500 });
  }
}
