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
  let body: { status?: string; payment_action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const status = typeof body.status === 'string' ? body.status : '';
  const paymentAction = body.payment_action;
  const confirmingTransfer = paymentAction === 'confirm_transfer';

  const ALLOWED_STATUSES = ['preparing', 'ready', 'in_transit', 'delivered', 'cancelled'];
  if ((paymentAction && !confirmingTransfer) || (confirmingTransfer && status) || (!confirmingTransfer && (!status || !ALLOWED_STATUSES.includes(status)))) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const db = sbAdmin();

  // Verify order belongs to this vendor
  const { data: order, error: fetchErr } = await db
    .from('market_orders')
    .select('id, vendor_email, client_email, client_name, total, status, items, payment_method, payment_status, payment_proof_url')
    .eq('id', id)
    .eq('vendor_email', user.email)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  if (confirmingTransfer) {
    if (order.payment_method !== 'transferencia') {
      return NextResponse.json({ error: 'Este pedido no requiere confirmación de transferencia' }, { status: 409 });
    }
    if (order.payment_status !== 'awaiting_confirmation' || !order.payment_proof_url || order.status === 'cancelled') {
      return NextResponse.json({ error: 'El pago ya no está pendiente o falta el comprobante' }, { status: 409 });
    }

    const confirmedAt = new Date().toISOString();
    const { data: confirmedOrder, error: confirmError } = await db
      .from('market_orders')
      .update({
        payment_status: 'confirmed',
        payment_confirmed_at: confirmedAt,
        payment_confirmed_by: user.email,
        updated_at: confirmedAt,
      })
      .eq('id', id)
      .eq('vendor_email', user.email)
      .eq('payment_status', 'awaiting_confirmation')
      .select('id')
      .maybeSingle();

    if (confirmError) return NextResponse.json({ error: confirmError.message }, { status: 500 });
    if (!confirmedOrder) return NextResponse.json({ error: 'El pago ya fue confirmado por otro proceso' }, { status: 409 });

    if (order.client_email) {
      emitNotification(
        order.client_email,
        'status_change',
        '✅ Transferencia confirmada',
        `El vendedor confirmó el pago de tu pedido #${String(id).slice(0, 8).toUpperCase()}.`,
        { order_id: id, payment_status: 'confirmed' },
        { groupKey: `market_order_payment_confirmed_${id}` },
      );
    }

    return NextResponse.json({ success: true, payment_status: 'confirmed', payment_confirmed_at: confirmedAt });
  }

  if (order.payment_method === 'transferencia' && order.payment_status !== 'confirmed' && status !== 'cancelled') {
    return NextResponse.json({ error: 'Confirma primero el pago por transferencia antes de preparar el pedido' }, { status: 409 });
  }

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
