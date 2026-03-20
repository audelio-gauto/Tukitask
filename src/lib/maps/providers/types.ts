export type GeocodeResult = {
  provider: string
  placeId?: string
  display_name: string
  lat: number
  lng: number
  raw?: any
}

export type DirectionsResult = {
  provider: string
  distance_meters: number
  duration_seconds: number
  polyline?: string
  coords?: Array<[number, number]>
  raw?: any
}

export type MapProvider = {
  name: string
  geocode: (query: string) => Promise<GeocodeResult | null>
  reverseGeocode?: (lat: number, lng: number) => Promise<GeocodeResult | null>
  directions?: (from: [number, number], to: [number, number]) => Promise<DirectionsResult | null>
}
