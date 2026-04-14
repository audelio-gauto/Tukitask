// Dashboard del panel de administración
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

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
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  revenueToday: number;
}

function fmtGs(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, admins: 0, drivers: 0, vendedores: 0, servicios: 0, hoteleria: 0, clientes: 0 });
  const [orderMetrics, setOrderMetrics] = useState<OrderMetrics>({ totalOrders: 0, pendingOrders: 0, deliveredOrders: 0, cancelledOrders: 0, totalRevenue: 0, revenueToday: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Use HEAD+count queries (zero rows transferred) instead of fetching entire tables.
      // Safe at millions of users.
      const [
        { count: total },
        { count: drivers },
        { count: vendedores },
        { count: servicios },
        { count: hoteleria },
        { count: clientes },
        { count: admins },
        { data: recentUsersData },
        { data: allOrders },
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'driver'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'vendedor'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'servicio'),
        supabase.from('users').select('*', { count: 'exact', head: true })
          .in('role', ['hoteleria', 'tecnico']),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'cliente'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
        supabase.from('users').select('id, email, role, created_at')
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('orders')
          .select('id, status, accepted_price, offer_price, suggested_price, created_at')
          .order('created_at', { ascending: false }).limit(500),
      ]);

      setStats({
        total:      total      ?? 0,
        admins:     admins     ?? 0,
        drivers:    drivers    ?? 0,
        vendedores: vendedores ?? 0,
        servicios:  servicios  ?? 0,
        hoteleria:  hoteleria  ?? 0,
        clientes:   clientes   ?? 0,
      });

      const orders: any[] = allOrders || [];
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const getPrice = (o: any) => Number(o.accepted_price ?? o.offer_price ?? o.suggested_price ?? 0);
      const deliveredStatuses = ['delivered', 'commission_charged', 'client_confirmed', 'returned'];
      const delivered = orders.filter(o => deliveredStatuses.includes(o.status));
      setOrderMetrics({
        totalOrders:     orders.length,
        pendingOrders:   orders.filter(o => ['pending', 'negotiating'].includes(o.status)).length,
        deliveredOrders: delivered.length,
        cancelledOrders: orders.filter(o => ['cancelled', 'failed', 'return_rejected'].includes(o.status)).length,
        totalRevenue:    delivered.reduce((s, o) => s + getPrice(o), 0),
        revenueToday:    delivered.filter(o => new Date(o.created_at) >= todayStart).reduce((s, o) => s + getPrice(o), 0),
      });
      setRecentUsers(recentUsersData || []);
      setLoading(false);
    })();
  }, []);

  const statCards = [
    { label: 'Total Usuarios', value: stats.total,      color: 'bg-gradient-to-br from-[#F5C518] to-[#F58A07]', icon: '👥' },
    { label: 'Conductores',   value: stats.drivers,    color: 'bg-emerald-600',  icon: '🚗' },
    { label: 'Vendedores',    value: stats.vendedores, color: 'bg-amber-500',    icon: '🛍️' },
    { label: 'Servicios',     value: stats.servicios,  color: 'bg-sky-600',      icon: '🔧' },
    { label: 'Hotelería',     value: stats.hoteleria,  color: 'bg-purple-600',   icon: '🏨' },
    { label: 'Clientes',      value: stats.clientes,   color: 'bg-rose-600',     icon: '👤' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Resumen general del sistema</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xl">{card.icon}</span>
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
          {[
            { label: 'Total Pedidos',  value: orderMetrics.totalOrders,     icon: '📦', color: 'text-blue-600' },
            { label: 'Pendientes',     value: orderMetrics.pendingOrders,    icon: '⏳', color: 'text-amber-600' },
            { label: 'Entregados',     value: orderMetrics.deliveredOrders,  icon: '✅', color: 'text-emerald-600' },
            { label: 'Cancelados',     value: orderMetrics.cancelledOrders,  icon: '❌', color: 'text-red-600' },
            { label: 'Ingresos Hoy',   value: `${fmtGs(orderMetrics.revenueToday)} Gs`, icon: '💰', color: 'text-yellow-600' },
            { label: 'Ingresos Total', value: `${fmtGs(orderMetrics.totalRevenue)} Gs`, icon: '💵', color: 'text-yellow-600' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-all">
              <div className="text-lg mb-1">{card.icon}</div>
              <div className={`font-bold text-base leading-tight ${card.color}`}>{card.value}</div>
              <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
            </div>
          ))}
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
