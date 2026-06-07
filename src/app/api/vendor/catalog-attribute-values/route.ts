import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const attributeId = Number(searchParams.get('attribute_id'));

  if (!Number.isFinite(attributeId) || attributeId <= 0) {
    return NextResponse.json({ error: 'attribute_id invalido' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data, error } = await db
    .from('vendor_attribute_values')
    .select('id, attribute_id, name, slug, is_active, sort_order, created_at, updated_at')
    .eq('attribute_id', attributeId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}