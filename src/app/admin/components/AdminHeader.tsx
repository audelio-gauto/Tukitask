'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/lib/useTheme';
import { usePushNotifications } from '@/lib/usePushNotifications';
import { NotificationBell } from '@/components/NotificationBell';

export default function AdminHeader({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const { theme, setTheme } = useTheme();
  const { cleanup: cleanupPushNotifications } = usePushNotifications(email || undefined);

  useEffect(() => {
    let active = true;
    // getSession lee la sesión local al instante; getUser confirma contra el servidor.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session?.user?.email) setEmail(session.user.email);
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active && user?.email) setEmail(user.email);
    });
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    await cleanupPushNotifications();
    await supabase.auth.signOut();
    router.replace('/auth');
  }

  return (
    <header className="adm-header">
      <div className="adm-header-heading">
        <button type="button" className="adm-menu-toggle" onClick={onToggleMenu} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="admin-navigation">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="adm-header-title">Tukitask &middot; Administración</h1>
      </div>
      <div className="adm-header-actions">
        {/* Tema y notificaciones, siempre juntos */}
        <div className="adm-header-tools">
          <button
            className="adm-theme-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {theme === 'dark' ? (
              /* Sun icon */
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
              /* Moon icon */
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          {email && <NotificationBell userEmail={email.toLowerCase()} variant="admin" />}
        </div>

        {/* Profile */}
        <div className="adm-profile-chip">
          <div className="adm-profile-avatar">
            {email ? email[0].toUpperCase() : 'A'}
          </div>
          <span className="adm-profile-email hidden sm:block">{email || 'Admin'}</span>
        </div>

        {/* Logout */}
        <button onClick={handleLogout} className="adm-logout-btn">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
