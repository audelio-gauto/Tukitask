import { Redis } from '@upstash/redis'

let client: Redis | null = null

export function getRedisClient(): Redis | null {
  if (client) return client
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    client = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    return client
  }
  return null
}

export const redis = getRedisClient()
