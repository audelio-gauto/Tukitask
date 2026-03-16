import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ role: null }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ role: null }, { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey);
    const emailNormalized = String(email).toLowerCase();
    const { data, error } = await sb.from('users').select('role').ilike('email', emailNormalized).maybeSingle();
    if (error || !data) return NextResponse.json({ role: null });
    return NextResponse.json({ role: data.role });
  } catch {
    return NextResponse.json({ role: null }, { status: 500 });
  }
}
