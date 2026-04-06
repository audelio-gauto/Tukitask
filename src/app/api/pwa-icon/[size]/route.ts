import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const VALID_SIZES = ['192', '512'] as const;
type ValidSize = typeof VALID_SIZES[number];

const FALLBACK: Record<ValidSize, string> = {
  '192': '/icons/icon-192x192.png',
  '512': '/icons/icon-512x512.png',
};

/**
 * GET /api/pwa-icon/192  or  /api/pwa-icon/512
 *
 * Redirects to the custom icon stored in app_config (uploaded via admin).
 * Falls back to the static generated icon if no custom icon is configured.
 * Response is cached for 5 minutes so it stays fresh after admin updates.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;

  if (!VALID_SIZES.includes(size as ValidSize)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let iconUrl: string = FALLBACK[size as ValidSize];

  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const key = `pwa_icon_${size}`;
    const { data } = await sb
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (data?.value) iconUrl = data.value;
  } catch {
    // DB unavailable — use static fallback
  }

  // If the URL is relative (static fallback), make it absolute using the request origin
  // so the redirect works on any host (localhost, Vercel preview, production)
  if (iconUrl.startsWith('/')) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    iconUrl = `${origin}${iconUrl}`;
  }

  return NextResponse.redirect(iconUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
