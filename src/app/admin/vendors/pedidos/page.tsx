'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

const SUB_LINKS = [
  { label: 'Cancelaciones', href: '/admin/vendors/pedidos/cancelaciones', desc: 'Pedidos cancelados por vendedor o cliente.' },
  { label: 'Reembolsos', href: '/admin/vendors/pedidos/reembolsos', desc: 'Solicitudes de devolución de dinero pendientes.' },
  { label: 'Disputas', href: '/admin/vendors/pedidos/disputas', desc: 'Conflictos entre vendedores y compradores.' },
];

async function fetchCount(token: string, status?: string): Promise<number> {
  const params = new URLSearchParams({ type: 'venta', limit: '1' });
  if (status) params.set('status', status);
  try {
    const res = await fetch(`/api/admin/orders?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return json.total ?? 0;
  } catch {
    return 0;
  }
}

export default function VendorPedidosPage() {
  const [counts, setCounts] = useState({ total: 0, pending: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const [total, pending, completed, cancelled] = await Promise.all([
        fetchCount(token),
        fetchCount(token, 'pending'),
        fetchCount(token, 'completed'),
        fetchCount(token, 'cancelled'),
      ]);
      setCounts({ total, pending, completed, cancelled });
      setLoading(false);
    })();
  }, []);

  const stats = [
    { label: 'Todos',      value: counts.total,     color: 'text-gray-900'    },
    { label: 'Pendientes', value: counts.pending,    color: 'text-amber-600'   },
    { label: 'Completados',value: counts.completed,  color: 'text-emerald-600' },
    { label: 'Cancelados', value: counts.cancelled,  color: 'text-red-600'     },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Pedidos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Pedidos de Vendedores</h1>
        <p className="text-gray-500 text-sm mt-0.5">Supervisión completa de todos los pedidos realizados a través de la plataforma de vendedores.</p>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {loading ? (
              <div className="h-8 w-12 bg-gray-100 rounded animate-pulse mb-1" />
            ) : (
              <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            )}
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-5">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5C518] text-gray-900 rounded-lg text-sm font-semibold hover:bg-[#e6b800] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Ver todos los pedidos de venta
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {SUB_LINKS.map(s => (
          <Link key={s.href} href={s.href} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md hover:border-gray-300 transition-all group">
            <h3 className="font-semibold text-gray-900 group-hover:text-[#F5C518] transition-colors text-sm mb-1">{s.label}</h3>
            <p className="text-xs text-gray-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
