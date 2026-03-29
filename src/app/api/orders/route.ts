import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { cacheGet, cacheSet } from '@/lib/cache';
import { emitNotification } from '@/lib/notificationEmitter';

// Comision mínima para poder ver pedidos disponibles (en la moneda base de la app)
const MIN_WALLET_BALANCE = 0; // 0 = solo bloquear si saldo negativo; sube este valor para forzar saldo mínimo

// GET: Listar pedidos — abierto (scoped por email de query param)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientEmail = searchParams.get('client_email');
  const driverEmail = searchParams.get('driver_email');
  const history = searchParams.get('history');
  const db = sbAdmin();

  let query = db
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (clientEmail) {
    query = query.eq('client_email', clientEmail);
  } else if (driverEmail && searchParams.get('only_failed') === 'true') {
    query = query.eq('accepted_by', driverEmail).in('status', ['failed', 'return_rejected']);
  } else if (driverEmail && history === 'true') {
    query = query.eq('accepted_by', driverEmail).in('status', ['delivered', 'commission_charged', 'client_confirmed', 'cancelled', 'returned', 'return_rejected']);
  } else if (driverEmail) {
    query = query.eq('accepted_by', driverEmail).in('status', ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered', 'return_rejected']);
  } else {
    // Pedidos disponibles para drivers — verificar saldo de billetera
    const user = await getAuthUser(req);
    if (user) {
      const { data: wallet } = await db
        .from('driver_wallets')
        .select('balance')
        .eq('driver_email', user.email)
        .maybeSingle();
      const balance = Number(wallet?.balance ?? 0);
      if (balance < MIN_WALLET_BALANCE) {
        return NextResponse.json({ error: 'saldo_insuficiente', balance }, { status: 402 });
      }
    }
    // Cache available orders for 5s (all drivers see the same list)
    const cachedOrders = await cacheGet<unknown[]>('orders:available');
    if (cachedOrders) return NextResponse.json(cachedOrders);

    query = query.in('status', ['pending', 'negotiating']).limit(100);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cache the available orders result if this was the unfiltered query
  if (!clientEmail && !driverEmail && data) {
    await cacheSet('orders:available', data, 5);
  }

  return NextResponse.json(data);
}

// POST: Crear pedido — requiere auth; client_email se fuerza desde el token
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  // Forzar client_email desde el token — nunca confiar en el body
  const safeBody = { ...body, client_email: user.email };
  const db = sbAdmin();
  const { data, error } = await db
    .from('orders')
    .insert([safeBody])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH: Transición de estado — requiere auth; ownership verificado via token
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  const { order_id, status, fail_reason, return_reason, return_rejected_reason } = body;

  if (!order_id || !status) {
    return NextResponse.json({ error: 'order_id and status required' }, { status: 400 });
  }

  // Driver-initiated transitions
  const driverAllowed: Record<string, string[]> = {
    picking_up: ['accepted'],
    in_transit: ['picking_up', 'failed', 'return_rejected'], // retry delivery
    delivered: ['in_transit'],
    failed: ['in_transit'],
    returning: ['failed', 'return_rejected'],
    return_delivered: ['driver_returning'],
    incident_closed: ['return_rejected'],
  };

  // Client-initiated transitions
  const clientAllowed: Record<string, string[]> = {
    driver_returning: ['returning'],
    returned: ['return_delivered'],
    return_rejected: ['return_delivered', 'returning'],
    cancelled: ['pending', 'negotiating'],
    // client_confirmed = comprobante/recibo para cliente y admin
    // la comisión ya fue descontada automáticamente al marcar 'delivered'
    client_confirmed: ['delivered', 'commission_charged'],
  };

  const isDriverStatus = status in driverAllowed;
  const isClientStatus = status in clientAllowed;

  if (!isDriverStatus && !isClientStatus) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data: order } = await db
    .from('orders')
    .select('status, accepted_by, client_email, return_attempts')
    .eq('id', order_id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  if (isDriverStatus && order.accepted_by !== user.email) {
    return forbidden('Not your order');
  }
  if (isClientStatus && order.client_email !== user.email) {
    return forbidden('Not your order');
  }

  const allowedPrev = isClientStatus ? clientAllowed[status] : driverAllowed[status];
  if (!allowedPrev.includes(order.status)) {
    return NextResponse.json({ error: `Cannot transition from ${order.status} to ${status}` }, { status: 409 });
  }

  const { error } = await db.from('orders').update({ status }).eq('id', order_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Columnas opcionales — fallan silenciosamente si la columna no existe en producción
  const extraUpdates: Record<string, unknown> = {};
  if (status === 'delivered') extraUpdates.completed_at = new Date().toISOString();
  if (status === 'client_confirmed') extraUpdates.confirmed_at = new Date().toISOString();
  if (status === 'failed' && fail_reason) extraUpdates.fail_reason = fail_reason;
  if (status === 'returning' && return_reason) extraUpdates.return_reason = return_reason;
  if (status === 'returning') extraUpdates.returning_at = new Date().toISOString();
  if (status === 'returning') extraUpdates.return_attempts = (Number(order.return_attempts) || 0) + 1;
  if (status === 'incident_closed') extraUpdates.incident_closed_at = new Date().toISOString();
  if (status === 'returned') extraUpdates.returned_at = new Date().toISOString();
  if (status === 'return_rejected' && return_rejected_reason) extraUpdates.return_rejected_reason = return_rejected_reason;
  if (Object.keys(extraUpdates).length > 0) {
    await db.from('orders').update(extraUpdates).eq('id', order_id);
  }

  // ── Descontar comisión automáticamente cuando el driver confirma entrega ──
  // El RPC deduct_commission también actualiza el status a 'commission_charged'
  if (status === 'delivered') {
    const { error: rpcErr } = await db.rpc('deduct_commission', { p_order_id: order_id });
    if (rpcErr) {
      // Registrar error pero no fallar — la entrega fue confirmada, comisión se gestiona manualmente
      console.error('[orders PATCH] deduct_commission failed:', rpcErr.message);
    }
  }

  // ── Notify the other party about the status change ──
  const statusLabels: Record<string, string> = {
    picking_up: 'El conductor va en camino a recoger tu paquete',
    in_transit: 'Tu paquete está en tránsito',
    delivered: '¡Tu paquete fue entregado!',
    failed: 'Hubo un problema con la entrega',
    returning: 'Tu paquete está siendo devuelto',
    returned: 'Tu paquete fue devuelto',
    cancelled: 'El pedido fue cancelado',
    client_confirmed: 'El cliente confirmó la recepción',
  };
  // Urgent statuses deserve popup + sound
  const urgentStatuses = ['picking_up', 'delivered', 'failed', 'returned'];
  const label = statusLabels[status];
  if (label) {
    const targetEmail = isDriverStatus ? order.client_email : order.accepted_by;
    if (targetEmail) {
      emitNotification(
        targetEmail,
        'status_change',
        'Actualización de envío',
        label,
        { order_id, status },
        { priority: urgentStatuses.includes(status) ? 'urgent' : 'high' },
      );
    }
  }

  return NextResponse.json({ success: true, status });
}
