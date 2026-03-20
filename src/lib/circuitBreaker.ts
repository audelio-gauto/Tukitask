import { redis } from './redis'

// Redis-backed circuit breaker
// failureKey: string, threshold: number failures, windowSec: number to count failures, openSec: seconds to keep circuit open
export async function isCircuitOpen(name: string, openSec = 60) {
  if (!redis) return false
  try {
    const tripped = await redis.get(`cb:tripped:${name}`)
    return !!tripped
  } catch (err) {
    console.warn('isCircuitOpen error', err)
    return false
  }
}

export async function recordFailure(name: string, threshold = 5, windowSec = 60, openSec = 60) {
  if (!redis) return
  try {
    const key = `cb:fail:${name}`
    const cur = await redis.incr(key)
    if (cur === 1) await redis.expire(key, windowSec)
    if (Number(cur) >= threshold) {
      await redis.set(`cb:tripped:${name}`, '1', { ex: openSec })
    }
  } catch (err) {
    console.warn('recordFailure error', err)
  }
}

export async function recordSuccess(name: string) {
  if (!redis) return
  try {
    // reset failure counter
    await redis.del(`cb:fail:${name}`)
    await redis.del(`cb:tripped:${name}`)
  } catch (err) {
    console.warn('recordSuccess error', err)
  }
}
