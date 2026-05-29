import { NextResponse } from 'next/server';
import { forbidden, getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';

type PatchBody = {
  action?: 'accept_counter' | 'edit_counter';
  counterAmount?: number;
  message?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = sbAdmin();

  const { data: negotiation, error } = await db
    .from('tukibot_negotiations')
    .select('id, vendor_id, vendor_email, buyer_id, buyer_email, buyer_name, product_name, product_image, listed_price, buyer_offer, counter_amount, quantity, status, meta')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!negotiation) return NextResponse.json({ error: 'Negociación no encontrada' }, { status: 404 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const action = body.action;
  if (!action) return NextResponse.json({ error: 'Acción requerida' }, { status: 400 });

  if (action === 'accept_counter') {
    if (negotiation.buyer_id !== user.id) return forbidden();
    if (negotiation.status !== 'countered') {
      return NextResponse.json({ error: 'La negociación ya no está pendiente de aceptación' }, { status: 409 });
    }

    const finalAmount = Number(negotiation.counter_amount ?? negotiation.buyer_offer ?? negotiation.listed_price);
    const updatePayload = {
      status: 'accepted_pending_payment',
      final_amount: finalAmount,
      accepted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await db
      .from('tukibot_negotiations')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await db.from('notifications').insert({
      user_email: negotiation.vendor_email,
      type: 'market_negotiation_accepted',
      title: '✅ Oferta aceptada, falta pago',
      body: `${negotiation.buyer_name || negotiation.buyer_email || 'Un cliente'} aceptó la contraoferta de ${negotiation.product_name || 'tu producto'}.`,
      data: { negotiation_id: id },
    });

    return NextResponse.json({ ok: true, status: 'accepted_pending_payment', finalAmount });
  }

  if (action === 'edit_counter') {
    if (negotiation.vendor_id !== user.id) return forbidden();
    if (!['countered', 'accepted_pending_payment'].includes(negotiation.status)) {
      return NextResponse.json({ error: 'La negociación ya no se puede editar' }, { status: 409 });
    }

    const counterAmount = Number(body.counterAmount ?? 0);
    if (!Number.isFinite(counterAmount) || counterAmount <= 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const nextExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const message = (body.message || '').trim();

    const { error: updateError } = await db
      .from('tukibot_negotiations')
      .update({
        counter_amount: counterAmount,
        final_amount: null,
        bot_message: message || null,
        status: 'countered',
        accepted_at: null,
        expires_at: nextExpiration,
        last_price_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await db.from('notifications').insert({
      user_email: negotiation.buyer_email,
      type: 'market_negotiation_counter_updated',
      title: '💬 Tu oferta recibió una nueva propuesta',
      body: `Nueva contraoferta para ${negotiation.product_name || 'tu producto'}: Gs. ${counterAmount.toLocaleString('es-PY')}`,
      data: { negotiation_id: id },
    });

    return NextResponse.json({ ok: true, status: 'countered', counterAmount, expiresAt: nextExpiration });
  }

  return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
}
