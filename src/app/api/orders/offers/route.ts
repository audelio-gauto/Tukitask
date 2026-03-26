import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';

// GET — open (datos públicos para la negociación)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const driverEmail = searchParams.get('driver_email');

  if (orderId) {
    const { data, error } = await supabaseServer
      .from('driver_offers')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (driverEmail) {
    const { data, error } = await supabaseServer
      .from('driver_offers')
      .select('*, orders(*)')
      .eq('driver_email', driverEmail)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Provide order_id or driver_email' }, { status: 400 });
}

// POST — driver envía oferta; driver_email se fuerza desde el token
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { order_id, amount } = body;

  if (!order_id || !amount) {
    return NextResponse.json({ error: 'order_id y amount son requeridos' }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from('orders')
    .select('status')
    .eq('id', order_id)
    .single();

  if (!order || (order.status !== 'pending' && order.status !== 'negotiating')) {
    return NextResponse.json({ error: 'Order is no longer available' }, { status: 409 });
  }

  // Usar email del token — no del body
  const driverEmail = user.email;

  const { data: existing } = await supabaseServer
    .from('driver_offers')
    .select('id')
    .eq('order_id', order_id)
    .eq('driver_email', driverEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseServer
      .from('driver_offers')
      .update({ amount: Number(amount), updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabaseServer
    .from('driver_offers')
    .insert([{
      order_id,
      driver_email: driverEmail,
      driver_name: body.driver_name || null,
      driver_photo: body.driver_photo || null,
      amount: Number(amount),
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseServer
    .from('orders')
    .update({ status: 'negotiating' })
    .eq('id', order_id)
    .eq('status', 'pending');

  return NextResponse.json(data, { status: 201 });
}

// PATCH — cliente acepta/rechaza oferta; se verifica que el cliente sea dueño del pedido
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { offer_id, action } = body;

  if (!offer_id || !action) {
    return NextResponse.json({ error: 'offer_id and action required' }, { status: 400 });
  }

  if (action === 'accept') {
    // Single atomic RPC — prevents double-acceptance race conditions via FOR UPDATE lock
    const { data, error } = await supabaseServer.rpc('accept_offer', {
      p_offer_id:    offer_id,
      p_client_email: user.email,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const result = data as { success: boolean; error?: string; status?: number; offer?: object };
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ success: true, offer: result.offer });
  }

  if (action === 'reject') {
    // Verificar ownership antes de rechazar
    const { data: offer } = await supabaseServer
      .from('driver_offers')
      .select('order_id')
      .eq('id', offer_id)
      .single();
    if (offer) {
      const { data: order } = await supabaseServer
        .from('orders')
        .select('client_email')
        .eq('id', offer.order_id)
        .single();
      if (!order || order.client_email !== user.email) return forbidden('Not your order');
    }

    const { error } = await supabaseServer
      .from('driver_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', offer_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
