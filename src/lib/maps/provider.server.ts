import crypto from 'crypto'
import { redis } from '../redis'
import { mapboxProvider } from './providers/mapbox'
import { mapboxGeoSearch, mapboxReverseGeocode } from './providers/mapbox'
import { nominatimGeoSearch } from './providers/nominatim'
import { googleProvider } from './providers/google'
import type { GeocodeResult, DirectionsResult } from './providers/types'
import { incrementMetric } from '../metrics'
import { supabaseServer } from '../supabaseServer'

const redisClient = redis

const geocodeTTL = Number(process.env.GEOCODE_CACHE_TTL_SECONDS || 300) // default 5 min
const directionsTTL = Number(process.env.DIRECTIONS_CACHE_TTL_SECONDS || 300)

// --- Dynamic API key loading from Supabase app_settings ---
let _keyCache: { mapbox: string; google: string; ts: number } | null = null
const KEY_CACHE_TTL = 60_000 // 1 minute

async function getApiKeys(): Promise<{ mapbox: string; google: string }> {
  if (_keyCache && Date.now() - _keyCache.ts < KEY_CACHE_TTL) {
    return { mapbox: _keyCache.mapbox, google: _keyCache.google }
  }
  let mapbox = process.env.MAPBOX_API_KEY || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  let google = process.env.GOOGLE_MAPS_API_KEY || ''
  try {
    const { data, error } = await supabaseServer.from('app_settings').select('key, value')
    if (error) {
      console.warn('Supabase app_settings query error:', error.message)
    }
    if (data) {
      for (const row of data) {
        if (row.key === 'mapbox_api_key' && row.value) mapbox = row.value
        if (row.key === 'google_maps_api_key' && row.value) google = row.value
      }
    }
  } catch (err) {
    console.warn('Failed to load API keys from app_settings, using env vars', err)
  }
  if (!mapbox && !google) {
    console.warn('No map API keys found (neither env vars nor app_settings)')
  }
  _keyCache = { mapbox, google, ts: Date.now() }
  return { mapbox, google }
}

const preferred = (process.env.MAP_PROVIDER || 'mapbox').split(',').map(p => p.trim())

async function getProviders() {
  const keys = await getApiKeys()
  const list: Array<any> = []
  if (keys.mapbox) list.push(mapboxProvider(keys.mapbox))
  if (keys.google) list.push(googleProvider(keys.google))
  // Order providers according to preferred env if present
  if (preferred && preferred.length) {
    const ordered = preferred
      .map(name => list.find(p => p.name === name))
      .filter(Boolean)
    list.forEach(p => { if (!ordered.includes(p)) ordered.push(p) })
    return ordered
  }
  return list
}

function hashKey(parts: any) {
  const str = typeof parts === 'string' ? parts : JSON.stringify(parts)
  return crypto.createHash('sha256').update(str).digest('hex')
}

async function cacheGet(key: string) {
  if (!redisClient) return null
  try {
    const raw = await redisClient.get(key)
    if (raw) {
      // metric: cache hit
      try { incrementMetric(`metrics:cache:hit:${key.split(':')[0] || 'generic'}`) } catch (e) {}
      return JSON.parse(raw as string)
    }
    // metric: cache miss
    try { incrementMetric(`metrics:cache:miss:${key.split(':')[0] || 'generic'}`) } catch (e) {}
    return null
  } catch (err) {
    console.warn('Redis get failed', err)
    return null
  }
}

async function cacheSet(key: string, value: any, ttlSeconds: number) {
  if (!redisClient) return
  try {
    await redisClient.set(key, JSON.stringify(value), { ex: ttlSeconds })
    try { incrementMetric(`metrics:cache:set:${key.split(':')[0] || 'generic'}`) } catch (e) {}
  } catch (err) {
    console.warn('Redis set failed', err)
  }
}

