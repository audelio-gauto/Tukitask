import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth'

// GET: list tecnico/servicio users + service pricing config
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  // Get emails of all users with servicio/tecnico role
  // Note: 'servicio' is the primary role for technicians in the user_role enum.
  // If 'tecnico' has been added via migration 021, it is also included.
  const { data: userRows, error: usersErr } = await supabaseServer
    .from('users')
    .select('email')
    .in('role', ['servicio', 'tecnico'])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  const tecnicoEmails = (userRows || []).map((u: any) => u.email)

  const [tecnicosRes, pricingRes] = await Promise.all([
    tecnicoEmails.length > 0
      ? supabaseServer
          .from('tecnico_settings')
          .select(`
            email, first_name, last_name, profile_photo, gender,
            custom_commission_pct, custom_commission_fixed,
            subscription_active, subscription_plan, subscription_expires_at,
            commission_pct
          `)
          .in('email', tecnicoEmails)
          .order('first_name')
      : Promise.resolve({ data: [], error: null }),
    supabaseServer
      .from('service_pricing')
      .select('*')
      .order('sort_order'),
  ])

  if (tecnicosRes.error) return NextResponse.json({ error: tecnicosRes.error.message }, { status: 500 })

  return NextResponse.json({
    tecnicos: tecnicosRes.data || [],
    service_pricing: pricingRes.data || [],
  })
}

// PUT: update tecnico commission/subscription OR service pricing
export async function PUT(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json()

  // Update service pricing rows
  if (body.service_pricing) {
    for (const item of body.service_pricing) {
      const sp = item.suggested_price === '' || item.suggested_price === null ? null : parseFloat(item.suggested_price)
      const cp = parseFloat(item.commission_pct ?? 12)
      const cf = parseFloat(item.commission_fixed ?? 0)
      if (isNaN(cp) || cp < 0 || cp > 100) return NextResponse.json({ error: `Comisión % inválida para ${item.service_type}` }, { status: 400 })
      if (isNaN(cf) || cf < 0) return NextResponse.json({ error: `Comisión fija inválida para ${item.service_type}` }, { status: 400 })
      const { error } = await supabaseServer
        .from('service_pricing')
        .update({
          suggested_price: sp, commission_pct: cp, commission_fixed: cf,
          ...(item.gender !== undefined && { gender: ['mujer', 'hombre', 'ambos'].includes(item.gender) ? item.gender : 'ambos' }),
          ...(item.is_active !== undefined && { is_active: Boolean(item.is_active) }),
          ...(item.label !== undefined && { label: String(item.label).trim() }),
          ...(item.emoji !== undefined && { emoji: String(item.emoji).trim() }),
          ...(item.sort_order !== undefined && { sort_order: parseInt(item.sort_order, 10) || 0 }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  // Update tecnico commission/subscription
  const { email, custom_commission_pct, custom_commission_fixed,
          subscription_active, subscription_plan, subscription_expires_at } = body

  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })

  const update: Record<string, unknown> = {}

  if (custom_commission_pct !== undefined) {
    const v = custom_commission_pct === null || custom_commission_pct === '' ? null : parseFloat(custom_commission_pct)
    if (v !== null && (isNaN(v) || v < 0 || v > 100))
      return NextResponse.json({ error: 'Comisión % inválida (0-100)' }, { status: 400 })
    update.custom_commission_pct = v
  }
  if (custom_commission_fixed !== undefined) {
    const v = custom_commission_fixed === null || custom_commission_fixed === '' ? null : parseFloat(custom_commission_fixed)
    if (v !== null && (isNaN(v) || v < 0))
      return NextResponse.json({ error: 'Comisión fija inválida' }, { status: 400 })
    update.custom_commission_fixed = v
  }
  if (subscription_active !== undefined) update.subscription_active = Boolean(subscription_active)
  if (subscription_plan !== undefined) update.subscription_plan = subscription_plan || null
  if (subscription_expires_at !== undefined) update.subscription_expires_at = subscription_expires_at || null

  const { error } = await supabaseServer
    .from('tecnico_settings')
    .update(update)
    .eq('email', email)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST: create new service category
export async function POST(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  const body = await req.json()
  const { service_type, label, emoji, gender, suggested_price, commission_pct, commission_fixed, sort_order } = body

  if (!service_type || !label || !emoji) {
    return NextResponse.json({ error: 'service_type, label y emoji son requeridos' }, { status: 400 })
  }
  // Sanitize service_type: lowercase, no spaces
  const st = String(service_type).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  if (!st) return NextResponse.json({ error: 'service_type inválido' }, { status: 400 })

  const { data, error } = await supabaseServer
    .from('service_pricing')
    .insert({
      service_type: st,
      label: String(label).trim(),
      emoji: String(emoji).trim(),
      gender: ['mujer', 'hombre', 'ambos'].includes(gender) ? gender : 'ambos',
      suggested_price: suggested_price ? parseFloat(suggested_price) : null,
      commission_pct: parseFloat(commission_pct ?? 12),
      commission_fixed: parseFloat(commission_fixed ?? 0),
      sort_order: parseInt(sort_order ?? 99, 10),
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE: delete a service category
export async function DELETE(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabaseServer
    .from('service_pricing')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
