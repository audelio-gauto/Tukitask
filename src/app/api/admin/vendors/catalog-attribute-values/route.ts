import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const attributeId = Number(searchParams.get('attribute_id'));
  const q = (searchParams.get('q') ?? '').trim();

  if (!Number.isFinite(attributeId) || attributeId <= 0) {
    return NextResponse.json({ error: 'attribute_id invalido' }, { status: 400 });
  }

  const db = sbAdmin();
  let query = db
    .from('vendor_attribute_values')
    .select('id, attribute_id, name, slug, is_active, sort_order, created_at, updated_at')
    .eq('attribute_id', attributeId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const attributeId = Number(body.attribute_id);
  const name = (body.name ?? '').trim();

  if (!Number.isFinite(attributeId) || attributeId <= 0) {
    return NextResponse.json({ error: 'attribute_id invalido' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 });

  const slug = toSlug((body.slug ?? '').trim() || name);
  if (!slug) return NextResponse.json({ error: 'slug invalido' }, { status: 400 });

  const db = sbAdmin();

  const { data: attr, error: attrError } = await db
    .from('vendor_catalog_taxonomies')
    .select('id, taxonomy_type')
    .eq('id', attributeId)
    .maybeSingle();

  if (attrError) return NextResponse.json({ error: attrError.message }, { status: 500 });
  if (!attr || attr.taxonomy_type !== 'attribute') {
    return NextResponse.json({ error: 'attribute_id no corresponde a un atributo' }, { status: 400 });
  }

  const { data: row, error } = await db
    .from('vendor_attribute_values')
    .insert({
      attribute_id: attributeId,
      name: name.slice(0, 120),
      slug,
      is_active: body.is_active !== false,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      updated_at: new Date().toISOString(),
    })
    .select('id, attribute_id, name, slug, is_active, sort_order, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const id = Number(body.id);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'id invalido' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 120);
  if (typeof body.slug === 'string' && body.slug.trim()) patch.slug = toSlug(body.slug.trim());
  if (!patch.slug && patch.name) patch.slug = toSlug(patch.name);
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (Number.isFinite(body.sort_order)) patch.sort_order = Number(body.sort_order);

  const db = sbAdmin();
  const { data: row, error } = await db
    .from('vendor_attribute_values')
    .update(patch)
    .eq('id', id)
    .select('id, attribute_id, name, slug, is_active, sort_order, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: row });
}

export async function DELETE(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'id invalido' }, { status: 400 });
  }

  const db = sbAdmin();
  const { error } = await db
    .from('vendor_attribute_values')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
