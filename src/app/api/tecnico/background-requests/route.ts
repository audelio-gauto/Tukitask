import { NextResponse } from 'next/server';
import { getAuthUser, sbAdmin, unauthorized, forbidden } from '@/lib/apiAuth';
import { serverError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

// Endpoint liviano para el servicio nativo Android del técnico. Devuelve solo
// las solicitudes pendientes que le corresponden, sin el peso del marketplace
// completo, para poder avisar mientras usa Google Maps/WhatsApp u otra app.
const MIN_WALLET_BALANCE = Number(process.env.DRIVER_MIN_WALLET_BALANCE ?? 0);
const ACTIVE_STATUSES = ['accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'];
const RECENT_MS = 3 * 60 * 60 * 1000;
const SCHEDULED_NOTICE_MS = 30 * 60 * 1000;
const NO_STORE = { 'Cache-Control': 'no-store' };

interface TecnicoJobRow {
  id: string;
  service_type: string | null;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  created_at: string | null;
  scheduled_at: string | null;
  client_initial_price: number | string | null;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const db = sbAdmin();

  const { data: userRow, error: roleError } = await db
    .from('users')
    .select('role')
    .eq('email', user.email)
    .maybeSingle();
  if (roleError) return serverError(roleError, 'tecnico-background-requests role');
  if (!['tecnico', 'servicio', 'admin', 'super_admin', 'owner'].includes(userRow?.role ?? '')) {
    return forbidden();
  }

  const { data: wallet, error: walletError } = await db
    .from('driver_wallets')
    .select('balance')
    .eq('driver_email', user.email)
    .maybeSingle();
  if (walletError) return serverError(walletError, 'tecnico-background-requests wallet');
  const balance = Number(wallet?.balance ?? 0);
  if (balance < MIN_WALLET_BALANCE) {
    return NextResponse.json(
      { jobs: [], wallet_blocked: true, balance },
      { headers: NO_STORE },
    );
  }

  // Un técnico con un servicio en curso no debe recibir avisos de otros.
  const { data: activeJobs, error: activeError } = await db
    .from('tecnico_jobs')
    .select('id')
    .eq('tecnico_email', user.email)
    .in('status', ACTIVE_STATUSES)
    .limit(1);
  if (activeError) return serverError(activeError, 'tecnico-background-requests active');
  if ((activeJobs ?? []).length > 0) {
    return NextResponse.json({ jobs: [], busy: true }, { headers: NO_STORE });
  }

  const [settingsRes, locationRes] = await Promise.all([
    db.from('tecnico_settings')
      .select('gender, accepted_services, verified, pickup_range')
      .eq('email', user.email)
      .maybeSingle(),
    db.from('driver_locations')
      .select('lat, lng')
      .eq('driver_email', user.email)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (settingsRes.error) return serverError(settingsRes.error, 'tecnico-background-requests settings');
  if (locationRes.error) return serverError(locationRes.error, 'tecnico-background-requests location');

  const settings = settingsRes.data;
  const gender: string = settings?.gender ?? '';
  const accepted: Record<string, unknown> = settings?.accepted_services ?? {};
  const disabled = Object.entries(accepted)
    .filter(([, enabled]) => enabled === false || enabled === 'false')
    .map(([service]) => service);
  const verified: boolean = settings?.verified === true;
  const pickupRange = Number(settings?.pickup_range ?? 20);
  const lat = locationRes.data?.lat != null ? Number(locationRes.data.lat) : null;
  const lng = locationRes.data?.lng != null ? Number(locationRes.data.lng) : null;
  const location = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;

  let query = db
    .from('tecnico_jobs')
    .select('id, service_type, address, lat, lng, created_at, scheduled_at, client_initial_price')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(60);

  // Mismos filtros que /api/tecnico/jobs?offers=true.
  if (gender === 'mujer' || gender === 'hombre') {
    query = query.or(`service_gender.in.(${gender},indiferente),service_gender.is.null`);
  }
  if (disabled.length > 0) query = query.not('service_type', 'in', `(${disabled.join(',')})`);
  if (!verified) query = query.eq('require_verified_tecnico', false);

  const { data: jobsData, error: jobsError } = await query;
  if (jobsError) return serverError(jobsError, 'tecnico-background-requests jobs');

  // La UI oculta las solicitudes a las que este técnico ya les envió oferta.
  const { data: myOffers, error: offersError } = await db
    .from('tecnico_job_offers')
    .select('job_id')
    .eq('tecnico_email', user.email)
    .limit(500);
  if (offersError) return serverError(offersError, 'tecnico-background-requests offers');
  const offered = new Set<string>((myOffers ?? []).map((offer: { job_id: string }) => offer.job_id));

  const now = Date.now();
  const recentSince = now - RECENT_MS;
  const scheduledLimit = now + SCHEDULED_NOTICE_MS;

  const jobs = ((jobsData ?? []) as TecnicoJobRow[])
    .filter(job => !offered.has(job.id))
    .filter(job => {
      const createdAt = job.created_at ? Date.parse(job.created_at) : NaN;
      const createdRecently = Number.isFinite(createdAt) && createdAt >= recentSince;
      if (!job.scheduled_at) return createdRecently;
      const scheduledAt = Date.parse(job.scheduled_at);
      return createdRecently || (Number.isFinite(scheduledAt) && scheduledAt <= scheduledLimit);
    })
    .filter(job => {
      if (!location || job.lat == null || job.lng == null) return true;
      return distanceKm(location.lat, location.lng, Number(job.lat), Number(job.lng)) <= pickupRange;
    })
    .map(job => ({
      id: job.id,
      service_type: job.service_type,
      address: job.address,
      lat: job.lat,
      lng: job.lng,
      created_at: job.created_at,
      scheduled_at: job.scheduled_at,
      client_initial_price: job.client_initial_price,
      distance_km: location && job.lat != null && job.lng != null
        ? Math.round(distanceKm(location.lat, location.lng, Number(job.lat), Number(job.lng)) * 10) / 10
        : null,
    }));

  return NextResponse.json({ jobs }, { headers: NO_STORE });
}
