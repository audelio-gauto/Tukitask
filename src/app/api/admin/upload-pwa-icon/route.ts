import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'app-assets';
const ALLOWED_SIZES = [192, 512] as const;
type AllowedSize = typeof ALLOWED_SIZES[number];

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

async function authorizeAdmin(req: Request): Promise<boolean> {
  const auth = (req.headers.get('authorization') || '').trim();
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.split(' ')[1];
  if (!token) return false;
  try {
    const client = sb();
    // @ts-ignore
    const { data: { user } } = await client.auth.getUser(token);
    if (!user) return false;
    const { data } = await client.from('users').select('role').eq('id', user.id).maybeSingle();
    return ['admin', 'super_admin', 'owner'].includes(data?.role ?? '');
  } catch { return false; }
}

export async function POST(req: Request) {
  if (!await authorizeAdmin(req))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { base64, mimeType, size } = await req.json() as {
      base64: string;
      mimeType: string;
      size: AllowedSize;
    };

    if (!base64 || !mimeType) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    if (!ALLOWED_SIZES.includes(size)) {
      return NextResponse.json({ error: `Tamaño inválido. Use: ${ALLOWED_SIZES.join(', ')}` }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 });
    }

    const inputBuffer = Buffer.from(base64, 'base64');
    if (inputBuffer.length > 4 * 1024 * 1024) {
      return NextResponse.json({ error: 'Archivo demasiado grande (máx 4MB)' }, { status: 400 });
    }

    // Resize to exact size using sharp (installed as dep of Next.js)
    const sharp = require('sharp') as typeof import('sharp');
    const pngBuffer = await sharp(inputBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 15, g: 15, b: 26, alpha: 1 }, // #0f0f1a brand dark bg
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const fileName = `pwa-icon-${size}x${size}.png`;
    const client = sb();

    // Ensure bucket exists and is public
    const { data: buckets } = await client.storage.listBuckets();
    const exists = (buckets ?? []).some(b => b.id === BUCKET);
    if (!exists) {
      await client.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10485760 });
    }

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(fileName, pngBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = client.storage.from(BUCKET).getPublicUrl(fileName);
    // Add cache-busting so browsers reload the icon immediately
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Persist in app_config
    const configKey = `pwa_icon_${size}`;
    await client.from('app_config').upsert(
      { key: configKey, value: publicUrl, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    return NextResponse.json({ url: publicUrl, size, key: configKey });
  } catch (err) {
    console.error('[upload-pwa-icon]', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
