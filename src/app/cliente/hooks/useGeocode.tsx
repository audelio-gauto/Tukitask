'use client'
import { useEffect, useRef, useState } from 'react'
import { idbGet, idbSet } from '../../../lib/indexeddb/cache'

type GeoResult = {
  provider: string
  placeId?: string
  display_name: string
  lat: number
  lng: number
}

const MEM_CACHE = new Map<string, { result: GeoResult | null; expiresAt: number }>()
const MEM_LRU_LIMIT = 200

function memSet(key: string, value: GeoResult | null, ttlSeconds: number) {
  if (MEM_CACHE.size >= MEM_LRU_LIMIT) {
    // remove oldest
    const firstKey = MEM_CACHE.keys().next().value
    if (firstKey) MEM_CACHE.delete(firstKey)
  }
  MEM_CACHE.set(key, { result: value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

function memGet(key: string) {
  const rec = MEM_CACHE.get(key)
  if (!rec) return null
  if (Date.now() > rec.expiresAt) {
    MEM_CACHE.delete(key)
    return null
  }
  return rec.result
}

export function useGeocode(query: string, opts?: { ttlSeconds?: number; debounceMs?: number }) {
  const ttl = opts?.ttlSeconds ?? 300
  const debounceMs = opts?.debounceMs ?? 300
  const [result, setResult] = useState<GeoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResult(null)
      setLoading(false)
      setError(null)
      return
    }

    const key = `geocode:${query.trim().toLowerCase()}`
    const mem = memGet(key)
    if (mem) {
      setResult(mem)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(async () => {
      // check idb
      const idb = await idbGet<GeoResult>(key)
      if (cancelled) return
      if (idb) {
        memSet(key, idb, ttl)
        setResult(idb)
        setLoading(false)
        return
      }

      // fetch from serverless API
      try {
        abortRef.current?.abort()
        const ac = new AbortController()
        abortRef.current = ac
        const res = await fetch('/api/maps/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: ac.signal,
        })
        if (!res.ok) throw new Error(`status:${res.status}`)
        const data = await res.json()
        const r = data.result as GeoResult | null
        if (r) {
          memSet(key, r, ttl)
          idbSet(key, r, ttl)
        }
        if (!cancelled) setResult(r)
      } catch (err: any) {
        if (err.name === 'AbortError') return
        console.warn('geocode fetch err', err)
        if (!cancelled) setError(String(err?.message ?? err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, debounceMs)

    return () => {
      cancelled = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [query, ttl, debounceMs])

  return { result, loading, error }
}
