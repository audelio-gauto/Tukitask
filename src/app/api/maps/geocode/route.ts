import { NextResponse } from 'next/server'
import { geocode, geocodeSearch, availableProviders } from '../../../../lib/maps/provider.server'
import { allowRequest } from '../../../../lib/rateLimit'
import { isCircuitOpen, recordFailure, recordSuccess } from '../../../../lib/circuitBreaker'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const query = body?.query || ''
  const multi = body?.multi === true // if true, return multiple results for autocomplete
  if (!query) return NextResponse.json({ error: 'missing query' }, { status: 400 })

  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const cbName = 'maps:geocode'
    if (await isCircuitOpen(cbName)) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
    const allowed = await allowRequest(`rl:geocode:${ip}`, Number(process.env.GEOCODE_RATE_LIMIT || 10), Number(process.env.GEOCODE_RATE_WINDOW || 1))
    if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    if (multi) {
      const results = await geocodeSearch(query, body?.limit || 6)
      await recordSuccess(cbName)
      return NextResponse.json({ results, providers: await availableProviders() })
    }

    const result = await geocode(query)
    if (!result) {
      await recordFailure(cbName)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    await recordSuccess(cbName)
    return NextResponse.json({ result, providers: await availableProviders() })
  } catch (err) {
    console.error('geocode route error', err)
    await recordFailure('maps:geocode')
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
