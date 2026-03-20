import type { MapProvider, GeocodeResult } from './types'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

const toGeocodeResult = (item: any): GeocodeResult => ({
  provider: 'nominatim',
  placeId: String(item.place_id),
  display_name: item.display_name,
  lat: parseFloat(item.lat),
  lng: parseFloat(item.lon),
  raw: item,
})

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
