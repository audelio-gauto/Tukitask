import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Allow larger body for photo uploads (up to 4MB base64 ≈ 3MB file)
export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(url, key);
};

export async function POST(req: Request) {
  try {
    const { email, base64, mimeType } = await req.json();
    if (!email || !base64) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Formato no soportado. Usa JPG, PNG o WebP' }, { status: 400 });
    }

    // Decode base64
    const buffer = Buffer.from(base64, 'base64');

    // Max 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagen demasiado grande (máx 2MB)' }, { status: 400 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const emailSafe = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fileName = `${emailSafe}.${ext}`;

    const sb = getSupabase();

    // Upload to Supabase Storage (bucket: profile-photos)
    const { error: uploadError } = await sb.storage
      .from('profile-photos')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = sb.storage.from('profile-photos').getPublicUrl(fileName);

    // Save URL in driver_profiles
    await sb.from('driver_profiles').upsert(
      { email: email.toLowerCase(), profile_photo: urlData.publicUrl },
      { onConflict: 'email' }
    );

    return NextResponse.json({ url: urlData.publicUrl });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
