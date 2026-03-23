import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// GET: Listar pedidos
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientEmail = searchParams.get('client_email');
  const driverEmail = searchParams.get('driver_email');
  const history = searchParams.get('history');

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientEmail) {
    query = query.eq('client_email', clientEmail);
  } else if (driverEmail && searchParams.get('only_failed') === 'true') {
    // Driver's currently failed orders (awaiting retry or return decision)
    query = query.eq('accepted_by', driverEmail).eq('status', 'failed');
  } else if (driverEmail && history === 'true') {
    // Driver delivery history: completed/failed/returned orders
    query = query.eq('accepted_by', driverEmail).in('status', ['delivered', 'cancelled', 'returned', 'return_rejected']);
  } else if (driverEmail) {
    // Driver's active jobs (including return flow)
    query = query.eq('accepted_by', driverEmail).in('status', ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered']);
  } else {
    query = query.in('status', ['pending', 'negotiating']);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: Crear nuevo pedido
export async function POST(req: Request) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('orders')
    .insert([body])
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: Update order status (driver or client transitions)
export async function PATCH(req: Request) {
  const body = await req.json();
  const { order_id, status, driver_email, client_email, fail_reason, return_rejected_reason } = body;

  if (!order_id || !status) {
    return NextResponse.json({ error: 'order_id and status required' }, { status: 400 });
  }

  // Driver-initiated transitions
  const driverAllowed: Record<string, string[]> = {
    picking_up: ['accepted'],
    in_transit: ['picking_up', 'failed'], // failed → retry delivery
    delivered: ['in_transit'],
    failed: ['in_transit'],
    returning: ['failed'],
    return_delivered: ['driver_returning'],
  };

  // Client-initiated transitions
  const clientAllowed: Record<string, string[]> = {
    driver_returning: ['returning'],   // client accepts the return
    returned: ['return_delivered'],    // client confirms receipt
    return_rejected: ['return_delivered'], // client rejects receipt
  };

  const isDriverStatus = status in driverAllowed;
  const isClientStatus = status in clientAllowed;

  if (!isDriverStatus && !isClientStatus) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }

  const { data: order } = await supabase
    .from('orders')
    .select('status, accepted_by, client_email')
    .eq('id', order_id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const allowedPrev = isClientStatus ? clientAllowed[status] : driverAllowed[status];
  if (!allowedPrev.includes(order.status)) {
    return NextResponse.json({ error: `Cannot transition from ${order.status} to ${status}` }, { status: 409 });
  }

  if (driver_email && order.accepted_by !== driver_email) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 });
  }
  if (client_email && order.client_email !== client_email) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === 'delivered') updates.completed_at = new Date().toISOString();
  if (status === 'failed' && fail_reason) updates.fail_reason = fail_reason;
  if (status === 'returning') updates.returning_at = new Date().toISOString();
  if (status === 'returned') updates.returned_at = new Date().toISOString();
  if (status === 'return_rejected' && return_rejected_reason) updates.return_rejected_reason = return_rejected_reason;

  const { error } = await supabase.from('orders').update(updates).eq('id', order_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, status });
}
