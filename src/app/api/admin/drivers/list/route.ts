import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Missing supabase env vars' }, { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceKey);
    // Fetch users with role like 'driver' (case-insensitive)
    const { data, error } = await sb.from('users').select('id,email,full_name,role').ilike('role', 'driver%');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
