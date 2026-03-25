import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

export async function POST(req: Request) {
  try {
    const { base64, mimeType, fileName } = await req.json();

    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Archivo demasiado grande (máx 2MB)' }, { status: 400 });
    }

    const ext = mimeType === 'image/svg+xml' ? 'svg'
      : mimeType === 'image/png' ? 'png'
      : mimeType === 'image/webp' ? 'webp' : 'jpg';

    const storedName = fileName ? `logo.${ext}` : `logo_${Date.now()}.${ext}`;
    const client = sb();

    const { error: uploadError } = await client.storage
      .from('app-assets')
      .upload(storedName, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = client.storage.from('app-assets').getPublicUrl(storedName);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    // Persist in app_config
    await client.from('app_config').upsert(
      { key: 'logo_url', value: publicUrl, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    return NextResponse.json({ url: publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
