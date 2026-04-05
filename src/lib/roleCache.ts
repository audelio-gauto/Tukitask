/**
 * Caches the user's role in sessionStorage to avoid calling /api/check-role
 * on every layout mount. TTL: 5 minutes.
 * Session storage is cleared automatically when the tab/browser is closed.
 */

const KEY = 'tuki_role_v1';
const TTL_MS = 5 * 60 * 1000; // 5 min

interface RoleCacheEntry { email: string; role: string; ts: number }

export function getCachedRole(email: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const c: RoleCacheEntry = JSON.parse(raw);
    if (c.email !== email || Date.now() - c.ts > TTL_MS) return null;
    return c.role;
  } catch { return null; }
}

export function setCachedRole(email: string, role: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, role, ts: Date.now() }));
  } catch {}
}

export function clearRoleCache(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(KEY); } catch {}
}
