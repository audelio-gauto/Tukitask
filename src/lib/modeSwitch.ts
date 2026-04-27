/**
 * modeSwitch — controls UI mode switching for driver/tecnico users
 * who want to use the app as a client.
 *
 * This is purely a UI routing helper. No permissions are granted here.
 * All API security is enforced server-side via JWT + role checks.
 */

const STORAGE_KEY = 'tuki_app_mode';
const REAL_ROLE_KEY = 'tuki_real_role';

export type AppMode = 'tasker' | 'cliente';

/** Save the current mode */
export function setAppMode(mode: AppMode): void {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
}

/** Get the current mode (defaults to 'tasker') */
export function getAppMode(): AppMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'cliente' ? 'cliente' : 'tasker';
  } catch { return 'tasker'; }
}

/** Clear mode (revert to tasker) */
export function clearAppMode(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Save the real role so the cliente panel can redirect back correctly */
export function saveRealRole(role: string): void {
  try { localStorage.setItem(REAL_ROLE_KEY, role); } catch {}
}

/** Get the real role saved when switching to client mode */
export function getRealRole(): string | null {
  try { return localStorage.getItem(REAL_ROLE_KEY); } catch { return null; }
}

/** The roles that are allowed to switch to client mode */
export const TASKER_ROLES = ['driver', 'servicio', 'tecnico'];
