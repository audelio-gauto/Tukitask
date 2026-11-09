import { NextResponse } from 'next/server';
import { sbAdmin, getAuthUser, unauthorized } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';
import { haversineKm } from '@/lib/geo';

export const dynamic = 'force-dynamic';

// Map driver_profiles.transport_mode → vehicle types used by the client order form
const MODE_TO_VEHICLE: Record<string, string> = {
  moto: 'moto',
  auto: 'auto',
  moto_carro: 'motocarro',
  camion: 'camion2t',
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const MAX_RADIUS_KM = 50;
const MAX_RESULTS = 40;
const PAGE_SIZE = 200;
const MODE_TO_FILTER: Record<string, string> = {
  moto: 'moto_envios',
  auto: 'auto_envios',
  moto_carro: 'moto_carro_fletes',
  camion: 'camion_fletes',
};

interface DriverLocation {
  driver_email: string;
  lat: number;
  lng: number;
}

interface DriverProfile {
  email: string;
  transport_mode: string | null;
  pickup_range: number | null;
  service_filters: Record<string, boolean> | null;
}

// GET /api/nearby-drivers?lat=X&lng=Y[&radius_km=Z]
// Read-only. Returns anonymized, rounded positions (no emails / names) of online drivers.
export async function GET(req: Request) {
  const caller = await getAuthUser(req);
  if (!caller) return unauthorized();

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(1, parseFloat(searchParams.get('radius_km') ?? '8') || 8));
  const respectRange = searchParams.get('respect_range') === '1';

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'invalid_coords' }, { status: 400 });
  }

  try {
    const db = sbAdmin();
    const angularRadius = radiusKm / 6371;
    const dLat = angularRadius * 180 / Math.PI;
    const reachesPole = Math.abs(lat) + dLat >= 90;
    const dLng = reachesPole ? 180 : Math.asin(Math.sin(angularRadius) / Math.cos(lat * Math.PI / 180)) * 180 / Math.PI;
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();

    const locs: (DriverLocation & { distanceKm: number })[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = db.from('driver_locations')
        .select('driver_email, lat, lng')
        .gte('updated_at', since)
        .gte('lat', Math.max(-90, lat - dLat)).lte('lat', Math.min(90, lat + dLat))
        .order('driver_email')
        .range(offset, offset + PAGE_SIZE - 1);
      if (!reachesPole && lng - dLng >= -180 && lng + dLng <= 180) {
        query = query.gte('lng', lng - dLng).lte('lng', lng + dLng);
      }
      const { data, error } = await query;
      if (error) return serverError(error, 'nearby-drivers locations');
      const page = (data ?? []) as DriverLocation[];
      for (const location of page) {
        const distanceKm = haversineKm(lat, lng, location.lat, location.lng);
        if (distanceKm <= radiusKm) locs.push({ ...location, distanceKm });
      }
      if (page.length < PAGE_SIZE) break;
    }

    locs.sort((a, b) => a.distanceKm - b.distanceKm);
    const driverSet = new Set<string>();
    const profileMap = new Map<string, DriverProfile>();
    for (let offset = 0; offset < locs.length; offset += PAGE_SIZE) {
      const emails = locs.slice(offset, offset + PAGE_SIZE).map(l => l.driver_email);
      const [usersResult, profilesResult] = await Promise.all([
        db.from('users').select('email').eq('role', 'driver').in('email', emails),
        db.from('driver_profiles').select('email, transport_mode, pickup_range, service_filters').in('email', emails),
      ]);
      if (usersResult.error) return serverError(usersResult.error, 'nearby-drivers users');
      if (profilesResult.error) return serverError(profilesResult.error, 'nearby-drivers profiles');
      for (const user of usersResult.data ?? []) driverSet.add(user.email);
      for (const profile of (profilesResult.data ?? []) as DriverProfile[]) profileMap.set(profile.email, profile);
    }

    const candidates = locs.flatMap(location => {
      if (!driverSet.has(location.driver_email)) return [];
      const profile = profileMap.get(location.driver_email);
      const mode = profile?.transport_mode ?? 'moto';
      const filter = MODE_TO_FILTER[mode];
      if (respectRange && (location.distanceKm > (profile?.pickup_range ?? 50) ||
        (filter && profile?.service_filters?.[filter] === false))) return [];
      return [{
        vehicle_type: MODE_TO_VEHICLE[mode] ?? 'moto',
        lat: Math.round(location.lat * 1000) / 1000,
        lng: Math.round(location.lng * 1000) / 1000,
      }];
    });

    // Keep at least the nearest candidate for each vehicle category.
    const firstByType = new Set<string>();
    const selected = new Set<number>();
    candidates.forEach((candidate, index) => {
      if (!firstByType.has(candidate.vehicle_type)) {
        firstByType.add(candidate.vehicle_type);
        selected.add(index);
      }
    });
    for (let i = 0; i < candidates.length && selected.size < MAX_RESULTS; i++) selected.add(i);
    const drivers = candidates.filter((_, index) => selected.has(index));

    return NextResponse.json({ drivers });
  } catch (err) {
    return serverError(err, 'nearby-drivers');
  }
}
