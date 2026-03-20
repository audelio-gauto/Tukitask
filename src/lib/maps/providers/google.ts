import { MapProvider, GeocodeResult, DirectionsResult } from './types'

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json'

const toGeocodeResult = (result: any): GeocodeResult => ({
  provider: 'google',
  placeId: result.place_id,
  display_name: result.formatted_address,
  lat: result.geometry.location.lat,
  lng: result.geometry.location.lng,
  raw: result,
})

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
