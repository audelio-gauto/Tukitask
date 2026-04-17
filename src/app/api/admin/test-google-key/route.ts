import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'

/**
 * Diagnostic endpoint to verify Google Places API key.
 * Admin-only — requires valid session with admin role.
 */
export async function GET(req: Request) {
  // Auth check
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Check role
  const { data: profile } = await supabaseServer
    .from('driver_profiles')
    .select('role')
    .eq('email', user.email)
    .maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // 1. Read key from app_settings
  const { data: settings, error: dbErr } = await supabaseServer
    .from('app_settings')
    .select('key, value')
    .in('key', ['google_maps_api_key', 'mapbox_api_key'])

  if (dbErr) {
    return NextResponse.json({ step: 'db_read', error: dbErr.message }, { status: 500 })
  }

  const googleRow = settings?.find(r => r.key === 'google_maps_api_key')
  const mapboxRow = settings?.find(r => r.key === 'mapbox_api_key')

  const googleKey = googleRow?.value || ''
  const mapboxKey = mapboxRow?.value || ''

  const result: Record<string, unknown> = {
    google_key_in_db: googleKey ? `${googleKey.slice(0, 8)}...${googleKey.slice(-4)}` : '(vacío)',
    google_key_length: googleKey.length,
    mapbox_key_in_db: mapboxKey ? `${mapboxKey.slice(0, 8)}...${mapboxKey.slice(-4)}` : '(vacío)',
    google_env_var: process.env.GOOGLE_MAPS_API_KEY ? 'set' : 'not set',
  }

  // 2. Test the Google Places API with a simple query
  if (!googleKey) {
    result.google_test = 'SKIP — no key configured'
    return NextResponse.json(result)
  }

  try {
    const params = new URLSearchParams({
      query: 'farmacia asuncion',
      key: googleKey,
      language: 'es',
      region: 'py',
    })
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
    const res = await fetch(url)
    const data = await res.json()

    result.google_test = {
      http_status: res.status,
      api_status: data.status,
      error_message: data.error_message || null,
      results_count: data.results?.length ?? 0,
      first_result: data.results?.[0]?.name ?? null,
    }
  } catch (err: unknown) {
    result.google_test = { error: err instanceof Error ? err.message : String(err) }
  }

  return NextResponse.json(result)
}
