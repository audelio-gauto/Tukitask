import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/apiAuth';

// GET /api/tienda/products — public product listing with optional filters
// ?q=        full-text search (name or category)
// ?vendor_id= filter by vendor UUID
// ?category=  filter by category
// ?limit=     max results (default 60, max 100)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Escape PostgREST ilike wildcards to prevent filter injection
  const rawQ     = searchParams.get('q')?.trim() ?? '';
  const q        = rawQ.replace(/[%_\\]/g, '\\$&');
  const vendorId = searchParams.get('vendor_id') ?? '';
  const category = searchParams.get('category') ?? '';
  const limit    = Math.min(100, Number(searchParams.get('limit') || '60'));

  const db = sbAdmin();
  let query = db
    .from('products')
    .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image, short_description, negotiable')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (q)                          query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`);
  if (vendorId)                   query = query.eq('vendor_id', vendorId);
  if (category && category !== 'Todos') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data ?? [] });
}
