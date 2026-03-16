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

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, admins: 0, drivers: 0, vendedores: 0, servicios: 0, hoteleria: 0, clientes: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: allUsers } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      const users: any[] = allUsers || [];
      setStats({
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        drivers: users.filter(u => u.role === 'driver').length,
        vendedores: users.filter(u => u.role === 'vendedor').length,
        servicios: users.filter(u => u.role === 'servicio').length,
        hoteleria: users.filter(u => u.role === 'hoteleria').length,
        clientes: users.filter(u => u.role === 'cliente').length,
      });
      setRecentUsers(users.slice(0, 5));
      setLoading(false);
    })();
  }, []);

  const statCards = [
    { label: 'Total Usuarios', value: stats.total, color: 'bg-indigo-600', icon: '👥' },
    { label: 'Conductores', value: stats.drivers, color: 'bg-emerald-600', icon: '🚗' },
    { label: 'Vendedores', value: stats.vendedores, color: 'bg-amber-500', icon: '🛒' },
    { label: 'Servicios', value: stats.servicios, color: 'bg-sky-600', icon: '🔧' },
    { label: 'Hotelería', value: stats.hoteleria, color: 'bg-purple-600', icon: '🏨' },
    { label: 'Clientes', value: stats.clientes, color: 'bg-rose-600', icon: '👤' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Resumen general del sistema</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className={`${card.color} text-white text-xs font-bold px-2 py-1 rounded-full`}>
                {card.value}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-600">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions + Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Acciones rápidas</h3>
          <div className="space-y-3">
            <Link
              href="/admin/users"
              className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-sm font-medium">Gestionar Usuarios</span>
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
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
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Usuarios recientes</h3>
            <Link href="/admin/users" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              Ver todos →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-indigo-600">{u.email?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-gray-700">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${u.role === 'admin' ? 'bg-red-100 text-red-800' :
                          u.role === 'driver' ? 'bg-emerald-100 text-emerald-800' :
                          u.role === 'vendedor' ? 'bg-amber-100 text-amber-800' :
                          u.role === 'servicio' ? 'bg-sky-100 text-sky-800' :
                          u.role === 'hoteleria' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentUsers.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-gray-400">No hay usuarios registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
