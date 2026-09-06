import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

// GET /api/tienda/reviews?product_id=<uuid>
// Public — returns reviews for a product
//
// GET /api/tienda/reviews?mine=true&product_ids=<uuid>,<uuid>,...
// Authenticated — returns which of the given product_ids the caller already reviewed
// (used to hide "Calificar" buttons for products already rated).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('mine') === 'true') {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const productIds = (searchParams.get('product_ids') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (productIds.length === 0) return NextResponse.json({ reviewed: [] });

    const db = sbAdmin();
    const { data, error } = await db
      .from('product_reviews')
      .select('product_id')
      .eq('buyer_email', user.email)
      .in('product_id', productIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const reviewed = (data ?? []).map((r: { product_id: string }) => r.product_id);
    return NextResponse.json({ reviewed });
  }

  const productId = searchParams.get('product_id')?.trim();
  if (!productId) return NextResponse.json({ error: 'product_id requerido' }, { status: 400 });

  const db = sbAdmin();
  const { data, error } = await db
    .from('product_reviews')
    .select('id, buyer_email, rating, comment, created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data ?? [] });
}

// POST /api/tienda/reviews
// Authenticated — requires verified purchase
// Body: { product_id, rating (1-5), comment? }
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let body: { product_id?: string; rating?: number; comment?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { product_id, rating, comment } = body;
  if (!product_id || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'product_id y rating (1-5) son requeridos' }, { status: 400 });
  }
  if (comment && comment.length > 500) {
    return NextResponse.json({ error: 'El comentario no puede superar 500 caracteres' }, { status: 400 });
  }

  const db = sbAdmin();

  // Verify product exists and is published
  const { data: product } = await db
    .from('products')
    .select('id, vendor_id')
    .eq('id', product_id)
    .eq('status', 'published')
    .single();

  if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  // Verify buyer has at least one non-cancelled order containing this product
  const { data: orders } = await db
    .from('market_orders')
    .select('id, items')
    .eq('client_email', user.email)
    .neq('status', 'cancelled');

  const hasPurchased = (orders ?? []).some((order: { items: unknown }) =>
    Array.isArray(order.items) &&
    (order.items as { productId?: string }[]).some(item => item.productId === product_id)
  );

  if (!hasPurchased) {
    return NextResponse.json(
      { error: 'Solo compradores verificados pueden dejar reseñas en este producto' },
      { status: 403 },
    );
  }

  // Upsert — one review per (product, buyer)
  const { data, error } = await db
    .from('product_reviews')
    .upsert(
      {
        product_id,
        vendor_id:   product.vendor_id,
        buyer_email: user.email,
        rating,
        comment:     comment?.trim() || null,
      },
      { onConflict: 'product_id,buyer_email' },
    )
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: data }, { status: 201 });
}
