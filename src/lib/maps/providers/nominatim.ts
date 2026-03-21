import type { GeocodeResult } from './types'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'TukiTask/1.0 (delivery app)'

const toGeocodeResult = (item: {
  osm_id: number
  display_name: string
  lat: string
  lon: string
  type?: string
  class?: string
}): GeocodeResult => ({
  provider: 'nominatim',
  placeId: `osm-${item.osm_id}`,
  display_name: item.display_name,
  lat: parseFloat(item.lat),
  lng: parseFloat(item.lon),
  raw: item,
})

/**
 * Search for POIs and addresses via Nominatim (OpenStreetMap).
 * Great for businesses, shops, malls, pharmacies, etc. in Paraguay.
 * Respects Nominatim usage policy: max 1 req/sec, User-Agent required.
 */
export async function nominatimGeoSearch(
  query: string,
  limit = 5,
  proximity?: { lng: number; lat: number },
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
    countrycodes: 'py',
    'accept-language': 'es',
  })

  if (proximity && isFinite(proximity.lng) && isFinite(proximity.lat)) {
    params.set('viewbox', `${proximity.lng - 0.5},${proximity.lat - 0.5},${proximity.lng + 0.5},${proximity.lat + 0.5}`)
    params.set('bounded', '0')
  }

  const url = `${NOMINATIM_BASE}/search?${params.toString()}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!res.ok) {
    console.warn(`[nominatimGeoSearch] API returned ${res.status}: ${res.statusText}`)
    return []
  }

  const data = await res.json()
  return (data || []).map(toGeocodeResult)
}
