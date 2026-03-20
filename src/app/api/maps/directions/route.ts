import { NextResponse } from 'next/server'
import { directions } from '../../../../lib/maps/provider.server'
import { allowRequest } from '../../../../lib/rateLimit'
import { isCircuitOpen, recordFailure, recordSuccess } from '../../../../lib/circuitBreaker'

function decodePolyline(polyline: string): Array<[number, number]> {
  const coords: Array<[number, number]> = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < polyline.length) {
    let result = 0
    let shift = 0
    let b: number
    do {
      b = polyline.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1))
    lat += dlat

    result = 0
    shift = 0
    do {
      b = polyline.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1))
    lng += dlng

    coords.push([lat / 1e5, lng / 1e5])
  }
  return coords
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  let from: any = body?.from
  let to: any = body?.to
  if (!from || !to) return NextResponse.json({ error: 'missing from/to' }, { status: 400 })

  // accept objects {lat,lng} or arrays [lat,lng]
  const normalize = (p: any): [number, number] | null => {
    if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])]
    if (p && typeof p === 'object' && ('lat' in p) && ('lng' in p)) return [Number(p.lat), Number(p.lng)]
    return null
  }

  const f = normalize(from)
  const t = normalize(to)
  if (!f || !t) return NextResponse.json({ error: 'invalid coordinates' }, { status: 400 })

  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const cbName = 'maps:directions'
    if (await isCircuitOpen(cbName)) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 })
    const allowed = await allowRequest(`rl:directions:${ip}`, Number(process.env.DIRECTIONS_RATE_LIMIT || 20), Number(process.env.DIRECTIONS_RATE_WINDOW || 1))
    if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    const res = await directions(f, t)
    if (!res) {
      await recordFailure(cbName)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    await recordSuccess(cbName)

    // Normalize coords to { lat, lng } objects
    let coords: Array<{ lat: number; lng: number }> = []

    if (res.coords && res.coords.length > 0) {
      // coords may be [lat, lng] tuples or already { lat, lng } objects
      coords = res.coords.map((p: any) => {
        if (Array.isArray(p)) return { lat: p[0], lng: p[1] }
        if (p && typeof p === 'object' && 'lat' in p) return { lat: p.lat, lng: p.lng }
        return p
      })
    } else if (res.polyline) {
      try {
        const pts = decodePolyline(res.polyline)
        coords = pts.map(p => ({ lat: p[0], lng: p[1] }))
      } catch (err) {
        // continue without coords
      }
    }

    return NextResponse.json({
      ...res,
      coords,
      distance_meters: res.distance_meters,
      duration_seconds: res.duration_seconds,
    })
    } catch (err) {
    console.error('directions route error', err)
    await recordFailure('maps:directions')
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
