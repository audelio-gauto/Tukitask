import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';
import { allowRequest } from '@/lib/rateLimit';

type PendingOrder = {
  id: string;
  created_at: string;
  vendor_email: string;
  negotiation_id: string | null;
  items: Array<{ productId: string; price: number; qty: number; negotiationId?: string | null }>;
};

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const allowed = await allowRequest(`rl:market-proof:${user.email}`, 5, 600);
  if (!allowed) return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 });

  let body: { orderIds?: unknown; payment_proof_base64?: unknown; payment_proof_mime?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const orderIds = Array.isArray(body.orderIds)
    ? Array.from(new Set(body.orderIds.filter((id): id is string => typeof id === 'string')))
    : [];
  const mime = typeof body.payment_proof_mime === 'string' ? body.payment_proof_mime : '';
  const base64 = typeof body.payment_proof_base64 === 'string' ? body.payment_proof_base64 : '';

  if (orderIds.length === 0 || orderIds.length > 20 || !base64 || !mime) {
    return NextResponse.json({ error: 'Datos del comprobante incompletos' }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(mime as never)) {
    return NextResponse.json({ error: 'Formato de imagen no soportado' }, { status: 400 });
  }

  const proofBuffer = Buffer.from(base64, 'base64');
  if (proofBuffer.length === 0 || proofBuffer.length > MAX_FILE_SIZE_PHOTO) {
    return NextResponse.json({ error: 'El comprobante debe pesar hasta 2 MB' }, { status: 400 });
  }
  if (!validateImageMagicBytes(proofBuffer, mime)) {
    return NextResponse.json({ error: 'El comprobante no es una imagen válida' }, { status: 400 });
  }

  const db = sbAdmin();
  const { data, error } = await db
    .from('market_orders')
    .select('id, created_at, vendor_email, negotiation_id, items')
    .in('id', orderIds)
    .eq('client_email', user.email)
    .eq('payment_method', 'transferencia')
    .eq('payment_status', 'awaiting_confirmation')
    .eq('status', 'pending')
    .is('payment_proof_url', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orders = (data ?? []) as PendingOrder[];
  if (orders.length !== orderIds.length) {
    return NextResponse.json({ error: 'Uno o más pedidos no están disponibles para recibir el comprobante' }, { status: 409 });
  }
  if (orders.some(order => Date.now() - new Date(order.created_at).getTime() > 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'La reserva de estos pedidos venció. Volvé a generar el pedido.' }, { status: 410 });
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const emailSafe = (user.email ?? '').replace(/[^a-z0-9]/gi, '_');
  const fileName = `market-checkout/${emailSafe}_${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from('delivery-proofs')
    .upload(fileName, proofBuffer, { contentType: mime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Error al subir comprobante: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = db.storage.from('delivery-proofs').getPublicUrl(fileName);
  const { data: updatedOrders, error: updateError } = await db
    .from('market_orders')
    .update({ payment_proof_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .in('id', orderIds)
    .eq('client_email', user.email)
    .eq('payment_method', 'transferencia')
    .eq('payment_status', 'awaiting_confirmation')
    .eq('status', 'pending')
    .is('payment_proof_url', null)
    .select('id');

  if (updateError || !updatedOrders || updatedOrders.length !== orderIds.length) {
    await db.storage.from('delivery-proofs').remove([fileName]);
    return NextResponse.json(
      { error: updateError?.message ?? 'El pedido cambió mientras se enviaba el comprobante. Intentá nuevamente.' },
      { status: updateError ? 500 : 409 },
    );
  }

  for (const order of orders) {
    const itemNegotiations = (order.items ?? []).filter(item => item.negotiationId);
    const negotiationIds = Array.from(new Set(
      itemNegotiations.map(item => item.negotiationId as string).concat(order.negotiation_id ?? [])
    ));
    for (const negotiationId of negotiationIds) {
      const finalAmount = itemNegotiations
        .filter(item => item.negotiationId === negotiationId)
        .reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
      await db
        .from('tukibot_negotiations')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          market_order_id: order.id,
          ...(finalAmount > 0 ? { final_amount: finalAmount } : {}),
        })
        .eq('id', negotiationId)
        .eq('buyer_id', user.id);
    }
  }

  const vendorEmails = Array.from(new Set(orders.map(order => order.vendor_email)));
  const notificationResults = await Promise.all(vendorEmails.map(vendorEmail => {
    const vendorOrderIds = orders.filter(order => order.vendor_email === vendorEmail).map(order => order.id);
    return db.from('notifications').insert({
      user_email: vendorEmail,
      type: 'new_market_order',
      title: '🧾 Comprobante recibido',
      body: `El cliente envió el comprobante para ${vendorOrderIds.length === 1 ? `el pedido #${vendorOrderIds[0].slice(0, 8).toUpperCase()}` : `${vendorOrderIds.length} pedidos`}. Revisá el pago antes de preparar.`,
      data: { order_ids: vendorOrderIds, payment_status: 'awaiting_confirmation' },
    });
  }));
  notificationResults.forEach(result => {
    if (result.error) console.error('[market-orders/payment-proof] notification error:', result.error.message);
  });

  return NextResponse.json({ success: true, orderIds });
}