import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

export async function POST(req: Request) {
  try {
    const { base64, mimeType } = await req.json();

    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG o WebP' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 5MB)' }, { status: 400 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `service/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const sb = getSupabase();

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
