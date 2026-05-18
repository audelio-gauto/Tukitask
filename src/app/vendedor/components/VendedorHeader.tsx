'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/lib/useTheme';

const pageTitles: Record<string, string> = {
  '/vendedor':                 'Vista General',
  '/vendedor/productos':       'Productos',
  '/vendedor/pedidos':         'Gestión de Pedidos',
  '/vendedor/negociaciones':   'Negociaciones',
  '/vendedor/analisis':        'Análisis y Reportes',
  '/vendedor/configuracion':   'Configuración de Tienda',
};

export default function VendedorHeader() {
  const router   = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState('');
  const [initial, setInitial] = useState('V');
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email);
        setInitial(user.email[0].toUpperCase());
      }
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/auth');
  }

  const pageTitle = pageTitles[pathname] ?? 'Mi Tienda';

  return (
    <header className="vnd-header">
      <div className="vnd-header-left">
        <span className="vnd-header-title">
          TukiMarket
          <span className="vnd-header-sep"> · </span>
        </span>
        <span className="vnd-header-page">{pageTitle}</span>
      </div>

      <div className="vnd-header-actions">
        {/* Theme toggle */}
        <button
          className="vnd-theme-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>

        {/* Notifications bell */}
        <button className="vnd-theme-btn" title="Notificaciones" style={{ position: 'relative' }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* Profile */}
        <div className="vnd-profile-chip">
          <div className="vnd-profile-avatar">{initial}</div>
          <span className="vnd-profile-email hidden sm:block">{email || 'Vendedor'}</span>
        </div>

        {/* Logout */}
        <button className="vnd-logout-btn" onClick={handleLogout}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
