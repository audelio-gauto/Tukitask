import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Map driver_profiles.transport_mode → vehicle types used by the client order form
const MODE_TO_VEHICLE: Record<string, string> = {
  moto: 'moto',
  auto: 'auto',
  moto_carro: 'motocarro',
  camion: 'camion2t',
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const MAX_RADIUS_KM = 15;
const MAX_RESULTS = 40;

// GET /api/nearby-drivers?lat=X&lng=Y[&radius_km=Z]
// Read-only. Returns anonymized, rounded positions (no emails / names) of online drivers.
export async function GET(req: Request) {
  const caller = await getAuthUser(req);
  if (!caller) return unauthorized();

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(1, parseFloat(searchParams.get('radius_km') ?? '8') || 8));

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'invalid_coords' }, { status: 400 });
  }

  try {
    const db = sbAdmin();
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();

    const { data: locs, error } = await db
      .from('driver_locations')
      .select('driver_email, lat, lng')
      .gte('updated_at', since)
      .gte('lat', lat - dLat).lte('lat', lat + dLat)
      .gte('lng', lng - dLng).lte('lng', lng + dLng)
      .limit(200);
    if (error || !locs || locs.length === 0) return NextResponse.json({ drivers: [] });

    const emails = locs.map((l: { driver_email: string }) => l.driver_email);
    const [{ data: users }, { data: profiles }] = await Promise.all([
      db.from('users').select('email').eq('role', 'driver').in('email', emails),
      db.from('driver_profiles').select('email, transport_mode').in('email', emails),
    ]);

    const driverSet = new Set((users ?? []).map((u: { email: string }) => u.email));
    const modeMap = new Map<string, string>(
      (profiles ?? []).map((p: { email: string; transport_mode: string | null }) => [p.email, p.transport_mode ?? 'moto']),
    );

    const drivers = locs
      .filter((l: { driver_email: string }) => driverSet.has(l.driver_email))
      .map((l: { driver_email: string; lat: number; lng: number }) => ({
        vehicle_type: MODE_TO_VEHICLE[modeMap.get(l.driver_email) ?? 'moto'] ?? 'moto',
        lat: Math.round(l.lat * 1000) / 1000,
        lng: Math.round(l.lng * 1000) / 1000,
      }))
      .slice(0, MAX_RESULTS);

    return NextResponse.json({ drivers });
  } catch (err) {
    console.error('[nearby-drivers]', err);
    return NextResponse.json({ drivers: [] });
  }
}
