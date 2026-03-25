import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

// GET /api/admin/config  → { logo_url, logo_size, ... }
export async function GET() {
  const { data, error } = await sb()
    .from('app_config')
    .select('key, value');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config: Record<string, string> = {};
  (data ?? []).forEach(row => { config[row.key] = row.value; });
  return NextResponse.json(config);
}

// POST /api/admin/config  body: { key: string, value: string }
export async function POST(req: Request) {
  try {
    const { key, value } = await req.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    const { error } = await sb()
      .from('app_config')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
