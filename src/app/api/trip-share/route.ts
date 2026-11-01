import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

const LIVE_STATUSES = ['accepted', 'picking_up', 'at_pickup', 'in_transit', 'returning', 'driver_returning'];

// POST { order_id } → { token }. Solo el cliente o el driver del pedido; reutiliza el enlace vigente.
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.order_id ?? '');
  if (!orderId) return NextResponse.json({ error: 'order_id requerido' }, { status: 400 });

  const db = sbAdmin();
  const { data: order } = await db.from('orders').select('id, client_email, accepted_by, status').eq('id', orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const isClient = order.client_email?.toLowerCase() === user.email;
  const isDriver = order.accepted_by?.toLowerCase() === user.email;
  if (!isClient && !isDriver) return forbidden('No autorizado');
  if (!LIVE_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'Solo se puede compartir un servicio en curso' }, { status: 409 });
  }

  const { data: existing } = await db
    .from('trip_shares')
    .select('token')
    .eq('order_id', orderId)
    .eq('created_by', user.email)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.token) return NextResponse.json({ token: existing.token });

  const token = randomBytes(18).toString('base64url');
  const { error } = await db.from('trip_shares').insert({ token, order_id: orderId, created_by: user.email });
  if (error) return serverError(error);
  return NextResponse.json({ token });
}

// GET ?token=X → datos mínimos para el enlace público (sin teléfono ni correos)
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const db = sbAdmin();
  const { data: share } = await db.from('trip_shares').select('order_id, expires_at').eq('token', token).maybeSingle();
  if (!share || new Date(share.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 });

  const { data: order } = await db
    .from('orders')
    .select('status, accepted_by, pickup_address, delivery_address, delivery_lat, delivery_lng, order_type')
    .eq('id', share.order_id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let driver: { name: string | null; plate: string | null; vehicle: string | null } | null = null;
  let location: { lat: number; lng: number; updated_at: string } | null = null;
  if (order.accepted_by) {
    const [{ data: dp }, { data: loc }] = await Promise.all([
      db.from('driver_profiles').select('first_name, license_plate, transport_mode').eq('email', order.accepted_by).maybeSingle(),
      db.from('driver_locations').select('lat, lng, updated_at').eq('driver_email', order.accepted_by).maybeSingle(),
    ]);
    driver = { name: dp?.first_name ?? null, plate: dp?.license_plate ?? null, vehicle: dp?.transport_mode ?? null };
    if (LIVE_STATUSES.includes(order.status)) location = loc ?? null;
  }

  return NextResponse.json({
    status: order.status,
    live: LIVE_STATUSES.includes(order.status),
    order_type: order.order_type ?? null,
    pickup_address: order.pickup_address ?? null,
    delivery_address: order.delivery_address ?? null,
    delivery: order.delivery_lat != null ? { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) } : null,
    driver,
    location,
  });
}
