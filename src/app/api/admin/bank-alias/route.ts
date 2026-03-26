import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

// GET — devuelve todos los alias activos (también se usa en billetera pública)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true'; // admin ve inactivos también

  const db = sbAdmin();
  let query = db
    .from('bank_alias')
    .select('id, bank_name, alias, extra_info, is_active, updated_at')
    .order('id', { ascending: true });

  if (!all) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — crear nuevo alias (solo admin)
export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const { bank_name, alias, extra_info } = body;
  if (!bank_name || !alias) {
    return NextResponse.json({ error: 'bank_name y alias son requeridos' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data, error } = await db
    .from('bank_alias')
    .insert({ bank_name: bank_name.trim(), alias: alias.trim(), extra_info: extra_info?.trim() || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — editar alias existente (solo admin)
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const { id, bank_name, alias, extra_info, is_active } = body;
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (bank_name !== undefined) updates.bank_name = bank_name.trim();
  if (alias !== undefined) updates.alias = alias.trim();
  if (extra_info !== undefined) updates.extra_info = extra_info?.trim() || null;
  if (is_active !== undefined) updates.is_active = is_active;

  const db = sbAdmin();
  const { data, error } = await db
    .from('bank_alias')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — eliminar alias (solo admin)
export async function DELETE(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const db = sbAdmin();
  const { error } = await db.from('bank_alias').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
