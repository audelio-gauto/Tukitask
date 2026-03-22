import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// GET /api/orders/offers?order_id=xxx  → list offers for an order
// GET /api/orders/offers?driver_email=xxx → list offers by a driver
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const driverEmail = searchParams.get('driver_email');

  if (orderId) {
    const { data, error } = await supabase
      .from('driver_offers')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (driverEmail) {
    const { data, error } = await supabase
      .from('driver_offers')
      .select('*, orders(*)')
      .eq('driver_email', driverEmail)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Provide order_id or driver_email' }, { status: 400 });
}

// POST /api/orders/offers → driver sends an offer
// Body: { order_id, driver_email, driver_name, driver_photo, amount }
export async function POST(req: Request) {
  const body = await req.json();
  const { order_id, driver_email, amount } = body;

  if (!order_id || !driver_email || !amount) {
    return NextResponse.json({ error: 'order_id, driver_email, and amount are required' }, { status: 400 });
  }

  // Check order is still pending
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', order_id)
    .single();

  if (!order || (order.status !== 'pending' && order.status !== 'negotiating')) {
    return NextResponse.json({ error: 'Order is no longer available' }, { status: 409 });
  }

  // Check if driver already has a pending offer for this order
  const { data: existing } = await supabase
    .from('driver_offers')
    .select('id')
    .eq('order_id', order_id)
    .eq('driver_email', driver_email)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    // Update existing offer
    const { data, error } = await supabase
      .from('driver_offers')
      .update({ amount: Number(amount), updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Insert new offer
  const { data, error } = await supabase
    .from('driver_offers')
    .insert([{
      order_id,
      driver_email,
      driver_name: body.driver_name || null,
      driver_photo: body.driver_photo || null,
      amount: Number(amount),
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update order status to negotiating
  await supabase
    .from('orders')
    .update({ status: 'negotiating' })
    .eq('id', order_id)
    .eq('status', 'pending');

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/orders/offers → client accepts/rejects an offer
// Body: { offer_id, action: 'accept' | 'reject' }
export async function PATCH(req: Request) {
  const body = await req.json();
  const { offer_id, action } = body;

  if (!offer_id || !action) {
    return NextResponse.json({ error: 'offer_id and action required' }, { status: 400 });
  }

  if (action === 'accept') {
    // Get the offer
    const { data: offer, error: offerErr } = await supabase
      .from('driver_offers')
      .select('*')
      .eq('id', offer_id)
      .single();

    if (offerErr || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    // Accept this offer
    const { error: updateErr } = await supabase
      .from('driver_offers')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', offer_id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Reject all other pending offers for this order
    await supabase
      .from('driver_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('order_id', offer.order_id)
      .neq('id', offer_id)
      .eq('status', 'pending');

    // Update order: accepted + assign driver
    const { error: orderErr } = await supabase
      .from('orders')
      .update({
        status: 'accepted',
        accepted_by: offer.driver_email,
        accepted_at: new Date().toISOString(),
        offer: offer.amount,
      })
      .eq('id', offer.order_id);

    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

    return NextResponse.json({ success: true, offer });
  }

  if (action === 'reject') {
    const { error } = await supabase
      .from('driver_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', offer_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
