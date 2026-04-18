import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { cacheGet, cacheSet, cacheDel } from '@/lib/cache';
import { emitNotification } from '@/lib/notificationEmitter';

// Saldo mínimo para poder ver pedidos disponibles.
// 0 = solo bloquear si saldo negativo. Sube este valor para exigir depósito previo.
// Configurable via env var DRIVER_MIN_WALLET_BALANCE (en Gs.)
const MIN_WALLET_BALANCE = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);

// GET: Listar pedidos — abierto (scoped por email de query param)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientEmail = searchParams.get('client_email');
  const driverEmail = searchParams.get('driver_email');
  const history = searchParams.get('history');
  const orderId = searchParams.get('id');
  const db = sbAdmin();

  // ── Single order by ID (client or driver tracking) ───────────────────────
  if (orderId) {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const { data: order, error } = await db
      .from('orders')
      .select('*, order_stops(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // Security: only the client or the assigned driver may fetch
    const isClient = order.client_email?.toLowerCase() === user.email;
    const isDriver = order.accepted_by?.toLowerCase() === user.email;
    if (!isClient && !isDriver) return forbidden('No autorizado');

    // Enrich with driver name/photo for client tracking view
    let driver_name: string | null = null;
    let driver_photo: string | null = null;
    let driver_avg_rating: number | null = null;
    if (order.accepted_by) {
      const { data: dp } = await db
        .from('driver_profiles')
        .select('first_name, last_name, profile_photo, avg_rating')
        .eq('email', order.accepted_by)
        .maybeSingle();
      if (dp) {
        driver_name = [dp.first_name, dp.last_name].filter(Boolean).join(' ') || null;
        driver_photo = dp.profile_photo ?? null;
        driver_avg_rating = dp.avg_rating ?? null;
      }
    }
    return NextResponse.json({ ...order, driver_name, driver_photo, driver_avg_rating });
  }

  let query = db
    .from('orders')
    .select('*, order_stops(*)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (clientEmail) {
    // Ownership check: only the authenticated client can see their own orders
    const user = await getAuthUser(req);
    if (!user || user.email !== clientEmail) return unauthorized();
    query = query.eq('client_email', clientEmail);
  } else if (driverEmail && searchParams.get('only_failed') === 'true') {
    // Ownership check: only the authenticated driver can see their own orders
    const user = await getAuthUser(req);
    if (!user || user.email !== driverEmail) return unauthorized();
    query = query.eq('accepted_by', driverEmail).in('status', ['failed', 'return_rejected']);
  } else if (driverEmail && history === 'true') {
    const user = await getAuthUser(req);
    if (!user || user.email !== driverEmail) return unauthorized();
    query = query.eq('accepted_by', driverEmail).in('status', ['delivered', 'commission_charged', 'client_confirmed', 'failed', 'cancelled', 'returned', 'return_rejected']);
  } else if (driverEmail) {
    const user = await getAuthUser(req);
    if (!user || user.email !== driverEmail) return unauthorized();
    query = query.eq('accepted_by', driverEmail).in('status', ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered', 'return_rejected', 'cancelled']);
  } else {
    // Pedidos disponibles para drivers — requiere auth
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    // Verificar saldo de billetera
    const { data: wallet } = await db
      .from('driver_wallets')
      .select('balance')
      .eq('driver_email', user.email)
      .maybeSingle();
    const balance = Number(wallet?.balance ?? 0);
    if (balance < MIN_WALLET_BALANCE) {
      return NextResponse.json({ error: 'saldo_insuficiente', balance }, { status: 402 });
    }

    // Fetch driver profile + approved doc types for server-side filtering
    const { data: dProf } = await db
      .from('driver_profiles')
      .select('service_filters, pickup_range, delivery_range')
      .eq('email', user.email)
      .maybeSingle();
    const sf = (dProf?.service_filters as Record<string, boolean> | null) ?? {};
    const dPickupRange   = Number(dProf?.pickup_range   ?? 10);
    const dDeliveryRange = Number(dProf?.delivery_range  ?? 20);

    // Compute which vehicle types the driver has fully approved docs for
    const PERSONAL_KEYS = ['cedula_frente', 'antecedentes', 'domicilio'];
    const VEH_DOC_KEYS  = ['registro_frente', 'registro_dorso', 'cedula_verde_frente', 'cedula_verde_dorso'];
    const ALL_VTS = ['moto', 'auto', 'moto_carro', 'camion'];
    const allNeeded = [...PERSONAL_KEYS, ...ALL_VTS.flatMap(vt => VEH_DOC_KEYS.map(k => `${vt}_${k}`))];
    const { data: driverDocs } = await db
      .from('driver_documents')
      .select('doc_type, status')
      .eq('driver_email', user.email)
      .in('doc_type', allNeeded);
    const docMap: Record<string, string> = {};
    for (const d of (driverDocs || [])) docMap[d.doc_type] = d.status;
    const approvedVts = new Set<string>();
    for (const vt of ALL_VTS) {
      const needed = [...PERSONAL_KEYS, ...VEH_DOC_KEYS.map(k => `${vt}_${k}`)];
      if (needed.every(k => docMap[k] === 'approved')) approvedVts.add(vt);
    }

    const FILTER_MAP: Record<string, string> = { moto: 'moto_envios', auto: 'auto_envios', moto_carro: 'moto_carro_fletes', camion: 'camion_fletes' };
    const VT_MAP: Record<string, string> = { moto: 'moto', auto: 'auto', motocarro: 'moto_carro', camion2t: 'camion' };
    // Compute the set of order vehicle_type values this driver can serve
    const allowedOrderVts = new Set<string>();
    for (const [orderVt, driverVt] of Object.entries(VT_MAP)) {
      if (!approvedVts.has(driverVt)) continue;
      const fk = FILTER_MAP[driverVt];
      if (fk && sf[fk] === false) continue;
      allowedOrderVts.add(orderVt);
    }

    // Cache available orders for 2s (reduces race-condition window vs 5s)
    // v2 key: ensures old cache without client_is_verified is not served
    const cachedOrders = await cacheGet<Record<string, unknown>[]>('orders:v2:available');
    let allOrders: Record<string, unknown>[];
    if (cachedOrders) {
      allOrders = cachedOrders;
    } else {
      query = query.in('status', ['pending', 'negotiating']).limit(100);
      const { data: fetched, error: qErr } = await query;
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
      // Enrich with client profile info + cache
      const raw = (fetched || []) as Record<string, unknown>[];
      const emails = [...new Set(raw.map(o => o.client_email as string).filter(Boolean))];
      let profileMap: Record<string, { photo_url: string | null; avg_rating: number | null; is_verified: boolean }> = {};
      if (emails.length > 0) {
        const { data: profiles, error: profileErr } = await db.from('client_profiles').select('email, photo_url, avg_rating, is_verified').in('email', emails);
        if (!profileErr) {
          (profiles ?? []).forEach((p: { email: string; photo_url: string | null; avg_rating: number | null; is_verified: boolean | null }) => {
            profileMap[p.email] = { photo_url: p.photo_url ?? null, avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null, is_verified: p.is_verified === true };
          });
        } else {
          const { data: fallback } = await db.from('client_profiles').select('email, photo_url, avg_rating').in('email', emails);
          (fallback ?? []).forEach((p: { email: string; photo_url: string | null; avg_rating: number | null }) => {
            profileMap[p.email] = { photo_url: p.photo_url ?? null, avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null, is_verified: false };
          });
        }
      }
      allOrders = raw.map(o => ({
        ...o,
        client_photo:       profileMap[o.client_email as string]?.photo_url  ?? o.client_photo  ?? null,
        client_avg_rating:  profileMap[o.client_email as string]?.avg_rating ?? o.client_avg_rating ?? null,
        client_is_verified: profileMap[o.client_email as string]?.is_verified ?? false,
      }));
      await cacheSet('orders:v2:available', allOrders, 2);
    }

    // Server-side filter: vehicle type + service_filters + docs
    const filtered = allOrders.filter(o => {
      const ovt = (o.vehicle_type as string) || '';
      if (ovt && !allowedOrderVts.has(ovt)) return false;
      return true;
    });

    return NextResponse.json(filtered);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For client history — enrich with driver info from driver_profiles
  if (clientEmail && data) {
    const driverEmails = [...new Set(
      (data as Record<string, unknown>[]).map(o => o.accepted_by as string).filter(Boolean)
    )];
    let driverMap: Record<string, { name: string; photo: string | null; avg_rating: number | null }> = {};
    if (driverEmails.length > 0) {
      const { data: profiles } = await db
        .from('driver_profiles')
        .select('email, first_name, last_name, profile_photo, avg_rating')
        .in('email', driverEmails);
      (profiles ?? []).forEach((p: { email: string; first_name: string | null; last_name: string | null; profile_photo: string | null; avg_rating: number | null }) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email.split('@')[0];
        driverMap[p.email] = { name, photo: p.profile_photo ?? null, avg_rating: p.avg_rating != null ? Number(p.avg_rating) : null };
      });
    }
    const enriched = (data as Record<string, unknown>[]).map(o => ({
      ...o,
      driver_email: o.accepted_by ?? null,
      driver_name: (o.accepted_by && driverMap[o.accepted_by as string]?.name) ? driverMap[o.accepted_by as string].name : (o.driver_name ?? null),
      driver_photo: (o.accepted_by && driverMap[o.accepted_by as string]?.photo) ? driverMap[o.accepted_by as string].photo : (o.driver_photo ?? null),
    }));
    return NextResponse.json(enriched);
  }

  return NextResponse.json(data);
}

// POST: Crear pedido — requiere auth; client_email se fuerza desde el token
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json();

  // Validate suggested_price bounds (en Gs.) — configurable via env vars
  const MIN_PRICE = Number(process.env.ORDER_MIN_PRICE ?? 1000);      // default 1.000 Gs.
  const MAX_PRICE = Number(process.env.ORDER_MAX_PRICE ?? 50_000_000); // default 50.000.000 Gs.
  const price = Number(body.suggested_price ?? body.client_initial_price ?? 0);
  if (price > 0 && (price < MIN_PRICE || price > MAX_PRICE)) {
    return NextResponse.json(
      { error: `El precio debe estar entre ${MIN_PRICE.toLocaleString()} y ${MAX_PRICE.toLocaleString()} Gs.` },
      { status: 400 }
    );
  }
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

  if (Array.isArray(stops) && stops.length > 20) {
    return NextResponse.json({ error: 'Máximo 20 paradas permitidas' }, { status: 400 });
  }

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
      // Count delivered vs failed outcomes for accurate status + notification
      const { data: allStops } = await db
        .from('order_stops')
        .select('status')
        .eq('order_id', order_id);
      const deliveredCount = (allStops || []).filter((s: { status: string }) => s.status === 'delivered').length;
      const failedCount    = (allStops || []).filter((s: { status: string }) => s.status === 'failed').length;
      const totalCount     = (allStops || []).length;
      // 'failed' only when ALL stops failed; otherwise 'delivered' (partial deliveries accepted)
      const finalStatus = deliveredCount === 0 && failedCount > 0 ? 'failed' : 'delivered';

      await db.from('orders').update({ status: 'in_transit' }).eq('id', order_id); // ensure correct base
      const { error: doneErr } = await db.from('orders').update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
      }).eq('id', order_id);
      if (!doneErr) {
        // Charge commission only when at least one stop was delivered
        if (deliveredCount > 0) {
          let commErr = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
            const { error } = await db.rpc('deduct_commission', { p_order_id: order_id });
            if (!error) { commErr = null; break; }
            commErr = error;
          }
          if (commErr) console.error('[multi-stop] deduct_commission failed after 3 attempts:', commErr.message, '— order_id:', order_id);
        }
        // Notify client with accurate counts
        const { data: ord } = await db.from('orders').select('client_email').eq('id', order_id).single();
        if (ord?.client_email) {
          const title = failedCount === 0
            ? 'Todos los envíos entregados'
            : failedCount === totalCount
              ? 'No se pudo entregar'
              : `${deliveredCount} de ${totalCount} paradas entregadas`;
          const body = failedCount === 0
            ? '¡Todos tus paquetes fueron entregados!'
            : failedCount === totalCount
              ? 'No se pudo completar ninguna entrega.'
              : `✅ ${deliveredCount} entregadas · ❌ ${failedCount} fallidas`;
          emitNotification(ord.client_email, 'status_change', title, body, { order_id, status: finalStatus }, { priority: 'urgent', groupKey: `order:${order_id}:done` });
        }
      }
      return NextResponse.json({ success: true, order_status: finalStatus, all_stops_done: true, delivered_count: deliveredCount, failed_count: failedCount });
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

  // Invalidate available-orders cache when an order leaves the public feed
  if (['accepted', 'cancelled', 'delivered', 'failed'].includes(status)) {
    await cacheDel('orders:v2:available');
  }

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
    // Retry up to 3 times with exponential backoff (500ms, 1000ms, 2000ms)
    let rpcErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      const result = await db.rpc('deduct_commission', { p_order_id: order_id });
      if (!result.error) { rpcErr = null; break; }
      rpcErr = result.error;
    }
    if (rpcErr) {
      // All retries failed — log for manual reconciliation, but don't fail the delivery
      console.error('[orders PATCH] deduct_commission failed after 3 attempts:', rpcErr.message, '— order_id:', order_id);
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
        { priority: urgentStatuses.includes(status) ? 'urgent' : 'high', groupKey: `order:${order_id}:${status}` },
      );
    }
  }

  return NextResponse.json({ success: true, status });
}
