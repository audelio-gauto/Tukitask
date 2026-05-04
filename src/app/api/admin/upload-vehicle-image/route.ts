import { NextResponse } from 'next/server';
import { getAuthAdmin, unauthorized, sbAdmin } from '@/lib/apiAuth';

export async function POST(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

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
    const client = sbAdmin();

    // Ensure app-assets bucket exists
    const { data: buckets } = await client.storage.listBuckets();
    const bucketExists = (buckets ?? []).some((b: { id: string }) => b.id === 'app-assets');
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
      console.error('vehicle_pricing update error:', dbError.message, dbError.code);
      // Column may not exist yet (migration not applied)
      if (dbError.message?.includes('column') || dbError.code === '42703') {
        return NextResponse.json({
          error: 'La columna image_url no existe. Ejecutá la migración 037 en Supabase SQL Editor.',
        }, { status: 500 });
      }
      // Row may not exist yet — try upsert
      const { error: upsertError } = await client
        .from('vehicle_pricing')
        .upsert({ vehicle_type: vehicleType, image_url: publicUrl }, { onConflict: 'vehicle_type' });
      if (upsertError) {
        console.error('vehicle_pricing upsert error:', upsertError.message);
        return NextResponse.json({ error: `Error al guardar en BD: ${upsertError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('upload-vehicle-image exception:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
