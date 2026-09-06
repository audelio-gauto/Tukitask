import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

// GET /api/tienda/mis-pedidos/[id]
// Authenticated — returns full detail of ONE market order, only if it belongs
// to the requesting client (ownership check prevents IDOR).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const db = sbAdmin();
  const { data: order, error } = await db
    .from('market_orders')
    .select('id, status, vendor_email, vendor_id, client_name, client_email, items, total, shipping_price, address, payment_method, payment_proof_url, negotiated, notes, billing, delivery, created_at, updated_at, accepted_at, completed_at, cancelled_at')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  if (order.client_email !== user.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let storeName: string | null = null;
  let storeLogo: string | null = null;
  if (order.vendor_id) {
    try {
      const { data: store } = await db
        .from('store_configs')
        .select('config')
        .eq('vendor_id', order.vendor_id)
        .maybeSingle();
      const config = (store as { config?: { storeName?: string; logoImage?: string } } | null)?.config;
      storeName = config?.storeName?.trim() || null;
      storeLogo = config?.logoImage || null;
    } catch { /* ignore — fall back to vendor_email on the client */ }
  }

  return NextResponse.json({ ...order, store_name: storeName, store_logo: storeLogo });
}
