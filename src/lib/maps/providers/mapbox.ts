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
    const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}&limit=5&autocomplete=true&language=es`
    const res = await fetch(url)
    if (!res.ok) return null
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

/** Search returning multiple results for autocomplete */
export async function mapboxGeoSearch(query: string, apiKey: string, limit = 6): Promise<GeocodeResult[]> {
  const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}&limit=${limit}&autocomplete=true&language=es`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return (data.features || []).map(toGeocodeResult)
}
