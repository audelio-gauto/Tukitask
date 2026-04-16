'use client';
import { useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'tuki_theme';

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
}

/** Read theme mode from localStorage, fallback to 'dark' */
function readStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
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
    return () => window.removeEventListener('storage', handler);
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
 */
export function initTheme() {
  if (typeof document === 'undefined') return;
  applyTheme(readStoredTheme());
}
