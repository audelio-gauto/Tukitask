import { redis } from './redis'

export async function incrementMetric(key: string, by = 1) {
  if (!redis) return
  try {
    await redis.incrby(key, by)
  } catch (err) {
    console.warn('incrementMetric error', err)
  }
}

export async function getMetric(key: string) {
  if (!redis) return null
  try {
    const v = await redis.get(key)
    return v ? Number(v) : null
  } catch (err) {
    console.warn('getMetric error', err)
    return null
  }
}
