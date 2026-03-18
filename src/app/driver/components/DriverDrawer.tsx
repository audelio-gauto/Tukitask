'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const driverMenuItems = [
  { slug: 'dashboard', label: 'Dashboard', href: '/driver', icon: 'home' },
  { slug: 'deliveries', label: 'Envíos', href: '/driver/deliveries', icon: 'box' },
  { slug: 'assigned', label: 'Asignados', href: '/driver/assigned', icon: 'clipboard' },
  { slug: 'en-ruta', label: 'En Ruta', href: '/driver/en-ruta', icon: 'truck' },
  { slug: 'delivered', label: 'Entregados', href: '/driver/delivered', icon: 'check' },
  { slug: 'failed', label: 'Fallidos', href: '/driver/failed', icon: 'x' },
  { slug: 'settings', label: 'Configuración', href: '/driver/settings', icon: 'settings' },
];

const tecnicoMenuItems = [
  { slug: 'dashboard', label: 'Dashboard', href: '/tecnico', icon: 'home' },
  { slug: 'ofertas', label: 'Ofertas Activas', href: '/tecnico/ofertas', icon: 'box' },
  { slug: 'citas', label: 'Citas Confirmadas', href: '/tecnico/citas', icon: 'clipboard' },
  { slug: 'aceptacion', label: 'Tasa de Aceptación', href: '/tecnico/aceptacion', icon: 'check' },
  { slug: 'ganancias', label: 'Ganancias', href: '/tecnico/ganancias', icon: 'map' },
  { slug: 'settings', label: 'Configuración', href: '/tecnico/settings', icon: 'settings' },
];

const icons: Record<string, React.ReactNode> = {
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg>,
  box: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  clipboard: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  truck: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  check: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  x: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  settings: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  bars: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  crosshair: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  map: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
};

interface DriverDrawerProps {
  open: boolean;
  onClose: () => void;
  email: string;
  displayName: string;
  profilePhoto?: string;
  role?: string | null;
}

export function DriverDrawer({ open, onClose, email, displayName, profilePhoto, role = null }: DriverDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  }, [router]);

  return (
    <>
      <nav className={`tuki-drawer ${open ? 'open' : ''}`}>
        <div className="tuki-drawer-header">
          <div
            className="tuki-drawer-avatar"
            style={profilePhoto ? { backgroundImage: `url(${profilePhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          >
            {!profilePhoto && (displayName?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || 'D')}
          </div>
          <div>
            <h3 className="tuki-drawer-name">{displayName || 'Conductor'}</h3>
            <span className="tuki-drawer-email">{email}</span>
          </div>
        </div>
        <div className="tuki-drawer-body">
          {(role === 'servicio' ? tecnicoMenuItems : driverMenuItems).map((item) => (
            <Link
              key={item.slug}
              href={item.href}
              className={`tuki-drawer-link ${pathname === item.href ? 'active' : ''}`}
              onClick={onClose}
            >
              {icons[item.icon]}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="tuki-drawer-footer">
          <button className="tuki-drawer-link" onClick={handleLogout}>
            {icons.logout}
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </nav>
      <div className={`tuki-overlay ${open ? 'active' : ''}`} onClick={onClose} />
    </>
  );
}

export { icons };
