'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface SubItem {
  label: string;
  href?: string;
  isHeader?: boolean;
}

interface MenuItem {
  label: string;
  href?: string;
  /** Auto-expands the group whenever pathname starts with this prefix */
  groupRootPath?: string;
  icon: React.ReactNode;
  subItems?: SubItem[];
}

const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    label: 'Pedidos',
    href: '/admin/orders',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    label: 'Métricas',
    href: '/admin/metrics',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 13v6M12 9v10M17 5v14" />
      </svg>
    ),
  },
  {
    label: 'Usuarios',
    href: '/admin/users',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    label: 'Ruta',
    href: '/admin/ruta',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    label: 'Conductores',
    groupRootPath: '/admin/drivers',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 5h4m4 6H6a2 2 0 01-2-2V6a2 2 0 012-2h8l6 6v6a2 2 0 01-2 2z" />
      </svg>
    ),
    subItems: [
      { label: 'Lista de Conductores', href: '/admin/drivers/driver' },
      { label: 'Configuración de Precios', href: '/admin/drivers/pricing' },
      { label: 'Comisión por Driver', href: '/admin/drivers/commission' },
      { label: 'Rentabilidad Gs/km', href: '/admin/drivers/rates' },
    ],
  },
  {
    label: 'Servicios',
    groupRootPath: '/admin/services',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    subItems: [
      { label: 'Lista de Técnicos', href: '/admin/services/tecnico' },
      { label: 'Precios y Comisión', href: '/admin/services/commission' },
    ],
  },
  {
    label: 'Hotelerías',
    href: '/admin/hotels',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    label: 'Clientes',
    href: '/admin/clients',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: 'Billeteras',
    groupRootPath: '/admin/wallets',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    subItems: [
      { label: 'Recargas pendientes', href: '/admin/wallets?tab=pending' },
      { label: 'Ajuste Manual', href: '/admin/wallets?tab=ajuste' },
      { label: 'Historial de Movimientos', href: '/admin/wallets?tab=movimientos' },
    ],
  },
  {
    label: 'Alias de Banco',
    href: '/admin/bank-alias',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
      </svg>
    ),
  },
  {
    label: 'Promociones',
    href: '/admin/promos',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 10V5a2 2 0 012-2z" />
      </svg>
    ),
  },
  {
    label: 'Documentos',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    subItems: [
      { label: 'Aprobados', href: '/admin/documentos/aprobados' },
      { label: 'Rechazados', href: '/admin/documentos/rechazados' },
    ],
  },
  {
    label: 'Reportes',
    href: '/admin/reports',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  {
    label: 'Auditoría',
    href: '/admin/audit',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    label: 'Sospechosos',
    href: '/admin/orders/suspicious',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  {
    label: 'Calificaciones',
    href: '/admin/ratings',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    label: 'Vendedores',
    groupRootPath: '/admin/vendors',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
    subItems: [
      // ── Dashboard ──────────────────────────────────────────
      { label: 'DASHBOARD', isHeader: true },
      { label: 'Métricas en tiempo real', href: '/admin/vendors' },
      // ── Gestión de Vendedores ──────────────────────────────
      { label: 'GESTIÓN DE VENDEDORES', isHeader: true },
      { label: 'Lista de Vendedores', href: '/admin/vendors/lista' },
      { label: 'Verificaciones', href: '/admin/vendors/verificaciones' },
      { label: 'Bloqueos / Suspensiones', href: '/admin/vendors/bloqueos' },
      // ── Gestión de Productos ───────────────────────────────
      { label: 'GESTIÓN DE PRODUCTOS', isHeader: true },
      { label: 'Aprobar Productos', href: '/admin/vendors/productos/aprobar' },
      { label: 'Categorías', href: '/admin/vendors/productos/categorias' },
      { label: 'Productos Reportados', href: '/admin/vendors/productos/reportados' },
      { label: 'Control de Stock', href: '/admin/vendors/productos/stock' },
      // ── Gestión de Pedidos ─────────────────────────────────
      { label: 'GESTIÓN DE PEDIDOS', isHeader: true },
      { label: 'Ver todos los Pedidos', href: '/admin/vendors/pedidos' },
      { label: 'Cancelaciones', href: '/admin/vendors/pedidos/cancelaciones' },
      { label: 'Reembolsos', href: '/admin/vendors/pedidos/reembolsos' },
      { label: 'Disputas', href: '/admin/vendors/pedidos/disputas' },
      // ── Negociaciones ──────────────────────────────────────
      { label: 'NEGOCIACIONES', isHeader: true },
      { label: 'Monitorear Ofertas', href: '/admin/vendors/negociaciones' },
      { label: 'Spam / Fraude', href: '/admin/vendors/negociaciones/fraude' },
      { label: 'Historial', href: '/admin/vendors/negociaciones/historial' },
      { label: 'Límites Automáticos', href: '/admin/vendors/negociaciones/limites' },
      // ── Configuracion Comercial ──────────────────────────
      { label: 'CONFIGURACION COMERCIAL', isHeader: true },
      { label: 'Porcentajes de Comision', href: '/admin/vendors/configuracion/comisiones' },
      { label: 'Metodos de Pago', href: '/admin/vendors/configuracion/metodos-pago' },
      { label: 'Limites de Negociacion', href: '/admin/vendors/configuracion/limites-negociacion' },
    ],
  },
  {
    label: 'Finanzas',
    groupRootPath: '/admin/finanzas',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    subItems: [
      // ── Resumen ────────────────────────────────────────────
      { label: 'RESUMEN', isHeader: true },
      { label: 'Resumen General', href: '/admin/finanzas' },
      // ── Movimientos ────────────────────────────────────────
      { label: 'MOVIMIENTOS', isHeader: true },
      { label: 'Comisiones', href: '/admin/finanzas/comisiones' },
      { label: 'Retiros Vendedores', href: '/admin/finanzas/retiros' },
      { label: 'Pagos Pendientes', href: '/admin/finanzas/pagos-pendientes' },
      { label: 'Movimientos Financieros', href: '/admin/finanzas/movimientos' },
    ],
  },
  {
    label: 'Los API Keys',
    href: '/admin/apikeys',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    label: 'Control AI',
    href: '/admin/control-ai',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3a3.75 3.75 0 00-3.75 3.75v1.5A3.75 3.75 0 002.25 12v.75A3.75 3.75 0 006 16.5h1.5A3.75 3.75 0 0011.25 20.25h1.5A3.75 3.75 0 0016.5 16.5H18a3.75 3.75 0 003.75-3.75V12A3.75 3.75 0 0018 8.25v-1.5A3.75 3.75 0 0014.25 3h-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M12 9v6" />
      </svg>
    ),
  },
  {
    label: 'Configuracion',
    href: '/admin/settings',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());

  useEffect(() => {
    const autoOpen = new Set<string>();
    menuItems.forEach(item => {
      if (item.groupRootPath && pathname.startsWith(item.groupRootPath)) {
        autoOpen.add(item.label);
      } else if (item.subItems?.some(sub => sub.href && (pathname === sub.href.split('?')[0] || pathname.startsWith(sub.href.split('?')[0] + '/')))) {
        autoOpen.add(item.label);
      }
    });
    setOpenMenus(autoOpen);
  }, [pathname]);

  function toggleMenu(label: string) {
    setOpenMenus(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside
      className={`adm-sidebar ${collapsed ? 'w-16' : 'w-64'} h-screen flex flex-col transition-all duration-300 fixed left-0 top-0 z-40`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/10">
        {!collapsed && (
          <span className="text-base font-bold text-white tracking-wide">Tukitask</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors ${collapsed ? 'mx-auto' : ''}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            }
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {menuItems.map(item => {
          const hasSubItems = !!(item.subItems && item.subItems.length > 0);
          const isOpen = openMenus.has(item.label);
          const isChildActive = (item.groupRootPath && pathname.startsWith(item.groupRootPath))
            || (item.subItems?.some(sub => sub.href && (pathname === sub.href.split('?')[0] || pathname.startsWith(sub.href.split('?')[0] + '/'))) ?? false);
          const isActive = !hasSubItems && !!item.href && (pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')));

          if (hasSubItems) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all
                    ${isChildActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}
                    ${collapsed ? 'justify-center' : ''}
                  `}
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <svg
                        className={`w-3.5 h-3.5 text-white/30 transition-transform duration-200 ${isOpen || isChildActive ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </>
                  )}
                </button>
                {(isOpen || isChildActive) && !collapsed && (
                  <div className="mt-0.5 ml-4 pl-3 border-l border-white/10 space-y-0.5">
                    {item.subItems!.map((sub, idx) => {
                      if (sub.isHeader) {
                        return (
                          <p key={`hdr-${idx}`} className="px-3 pt-2 pb-0.5 text-[10px] font-bold tracking-widest text-white/25 uppercase select-none">
                            {sub.label}
                          </p>
                        );
                      }
                      const isSubActive = !!sub.href && (pathname === sub.href || pathname.startsWith(sub.href + '/'));
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href!}
                          className={`block px-3 py-1.5 rounded-md text-xs font-medium transition-all
                            ${isSubActive
                              ? 'bg-[#F5C518] text-[#1d2327] font-semibold'
                              : 'text-white/50 hover:bg-white/10 hover:text-white'
                            }
                          `}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all
                ${isActive
                  ? 'bg-[#F5C518] text-[#1d2327] font-semibold'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-xs text-white/25">Tukitask Admin v1.0</p>
        </div>
      )}
    </aside>
  );
}

