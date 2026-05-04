import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

async function authorizeAdmin(req: Request) {
  const auth = (req.headers.get('authorization') || '').trim();
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.split(' ')[1];
  if (!token) return false;
  try {
    const client = sb();
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
    const { base64, mimeType, vehicleType } = await req.json();

    if (!base64 || !mimeType || !vehicleType) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Formato no soportado. Usá JPG, PNG o WebP.' }, { status: 400 });
    }

    // Validate vehicleType is a known safe slug (alphanumeric + underscore)
    if (!/^[a-z0-9_]{1,32}$/.test(vehicleType)) {
      return NextResponse.json({ error: 'Tipo de vehículo inválido' }, { status: 400 });
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Archivo demasiado grande (máx 2 MB)' }, { status: 400 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storedName = `vehicle-icons/${vehicleType}.${ext}`;
    const client = sb();

    // Ensure app-assets bucket exists
    const { data: buckets } = await client.storage.listBuckets();
    const bucketExists = (buckets ?? []).some(b => b.id === 'app-assets');
    if (!bucketExists) {
      await client.storage.createBucket('app-assets', { public: true, fileSizeLimit: 2097152 });
    }

    const { error: uploadError } = await client.storage
      .from('app-assets')
      .upload(storedName, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = client.storage.from('app-assets').getPublicUrl(storedName);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Persist URL in vehicle_pricing
    const { error: dbError } = await client
      .from('vehicle_pricing')
      .update({ image_url: publicUrl })
      .eq('vehicle_type', vehicleType);

    if (dbError) {
      // Row may not exist yet — upsert it minimally
      await client.from('vehicle_pricing').upsert(
        { vehicle_type: vehicleType, image_url: publicUrl },
        { onConflict: 'vehicle_type' }
      );
    }

    return NextResponse.json({ url: publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
