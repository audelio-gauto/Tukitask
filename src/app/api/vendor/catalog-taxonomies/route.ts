import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

type TaxonomyType = 'category' | 'brand' | 'attribute' | 'tag';

const VALID_TYPES: TaxonomyType[] = ['category', 'brand', 'attribute', 'tag'];

function isValidType(type: string): type is TaxonomyType {
  return VALID_TYPES.includes(type as TaxonomyType);
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

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
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}