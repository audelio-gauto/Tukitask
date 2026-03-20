import crypto from 'crypto'
import { redis } from '../redis'
import { mapboxProvider } from './providers/mapbox'
import { mapboxGeoSearch } from './providers/mapbox'
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
  let mapbox = process.env.MAPBOX_API_KEY || ''
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

/** Multi-result search for autocomplete (returns up to `limit` results) */
export async function geocodeSearch(query: string, limit = 6): Promise<GeocodeResult[]> {
  const key = `geocode_search:${hashKey(query)}:${limit}`
  const cached = await cacheGet(key)
  if (cached) return cached as GeocodeResult[]

  const keys = await getApiKeys()
  // Try Mapbox first if available
  if (keys.mapbox) {
    try {
      const results = await mapboxGeoSearch(query, keys.mapbox, limit)
      if (results.length > 0) {
        await cacheSet(key, results, geocodeTTL)
        return results
      }
    } catch (err) {
      console.warn('mapboxGeoSearch failed', err)
    }
  }
  // Fallback: use provider.geocode (single result)
  const single = await geocode(query)
  const results = single ? [single] : []
  if (results.length > 0) await cacheSet(key, results, geocodeTTL)
  return results
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
