import { getMapboxKey } from '@/lib/maps/provider.server';

export const dynamic = 'force-dynamic';

// Estilos Mapbox permitidos para los mapas Leaflet (el token del Admin nunca llega al navegador)
const STYLES: Record<string, string> = {
  light: 'light-v11',
  streets: 'streets-v12',
  dark: 'dark-v11',
  satellite: 'satellite-streets-v12',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ style: string; z: string; x: string; y: string }> },
) {
  const { style, z, x, y } = await params;
  const styleId = STYLES[style];
  const yClean = y.replace(/\.(png|jpg|jpeg)$/i, '');
  if (!styleId || ![z, x, yClean].every(v => /^\d{1,8}$/.test(v))) {
    return new Response('bad request', { status: 400 });
  }

  const token = await getMapboxKey();
  if (!token) return new Response('mapbox key missing', { status: 503 });

  const upstream = await fetch(
    `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/${z}/${x}/${yClean}@2x?access_token=${encodeURIComponent(token)}`,
  );
  if (!upstream.ok) return new Response('tile error', { status: upstream.status === 404 ? 404 : 502 });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}
