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

// GET: list all drivers with their commission + subscription data
export async function GET(req: Request) {
  const auth = await authorize(req)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabaseServer
    .from('driver_profiles')
    .select(`
      email, first_name, last_name, profile_photo, transport_mode,
      custom_commission_pct, custom_commission_fixed,
      subscription_active, subscription_plan, subscription_expires_at
    `)
    .order('first_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drivers: data || [] })
}

// PUT: update a driver's commission + subscription settings
export async function PUT(req: Request) {
  const auth = await authorize(req)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
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
  if (subscription_expires_at !== undefined) {
    update.subscription_expires_at = subscription_expires_at || null
  }

  const { error } = await supabaseServer
    .from('driver_profiles')
    .update(update)
    .eq('email', email)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
