import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// ── Module-level demand cache ─────────────────────────────────────────────────
// One cache slot per serverless instance. TTL 60 s → at most 1 DB hit/min.
// No Redis needed; if the instance restarts, we simply re-fetch once.
interface DemandCache { ratio: number; ts: number }
let _demandCache: DemandCache | null = null;
const DEMAND_TTL_MS = 60_000;

async function getDemandRatio(): Promise<number> {
  const now = Date.now();
  if (_demandCache && now - _demandCache.ts < DEMAND_TTL_MS) {
    return _demandCache.ratio;
  }

  // Two lightweight COUNT(*) queries — no rows returned, minimal I/O
  const since15m = new Date(now - 15 * 60 * 1000).toISOString();
  const since5m  = new Date(now - 5  * 60 * 1000).toISOString();

  const [ordersRes, driversRes] = await Promise.all([
    supabaseServer
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', since15m),
    supabaseServer
      .from('driver_locations')
      .select('driver_email', { count: 'exact', head: true })
      .gte('updated_at', since5m),
  ]);

  const pending = ordersRes.count ?? 0;
  const online  = Math.max(driversRes.count ?? 0, 1); // avoid ÷0
  const ratio   = pending / online;

  _demandCache = { ratio, ts: now };
  return ratio;
}

// ── GET /api/pricing/dynamic ──────────────────────────────────────────────────
// Query params:
//   vehicle_type  string   e.g. "moto"
//   distance_km   number   e.g. "8.350"
//
// Response:
//   { suggested, range_min, range_max, multiplier, label, color }
//
// Falls back gracefully: if vehicle not found, uses global settings.
// No auth required — same as /api/pricing (public).

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vehicleType = (searchParams.get('vehicle_type') ?? '').trim();
  const distanceKm  = parseFloat(searchParams.get('distance_km') ?? '0') || 0;

  if (!vehicleType || distanceKm <= 0) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  try {
    // Fetch vehicle row + all settings + demand ratio in parallel
    const [vehicleRes, settingsRes, demandRatio] = await Promise.all([
      supabaseServer
        .from('vehicle_pricing')
        .select('base_price, price_per_km')
        .eq('vehicle_type', vehicleType)
        .maybeSingle(),
      supabaseServer
        .from('pricing_settings')
        .select('key, value'),
      getDemandRatio(),
    ]);

    // Build settings map
    const cfg: Record<string, number> = {};
    for (const s of settingsRes.data ?? []) cfg[s.key] = Number(s.value);

    // Base price calculation (mirrors the client-side useMemo logic exactly)
    const base  = Number(vehicleRes.data?.base_price   ?? cfg['global_base_price']   ?? cfg['base_price']   ?? 0);
    const perKm = Number(vehicleRes.data?.price_per_km ?? cfg['global_price_per_km'] ?? cfg['price_per_km'] ?? 0);
    const minP  = cfg['min_shipping_price'] ?? 0;
    const basePrice = Math.max(minP, base + perKm * distanceKm);

    // Surge settings (with safe defaults if keys not yet in DB)
    const peakMult    = cfg['surge_peak_multiplier']   ?? 1.25;
    const demandMult  = cfg['surge_demand_multiplier'] ?? 1.40;
    const threshold   = cfg['demand_ratio_threshold']  ?? 0.60;

    // Hour-of-day check — Paraguay is UTC-4 year-round (no DST)
    const hourPY      = new Date(Date.now() - 4 * 3600 * 1000).getUTCHours();
    const ps1 = cfg['peak_hour_start']   ?? 7;
    const pe1 = cfg['peak_hour_end']     ?? 9;
    const ps2 = cfg['peak_hour_start_2'] ?? 17;
    const pe2 = cfg['peak_hour_end_2']   ?? 19;
    const isPeak      = (hourPY >= ps1 && hourPY < pe1) || (hourPY >= ps2 && hourPY < pe2);
    const isHighDemand = demandRatio >= threshold;

    // Pick the highest applicable multiplier — never stack them to avoid sticker shock
    let multiplier = 1.0;
    let label      = 'Tarifa normal';
    let color      = 'green' as 'green' | 'orange' | 'red';

    if (isHighDemand && demandMult >= peakMult) {
      multiplier = demandMult; label = 'Alta demanda'; color = 'red';
    } else if (isPeak || isHighDemand) {
      multiplier = peakMult;  label = 'Hora pico';    color = 'orange';
    }

    const suggested = Math.round(basePrice * multiplier);
    const rangeMin  = Math.round(basePrice);
    const rangeMax  = Math.round(basePrice * Math.max(peakMult, demandMult));

    return NextResponse.json({ suggested, range_min: rangeMin, range_max: rangeMax, multiplier, label, color });
  } catch (err) {
    console.error('[pricing/dynamic]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
