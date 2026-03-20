import type { MapProvider, GeocodeResult, DirectionsResult } from './types'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const OSRM_BASE = 'https://router.project-osrm.org'

const toGeocodeResult = (item: any): GeocodeResult => ({
  provider: 'nominatim',
  placeId: String(item.place_id),
  display_name: item.display_name,
  lat: parseFloat(item.lat),
  lng: parseFloat(item.lon),
  raw: item,
})

function decodeOSRMPolyline(str: string): Array<[number, number]> {
  const coords: Array<[number, number]> = []
  let index = 0, lat = 0, lng = 0
  while (index < str.length) {
    let result = 0, shift = 0, b: number
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    result = 0; shift = 0
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    coords.push([lat / 1e5, lng / 1e5])
  }
  return coords
}

export const nominatimProvider = (): MapProvider => ({
  name: 'nominatim',
  geocode: async (query: string) => {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=es`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TukiTask/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.length === 0) return null
    return toGeocodeResult(data[0])
  },
  directions: async (from: [number, number], to: [number, number]): Promise<DirectionsResult | null> => {
    // OSRM expects lng,lat (not lat,lng)
    const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=polyline&annotations=duration,distance`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TukiTask/1.0' },
    })
    if (!res.ok) {
      console.warn(`[nominatim/OSRM] directions API returned ${res.status}`)
      return null
    }
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) return null
    const decoded = decodeOSRMPolyline(route.geometry)
    return {
      provider: 'osrm',
      distance_meters: route.distance,
      duration_seconds: route.duration,
      polyline: route.geometry,
      coords: decoded,
      raw: route,
    }
  },
})

/** Search returning multiple results for autocomplete (Nominatim / OpenStreetMap) */
export async function nominatimGeoSearch(query: string, limit = 6): Promise<GeocodeResult[]> {
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}&accept-language=es&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TukiTask/1.0' },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data || []).map(toGeocodeResult)
}
