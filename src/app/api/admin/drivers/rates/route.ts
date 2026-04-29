import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth'

const VEHICLE_TYPES = ['moto', 'auto', 'motocarro', 'camion2t'] as const

// GET — return rate thresholds for all vehicle types
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  const { data, error } = await supabaseServer
    .from('vehicle_pricing')
    .select('vehicle_type, label, emoji, rate_good_gspm, rate_ok_gspm')
    .in('vehicle_type', VEHICLE_TYPES as unknown as string[])
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ensure all 4 vehicle types are present even if missing from DB
  const DEFAULTS: Record<string, { label: string; emoji: string }> = {
    moto:      { label: 'Moto',       emoji: '🏍️' },
    auto:      { label: 'Auto',       emoji: '🚗' },
    motocarro: { label: 'Moto carro', emoji: '🛺' },
    camion2t:  { label: 'Camión 2T',  emoji: '🚛' },
  }
  const map: Record<string, any> = {}
  for (const row of data || []) map[row.vehicle_type] = row
  const rates = VEHICLE_TYPES.map(vt => ({
    vehicle_type: vt,
    label: map[vt]?.label ?? DEFAULTS[vt].label,
    emoji: map[vt]?.emoji ?? DEFAULTS[vt].emoji,
    rate_good_gspm: map[vt]?.rate_good_gspm ?? null,
    rate_ok_gspm:   map[vt]?.rate_ok_gspm   ?? null,
  }))

  return NextResponse.json({ rates })
}

// PATCH — update rate thresholds for a vehicle type
// Body: { vehicle_type: string, rate_good_gspm: number|null, rate_ok_gspm: number|null }
export async function PATCH(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json()
  const { vehicle_type, rate_good_gspm, rate_ok_gspm } = body

  if (!VEHICLE_TYPES.includes(vehicle_type)) {
    return NextResponse.json({ error: 'Tipo de vehículo inválido' }, { status: 400 })
  }

  // Validate: if both non-null, good must be > ok
  if (rate_good_gspm != null && rate_ok_gspm != null && rate_good_gspm <= rate_ok_gspm) {
    return NextResponse.json({ error: '"Buena" debe ser mayor que "Aceptable"' }, { status: 400 })
  }

  const { error } = await supabaseServer
    .from('vehicle_pricing')
    .update({ rate_good_gspm, rate_ok_gspm, updated_at: new Date().toISOString() })
    .eq('vehicle_type', vehicle_type)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
