import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../lib/supabaseServer'

// Public pricing endpoint — no admin auth required
// Returns vehicle pricing and pricing settings for clients to calculate suggested prices
export async function GET() {
  try {
    const [vehicles, settings] = await Promise.all([
      supabaseServer.from('vehicle_pricing').select('vehicle_type, label, emoji, base_price, price_per_km, sort_order').order('sort_order'),
      supabaseServer.from('pricing_settings').select('key, value, label').order('key'),
    ])

    if (vehicles.error) console.warn('vehicle_pricing query error:', vehicles.error.message)
    if (settings.error) console.warn('pricing_settings query error:', settings.error.message)

    return NextResponse.json({
      vehicle_pricing: vehicles.data || [],
      pricing_settings: settings.data || [],
    })
  } catch (err) {
    console.error('pricing public route error', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
