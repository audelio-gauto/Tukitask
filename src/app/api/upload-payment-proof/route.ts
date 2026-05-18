import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';

/**
 * POST /api/upload-payment-proof
 * Uploads a payment transfer screenshot for a mandadito order.
 * Called by the CLIENT (not the driver).
 * Body: { order_id, base64, mimeType }
 * Returns: { url }
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const { order_id, base64, mimeType } = await req.json() as { order_id: string; base64: string; mimeType: string };
    if (!order_id || !base64 || !mimeType) {
      return NextResponse.json({ error: 'order_id, base64, mimeType son requeridos' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as never)) {
      return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG o WebP' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_FILE_SIZE_PHOTO) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 2MB)' }, { status: 400 });
    }

    if (!validateImageMagicBytes(buffer, mimeType)) {
      return NextResponse.json({ error: 'El archivo no es una imagen válida' }, { status: 400 });
    }

    const db = sbAdmin();

    // Verify: client owns this order AND it is a mandadito in awaiting_payment
    const { data: order } = await db
      .from('orders')
      .select('client_email, order_type, status, accepted_by')
      .eq('id', order_id)
      .single();
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    if (order.client_email?.toLowerCase() !== user.email) return forbidden('Not your order');
    if (order.order_type !== 'mandadito') {
      return NextResponse.json({ error: 'Solo válido para pedidos mandadito' }, { status: 409 });
    }
    if (order.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'El pedido no está esperando pago' }, { status: 409 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `payment_proof_${order_id}.${ext}`;

    const { error: uploadError } = await db.storage
      .from('delivery-proofs')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('[upload-payment-proof] storage error:', uploadError);
      return NextResponse.json({ error: 'Error subiendo imagen: ' + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = db.storage.from('delivery-proofs').getPublicUrl(fileName);
    const proofUrl = urlData.publicUrl;

    // Save proof URL to order — requires migration 066 (payment_proof_url column)
    const { error: updateError } = await db.from('orders').update({ payment_proof_url: proofUrl }).eq('id', order_id);
    if (updateError) {
      console.error('[upload-payment-proof] update error:', updateError);
      return NextResponse.json({ error: 'Error guardando comprobante: ' + updateError.message + ' — Asegurate de correr la migración 066 en Supabase' }, { status: 500 });
    }

    // Notify the driver that the client uploaded the proof
    if (order.accepted_by) {
      const { emitNotification } = await import('@/lib/notificationEmitter');
      emitNotification(
        order.accepted_by,
        'status_change',
        '💳 Comprobante recibido',
        'El cliente subió el comprobante de pago — confirmá para ir a comprar',
        { order_id },
        { priority: 'urgent', groupKey: `order:${order_id}:payment_proof` },
      );
    }

    return NextResponse.json({ url: proofUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-payment-proof]', msg);
    return NextResponse.json({ error: 'Error interno: ' + msg }, { status: 500 });
  }
}
