'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/vendedor',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
      </svg>
    ),
  },
  {
    label: 'Productos',
    href: '/vendedor/productos',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    label: 'Pedidos',
    href: '/vendedor/pedidos',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
  },
  {
    label: 'Negociaciones',
    href: '/vendedor/negociaciones',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    badge: 0,
  },
  {
    label: 'Mi tienda',
    href: '/vendedor/plantillas',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10-1a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V5a1 1 0 00-1-1h-4zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-1a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1h-4z" />
      </svg>
    ),
  },
  {
    label: 'TukiBot',
    href: '/vendedor/tukibot',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.357 2.059l.537.268a2.25 2.25 0 001.357.2l3.304-.826a2.25 2.25 0 00.898-.42 2.25 2.25 0 00.713-2.577l-1.07-3.213a2.25 2.25 0 00-.98-1.238l-1.293-.776a2.25 2.25 0 00-2.25 0l-1.5.866M15 3.104c.251.023.501.05.75.082M15 3.104A24.301 24.301 0 009.75 3.104M3 9.75h18M3 15.75h18" />
      </svg>
    ),
  },
  {
    label: 'Resultados Automáticos',
    href: '/vendedor/tukibot/resultados',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l6-6 4.5 4.5L21 4.5M16.5 4.5H21v4.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5h16" />
      </svg>
    ),
  },
  {
    label: 'Análisis',
    href: '/vendedor/analisis',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Configuración',
    href: '/vendedor/configuracion',
    icon: (
      <svg className="vnd-nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function VendedorSidebar() {
  const pathname = usePathname();
  const [storeName, setStoreName] = useState('Mi Tienda');
  const [initial, setInitial] = useState('T');
  const analisisIcon = navItems.find(i => i.href === '/vendedor/analisis')?.icon;
  const configuracionIcon = navItems.find(i => i.href === '/vendedor/configuracion')?.icon;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        const name = user.user_metadata?.store_name || user.email.split('@')[0];
        setStoreName(name);
        setInitial(name[0].toUpperCase());
      }
    });
  }, []);

  function isActive(href: string) {
    if (href === '/vendedor') return pathname === '/vendedor';
    return pathname.startsWith(href);
  }

  return (
    <aside className="vnd-sidebar">
      {/* Brand */}
      <div className="vnd-sidebar-brand">
        <div className="vnd-sidebar-logo">T</div>
        <div className="vnd-sidebar-brand-name">
          <span className="vnd-sidebar-brand-title">TukiTask</span>
          <span className="vnd-sidebar-brand-sub">TukiMarket</span>
        </div>
      </div>

      {/* Store info */}
      <div className="vnd-store-info">
        <div className="vnd-store-avatar">{initial}</div>
        <div style={{ overflow: 'hidden' }}>
          <div className="vnd-store-name">{storeName}</div>
          <div className="vnd-store-status">
            <span className="vnd-store-dot" />
            Tienda activa
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="vnd-nav">
        <span className="vnd-nav-label">Principal</span>

        {navItems.slice(0, 8).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`vnd-nav-item${isActive(item.href) ? ' active' : ''}`}
          >
            {item.icon}
            <span style={{ flex: 1 }}>{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="vnd-nav-badge">{item.badge}</span>
            )}
          </Link>
        ))}

        <span className="vnd-nav-label" style={{ marginTop: 8 }}>Reportes</span>

        <Link
          href="/vendedor/analisis"
          className={`vnd-nav-item${isActive('/vendedor/analisis') ? ' active' : ''}`}
        >
          {analisisIcon}
          <span style={{ flex: 1 }}>Análisis</span>
        </Link>

        <span className="vnd-nav-label" style={{ marginTop: 8 }}>Sistema</span>

        <Link
          href="/vendedor/configuracion"
          className={`vnd-nav-item${isActive('/vendedor/configuracion') ? ' active' : ''}`}
        >
          {configuracionIcon}
          <span style={{ flex: 1 }}>Configuración</span>
        </Link>
      </nav>

      {/* Footer */}
      <div className="vnd-sidebar-footer">
        <span className="vnd-sidebar-version">TukiMarket v1.0</span>
        <a href="mailto:soporte@tukitask.com" className="vnd-sidebar-help">Ayuda</a>
      </div>
    </aside>
  );
}
