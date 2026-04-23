'use client';
import { useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'tuki_theme';

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
}

/** Read theme mode from localStorage, fallback to system prefers-color-scheme */
function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // No manual override — respect the OS preference
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

/**
 * Shared theme hook.
 * - Reads from localStorage on mount
 * - Applies data-theme attribute to <html> immediately
 * - Syncs across tabs via storage events
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    const initial = readStoredTheme();
    setThemeState(initial);
    applyTheme(initial);

    // Sync across tabs
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handler);

    // Sync with OS theme changes — only when no manual override stored
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const mqHandler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const next: ThemeMode = e.matches ? 'light' : 'dark';
        setThemeState(next);
        applyTheme(next);
      }
    };
    mq.addEventListener('change', mqHandler);

    return () => {
      window.removeEventListener('storage', handler);
      mq.removeEventListener('change', mqHandler);
    };
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    applyTheme(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  return { theme, setTheme };
}

/**
 * Lightweight initializer — call inside a layout useEffect to apply
 * the stored theme without subscribing to changes (avoids extra renders).
 * Falls back to prefers-color-scheme when no manual preference is stored.
 */
export function initTheme() {
  if (typeof document === 'undefined') return;
  applyTheme(readStoredTheme());
}
