import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

export async function POST(req: Request) {
  try {
    const { base64, mimeType, fileName } = await req.json();

    if (!base64 || !mimeType || !fileName) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const allowedMimes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/webm;codecs=opus'];
    const baseMime = mimeType.split(';')[0].trim();
    if (!allowedMimes.includes(mimeType) && !allowedMimes.includes(baseMime)) {
      return NextResponse.json({ error: 'Formato de audio no soportado' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');

    // Max 5 MB for audio
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio demasiado grande (máx 5MB)' }, { status: 400 });
    }

    const { error: uploadError } = await sb.storage
      .from('audio-messages')
      .upload(fileName, buffer, {
        contentType: baseMime,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = sb.storage
      .from('audio-messages')
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
