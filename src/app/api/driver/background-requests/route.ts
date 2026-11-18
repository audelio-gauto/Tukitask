import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

// Endpoint liviano para el servicio nativo Android que busca solicitudes
// mientras el conductor usa Google Maps/Waze u otra app. No reemplaza a
// /api/orders: solo devuelve lo mínimo para mostrar la notificación/burbuja.
const MIN_WALLET_BALANCE = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);
const ACTIVE_STATUSES = [
  'accepted', 'awaiting_payment', 'payment_confirmed', 'picking_up',
  'at_pickup', 'in_transit', 'returning', 'driver_returning',
  'return_delivered', 'return_rejected',
];
const RECENT_MS = 3 * 60 * 60 * 1000;
const SCHEDULED_NOTICE_MS = 30 * 60 * 1000;

interface FeedRow {
  order_id: string;
}

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
    .select('accepting_orders')
    .eq('email', user.email)
    .maybeSingle();
  if (profileError) return serverError(profileError, 'background-requests profile');
  if (profile?.accepting_orders === false) {
    return NextResponse.json({ orders: [] }, { headers: { 'Cache-Control': 'no-store' } });
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
      { headers: { 'Cache-Control': 'no-store' } },
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
    return NextResponse.json({ orders: [], busy: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: feedRows, error: feedError } = await db
    .from('driver_feed')
    .select('order_id')
    .eq('driver_email', user.email)
    .order('matched_at', { ascending: false })
    .limit(60);
  if (feedError) return serverError(feedError, 'background-requests feed');

  const orderIds = [...new Set(
    ((feedRows ?? []) as FeedRow[])
      .map(row => row.order_id)
      .filter((id): id is string => Boolean(id)),
  )];
  if (orderIds.length === 0) {
    return NextResponse.json({ orders: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const recentSince = new Date(Date.now() - RECENT_MS).toISOString();
  const { data: orders, error: ordersError } = await db
    .from('orders')
    .select('id, pickup_address, delivery_address, offer, suggested_price, vehicle_type, order_type, created_at, status, date_scheduled')
    .in('id', orderIds)
    .in('status', ['pending', 'negotiating'])
    .or(`created_at.gte.${recentSince},date_scheduled.not.is.null`)
    .limit(60);
  if (ordersError) return serverError(ordersError, 'background-requests orders');

  const soon = Date.now() + SCHEDULED_NOTICE_MS;
  const visible = ((orders ?? []) as BackgroundOrder[]).filter(order => {
    if (!order.date_scheduled) return true;
    const scheduledAt = new Date(order.date_scheduled).getTime();
    return Number.isFinite(scheduledAt) && scheduledAt <= soon;
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
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
