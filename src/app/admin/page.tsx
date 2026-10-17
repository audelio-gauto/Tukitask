// Dashboard del panel de administración
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/Icon';

interface RecentUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface DailyRevenue {
  date: string;
  label: string;
  amount: number;
}

interface DashboardData {
  stats: Stats;
  orders: OrderMetrics;
  marketplace: { total: number; pending: number; revenueLast30Days: number };
  alerts: Alerts;
  recentUsers: RecentUser[];
  warnings: string[];
}

interface Stats {
  total: number;
  admins: number;
  drivers: number;
  vendedores: number;
  servicios: number;
  hoteleria: number;
  clientes: number;
}

interface OrderMetrics {
  total: number;
  pending: number;
  delivered: number;
  cancelled: number;
  revenueToday: number;
  revenueLast30Days: number;
  daily: DailyRevenue[];
}

interface Alerts {
  pendingDriverRecharges: number;
  pendingVendorRecharges: number;
  stalePendingOrders: number;
  unresolvedReports: number;
  pendingProducts: number;
}

function fmtGs(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/dashboard${reloadKey > 0 ? '?refresh=1' : ''}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setLoadError(json.error || 'No se pudo cargar el resumen del sistema.');
        } else {
          setData(json as DashboardData);
        }
      } catch {
        if (active) setLoadError('Error de conexión al cargar el resumen del sistema.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reloadKey]);

  const stats = data?.stats ?? { total: 0, admins: 0, drivers: 0, vendedores: 0, servicios: 0, hoteleria: 0, clientes: 0 };
  const orderMetrics = data?.orders ?? { total: 0, pending: 0, delivered: 0, cancelled: 0, revenueToday: 0, revenueLast30Days: 0, daily: [] };
  const marketplace = data?.marketplace ?? { total: 0, pending: 0, revenueLast30Days: 0 };
  const alerts = data?.alerts ?? { pendingDriverRecharges: 0, pendingVendorRecharges: 0, stalePendingOrders: 0, unresolvedReports: 0, pendingProducts: 0 };
  const recentUsers = data?.recentUsers ?? [];
  const dailyRevenue = orderMetrics.daily;

  const statCards: Array<{ label: string; value: number; color: string; icon: IconName }> = [
    { label: 'Total Usuarios', value: stats.total,      color: 'bg-gradient-to-br from-[#F5C518] to-[#F58A07]', icon: 'user' },
    { label: 'Conductores',   value: stats.drivers,    color: 'bg-emerald-600',  icon: 'car' },
    { label: 'Vendedores',    value: stats.vendedores, color: 'bg-amber-500',    icon: 'briefcase' },
    { label: 'Servicios',     value: stats.servicios,  color: 'bg-sky-600',      icon: 'tool' },
    { label: 'Hoteleria',     value: stats.hoteleria,  color: 'bg-purple-600',   icon: 'home' },
    { label: 'Clientes',      value: stats.clientes,   color: 'bg-rose-600',     icon: 'user' },
  ];

  const alertItems: Array<{ key: string; count: number; label: string; href: string; tone: string; badge: string; text: string }> = [
    { key: 'driver-recharges', count: alerts.pendingDriverRecharges, label: 'Recargas de conductores pendientes', href: '/admin/wallets?tab=pending', tone: 'bg-amber-50 border-amber-200 hover:bg-amber-100', badge: 'bg-amber-400', text: 'text-amber-700' },
    { key: 'vendor-recharges', count: alerts.pendingVendorRecharges, label: 'Recargas de vendedores pendientes', href: '/admin/billetera/vendedores', tone: 'bg-amber-50 border-amber-200 hover:bg-amber-100', badge: 'bg-amber-400', text: 'text-amber-700' },
    { key: 'stale-orders', count: alerts.stalePendingOrders, label: 'Pedidos sin asignar >30 min', href: '/admin/orders', tone: 'bg-red-50 border-red-200 hover:bg-red-100', badge: 'bg-red-500', text: 'text-red-700' },
    { key: 'reports', count: alerts.unresolvedReports, label: 'Reportes sin resolver', href: '/admin/reports', tone: 'bg-purple-50 border-purple-200 hover:bg-purple-100', badge: 'bg-purple-500', text: 'text-purple-700' },
    { key: 'products', count: alerts.pendingProducts, label: 'Productos esperando aprobación', href: '/admin/vendors/productos/aprobar', tone: 'bg-sky-50 border-sky-200 hover:bg-sky-100', badge: 'bg-sky-500', text: 'text-sky-700' },
  ];
  const activeAlerts = alertItems.filter(a => a.count > 0);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Page title */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Resumen general del sistema</p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey(k => k + 1)}
          disabled={loading}
          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60"
        >
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Load error / partial data warnings */}
      {loadError && (
        <div role="alert" className="mb-5 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-red-700">{loadError}</span>
          <button type="button" onClick={() => setReloadKey(k => k + 1)} className="text-xs font-semibold text-red-700 underline">Reintentar</button>
        </div>
      )}
      {!loadError && data && data.warnings.length > 0 && (
        <div role="status" className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Algunos datos no pudieron cargarse y pueden aparecer en 0 ({data.warnings.length} consulta{data.warnings.length !== 1 ? 's' : ''} con error). Pulsá Actualizar para reintentar.
        </div>
      )}

      {/* Alerts */}
      {activeAlerts.length > 0 && (
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {activeAlerts.map(alert => (
            <Link key={alert.key} href={alert.href} className={`flex items-center gap-3 border rounded-lg px-4 py-3 transition-colors ${alert.tone}`}>
              <span className={`w-8 h-8 flex items-center justify-center rounded-full ${alert.badge} text-white font-bold text-sm flex-shrink-0`}>{alert.count}</span>
              <span className={`text-sm font-semibold ${alert.text}`}>{alert.label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <Icon name={card.icon} size={18} className="text-gray-600" />
              <span className={`${card.color} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
                {card.value}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-600">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Order Metrics */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pedidos & Facturación</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            { label: 'Total Pedidos',        value: orderMetrics.total,     icon: 'package', color: 'text-blue-600' },
            { label: 'Pendientes',           value: orderMetrics.pending,   icon: 'clock', color: 'text-amber-600' },
            { label: 'Entregados',           value: orderMetrics.delivered, icon: 'check', color: 'text-emerald-600' },
            { label: 'Cancelados / fallidos', value: orderMetrics.cancelled, icon: 'x', color: 'text-red-600' },
            { label: 'Facturación hoy',      value: `${fmtGs(orderMetrics.revenueToday)} Gs`, icon: 'money', color: 'text-yellow-600' },
            { label: 'Facturación 30 días',  value: `${fmtGs(orderMetrics.revenueLast30Days)} Gs`, icon: 'credit-card', color: 'text-yellow-600' },
          ] as Array<{ label: string; value: string | number; icon: IconName; color: string }>).map(card => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all">
              <div className="mb-1">
                <Icon name={card.icon} size={18} className={card.color} />
              </div>
              <div className={`font-bold text-base leading-tight ${card.color}`}>{card.value}</div>
              <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Marketplace */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Marketplace</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { label: 'Pedidos del Marketplace', value: marketplace.total, icon: 'package', color: 'text-blue-600', href: '/admin/vendors/pedidos' },
            { label: 'Pendientes de confirmar', value: marketplace.pending, icon: 'clock', color: 'text-amber-600', href: '/admin/vendors/pedidos' },
            { label: 'Ventas entregadas (30 días)', value: `${fmtGs(marketplace.revenueLast30Days)} Gs`, icon: 'money', color: 'text-yellow-600', href: '/admin/vendors' },
          ] as Array<{ label: string; value: string | number; icon: IconName; color: string; href: string }>).map(card => (
            <Link key={card.label} href={card.href} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all">
              <div className="mb-1">
                <Icon name={card.icon} size={18} className={card.color} />
              </div>
              <div className={`font-bold text-base leading-tight ${card.color}`}>{card.value}</div>
              <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Revenue mini-chart: last 7 days */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Facturación de pedidos — últimos 7 días</h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
          {dailyRevenue.map((day, i) => {
            const amt = day.amount;
            const maxAmt = Math.max(...dailyRevenue.map(d => d.amount), 1);
            const BAR_H = 60;
            const h = Math.max(4, Math.round((amt / maxAmt) * BAR_H));
            const isToday = i === dailyRevenue.length - 1;
            return (
              <div key={day.date} title={`${day.date}: ${fmtGs(amt)} Gs`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                <div style={{
                  width: '100%', height: h, borderRadius: '4px 4px 0 0',
                  background: isToday ? '#F5C518' : amt > 0 ? 'rgba(245,197,24,0.35)' : '#f3f4f6',
                  transition: 'height 0.4s ease',
                }} />
                <span style={{ fontSize: '0.6rem', color: isToday ? '#d97706' : '#9ca3af', fontWeight: isToday ? 700 : 400 }}>
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions + Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Acciones rápidas</h3>
          <div className="space-y-2">
            <Link
              href="/admin/users"
              className="flex items-center gap-3 p-2.5 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-sm font-medium">Gestionar Usuarios</span>
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">Configuración</span>
            </Link>
          </div>
        </div>

        {/* Recent Users Table */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Usuarios recientes</h3>
            <Link href="/admin/users" className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Ver todos →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Rol</th>
                  <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-[#F5C518] rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[#1d2327]">{u.email?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-gray-700 truncate max-w-[180px]">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${u.role === 'admin'     ? 'bg-red-100 text-red-700' :
                          u.role === 'driver'    ? 'bg-emerald-100 text-emerald-700' :
                          u.role === 'vendedor'  ? 'bg-amber-100 text-amber-700' :
                          u.role === 'servicio'  ? 'bg-sky-100 text-sky-700' :
                          u.role === 'hoteleria' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentUsers.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-gray-400">Sin usuarios registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
