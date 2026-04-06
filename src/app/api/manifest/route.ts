import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

/**
 * GET /manifest.json  (via next.config.ts rewrite: /manifest.json → /api/manifest)
 *
 * Returns the Web App Manifest with custom PWA icons when configured via admin.
 * Falls back to the generated static icons if no custom icons are set.
 */
export async function GET() {
  // Load custom icon URLs from app_config (if set via admin)
  let icon192 = '/icons/icon-192x192.png';
  let icon512 = '/icons/icon-512x512.png';
  let iconMaskable = '/icons/icon-maskable-512x512.png';

  try {
    const { data } = await sb()
      .from('app_config')
      .select('key, value')
      .in('key', ['pwa_icon_192', 'pwa_icon_512']);

    (data ?? []).forEach(row => {
      if (row.key === 'pwa_icon_192' && row.value) icon192 = row.value;
      if (row.key === 'pwa_icon_512' && row.value) {
        icon512 = row.value;
        iconMaskable = row.value; // custom icon is used as maskable too
      }
    });
  } catch {
    // Fallback to static if DB unavailable
  }

  const manifest = {
    id: '/',
    name: 'TukiTask',
    short_name: 'TukiTask',
    description: 'Plataforma de envíos y servicios técnicos',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    background_color: '#0f0f1a',
    theme_color: '#F5C518',
    orientation: 'portrait-primary',
    lang: 'es',
    dir: 'ltr',
    categories: ['productivity', 'utilities', 'logistics'],
    prefer_related_applications: false,
    icons: [
      // The dynamic proxy routes always return the admin-uploaded icon (or static fallback)
      { src: icon192,  sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512,  sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: iconMaskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Panel Cliente',
        short_name: 'Cliente',
        description: 'Solicitar un envío o servicio',
        url: '/cliente',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Panel Driver',
        short_name: 'Driver',
        description: 'Ver pedidos de delivery',
        url: '/driver',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Panel Técnico',
        short_name: 'Técnico',
        description: 'Ver servicios técnicos',
        url: '/tecnico',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
    ],
    screenshots: [
      {
        src: icon512,
        sizes: '512x512',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Panel principal',
      },
    ],
  };

  return new NextResponse(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Short cache so changes from admin panel appear quickly
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
