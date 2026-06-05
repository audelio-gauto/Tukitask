import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

// GET — devuelve los datos bancarios del vendedor autenticado
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const db = sbAdmin();
  const { data, error } = await db
    .from('vendor_bank_data')
    .select('banco, cuenta, alias, titular, tipo_cuenta, updated_at')
    .eq('vendor_email', user.email)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}

// PUT — guarda (upsert) datos bancarios del vendedor autenticado
export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { banco, cuenta, alias, titular, tipo_cuenta } = body as Record<string, string>;

  const payload = {
    vendor_email: user.email,
    banco:        (banco       ?? '').trim().slice(0, 100),
    cuenta:       (cuenta      ?? '').trim().slice(0, 100),
    alias:        (alias       ?? '').trim().slice(0, 100),
    titular:      (titular     ?? '').trim().slice(0, 150),
    tipo_cuenta:  (tipo_cuenta ?? '').trim().slice(0, 80),
    updated_at:   new Date().toISOString(),
  };

  const db = sbAdmin();
  const { error } = await db
    .from('vendor_bank_data')
    .upsert(payload, { onConflict: 'vendor_email' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
