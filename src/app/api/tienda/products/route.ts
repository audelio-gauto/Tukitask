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

  // Enrich with avg_rating + review_count from product_reviews
  const productIds = (data ?? []).map((p: { id: string }) => p.id);
  const ratingsMap: Record<string, { avg: number; count: number }> = {};

  if (productIds.length > 0) {
    const { data: ratingsData } = await db
      .from('product_reviews')
      .select('product_id, rating')
      .in('product_id', productIds);

    if (ratingsData) {
      const groups: Record<string, number[]> = {};
      for (const r of ratingsData as { product_id: string; rating: number }[]) {
        if (!groups[r.product_id]) groups[r.product_id] = [];
        groups[r.product_id].push(r.rating);
      }
      for (const [pid, ratings] of Object.entries(groups)) {
        ratingsMap[pid] = {
          avg: ratings.reduce((s, r) => s + r, 0) / ratings.length,
          count: ratings.length,
        };
      }
    }
  }

  const products = (data ?? []).map((p: { id: string }) => ({
    ...p,
    avg_rating:   ratingsMap[p.id]?.avg   ?? null,
    review_count: ratingsMap[p.id]?.count ?? 0,
  }));

  return NextResponse.json({ products });
}
