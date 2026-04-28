import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../../lib/supabaseServer'
import { getAuthAdmin, unauthorized } from '@/lib/apiAuth'

// GET: list only users with role=driver along with their commission + subscription data
export async function GET(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

  // Get emails of all users with driver role
  const { data: userRows, error: usersErr } = await supabaseServer
    .from('users')
    .select('email')
    .eq('role', 'driver')

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  const driverEmails = (userRows || []).map((u: any) => u.email)

  if (driverEmails.length === 0) return NextResponse.json({ drivers: [] })

  const { data, error } = await supabaseServer
    .from('driver_profiles')
    .select(`
      email, first_name, last_name, profile_photo, transport_mode,
      custom_commission_pct, custom_commission_fixed,
      subscription_active, subscription_plan, subscription_expires_at
    `)
    .in('email', driverEmails)
    .order('first_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drivers: data || [] })
}

// PUT: update a driver's commission + subscription settings
export async function PUT(req: Request) {
  const admin = await getAuthAdmin(req)
  if (!admin) return unauthorized()

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
