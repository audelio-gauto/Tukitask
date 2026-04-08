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
    .select('*, order_stops(*)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (clientEmail) {
    query = query.eq('client_email', clientEmail);
  } else if (driverEmail && searchParams.get('only_failed') === 'true') {
    query = query.eq('accepted_by', driverEmail).in('status', ['failed', 'return_rejected']);
  } else if (driverEmail && history === 'true') {
    query = query.eq('accepted_by', driverEmail).in('status', ['delivered', 'commission_charged', 'client_confirmed', 'cancelled', 'returned', 'return_rejected']);
  } else if (driverEmail) {
    query = query.eq('accepted_by', driverEmail).in('status', ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered', 'return_rejected', 'cancelled']);
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

  // For the driver marketplace — enrich with live client_profiles (photo + avg_rating)
  if (!clientEmail && !driverEmail && data) {
    const emails = [...new Set(data.map((o: Record<string,unknown>) => o.client_email as string).filter(Boolean))];
    let profileMap: Record<string, { photo_url: string | null; avg_rating: number | null; is_verified: boolean }> = {};
    if (emails.length > 0) {
      // Main profile data
      const { data: profiles } = await db
        .from('client_profiles')
        .select('email, photo_url, avg_rating')
        .in('email', emails);
      (profiles ?? []).forEach((p: { email: string; photo_url: string | null; avg_rating: number | null }) => {
        profileMap[p.email] = { photo_url: p.photo_url ?? null, avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null, is_verified: false };
      });
      // is_verified — safe separate query (column may not exist if migration 039 not run yet)
      try {
        const { data: verRows } = await db
          .from('client_profiles')
          .select('email, is_verified')
          .in('email', emails)
          .eq('is_verified', true);
        (verRows ?? []).forEach((r: { email: string; is_verified: boolean }) => {
          if (profileMap[r.email]) profileMap[r.email].is_verified = true;
        });
      } catch { /* column not yet available — non-fatal */ }
    }
    const enriched = data.map((o: Record<string,unknown>) => ({
      ...o,
      client_photo:       profileMap[o.client_email as string]?.photo_url  ?? o.client_photo  ?? null,
      client_avg_rating:  profileMap[o.client_email as string]?.avg_rating ?? o.client_avg_rating ?? null,
      client_is_verified: profileMap[o.client_email as string]?.is_verified ?? false,
    }));
    await cacheSet('orders:available', enriched, 5);
    return NextResponse.json(enriched);
  }

  return NextResponse.json(data);
}

// POST: Crear pedido — requiere auth; client_email se fuerza desde el token
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  const db = sbAdmin();

  // Extract stops array before inserting — they go to order_stops table
  // Extract mandadito fields — only sent to DB if columns exist (require migration 025)
  const { stops, order_type, shopping_list, max_budget, ...orderBody } = body as {
    stops?: Array<{
      address: string;
      lat?: string | number;
      lng?: string | number;
      receiver_contact?: string;
      receiver_phone?: string;
      description?: string;
    }>;
    order_type?: string;
    shopping_list?: string | null;
    max_budget?: number | null;
    [key: string]: unknown;
  };

  const isMultiStop = Array.isArray(stops) && stops.length > 1;

  // Forzar client_email desde el token — nunca confiar en el body
  const safeBody: Record<string, unknown> = {
    ...orderBody,
    client_email: user.email,
    is_multi_stop: isMultiStop,
    stop_count: isMultiStop ? stops!.length : 1,
    order_type: order_type || 'envio',
    shopping_list: shopping_list || null,
    max_budget: max_budget || null,
  };

  const { data: order, error } = await db
    .from('orders')
    .insert([safeBody])
    .select()
    .single();
  if (error) {
    console.error('[orders POST]', error.message, '— if column missing, run migration 025_mandaditos.sql');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert stops for multi-stop orders
  if (isMultiStop && stops && order) {
    const stopRows = stops.map((s, i) => ({
      order_id: order.id,
      sequence: i + 1,
      address: s.address,
      lat: s.lat ? Number(s.lat) : null,
      lng: s.lng ? Number(s.lng) : null,
      receiver_contact: s.receiver_contact || null,
      receiver_phone: s.receiver_phone || null,
      description: s.description || null,
      status: 'pending',
    }));
    const { error: stopsErr } = await db.from('order_stops').insert(stopRows);
    if (stopsErr) {
      // Roll back the order if stops failed (best effort)
      await db.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: stopsErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(order, { status: 201 });
}

// PATCH: Transición de estado — requiere auth; ownership verificado via token
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  const { order_id, status, fail_reason, return_reason, return_rejected_reason, stop_id, stop_status } = body;

  // ── Stop-level update (multi-stop orders) ──────────────────────────────────
  if (stop_id && stop_status) {
    if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    const db = sbAdmin();
    // Verify driver owns this order
    const { data: orderCheck } = await db
      .from('orders')
      .select('accepted_by, is_multi_stop, status')
      .eq('id', order_id)
      .single();
    if (!orderCheck) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (orderCheck.accepted_by?.toLowerCase() !== user.email) return forbidden('Not your order');
    if (!['in_transit', 'picking_up'].includes(orderCheck.status)) {
      return NextResponse.json({ error: 'Order must be in_transit to update stops' }, { status: 409 });
    }

    const stopUpdate: Record<string, unknown> = { status: stop_status };
    if (stop_status === 'delivered') stopUpdate.delivered_at = new Date().toISOString();
    if (stop_status === 'failed' && fail_reason) stopUpdate.fail_reason = fail_reason;

    const { error: stopErr } = await db
      .from('order_stops')
      .update(stopUpdate)
      .eq('id', stop_id)
      .eq('order_id', order_id); // extra safety check
    if (stopErr) return NextResponse.json({ error: stopErr.message }, { status: 500 });

    // Check if all stops are done (delivered or failed) → auto-transition order to 'delivered'
    const { data: remaining } = await db
      .from('order_stops')
      .select('id')
      .eq('order_id', order_id)
      .eq('status', 'pending');

    if (!remaining || remaining.length === 0) {
      // All stops resolved — mark order as delivered
      await db.from('orders').update({ status: 'in_transit' }).eq('id', order_id); // ensure correct base
      const { error: doneErr } = await db.from('orders').update({
        status: 'delivered',
        completed_at: new Date().toISOString(),
      }).eq('id', order_id);
      if (!doneErr) {
        await db.rpc('deduct_commission', { p_order_id: order_id }).catch(() => {});
        // Notify client
        const { data: ord } = await db.from('orders').select('client_email').eq('id', order_id).single();
        if (ord?.client_email) {
          emitNotification(ord.client_email, 'status_change', 'Todos los envíos entregados', '¡Todos tus paquetes fueron entregados!', { order_id, status: 'delivered' }, { priority: 'urgent' });
        }
      }
      return NextResponse.json({ success: true, order_status: 'delivered', all_stops_done: true });
    }

    return NextResponse.json({ success: true, stop_status, pending_stops: remaining.length });
  }

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

  if (isDriverStatus && order.accepted_by?.toLowerCase() !== user.email) {
    return forbidden('Not your order');
  }
  if (isClientStatus && order.client_email?.toLowerCase() !== user.email) {
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
