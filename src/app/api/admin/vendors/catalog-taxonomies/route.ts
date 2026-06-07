import { NextResponse } from 'next/server';
import { getAuthAdmin, sbAdmin, unauthorized } from '@/lib/apiAuth';

type TaxonomyType = 'category' | 'brand' | 'attribute' | 'tag';

const VALID_TYPES: TaxonomyType[] = ['category', 'brand', 'attribute', 'tag'];

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isValidType(type: string): type is TaxonomyType {
  return VALID_TYPES.includes(type as TaxonomyType);
}

export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') ?? '').trim();
  const q = (searchParams.get('q') ?? '').trim();

  if (!isValidType(type)) {
    return NextResponse.json({ error: 'type invalido' }, { status: 400 });
  }

  const db = sbAdmin();
  let query = db
    .from('vendor_catalog_taxonomies')
    .select('id, taxonomy_type, name, slug, description, is_active, sort_order, created_at, updated_at')
    .eq('taxonomy_type', type)
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
  const type = (body.type ?? '').trim();
  const name = (body.name ?? '').trim();
  const description = (body.description ?? '').trim();

  if (!isValidType(type)) return NextResponse.json({ error: 'type invalido' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 });

  const slug = toSlug(body.slug?.trim() || name);
  if (!slug) return NextResponse.json({ error: 'slug invalido' }, { status: 400 });

  const db = sbAdmin();
  const { data: row, error } = await db
    .from('vendor_catalog_taxonomies')
    .insert({
      taxonomy_type: type,
      name: name.slice(0, 120),
      slug,
      description: description ? description.slice(0, 500) : null,
      is_active: body.is_active !== false,
      sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
      updated_at: new Date().toISOString(),
    })
    .select('id, taxonomy_type, name, slug, description, is_active, sort_order, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const body = await req.json();
  const id = Number(body.id);
  const type = (body.type ?? '').trim();

  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'id invalido' }, { status: 400 });
  if (!isValidType(type)) return NextResponse.json({ error: 'type invalido' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 120);
  if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 500) || null;
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (Number.isFinite(body.sort_order)) patch.sort_order = Number(body.sort_order);
  if (typeof body.slug === 'string' && body.slug.trim()) patch.slug = toSlug(body.slug.trim());
  if (!patch.slug && patch.name) patch.slug = toSlug(patch.name);

  const db = sbAdmin();
  const { data: row, error } = await db
    .from('vendor_catalog_taxonomies')
    .update(patch)
    .eq('id', id)
    .eq('taxonomy_type', type)
    .select('id, taxonomy_type, name, slug, description, is_active, sort_order, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: row });
}

export async function DELETE(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  const type = (searchParams.get('type') ?? '').trim();

  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'id invalido' }, { status: 400 });
  if (!isValidType(type)) return NextResponse.json({ error: 'type invalido' }, { status: 400 });

  const db = sbAdmin();
  const { error } = await db
    .from('vendor_catalog_taxonomies')
    .delete()
    .eq('id', id)
    .eq('taxonomy_type', type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
