import { getRedisClient } from './redis';

/**
 * Redis cache helper for API routes.
 * Falls back gracefully if Redis is not configured (returns null → caller fetches fresh).
 *
 * Usage:
 *   const cached = await cacheGet<MyType>('stats:driver:user@email.com');
 *   if (cached) return NextResponse.json(cached);
 *   // ... fetch from DB ...
 *   await cacheSet('stats:driver:user@email.com', data, 15);
 */

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (raw === null || raw === undefined) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 15): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch {
    // silent — non-critical
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // silent
  }
}

/**
 * Cache-through helper: tries cache first, falls back to fetcher, then caches result.
 */
export async function cacheThrough<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 15,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}
