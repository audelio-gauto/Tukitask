import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'

async function authorize(req: Request) {
  const auth = (req.headers.get('authorization') || '').trim()
  if (!auth.startsWith('Bearer ')) return { ok: false }
  const token = auth.split(' ')[1]
  if (!token) return { ok: false }
  try {
    // @ts-ignore
    const { data: { user } } = await supabaseServer.auth.getUser(token)
    if (!user) return { ok: false }
    const { data, error } = await supabaseServer.from('users').select('role').eq('id', user.id).maybeSingle()
    if (error || !data) return { ok: false }
    if (!['admin', 'super_admin', 'owner'].includes(data.role)) return { ok: false }
    return { ok: true }
  } catch { return { ok: false } }
}

// GET: list tecnico/servicio users + service pricing config
export async function GET(req: Request) {
  const auth = await authorize(req)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
  const auth = await authorize(req)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
        .update({ suggested_price: sp, commission_pct: cp, commission_fixed: cf, updated_at: new Date().toISOString() })
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
