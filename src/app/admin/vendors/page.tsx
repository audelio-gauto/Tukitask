'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface KPI {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  href: string;
}

export default function VendorsDashboard() {
  const [totalVendors, setTotalVendors] = useState<number | null>(null);
  const [newThisWeek, setNewThisWeek]   = useState<number | null>(null);
  const [suspended, setSuspended]       = useState<number | null>(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [
        { count: total },
        { count: week },
        { count: susp },
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'vendedor'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'vendedor').gte('created_at', weekAgo),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'vendedor').eq('is_suspended', true),
      ]);
      setTotalVendors(total ?? 0);
      setNewThisWeek(week ?? 0);
      setSuspended(susp ?? 0);
      setLoading(false);
    })();
  }, []);

  const sections = [
    {
      title: 'Gestión de Vendedores',
      color: 'amber',
      links: [
        { label: 'Lista de Vendedores', href: '/admin/vendors/lista' },
        { label: 'Verificaciones', href: '/admin/vendors/verificaciones' },
        { label: 'Bloqueos / Suspensiones', href: '/admin/vendors/bloqueos' },
      ],
    },
    {
      title: 'Gestión de Productos',
      color: 'emerald',
      links: [
        { label: 'Aprobar Productos', href: '/admin/vendors/productos/aprobar' },
        { label: 'Categorías', href: '/admin/vendors/productos/categorias' },
        { label: 'Productos Reportados', href: '/admin/vendors/productos/reportados' },
        { label: 'Control de Stock', href: '/admin/vendors/productos/stock' },
      ],
    },
    {
      title: 'Gestión de Pedidos',
      color: 'blue',
      links: [
        { label: 'Ver todos los Pedidos', href: '/admin/vendors/pedidos' },
        { label: 'Cancelaciones', href: '/admin/vendors/pedidos/cancelaciones' },
        { label: 'Reembolsos', href: '/admin/vendors/pedidos/reembolsos' },
        { label: 'Disputas', href: '/admin/vendors/pedidos/disputas' },
      ],
    },
    {
      title: 'Negociaciones',
      color: 'purple',
      links: [
        { label: 'Monitorear Ofertas', href: '/admin/vendors/negociaciones' },
        { label: 'Spam / Fraude', href: '/admin/vendors/negociaciones/fraude' },
        { label: 'Historial', href: '/admin/vendors/negociaciones/historial' },
        { label: 'Límites Automáticos', href: '/admin/vendors/negociaciones/limites' },
      ],
    },
  ];

  const sectionColors: Record<string, string> = {
    amber:   'border-t-amber-400',
    emerald: 'border-t-emerald-400',
    blue:    'border-t-blue-400',
    purple:  'border-t-purple-400',
  };

  const sectionDotColors: Record<string, string> = {
    amber:   'bg-amber-400',
    emerald: 'bg-emerald-400',
    blue:    'bg-blue-400',
    purple:  'bg-purple-400',
  };

  const kpiCards = [
    {
      label: 'Total Vendedores',
      value: loading ? '—' : (totalVendors ?? 0).toLocaleString('es-PY'),
      sub: 'registrados',
      gradient: 'from-amber-400 to-amber-500',
      href: '/admin/vendors/lista',
      svgPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z',
    },
    {
      label: 'Nuevos esta semana',
      value: loading ? '—' : (newThisWeek ?? 0).toLocaleString('es-PY'),
      sub: 'últimos 7 días',
      gradient: 'from-emerald-400 to-emerald-500',
      href: '/admin/vendors/lista',
      svgPath: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    },
    {
      label: 'Suspendidos',
      value: loading ? '—' : (suspended ?? 0).toLocaleString('es-PY'),
      sub: 'requieren atención',
      gradient: 'from-red-400 to-red-500',
      href: '/admin/vendors/bloqueos',
      svgPath: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    },
    {
      label: 'Pedidos Activos',
      value: '—',
      sub: 'en tiempo real',
      gradient: 'from-blue-400 to-blue-500',
      href: '/admin/vendors/pedidos',
      svgPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    },
    {
      label: 'Ingresos / Comisiones',
      value: '—',
      sub: 'este mes',
      gradient: 'from-purple-400 to-purple-500',
      href: '/admin/vendors/pedidos',
      svgPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Panel de Vendedores</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Métricas en tiempo real, gestión completa de vendedores, productos, pedidos y negociaciones.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {kpiCards.map(k => (
          <Link key={k.label} href={k.href} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all group">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${k.gradient} flex items-center justify-center mb-3 shadow-sm`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={k.svgPath} />
              </svg>
            </div>
            <div className="text-2xl font-bold text-gray-900 leading-tight">{k.value}</div>
            <div className="text-xs font-medium text-gray-600 mt-0.5">{k.label}</div>
            {k.sub && <div className="text-[11px] text-gray-400 mt-0.5">{k.sub}</div>}
          </Link>
        ))}
      </div>

      {/* Sections Grid */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Secciones</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map(sec => (
          <div key={sec.title} className={`bg-white rounded-xl border-t-4 border border-gray-200 shadow-sm p-4 ${sectionColors[sec.color]}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${sectionDotColors[sec.color]}`} />
              <h3 className="text-sm font-semibold text-gray-900">{sec.title}</h3>
            </div>
            <ul className="space-y-1">
              {sec.links.map(l => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                  >
                    <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
