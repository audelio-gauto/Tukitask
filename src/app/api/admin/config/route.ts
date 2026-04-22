import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

async function authorizeAdmin(req: Request) {
  const auth = (req.headers.get('authorization') || '').trim();
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.split(' ')[1];
  if (!token) return false;
  try {
    const client = sb();
    // @ts-ignore
    const { data: { user } } = await client.auth.getUser(token);
    if (!user) return false;
    const { data } = await client.from('users').select('role').eq('id', user.id).maybeSingle();
    return ['admin', 'super_admin', 'owner'].includes(data?.role ?? '');
  } catch { return false; }
}

// Claves que se exponen públicamente (usadas en login page y PWA manifest)
const PUBLIC_KEYS = new Set(['logo_url', 'logo_size', 'pwa_icon_192', 'pwa_icon_512']);

// GET /api/admin/config  → sin auth: solo claves públicas; con auth admin: todo
export async function GET(req: Request) {
  const isAdmin = await authorizeAdmin(req);

  const { data, error } = await sb()
    .from('app_config')
    .select('key, value');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config: Record<string, string> = {};
  (data ?? []).forEach(row => {
    if (isAdmin || PUBLIC_KEYS.has(row.key)) {
      config[row.key] = row.value;
    }
  });
  return NextResponse.json(config);
}

// POST /api/admin/config  body: { key: string, value: string }  — solo admin
export async function POST(req: Request) {
  if (!await authorizeAdmin(req))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
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
