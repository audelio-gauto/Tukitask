import { MapProvider, GeocodeResult, DirectionsResult } from './types'

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json'
const PLACES_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json'

const toGeocodeResult = (result: any): GeocodeResult => ({
  provider: 'google',
  placeId: result.place_id,
  display_name: result.formatted_address,
  lat: result.geometry.location.lat,
  lng: result.geometry.location.lng,
  raw: result,
})

/**
 * Google Places Text Search — returns businesses, shops, pharmacies, etc.
 * Much more complete than Nominatim for Paraguay commercial data.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export async function googlePlacesSearch(
  query: string,
  apiKey: string,
  limit = 5,
  proximity?: { lat: number; lng: number },
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    query: `${query} Paraguay`,
    key: apiKey,
    language: 'es',
    region: 'py',
  })

  // Restrict results to Paraguay bounding box
  // SW: -27.60, -62.65  NE: -19.29, -54.24
  params.set('location', proximity && isFinite(proximity.lat) ? `${proximity.lat},${proximity.lng}` : '-23.44,-58.44')
  params.set('radius', '50000')

  const url = `${PLACES_SEARCH_URL}?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[googlePlacesSearch] API returned ${res.status} for query="${query}"`)
    return []
  }

  const data = await res.json()
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.warn(`[googlePlacesSearch] status=${data.status} error="${data.error_message || ''}" query="${query}" keyPrefix="${apiKey.slice(0, 8)}"`)
    return []
  }

  // Filter: only results within Paraguay bounds
  const PY_BOUNDS = { minLat: -27.60, maxLat: -19.29, minLng: -62.65, maxLng: -54.24 }
  const inParaguay = (lat: number, lng: number) =>
    lat >= PY_BOUNDS.minLat && lat <= PY_BOUNDS.maxLat &&
    lng >= PY_BOUNDS.minLng && lng <= PY_BOUNDS.maxLng

  return (data.results || [])
    .filter((r: any) => inParaguay(r.geometry.location.lat, r.geometry.location.lng))
    .slice(0, limit)
    .map((r: any): GeocodeResult => ({
    provider: 'google_places',
    placeId: r.place_id,
    display_name: r.name ? `${r.name} — ${r.formatted_address}` : r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    raw: r,
  }))
}

export const googleProvider = (apiKey: string): MapProvider => ({
  name: 'google',
  geocode: async (query: string) => {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${apiKey}&language=es`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const result = data.results && data.results[0]
    if (!result) return null
    return toGeocodeResult(result)
  },
  directions: async (from, to) => {
    const origin = `${from[0]},${from[1]}`
    const destination = `${to[0]},${to[1]}`
    const url = `${DIRECTIONS_URL}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${apiKey}&mode=driving`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const route = data.routes && data.routes[0]
    if (!route) return null
    const leg = route.legs && route.legs[0]
    const result: DirectionsResult = {
      provider: 'google',
      distance_meters: leg?.distance?.value ?? 0,
      duration_seconds: leg?.duration?.value ?? 0,
      polyline: route.overview_polyline?.points,
      raw: route,
    }
    return result
  },
})
