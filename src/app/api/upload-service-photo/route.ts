import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, validateImageMagicBytes } from '@/lib/constants';

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const { base64, mimeType } = await req.json();

    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as never)) {
      return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG o WebP' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 5MB)' }, { status: 400 });
    }
    if (!validateImageMagicBytes(buffer, mimeType)) {
      return NextResponse.json({ error: 'El archivo no es una imagen válida' }, { status: 400 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `service/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const sb = sbAdmin();

    const { error: uploadError } = await sb.storage
      .from('service-photos')
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = sb.storage.from('service-photos').getPublicUrl(fileName);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
