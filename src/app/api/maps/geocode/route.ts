import { NextResponse } from 'next/server'
import { geocode, geocodeSearch, reverseGeocode, availableProviders } from '../../../../lib/maps/provider.server'
import { allowRequest } from '../../../../lib/rateLimit'
import { isCircuitOpen, recordFailure, recordSuccess } from '../../../../lib/circuitBreaker'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const query = body?.query || ''
  const multi = body?.multi === true
  const reverse = body?.reverse === true

  if (!query && !reverse) return NextResponse.json({ error: 'missing query' }, { status: 400 })

  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const cbName = 'maps:geocode'
    if (await isCircuitOpen(cbName)) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
    const allowed = await allowRequest(`rl:geocode:${ip}`, Number(process.env.GEOCODE_RATE_LIMIT || 10), Number(process.env.GEOCODE_RATE_WINDOW || 1))
    if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    // Reverse geocode: { reverse: true, lat, lng }
    if (reverse) {
      const lat = Number(body?.lat)
      const lng = Number(body?.lng)
      if (!isFinite(lat) || !isFinite(lng)) return NextResponse.json({ error: 'invalid coordinates' }, { status: 400 })
      const result = await reverseGeocode(lat, lng)
      if (!result) {
        await recordFailure(cbName)
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }
      await recordSuccess(cbName)
      return NextResponse.json({ result })
    }

    // Proximity bias from client's location
    const proximity = body?.proximity && isFinite(Number(body.proximity.lng)) && isFinite(Number(body.proximity.lat))
      ? { lng: Number(body.proximity.lng), lat: Number(body.proximity.lat) }
      : undefined

    if (multi) {
      const results = await geocodeSearch(query, body?.limit || 6, proximity)
      await recordSuccess(cbName)
      return NextResponse.json({ results, provider: 'mapbox' })
    }

    const result = await geocode(query)
    if (!result) {
      await recordFailure(cbName)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    await recordSuccess(cbName)
    return NextResponse.json({ result, provider: 'mapbox' })
  } catch (err) {
    console.error('geocode route error', err)
    await recordFailure('maps:geocode')
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
