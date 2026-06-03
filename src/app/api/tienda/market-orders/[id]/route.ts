import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';
import { emitNotification } from '@/lib/notificationEmitter';

// PATCH /api/tienda/market-orders/[id]
// Vendor updates order status. When status → 'delivered', deducts commission automatically.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  const { status } = body as { status: string };

  const ALLOWED_STATUSES = ['preparing', 'ready', 'in_transit', 'delivered', 'cancelled'];
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const db = sbAdmin();

  // Verify order belongs to this vendor
  const { data: order, error: fetchErr } = await db
    .from('market_orders')
    .select('id, vendor_email, client_email, client_name, total, status, items')
    .eq('id', id)
    .eq('vendor_email', user.email)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  // Cannot modify a completed or already commission-charged order
  if (['commission_charged', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ error: 'El pedido ya no se puede modificar' }, { status: 409 });
  }

  // If marking as delivered → trigger commission deduction via RPC
  if (status === 'delivered') {
    const { data: rpcData, error: rpcErr } = await db.rpc('deduct_vendor_commission', {
      p_market_order_id: id,
    });

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    if (!rpcData?.ok) {
      // If already charged just acknowledge
      if (rpcData?.error === 'already_charged') {
        return NextResponse.json({ success: true, status: 'commission_charged', commission: 0 });
      }
      return NextResponse.json({ error: rpcData?.error || 'Error al descontar comisión' }, { status: 500 });
    }

    // Notify client that order was delivered
    if (order.client_email) {
      emitNotification(
        order.client_email,
        'status_change',
        '✅ Pedido entregado',
        `Tu pedido fue marcado como entregado por el vendedor.`,
        { order_id: id },
        { groupKey: `market_order_delivered_${id}` },
      );
    }

    return NextResponse.json({
      success: true,
      status: 'commission_charged',
      commission: rpcData.commission ?? 0,
      balance: rpcData.balance ?? null,
    });
  }

  // Otherwise just update status
  const { error: updateErr } = await db
    .from('market_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Notify client on relevant status changes
  const statusMessages: Record<string, string> = {
    preparing: 'Tu pedido está siendo preparado.',
    ready:     'Tu pedido está listo y pronto será enviado.',
    in_transit: 'Tu pedido está en camino.',
    cancelled:  'Tu pedido fue cancelado por el vendedor.',
  };
  if (order.client_email && statusMessages[status]) {
    emitNotification(
      order.client_email,
      'status_change',
      '🛒 Actualización de pedido',
      statusMessages[status],
      { order_id: id },
      { groupKey: `market_order_${status}_${id}` },
    );
  }

  return NextResponse.json({ success: true, status });
}

// GET /api/tienda/market-orders/[id] — vendor detail view
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = sbAdmin();

  const { data, error } = await db
    .from('market_orders')
    .select('*')
    .eq('id', id)
    .eq('vendor_email', user.email)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json(data);
}
