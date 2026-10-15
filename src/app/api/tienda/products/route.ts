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
  const q        = rawQ.replace(/[%_\\,.()]/g, '\\$&');
  const vendorId = searchParams.get('vendor_id') ?? '';
  const category = searchParams.get('category') ?? '';
  const requestedLimit = Number(searchParams.get('limit') || '60');
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 60;
  const requestedPage = Number(searchParams.get('page') || '1');
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(100_000, Math.trunc(requestedPage))) : 1;
  const from = (page - 1) * limit;

  const db = sbAdmin();
  let matchingStoreIds: string[] = [];
  if (q) {
    const { data: matchingStores } = await db
      .from('store_configs')
      .select('vendor_id')
      .ilike('config->>storeName', `%${q}%`)
      .limit(1000);
    matchingStoreIds = (matchingStores ?? [])
      .map((store: { vendor_id: string }) => store.vendor_id)
      .filter((id: string) => /^[0-9a-f-]{36}$/i.test(id));
  }

  let query = db
    .from('products')
    .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image, short_description, negotiable', { count: 'exact' })
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (q) {
    const searchFilters = [
      `name.ilike.%${q}%`,
      `category.ilike.%${q}%`,
      `vendor_email.ilike.%${q}%`,
    ];
    if (matchingStoreIds.length > 0) searchFilters.push(`vendor_id.in.(${matchingStoreIds.join(',')})`);
    query = query.or(searchFilters.join(','));
  }
  if (vendorId)                   query = query.eq('vendor_id', vendorId);
  if (category && category !== 'Todos') query = query.eq('category', category);

  const [{ data, count, error }, taxonomyResult] = await Promise.all([
    query.range(from, from + limit - 1),
    searchParams.get('include_categories') === '1'
      ? db.from('vendor_catalog_taxonomies')
        .select('slug')
        .eq('taxonomy_type', 'category')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with avg_rating + review_count from product_reviews
  const productIds = (data ?? []).map((p: { id: string }) => p.id);
  const ratingsMap: Record<string, { avg: number; count: number }> = {};

  if (productIds.length > 0) {
    const { data: statsData, error: statsError } = await db
      .rpc('product_review_stats', { p_product_ids: productIds });

    if (!statsError && Array.isArray(statsData)) {
      for (const s of statsData as { product_id: string; avg_rating: number | string; review_count: number | string }[]) {
        ratingsMap[s.product_id] = { avg: Number(s.avg_rating), count: Number(s.review_count) };
      }
    } else {
      // Fallback while migration 112 is not deployed.
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
  }

  const products = (data ?? []).map((p: { id: string }) => ({
    ...p,
    avg_rating:   ratingsMap[p.id]?.avg   ?? null,
    review_count: ratingsMap[p.id]?.count ?? 0,
  }));

  const categories = Array.isArray(taxonomyResult.data) && taxonomyResult.data.length > 0
    ? taxonomyResult.data.map((item: { slug: string }) => item.slug)
    : Array.from(new Set((data ?? []).map((item: { category: string | null }) => item.category).filter(Boolean)));

  return NextResponse.json({
    products,
    categories,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}
