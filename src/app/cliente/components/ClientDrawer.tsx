'use client';
import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const menuItems = [
  { slug: 'dashboard', label: 'Dashboard', href: '/cliente', icon: 'home' },
  { slug: 'enviar', label: 'Enviar Paquete', href: '/cliente/enviar', icon: 'send' },
  { slug: 'servicio', label: 'Solicitar Servicio', href: '/cliente/servicio', icon: 'tools' },
  { slug: 'mis-envios', label: 'Mis Envíos', href: '/cliente/mis-envios', icon: 'package' },
  { slug: 'pedidos', label: 'Mis Pedidos', href: '/cliente/pedidos', icon: 'shopping' },
  { slug: 'direcciones', label: 'Mis Direcciones', href: '/cliente/direcciones', icon: 'map' },
  { slug: 'settings', label: 'Configuración', href: '/cliente/settings', icon: 'settings' },
];

const icons: Record<string, React.ReactNode> = {
  home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg>,
  send: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
  package: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  shopping: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>,
  map: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  settings: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  tools: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.7 9.3a6 6 0 10-5.4 10.4l4.6-4.6 3.6 1.8 1.8-3.6-4.6-4.6z" /></svg>,
};

interface ClientDrawerProps {
  open: boolean;
  onClose: () => void;
  email: string;
  displayName: string;
  profilePhoto?: string;
}

export function ClientDrawer({ open, onClose, email, displayName, profilePhoto }: ClientDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  }, [router]);

  return (
    <>
      <nav className={`client-sidebar ${open ? 'open' : ''}`}>
        <div className="client-sidebar-header">
          <div
            className="client-sidebar-avatar"
            style={profilePhoto ? { backgroundImage: `url(${profilePhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
          >
            {!profilePhoto && (displayName?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || 'C')}
          </div>
          <div>
            <h3 className="client-sidebar-name">{displayName || 'Cliente'}</h3>
            <span className="client-sidebar-email">{email}</span>
          </div>
        </div>
        <div className="client-sidebar-body">
          {menuItems.map((item) => (
            <Link
              key={item.slug}
              href={item.href}
              className={`client-sidebar-link ${pathname === item.href ? 'active' : ''}`}
              onClick={onClose}
            >
              {icons[item.icon]}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="client-sidebar-footer">
          <button className="client-sidebar-link" onClick={handleLogout}>
            {icons.logout}
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </nav>
      <div className={`client-overlay ${open ? 'active' : ''}`} onClick={onClose} />
    </>
  );
}

export { icons };
