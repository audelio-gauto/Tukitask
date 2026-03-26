import { NextResponse } from 'next/server';
import { getAuthUser, unauthorized, sbAdmin } from '@/lib/apiAuth';
import { ALLOWED_AUDIO_TYPES, MAX_FILE_SIZE_AUDIO } from '@/lib/constants';

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const { base64, mimeType, fileName } = await req.json();

    if (!base64 || !mimeType || !fileName) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Sanitizar fileName: solo permitir nombre de archivo simple sin path traversal
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    if (!safeName || safeName.includes('..')) {
      return NextResponse.json({ error: 'Nombre de archivo inválido' }, { status: 400 });
    }

    const baseMime = mimeType.split(';')[0].trim() as string;
    if (!ALLOWED_AUDIO_TYPES.includes(mimeType as any) && !ALLOWED_AUDIO_TYPES.includes(baseMime as any)) {
      return NextResponse.json({ error: 'Formato de audio no soportado' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_FILE_SIZE_AUDIO) {
      return NextResponse.json({ error: 'Audio demasiado grande (máx 5MB)' }, { status: 400 });
    }

    // Aislar archivos por usuario con prefijo de email
    const emailSafe = user.email.replace(/[^a-z0-9]/g, '_');
    const storagePath = `${emailSafe}/${safeName}`;

    const sb = sbAdmin();
    const { error: uploadError } = await sb.storage
      .from('audio-messages')
      .upload(storagePath, buffer, { contentType: baseMime, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = sb.storage.from('audio-messages').getPublicUrl(storagePath);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
