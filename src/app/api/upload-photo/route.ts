import { NextResponse } from 'next/server';
import { serverError } from '@/lib/apiError';
import { sbAdmin, getAuthUser, unauthorized, forbidden } from '@/lib/apiAuth';
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE_PHOTO, validateImageMagicBytes } from '@/lib/constants';

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const { email, base64, mimeType, role } = await req.json();
    const emailNormalized = (email || '').toLowerCase();
    if (emailNormalized !== user.email) return forbidden();
    const profileRole: 'driver' | 'client' = role === 'client' ? 'client' : 'driver';
    if (!emailNormalized || !base64) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as never)) {
      return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG o WebP' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_FILE_SIZE_PHOTO) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 2MB)' }, { status: 400 });
    }

    // Validate magic bytes — rejects files with wrong MIME type (e.g. exe disguised as jpg)
    if (!validateImageMagicBytes(buffer, mimeType)) {
      return NextResponse.json({ error: 'El archivo no es una imagen válida' }, { status: 400 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const emailSafe = emailNormalized.replace(/[^a-z0-9]/g, '_');
    const fileName = `${emailSafe}.${ext}`;

    const sb = sbAdmin();

    const { error: uploadError } = await sb.storage
      .from('profile-photos')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return serverError(uploadError);
    }

    // Get public URL
    const { data: urlData } = sb.storage.from('profile-photos').getPublicUrl(fileName);

    if (profileRole === 'client') {
      await sb.from('client_profiles').upsert(
        { email: emailNormalized, photo_url: urlData.publicUrl, updated_at: new Date().toISOString() },
        { onConflict: 'email' }
      );
    } else {
      await sb.from('driver_profiles').upsert(
        { email: emailNormalized, profile_photo: urlData.publicUrl },
        { onConflict: 'email' }
      );
    }

    return NextResponse.json({ url: urlData.publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