export async function geocode(query: string): Promise<GeocodeResult | null> {
  const key = `geocode:${hashKey(query)}`
  const cached = await cacheGet(key)
  if (cached) return cached as GeocodeResult

  const providers = await getProviders()
  for (const provider of providers) {
    try {
      const res = await provider.geocode(query)
      if (res) {
        await cacheSet(key, res, geocodeTTL)
        return res
      }
    } catch (err) {
      console.warn(`Provider ${provider.name} geocode failed`, err)
      continue
    }
  }
  return null
}

/**
 * Multi-result search for autocomplete.
 * Runs Mapbox (streets/cities) + Nominatim/OSM (businesses/POIs) in parallel,
 * then merges and deduplicates results.
 */
export async function geocodeSearch(
  query: string,
  limit = 6,
  proximity?: { lng: number; lat: number },
): Promise<GeocodeResult[]> {
  const key = `geocode_search:${hashKey({ query, limit, proximity })}`
  const cached = await cacheGet(key)
  if (cached) return cached as GeocodeResult[]

  const keys = await getApiKeys()

  // Run both providers in parallel
  const [mapboxResults, nominatimResults] = await Promise.all([
    keys.mapbox
      ? mapboxGeoSearch(query, keys.mapbox, limit, proximity).catch((err) => {
          console.warn('[geocodeSearch] mapboxGeoSearch failed:', err)
          return [] as GeocodeResult[]
        })
      : Promise.resolve([] as GeocodeResult[]),
    nominatimGeoSearch(query, Math.min(limit, 5), proximity).catch((err) => {
      console.warn('[geocodeSearch] nominatimGeoSearch failed:', err)
      return [] as GeocodeResult[]
    }),
  ])

  // Merge: Nominatim first (has POIs), then Mapbox, deduplicate by proximity
  const merged = deduplicateResults([...nominatimResults, ...mapboxResults], limit)

  if (merged.length > 0) {
    await cacheSet(key, merged, geocodeTTL)
  }
  return merged
}

/** Remove near-duplicate results (within ~200m of each other with similar names) */
function deduplicateResults(results: GeocodeResult[], limit: number): GeocodeResult[] {
  const unique: GeocodeResult[] = []
  for (const r of results) {
    const isDup = unique.some(u => {
      const dlat = Math.abs(u.lat - r.lat)
      const dlng = Math.abs(u.lng - r.lng)
      // ~200m threshold
      if (dlat < 0.002 && dlng < 0.002) {
        // Check name similarity (one contains the other)
        const a = u.display_name.toLowerCase()
        const b = r.display_name.toLowerCase()
        if (a.includes(b.substring(0, 15)) || b.includes(a.substring(0, 15))) return true
      }
      return false
    })
    if (!isDup) unique.push(r)
    if (unique.length >= limit) break
  }
  return unique
}

/** Reverse geocode: lat,lng → address — Mapbox only */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const key = `reverse_geocode:${hashKey({ lat, lng })}`
  const cached = await cacheGet(key)
  if (cached) return cached as GeocodeResult

  const keys = await getApiKeys()
  if (!keys.mapbox) {
    console.error('[reverseGeocode] No MAPBOX_API_KEY configured')
    return null
  }

  try {
    const result = await mapboxReverseGeocode(lat, lng, keys.mapbox)
    if (result) {
      await cacheSet(key, result, geocodeTTL)
    }
    return result
  } catch (err) {
    console.warn('[reverseGeocode] failed:', err)
    return null
  }
}

export async function directions(from: [number, number], to: [number, number]): Promise<DirectionsResult | null> {
  const key = `directions:${hashKey({ from, to })}`
  const cached = await cacheGet(key)
  if (cached) return cached as DirectionsResult

  const providers = await getProviders()
  for (const provider of providers) {
    if (!provider.directions) continue
    try {
      const res = await provider.directions(from, to)
      if (res) {
        await cacheSet(key, res, directionsTTL)
        return res
      }
    } catch (err) {
      console.warn(`Provider ${provider.name} directions failed`, err)
      continue
    }
  }
  return null
}

export async function availableProviders() {
  const providers = await getProviders()
  return providers.map(p => p.name)
}
