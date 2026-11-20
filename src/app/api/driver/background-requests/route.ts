import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';
import { haversineKm } from '@/lib/geo';

export const dynamic = 'force-dynamic';

// Endpoint liviano para el servicio nativo Android que busca solicitudes
// mientras el conductor usa Google Maps/Waze u otra app. Consulta `orders`
// directamente (igual que /api/orders) en vez de depender de `driver_feed`:
// una fila faltante en el feed dejaba al conductor sin notificación de Android.
const MIN_WALLET_BALANCE = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);
const ACTIVE_STATUSES = [
  'accepted', 'awaiting_payment', 'payment_confirmed', 'picking_up',
  'at_pickup', 'in_transit', 'returning', 'driver_returning',
  'return_delivered', 'return_rejected',
];
const RECENT_MS = 3 * 60 * 60 * 1000;
const SCHEDULED_NOTICE_MS = 30 * 60 * 1000;
const NO_STORE = { 'Cache-Control': 'no-store' };

const FILTER_MAP: Record<string, string> = {
  moto: 'moto_envios',
  auto: 'auto_envios',
  moto_carro: 'moto_carro_fletes',
  camion: 'camion_fletes',
};
const VT_MAP: Record<string, string> = {
  moto: 'moto',
  auto: 'auto',
  motocarro: 'moto_carro',
  camion2t: 'camion',
};

interface BackgroundOrder {
  id: string;
  pickup_address: string | null;
  delivery_address: string | null;
  offer: string | number | null;
  suggested_price: number | null;
  vehicle_type: string | null;
  order_type: string | null;
  created_at: string;
  status: string;
  date_scheduled: string | null;
  pickup_lat: string | number | null;
  pickup_lng: string | number | null;
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const db = sbAdmin();

  const { data: userRow, error: roleError } = await db
    .from('users')
    .select('role')
    .eq('email', user.email)
    .maybeSingle();
  if (roleError) return serverError(roleError, 'background-requests role');
  if (!['driver', 'admin', 'super_admin', 'owner'].includes(userRow?.role ?? '')) return forbidden();

  const { data: profile, error: profileError } = await db
    .from('driver_profiles')
    .select('accepting_orders, service_filters, pickup_range')
    .eq('email', user.email)
    .maybeSingle();
  if (profileError) return serverError(profileError, 'background-requests profile');
  if (profile?.accepting_orders === false) {
    return NextResponse.json({ orders: [] }, { headers: NO_STORE });
  }

  const { data: wallet } = await db
    .from('driver_wallets')
    .select('balance')
    .eq('driver_email', user.email)
    .maybeSingle();
  const balance = Number(wallet?.balance ?? 0);
  if (balance < MIN_WALLET_BALANCE) {
    return NextResponse.json(
      { orders: [], wallet_blocked: true, balance },
      { headers: NO_STORE },
    );
  }

  // Un conductor con un servicio en curso no debe recibir avisos de otros.
  const { data: activeOrders, error: activeError } = await db
    .from('orders')
    .select('id')
    .eq('accepted_by', user.email)
    .in('status', ACTIVE_STATUSES)
    .limit(1);
  if (activeError) return serverError(activeError, 'background-requests active');
  if ((activeOrders ?? []).length > 0) {
    return NextResponse.json({ orders: [], busy: true }, { headers: NO_STORE });
  }

  const locationRes = await db.from('driver_locations')
    .select('lat, lng')
    .eq('driver_email', user.email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (locationRes.error) return serverError(locationRes.error, 'background-requests location');

  const sf = (profile?.service_filters as Record<string, boolean> | null) ?? {};
  const pickupRange = Number(profile?.pickup_range ?? 50);
  // Mismos tipos de vehículo que el feed: solo respetar los filtros activos.
  // No exigir documentos para avisar, igual que hace la notificación in-app.
  const allowedVehicleTypes: string[] = [];
  for (const [orderVt, driverVt] of Object.entries(VT_MAP)) {
    const filter = FILTER_MAP[driverVt];
    if (filter && sf[filter] === false) continue;
    allowedVehicleTypes.push(orderVt);
  }
  if (allowedVehicleTypes.length === 0) {
    return NextResponse.json({ orders: [] }, { headers: NO_STORE });
  }

  const lat = locationRes.data?.lat != null ? Number(locationRes.data.lat) : null;
  const lng = locationRes.data?.lng != null ? Number(locationRes.data.lng) : null;
  const hasLocation = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  const recentSince = new Date(Date.now() - RECENT_MS).toISOString();
  const query = db
    .from('orders')
    .select('id, pickup_address, delivery_address, offer, suggested_price, vehicle_type, order_type, created_at, status, date_scheduled, pickup_lat, pickup_lng')
    .in('status', ['pending', 'negotiating'])
    .in('vehicle_type', allowedVehicleTypes)
    .or(`created_at.gte.${recentSince},date_scheduled.not.is.null`)
    .limit(60);
  const { data: orders, error: ordersError } = await query;
  if (ordersError) return serverError(ordersError, 'background-requests orders');

  const soon = Date.now() + SCHEDULED_NOTICE_MS;
  const visible = ((orders ?? []) as BackgroundOrder[])
    .filter(order => order.order_type !== 'mandadito')
    .filter(order => {
      if (!order.date_scheduled) return true;
      const scheduledAt = Date.parse(order.date_scheduled);
      return Number.isFinite(scheduledAt) && scheduledAt <= soon;
    })
    .filter(order => {
      if (!hasLocation) return true;
      if (order.pickup_lat == null || order.pickup_lng == null) return false;
      const oLat = Number(order.pickup_lat);
      const oLng = Number(order.pickup_lng);
      if (!Number.isFinite(oLat) || !Number.isFinite(oLng)) return false;
      return haversineKm(lat!, lng!, oLat, oLng) <= pickupRange;
    });

  return NextResponse.json(
    {
      orders: visible.map(order => ({
        id: order.id,
        pickup_address: order.pickup_address,
        delivery_address: order.delivery_address,
        offer: order.offer,
        suggested_price: order.suggested_price,
        vehicle_type: order.vehicle_type,
        order_type: order.order_type,
        created_at: order.created_at,
      })),
    },
    { headers: NO_STORE },
  );
}
