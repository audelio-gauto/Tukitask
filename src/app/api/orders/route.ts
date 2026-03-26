import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';

// GET: Listar pedidos — abierto (scoped por email de query param)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientEmail = searchParams.get('client_email');
  const driverEmail = searchParams.get('driver_email');
  const history = searchParams.get('history');

  let query = supabaseServer
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (clientEmail) {
    query = query.eq('client_email', clientEmail);
  } else if (driverEmail && searchParams.get('only_failed') === 'true') {
    // Driver's failed / return-rejected orders (awaiting action)
    query = query.eq('accepted_by', driverEmail).in('status', ['failed', 'return_rejected']);
  } else if (driverEmail && history === 'true') {
    // Driver delivery history: completed/failed/returned orders
    query = query.eq('accepted_by', driverEmail).in('status', ['delivered', 'cancelled', 'returned', 'return_rejected']);
  } else if (driverEmail) {
    // Driver's active jobs (including return flow)
    query = query.eq('accepted_by', driverEmail).in('status', ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered', 'return_rejected']);
  } else {
    query = query.in('status', ['pending', 'negotiating']).limit(100);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: Crear pedido — requiere auth; client_email se fuerza desde el token
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json();
  // Forzar client_email desde el token — nunca confiar en el body
  const safeBody = { ...body, client_email: user.email };
  const { data, error } = await supabaseServer
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
    returning: ['failed', 'return_rejected'], // request return or re-request after rejection
    return_delivered: ['driver_returning'],
    incident_closed: ['return_rejected'], // driver closes after 3 rejections
  };

  // Client-initiated transitions
  const clientAllowed: Record<string, string[]> = {
    driver_returning: ['returning'],   // client accepts the return
    returned: ['return_delivered'],    // client confirms receipt
    return_rejected: ['return_delivered', 'returning'], // client rejects receipt or return request
    cancelled: ['pending', 'negotiating'], // client cancels the search
  };

  const isDriverStatus = status in driverAllowed;
  const isClientStatus = status in clientAllowed;

  if (!isDriverStatus && !isClientStatus) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from('orders')
    .select('status, accepted_by, client_email, return_attempts')
    .eq('id', order_id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Verificar ownership mediante el token — no trusting body emails
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

  const coreUpdates: Record<string, unknown> = { status };
  if (status === 'delivered') coreUpdates.completed_at = new Date().toISOString();

  const { error } = await supabaseServer.from('orders').update(coreUpdates).eq('id', order_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Columnas opcionales añadidas en migration 011 — fallan silenciosamente si no existen
  const extraUpdates: Record<string, unknown> = {};
  if (status === 'failed' && fail_reason) extraUpdates.fail_reason = fail_reason;
  if (status === 'returning' && return_reason) extraUpdates.return_reason = return_reason;
  if (status === 'returning') extraUpdates.returning_at = new Date().toISOString();
  if (status === 'returning') extraUpdates.return_attempts = (Number(order.return_attempts) || 0) + 1;
  if (status === 'incident_closed') extraUpdates.incident_closed_at = new Date().toISOString();
  if (status === 'returned') extraUpdates.returned_at = new Date().toISOString();
  if (status === 'return_rejected' && return_rejected_reason) extraUpdates.return_rejected_reason = return_rejected_reason;
  if (Object.keys(extraUpdates).length > 0) {
    await supabaseServer.from('orders').update(extraUpdates).eq('id', order_id);
  }

  return NextResponse.json({ success: true, status });
}
