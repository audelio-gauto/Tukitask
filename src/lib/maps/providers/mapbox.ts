import { MapProvider, GeocodeResult, DirectionsResult } from './types'

const MAPBOX_BASE = 'https://api.mapbox.com'

const toGeocodeResult = (feature: any): GeocodeResult => ({
  provider: 'mapbox',
  placeId: feature.id,
  display_name: feature.place_name,
  lat: feature.center[1],
  lng: feature.center[0],
  raw: feature,
})

export const mapboxProvider = (apiKey: string): MapProvider => ({
  name: 'mapbox',
  geocode: async (query: string) => {
    const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}&limit=1&autocomplete=true&language=es&country=py`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[mapbox geocode] API returned ${res.status}: ${res.statusText}`)
      return null
    }
    const data = await res.json()
    const feature = data.features && data.features[0]
    if (!feature) return null
    return toGeocodeResult(feature)
  },
  directions: async (from, to) => {
    const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`
    const url = `${MAPBOX_BASE}/directions/v5/mapbox/driving/${coords}?access_token=${apiKey}&geometries=polyline&overview=full&annotations=duration,distance`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const route = data.routes && data.routes[0]
    if (!route) return null
    const result: DirectionsResult = {
      provider: 'mapbox',
      distance_meters: route.distance,
      duration_seconds: route.duration,
      polyline: route.geometry,
      raw: route,
    }
    return result
  },
})

/** Search returning multiple results for autocomplete — Mapbox only, biased to Paraguay */
export async function mapboxGeoSearch(
  query: string,
  apiKey: string,
  limit = 6,
  proximity?: { lng: number; lat: number },
): Promise<GeocodeResult[]> {
  let url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}&limit=${limit}&autocomplete=true&language=es&country=py`
  if (proximity && isFinite(proximity.lng) && isFinite(proximity.lat)) {
    url += `&proximity=${proximity.lng},${proximity.lat}`
  } else {
    // Default proximity: Asunción, Paraguay
    url += `&proximity=-57.5759,-25.2637`
  }
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[mapboxGeoSearch] API returned ${res.status}: ${res.statusText}`)
    return []
  }
  const data = await res.json()
  return (data.features || []).map(toGeocodeResult)
}

/** Reverse geocode: coordinates to address — Mapbox only */
export async function mapboxReverseGeocode(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<GeocodeResult | null> {
  const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${apiKey}&limit=1&language=es&country=py`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[mapboxReverseGeocode] API returned ${res.status}: ${res.statusText}`)
    return null
  }
  const data = await res.json()
  const feature = data.features && data.features[0]
  if (!feature) return null
  return toGeocodeResult(feature)
}
