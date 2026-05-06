import { redis } from './redis'

// Simple Redis-backed fixed window rate limiter.
// key: string (e.g., "rl:maps:geocode:IP"), limit: number, windowSec: number
export async function allowRequest(key: string, limit = 60, windowSec = 60) {
  if (!redis) return true // no redis => allow (dev)
  try {
    const cur = await redis.incr(key)
    if (cur === 1) {
      // set expiry
      await redis.expire(key, windowSec)
    }
    return Number(cur) <= limit
  } catch (err) {
    // Redis error (transient network issue) — fail closed to prevent abuse
    console.warn('allowRequest redis error', err)
    return false
  }
}
