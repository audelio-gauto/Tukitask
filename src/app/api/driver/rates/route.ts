import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'

// Public (authenticated) — used by driver/page.tsx to load Gs/km thresholds
export async function GET() {
  const { data, error } = await supabaseServer
    .from('vehicle_pricing')
    .select('vehicle_type, rate_good_gspm, rate_ok_gspm')
    .in('vehicle_type', ['moto', 'auto', 'motocarro', 'camion2t'])

  if (error) return NextResponse.json({ rates: [] })

  // Only include vehicle types that have at least one threshold configured
  const rates = (data || []).filter(r => r.rate_good_gspm != null || r.rate_ok_gspm != null)
  return NextResponse.json({ rates })
}
