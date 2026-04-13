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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-[rgba(255,255,255,0.45)] text-sm mt-1">Resumen general del sistema</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="bg-[#1C1C2E] rounded-xl border border-[rgba(255,255,255,0.06)] p-4 hover:border-[rgba(245,197,24,0.2)] transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className={`${card.color} text-white text-xs font-bold px-2 py-1 rounded-full`}>
                {card.value}
              </span>
            </div>
            <p className="text-sm font-medium text-[rgba(255,255,255,0.6)]">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Order Metrics */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-4">Pedidos & Facturación</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Pedidos',  value: orderMetrics.totalOrders,     icon: '📦', color: 'text-blue-400' },
            { label: 'Pendientes',     value: orderMetrics.pendingOrders,    icon: '⏳', color: 'text-yellow-400' },
            { label: 'Entregados',     value: orderMetrics.deliveredOrders,  icon: '✅', color: 'text-emerald-400' },
            { label: 'Cancelados',     value: orderMetrics.cancelledOrders,  icon: '❌', color: 'text-red-400' },
            { label: 'Ingresos Hoy',   value: `${fmtGs(orderMetrics.revenueToday)} Gs`, icon: '💰', color: 'text-[#F5C518]' },
            { label: 'Ingresos Total', value: `${fmtGs(orderMetrics.totalRevenue)} Gs`, icon: '💵', color: 'text-[#F5C518]' },
          ].map(card => (
            <div key={card.label} className="bg-[#1C1C2E] rounded-xl border border-[rgba(255,255,255,0.06)] p-4 hover:border-[rgba(245,197,24,0.2)] transition-all">
              <div className="text-xl mb-2">{card.icon}</div>
              <div className={`font-bold text-lg leading-tight ${card.color}`}>{card.value}</div>
              <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions + Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-[#1C1C2E] rounded-xl border border-[rgba(255,255,255,0.06)] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Acciones rápidas</h3>
          <div className="space-y-3">
            <Link
              href="/admin/users"
              className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(245,197,24,0.08)] hover:bg-[rgba(245,197,24,0.15)] text-[#F5C518] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-sm font-medium">Gestionar Usuarios</span>
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.6)] hover:text-white transition-colors"
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
        <div className="lg:col-span-2 bg-[#1C1C2E] rounded-xl border border-[rgba(255,255,255,0.06)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Usuarios recientes</h3>
            <Link href="/admin/users" className="text-sm text-[#F5C518] hover:text-[#F58A07] font-medium transition-colors">
              Ver todos →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.07)]">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Email</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Rol</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
                {recentUsers.map(u => (
                  <tr key={u.id} className="hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-[#F5C518] to-[#F58A07] rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[#1C1C2E]">{u.email?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-[rgba(255,255,255,0.7)] truncate max-w-[180px]">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${u.role === 'admin'     ? 'bg-[rgba(239,68,68,0.15)] text-[#f87171]' :
                          u.role === 'driver'    ? 'bg-[rgba(16,185,129,0.15)] text-[#34d399]' :
                          u.role === 'vendedor'  ? 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]' :
                          u.role === 'servicio'  ? 'bg-[rgba(14,165,233,0.15)] text-[#38bdf8]' :
                          u.role === 'hoteleria' ? 'bg-[rgba(168,85,247,0.15)] text-[#c084fc]' :
                          'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.6)]'}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[rgba(255,255,255,0.4)]">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentUsers.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-[rgba(255,255,255,0.3)]">No hay usuarios registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
