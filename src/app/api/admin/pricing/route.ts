import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth'

export async function GET(req: Request) {
  try {
    const admin = await getAuthAdmin(req)
    if (!admin) return unauthorized()

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
    const admin = await getAuthAdmin(req)
    if (!admin) return unauthorized()

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
        const basePrice = item.base_price === '' || item.base_price == null ? null : parseFloat(item.base_price)
        const pricePerKm = item.price_per_km === '' || item.price_per_km == null ? null : parseFloat(item.price_per_km)
        const commissionPct = item.commission_pct === '' || item.commission_pct == null ? 10.00 : parseFloat(item.commission_pct)
        const commissionFixed = item.commission_fixed === '' || item.commission_fixed == null ? 0 : parseFloat(item.commission_fixed)

        if (basePrice !== null && (isNaN(basePrice) || basePrice < 0)) {
          errors.push(`Precio base inválido para ${item.vehicle_type}`)
          continue
        }
        if (pricePerKm !== null && (isNaN(pricePerKm) || pricePerKm < 0)) {
          errors.push(`Precio por KM inválido para ${item.vehicle_type}`)
          continue
        }
        if (isNaN(commissionPct) || commissionPct < 0 || commissionPct > 100) {
          errors.push(`Comisión % inválida para ${item.vehicle_type}`)
          continue
        }
        if (isNaN(commissionFixed) || commissionFixed < 0) {
          errors.push(`Comisión fija inválida para ${item.vehicle_type}`)
          continue
        }

        const { error } = await supabaseServer
          .from('vehicle_pricing')
          .upsert({
            vehicle_type: item.vehicle_type,
            label: item.label,
            emoji: item.emoji,
            base_price: basePrice,
            price_per_km: pricePerKm,
            commission_pct: commissionPct,
            commission_fixed: commissionFixed,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'vehicle_type' })
        if (error) errors.push(`vehicle_pricing ${item.vehicle_type}: ${error.message}`)
      }
    }

    // Update pricing settings (numeric) — null means "use default / not set"
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (Array.isArray(pricing_settings)) {
      for (const item of pricing_settings) {
        const raw = item.value
        // Allow null/empty to clear the setting
        const value = (raw === null || raw === undefined || raw === '' || raw === 'null') ? null : parseFloat(raw)
        if (value !== null && (isNaN(value) || value < 0)) {
          errors.push(`Valor inválido para ${item.key}`)
          continue
        }
        const hasValidId = item.id && UUID_RE.test(item.id)
        if (hasValidId) {
          // Existing row — update by id
          const { error } = await supabaseServer
            .from('pricing_settings')
            .update({ value: value ?? 0, updated_at: new Date().toISOString() })
            .eq('id', item.id)
          if (error) errors.push(`pricing_settings ${item.key}: ${error.message}`)
        } else {
          // New row — insert if key doesn't exist, update if it does
          const { data: existing } = await supabaseServer
            .from('pricing_settings')
            .select('id')
            .eq('key', item.key)
            .maybeSingle()
          if (existing) {
            const { error } = await supabaseServer
              .from('pricing_settings')
              .update({ value: value ?? 0, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
            if (error) errors.push(`pricing_settings ${item.key}: ${error.message}`)
          } else {
            const { error } = await supabaseServer
              .from('pricing_settings')
              .insert({ key: item.key, value: value ?? 0, label: item.label || item.key, description: item.description || '' })
            if (error) errors.push(`pricing_settings ${item.key}: ${error.message}`)
          }
        }
      }
    }

    // Update app settings (string values) — skip if table doesn't exist
    if (Array.isArray(app_settings) && app_settings.length > 0) {
      const testQuery = await supabaseServer.from('app_settings').select('id').limit(1)
      if (testQuery.error && testQuery.error.message.includes('app_settings')) {
        console.warn('app_settings table does not exist, skipping')
      } else {
        for (const item of app_settings) {
          const value = item.value === null || item.value === undefined ? '' : String(item.value)
          const hasValidId = item.id && UUID_RE.test(item.id)
          if (hasValidId) {
            const { error } = await supabaseServer
              .from('app_settings')
              .update({ value, updated_at: new Date().toISOString() })
              .eq('id', item.id)
            if (error) errors.push(`app_settings ${item.key}: ${error.message}`)
          } else {
            const { data: existing } = await supabaseServer
              .from('app_settings')
              .select('id')
              .eq('key', item.key)
              .maybeSingle()
            if (existing) {
              const { error } = await supabaseServer
                .from('app_settings')
                .update({ value, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
              if (error) errors.push(`app_settings ${item.key}: ${error.message}`)
            } else {
              const { error } = await supabaseServer
                .from('app_settings')
                .insert({ key: item.key, value, label: item.label || item.key, description: item.description || '' })
              if (error) errors.push(`app_settings ${item.key}: ${error.message}`)
            }
          }
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
