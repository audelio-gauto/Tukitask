import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// GET: Listar pedidos
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientEmail = searchParams.get('client_email');
  const driverEmail = searchParams.get('driver_email');

  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientEmail) {
    query = query.eq('client_email', clientEmail);
  } else if (driverEmail) {
    // Driver's active jobs
    query = query.eq('accepted_by', driverEmail).in('status', ['accepted', 'picking_up', 'in_transit']);
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

// PATCH: Update order status (driver transitions)
export async function PATCH(req: Request) {
  const body = await req.json();
  const { order_id, status, driver_email } = body;

  if (!order_id || !status) {
    return NextResponse.json({ error: 'order_id and status required' }, { status: 400 });
  }

  const allowed: Record<string, string[]> = {
    picking_up: ['accepted'],
    in_transit: ['picking_up'],
    delivered: ['in_transit'],
  };

  if (!allowed[status]) {
    return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
  }

  // Verify order exists and is in correct previous state
  const { data: order } = await supabase
    .from('orders')
    .select('status, accepted_by')
    .eq('id', order_id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!allowed[status].includes(order.status)) {
    return NextResponse.json({ error: `Cannot transition from ${order.status} to ${status}` }, { status: 409 });
  }
  if (driver_email && order.accepted_by !== driver_email) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 });
  }

  const updates: Record<string, unknown> = { status };
  if (status === 'delivered') updates.completed_at = new Date().toISOString();

  const { error } = await supabase.from('orders').update(updates).eq('id', order_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, status });
}
