import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';

/**
 * POST /api/upload-delivery-photo
 * Uploads a delivery proof photo for an order.
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

    // Verify the driver owns this order
    const { data: order } = await db
      .from('orders')
      .select('accepted_by')
      .eq('id', order_id)
      .single();
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    if (order.accepted_by?.toLowerCase() !== user.email) return forbidden('Not your order');

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `${order_id}.${ext}`;

    const { error: uploadError } = await db.storage
      .from('delivery-proofs')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = db.storage.from('delivery-proofs').getPublicUrl(fileName);
    const photoUrl = urlData.publicUrl;

    // Save URL to order record
    await db.from('orders').update({ delivery_photo_url: photoUrl }).eq('id', order_id);

    return NextResponse.json({ url: photoUrl });
  } catch (e) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
