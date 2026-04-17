import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

/**
 * GET /api/logo — serves the admin-configured logo image directly.
 * The service worker precaches this so it works offline.
 * Falls back to the static /icons/icon-192x192.png if no custom logo is set.
 */
export async function GET() {
  try {
    const { data } = await sb()
      .from('app_config')
      .select('value')
      .eq('key', 'logo_url')
      .maybeSingle();

    const logoUrl = data?.value;

    if (logoUrl) {
      // Fetch the remote logo and proxy it
      const res = await fetch(logoUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const ct = res.headers.get('content-type') || 'image/png';
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': ct,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          },
        });
      }
    }
  } catch {
    // Fall through to static fallback
  }

  // Fallback: serve the static icon
  try {
    const filePath = join(process.cwd(), 'public', 'icons', 'icon-192x192.png');
    const buf = readFileSync(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Logo not found' }, { status: 404 });
  }
}
