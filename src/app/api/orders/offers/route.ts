import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { allowRequest } from '@/lib/rateLimit';

// GET — requiere token (datos privados de negociación)
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('order_id');
  const orderIds = searchParams.get('order_ids'); // batch: comma-separated IDs
  const driverEmail = searchParams.get('driver_email');

  // Batch fetch: offers for multiple orders in one query
  if (orderIds) {
    const ids = orderIds.split(',').filter(Boolean).slice(0, 50); // max 50
    if (ids.length === 0) return NextResponse.json({});
    const { data, error } = await supabaseServer
      .from('driver_offers')
      .select('*')
      .in('order_id', ids)
      .in('status', ['pending', 'accepted'])   // accepted needed for tracking card
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with driver_profiles (avg_rating, total_ratings, vehicle info)
    const driverEmails = [...new Set((data ?? []).map((o: Record<string,unknown>) => o.driver_email as string).filter(Boolean))];
    const profileMap: Record<string, { avg_rating: number | null; total_ratings: number | null; vehicle_brand: string | null; vehicle_model: string | null; acceptance_rate: number | null; avg_response_seconds: number | null }> = {};
    if (driverEmails.length > 0) {
      const { data: profiles } = await supabaseServer
        .from('driver_profiles')
        .select('email, avg_rating, total_ratings, vehicle_type, transport_mode, acceptance_rate, avg_response_seconds')
        .in('email', driverEmails);
      (profiles ?? []).forEach((p: { email: string; avg_rating: number | null; total_ratings: number | null; vehicle_type: string | null; transport_mode: string | null; acceptance_rate: number | null; avg_response_seconds: number | null }) => {
        let vbrand: string | null = null;
        let vmodel: string | null = null;
        try {
          const vd = JSON.parse(p.vehicle_type || '{}');
          const mode = p.transport_mode || '';
          vbrand = vd[mode]?.marca || null;
          vmodel = vd[mode]?.modelo || null;
        } catch { /* noop */ }
        profileMap[p.email] = { avg_rating: p.avg_rating ?? null, total_ratings: p.total_ratings ?? null, vehicle_brand: vbrand, vehicle_model: vmodel, acceptance_rate: p.acceptance_rate ?? null, avg_response_seconds: p.avg_response_seconds ?? null };
      });
    }

    // Group by order_id
    const grouped: Record<string, unknown[]> = {};
    for (const offer of data ?? []) {
      const prof = profileMap[offer.driver_email];
      const { computeMatchScore } = await import('@/lib/matchScore');
      const matchResult = computeMatchScore({
        avgRating:          prof?.avg_rating          ?? null,
        distanceKm:         offer.distance_km         ?? null,
        acceptanceRate:     prof?.acceptance_rate     ?? null,
        avgResponseSeconds: prof?.avg_response_seconds ?? null,
      });
      const enriched = {
        ...offer,
        driver_avg_rating:         prof?.avg_rating          ?? null,
        driver_total_ratings:      prof?.total_ratings       ?? null,
        driver_vehicle_brand:      prof?.vehicle_brand       ?? null,
        driver_vehicle_model:      prof?.vehicle_model       ?? null,
        driver_acceptance_rate:    prof?.acceptance_rate     ?? null,
        driver_avg_response_secs:  prof?.avg_response_seconds ?? null,
        match_score:               matchResult.score,
        match_label:               matchResult.label,
        match_color:               matchResult.color,
      };
      if (!grouped[offer.order_id]) grouped[offer.order_id] = [];
      grouped[offer.order_id].push(enriched);
    }
    return NextResponse.json(grouped);
  }

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
import { emitNotification } from '@/lib/notificationEmitter';
import { cacheDel } from '@/lib/cache';
export async function POST(req: Request) {

  // Rate limit por IP+endpoint — 30 ofertas por minuto por IP (negociación activa puede enviar varias)
  const ip = req.headers.get('x-forwarded-for') || 'local';
  const allowed = await allowRequest(`rl:offers:post:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Demasiadas ofertas en poco tiempo. Esperá un momento.' }, { status: 429 });

  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  // E-1: Verificar saldo mínimo de billetera antes de permitir oferta
  // Previene que drivers con saldo insuficiente participen en el mercado.
  const minBal = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);
  {
    const { data: wallet } = await supabaseServer
      .from('driver_wallets')
      .select('balance')
      .eq('driver_email', user.email)
      .maybeSingle();
    const balance = Number(wallet?.balance ?? 0);
    if (balance < minBal) {
      return NextResponse.json({ error: 'saldo_insuficiente', balance }, { status: 402 });
    }
  }

  const body = await req.json();
  const { order_id, amount } = body;
  const note: string | null = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  const distanceKm: number | null = typeof body.distance_km === 'number' && body.distance_km >= 0 ? Math.round(body.distance_km * 10) / 10 : null;

  if (!order_id || !amount) {
    return NextResponse.json({ error: 'order_id y amount son requeridos' }, { status: 400 });
  }

  const { data: order } = await supabaseServer
    .from('orders')
    .select('status, created_at')
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
      .update({ amount: Number(amount), note, distance_km: distanceKm, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Fetch client_email to store on offer (enables filtered realtime subscriptions)
  const { data: orderForClient } = await supabaseServer
    .from('orders')
    .select('client_email')
    .eq('id', order_id)
    .single();
  const clientEmail = orderForClient?.client_email ?? null;

  // Fetch driver info server-side — do NOT trust body.driver_name / body.driver_photo
  const { data: driverProfile } = await supabaseServer
    .from('driver_profiles')
    .select('first_name, last_name, profile_photo')
    .eq('email', driverEmail)
    .maybeSingle();
  const driverName  = [driverProfile?.first_name, driverProfile?.last_name].filter(Boolean).join(' ') || null;
  const driverPhoto = driverProfile?.profile_photo ?? null;

  const { data, error } = await supabaseServer
    .from('driver_offers')
    .insert([{
      order_id,
      driver_email: driverEmail,
      driver_name: driverName,
      driver_photo: driverPhoto,
      amount: Number(amount),
      note,
      distance_km: distanceKm,
      client_email: clientEmail,
    }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseServer
    .from('orders')
    .update({ status: 'negotiating' })
    .eq('id', order_id)
    .eq('status', 'pending');

  // ── Matching stats: track response time for this driver (fire-and-forget) ──
  try {
    const responseSecs = order?.created_at
      ? Math.max(0, Math.round((Date.now() - new Date(order.created_at).getTime()) / 1000))
      : 60;
    await supabaseServer.rpc('record_driver_offer', {
      p_driver_email: driverEmail,
      p_response_seconds: responseSecs,
    });
  } catch { /* migration may not be applied yet — safe to ignore */ }

  // Notify the client about the new offer
  const { data: orderInfo } = await supabaseServer
    .from('orders')
    .select('client_email')
    .eq('id', order_id)
    .single();
  if (orderInfo?.client_email) {
    emitNotification(
      orderInfo.client_email,
      'new_offer',
      'Nueva oferta recibida',
      `Un conductor ofreció ${Number(amount).toLocaleString('es-PY')} ₲ para tu envío`,
      { order_id, offer_id: data.id },
      { groupKey: `offer:order:${order_id}` },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
export async function PATCH(req: Request) {

  // Rate limit por IP+endpoint
  const ip = req.headers.get('x-forwarded-for') || 'local';
  const allowed = await allowRequest(`rl:offers:patch:${ip}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

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
    // Invalidate available-orders cache so drivers see this order disappear immediately
    await cacheDel('orders:v2:available');
    // Notify the driver that their offer was accepted
    const accepted = result.offer as Record<string, unknown> | undefined;
    if (accepted?.driver_email) {
      emitNotification(
        String(accepted.driver_email),
        'offer_accepted',
        '¡Oferta aceptada!',
        'Tu oferta de envío fue aceptada. Dirígete al punto de recogida.',
        { order_id: accepted.order_id, offer_id },
        { priority: 'urgent' },
      );
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

    // Get driver email before rejecting so we can notify them
    const { data: offerForNotif } = await supabaseServer
      .from('driver_offers')
      .select('driver_email')
      .eq('id', offer_id)
      .single();

    const { error } = await supabaseServer
      .from('driver_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', offer_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Notify driver of rejection
    if (offerForNotif?.driver_email) {
      emitNotification(
        offerForNotif.driver_email,
        'offer_rejected',
        'Oferta rechazada',
        'Tu oferta fue rechazada por el cliente.',
        { offer_id },
        { priority: 'high' },
      );
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
