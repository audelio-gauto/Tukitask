import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'

async function authorizeRequest(req: Request) {
  const auth = (req.headers.get('authorization') || '').trim()
  const fallbackToken = process.env.ADMIN_PRICING_TOKEN || ''

  // Legacy static token (keeps compatibility)
  if (fallbackToken && auth === `Bearer ${fallbackToken}`) {
    return { ok: true, method: 'token' }
  }

  if (!auth.startsWith('Bearer ')) return { ok: false }
  const accessToken = auth.split(' ')[1]
  if (!accessToken) return { ok: false }

  try {
    // Validate access token with Supabase (service role client)
    // supabaseServer.auth.getUser accepts an access token and returns user info
    // (using service role key so this is safe on server-side)
    // @ts-ignore - supabase-js typings may vary across versions
    const userRes = await supabaseServer.auth.getUser(accessToken)
    const user = userRes?.data?.user
    if (!user) return { ok: false }

    // Look up role in our users table
    const { data, error } = await supabaseServer.from('users').select('role').eq('id', user.id).maybeSingle()
    if (error || !data) return { ok: false }
    const role = data.role
    if (role === 'admin' || role === 'super_admin' || role === 'owner') return { ok: true, method: 'supabase', user, role }
    return { ok: false }
  } catch (err) {
    console.error('authorizeRequest error', err)
    return { ok: false }
  }
}

export async function GET(req: Request) {
  try {
    const auth = await authorizeRequest(req)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const [multipliers, vehicles, settings, appSettings] = await Promise.all([
      supabaseServer.from('package_multipliers').select('*').order('sort_order'),
      supabaseServer.from('vehicle_pricing').select('*').order('sort_order'),
      supabaseServer.from('pricing_settings').select('*').order('key'),
      supabaseServer.from('app_settings').select('*').order('key'),
    ])

    // Log errors but don't block the entire response for optional tables
    if (vehicles.error) console.warn('vehicle_pricing query error:', vehicles.error.message)
    if (settings.error) console.warn('pricing_settings query error:', settings.error.message)
    if (multipliers.error) console.warn('package_multipliers query error:', multipliers.error.message)
    if (appSettings.error) console.warn('app_settings query error:', appSettings.error.message)

    return NextResponse.json({
      package_multipliers: multipliers.data || [],
      vehicle_pricing: vehicles.data || [],
      pricing_settings: settings.data || [],
      app_settings: appSettings.data || [],
    })
  } catch (err) {
    console.error('pricing GET exception', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await authorizeRequest(req)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const { package_multipliers, vehicle_pricing, pricing_settings, app_settings } = body
    const errors: string[] = []

    // Update package multipliers
    if (Array.isArray(package_multipliers)) {
      for (const item of package_multipliers) {
        const multiplier = parseFloat(item.multiplier)
        if (isNaN(multiplier) || multiplier < 0 || multiplier > 100) {
          errors.push(`Multiplicador inválido para ${item.package_type}`)
          continue
        }
        const { error } = await supabaseServer
          .from('package_multipliers')
          .update({ multiplier, updated_at: new Date().toISOString() })
          .eq('id', item.id)
        if (error) errors.push(`package_multipliers ${item.id}: ${error.message}`)
      }
    }

    // Update vehicle pricing
    if (Array.isArray(vehicle_pricing)) {
      for (const item of vehicle_pricing) {
        const basePrice = item.base_price === '' || item.base_price === null ? null : parseFloat(item.base_price)
        const pricePerKm = item.price_per_km === '' || item.price_per_km === null ? null : parseFloat(item.price_per_km)

        if (basePrice !== null && (isNaN(basePrice) || basePrice < 0)) {
          errors.push(`Precio base inválido para ${item.vehicle_type}`)
          continue
        }
        if (pricePerKm !== null && (isNaN(pricePerKm) || pricePerKm < 0)) {
          errors.push(`Precio por KM inválido para ${item.vehicle_type}`)
          continue
        }

        const { error } = await supabaseServer
          .from('vehicle_pricing')
          .update({ base_price: basePrice, price_per_km: pricePerKm, updated_at: new Date().toISOString() })
          .eq('id', item.id)
        if (error) errors.push(`vehicle_pricing ${item.id}: ${error.message}`)
      }
    }

    // Update pricing settings (numeric) — null means "use default / not set"
    if (Array.isArray(pricing_settings)) {
      for (const item of pricing_settings) {
        const raw = item.value
        // Allow null/empty to clear the setting
        const value = (raw === null || raw === undefined || raw === '' || raw === 'null') ? null : parseFloat(raw)
        if (value !== null && (isNaN(value) || value < 0)) {
          errors.push(`Valor inválido para ${item.key}`)
          continue
        }
        // Use upsert so new keys (global_base_price etc.) get created if they don't exist yet
        const { error } = await supabaseServer
          .from('pricing_settings')
          .upsert(
            { id: item.id, key: item.key, value: value ?? 0, label: item.label || item.key, description: item.description || '', updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          )
        if (error) errors.push(`pricing_settings ${item.key}: ${error.message}`)
      }
    }

    // Update app settings (string values) — skip if table doesn't exist
    if (Array.isArray(app_settings) && app_settings.length > 0) {
      // Check if app_settings table exists first
      const testQuery = await supabaseServer.from('app_settings').select('id').limit(1)
      if (testQuery.error && testQuery.error.message.includes('app_settings')) {
        console.warn('app_settings table does not exist, skipping')
      } else {
        for (const item of app_settings) {
          const value = item.value === null || item.value === undefined ? '' : String(item.value)
          const { error } = await supabaseServer
            .from('app_settings')
            .upsert(
              { id: item.id, key: item.key, value, label: item.label || item.key, description: item.description || '', updated_at: new Date().toISOString() },
              { onConflict: 'key' }
            )
          if (error) errors.push(`app_settings ${item.key}: ${error.message}`)
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('pricing PUT exception', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
