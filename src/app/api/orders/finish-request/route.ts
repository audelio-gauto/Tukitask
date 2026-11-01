import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { emitNotification } from '@/lib/notificationEmitter';
import { FINISH_TOLERANCE_M, FINISH_MIN_PORTION, haversineKm } from '@/lib/tripFinish';

const round1000 = (n: number) => Math.round(n / 1000) * 1000;
const gs = (n: number) => Math.round(n).toLocaleString('es-PY');

// POST: el driver pide finalizar un remis lejos del destino; el servidor calcula el monto con el GPS guardado.
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

  const db = sbAdmin();
  const { data: order } = await db.from('orders').select('*').eq('id', order_id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (order.accepted_by?.toLowerCase() !== user.email) return forbidden('Not your order');
  if (order.order_type !== 'viaje') return NextResponse.json({ error: 'Solo disponible para remis' }, { status: 409 });
  if (order.status !== 'in_transit') return NextResponse.json({ error: 'El viaje no está en curso' }, { status: 409 });
  if (!('finish_request_status' in order)) return NextResponse.json({ error: 'Función no disponible todavía' }, { status: 409 });

  const { pickup_lat: pLat, pickup_lng: pLng, delivery_lat: dLat, delivery_lng: dLng } = order;
  const offer = Number(order.offer ?? 0);
  if ([pLat, pLng, dLat, dLng].some(v => v == null) || offer <= 0) {
    return NextResponse.json({ error: 'Faltan datos de ruta del viaje' }, { status: 400 });
  }

  const { data: loc } = await db.from('driver_locations').select('lat, lng, updated_at').eq('driver_email', user.email).maybeSingle();
  const fresh = loc?.updated_at && Date.now() - new Date(loc.updated_at).getTime() < 5 * 60_000;
  if (!loc || !fresh) return NextResponse.json({ error: 'No se pudo obtener tu ubicación. Activá el GPS.' }, { status: 409 });

  const routeKm = haversineKm(pLat, pLng, dLat, dLng);
  const toDestKm = haversineKm(loc.lat, loc.lng, dLat, dLng);
  const fromPickupKm = haversineKm(pLat, pLng, loc.lat, loc.lng);
  const distM = Math.round(toDestKm * 1000);
  if (distM <= FINISH_TOLERANCE_M) return NextResponse.json({ error: 'within_destination' }, { status: 409 });

  let kind: 'early' | 'extended';
  let amount: number;
  if (fromPickupKm > routeKm) {
    kind = 'extended';
    const [{ data: vp }, { data: settings }] = await Promise.all([
      db.from('vehicle_pricing').select('price_per_km').eq('vehicle_type', order.vehicle_type ?? '').maybeSingle(),
      db.from('pricing_settings').select('key, value').in('key', ['global_price_per_km', 'price_per_km']),
    ]);
    const cfg: Record<string, number> = {};
    (settings ?? []).forEach((s: { key: string; value: number }) => { cfg[s.key] = Number(s.value); });
    const rate = Number(vp?.price_per_km ?? cfg['global_price_per_km'] ?? cfg['price_per_km'] ?? 0)
      || (routeKm > 0 ? offer / routeKm : 0);
    amount = Math.max(offer, round1000(offer + toDestKm * rate));
  } else {
    kind = 'early';
    const progress = routeKm > 0 ? Math.min(1, Math.max(0, 1 - toDestKm / routeKm)) : 1;
    amount = Math.min(offer, round1000(Math.max(offer * FINISH_MIN_PORTION, offer * progress)));
  }

  const { error } = await db.from('orders').update({
    finish_request_status: 'requested',
    finish_request_kind: kind,
    finish_request_amount: amount,
    finish_request_dist_m: distM,
    finish_request_at: new Date().toISOString(),
  }).eq('id', order_id);
  if (error) return serverError(error);

  if (order.client_email) {
    emitNotification(
      order.client_email, 'status_change', 'Confirmá el fin del viaje',
      kind === 'extended'
        ? `El conductor propone finalizar con un extra: total ₲${gs(amount)}`
        : `El conductor quiere finalizar aquí: total ₲${gs(amount)}`,
      { order_id, status: 'in_transit' },
      { priority: 'urgent', groupKey: `order:${order_id}:finish-request` },
    );
  }
  return NextResponse.json({ success: true, kind, amount, distance_m: distM });
}

// PATCH: el cliente acepta o rechaza. Al aceptar, el monto acordado pasa a ser el final y la comisión se calcula sobre él.
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { order_id, action } = await req.json().catch(() => ({}));
  if (!order_id || !['accept', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'order_id y action requeridos' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data: order } = await db.from('orders').select('*').eq('id', order_id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (order.client_email?.toLowerCase() !== user.email) return forbidden('Not your order');
  if (order.status !== 'in_transit' || order.finish_request_status !== 'requested') {
    return NextResponse.json({ error: 'No hay una solicitud pendiente' }, { status: 409 });
  }

  const update: Record<string, unknown> = action === 'accept'
    ? { finish_request_status: 'accepted', original_offer: order.original_offer ?? order.offer, offer: order.finish_request_amount }
    : { finish_request_status: 'rejected' };
  const { error } = await db.from('orders').update(update).eq('id', order_id);
  if (error) return serverError(error);

  if (order.accepted_by) {
    emitNotification(
      order.accepted_by, 'status_change',
      action === 'accept' ? 'El cliente confirmó' : 'El cliente rechazó finalizar',
      action === 'accept' ? `Ya podés finalizar el viaje: ₲${gs(Number(order.finish_request_amount))}` : 'El viaje continúa hasta el destino acordado.',
      { order_id, status: 'in_transit' },
      { priority: 'urgent', groupKey: `order:${order_id}:finish-answer` },
    );
  }
  return NextResponse.json({ success: true, status: update.finish_request_status });
}
