import { NextResponse } from 'next/server';
import { sbAdmin, getAuthAdmin, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ruta/mapkey
 * Returns the Mapbox token for the admin live map.
 * Reads from app_settings (Supabase) first, falls back to env var.
 * Admin-only endpoint.
 */
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req);
  if (!admin) return unauthorized();

  try {
    const db = sbAdmin();

    // Try Supabase app_settings first
    let mapboxToken = process.env.MAPBOX_API_KEY || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    const { data } = await db
      .from('app_settings')
      .select('key, value')
      .in('key', ['mapbox_api_key', 'google_maps_api_key']);

    if (data) {
      for (const row of data) {
        if (row.key === 'mapbox_api_key' && row.value) {
          mapboxToken = row.value;
        }
      }
    }

    return NextResponse.json({ mapbox: mapboxToken || null });
  } catch (err) {
    console.error('[admin/ruta/mapkey]', err);
    // Fallback to env var even on DB error
    const fallback = process.env.MAPBOX_API_KEY || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null;
    return NextResponse.json({ mapbox: fallback });
  }
}
