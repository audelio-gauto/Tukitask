'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface VentaOrder {
  id: string;
  created_at: string;
  cancelled_at: string | null;
  vendor_email: string;
  client_email: string;
  client_name: string | null;
  total: number;
  final_price: number | null;
  items: unknown[];
  notes: string | null;
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const startOfDay   = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const startOfWeek  = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const startOfMonth = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

export default function CancelacionesPage() {
  const [orders, setOrders]         = useState<VentaOrder[]>([]);
  const [total, setTotal]           = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount]   = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      const h = { Authorization: `Bearer ${token}` };

      const [resAll, resToday, resWeek, resMonth] = await Promise.all([
        fetch('/api/admin/orders?type=venta&status=cancelled&limit=50', { headers: h }),
        fetch(`/api/admin/orders?type=venta&status=cancelled&limit=1&date_from=${startOfDay()}`, { headers: h }),
        fetch(`/api/admin/orders?type=venta&status=cancelled&limit=1&date_from=${startOfWeek()}`, { headers: h }),
        fetch(`/api/admin/orders?type=venta&status=cancelled&limit=1&date_from=${startOfMonth()}`, { headers: h }),
      ]);

      const [all, today, week, month] = await Promise.all([
        resAll.json(), resToday.json(), resWeek.json(), resMonth.json(),
      ]);

      setOrders(all.rows || []);
      setTotal(all.total ?? 0);
      setTodayCount(today.total ?? 0);
      setWeekCount(week.total ?? 0);
      setMonthCount(month.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/pedidos" className="hover:text-gray-600 transition-colors">Pedidos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Cancelaciones</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Cancelaciones</h1>
        <p className="text-gray-500 text-sm mt-0.5">Historial y gestión de pedidos cancelados. Análisis de motivos y tasas de cancelación por vendedor.</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Hoy',          value: todayCount },
          { label: 'Esta semana',  value: weekCount  },
          { label: 'Este mes',     value: monthCount },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            {loading ? (
              <div className="h-8 w-12 bg-gray-100 rounded animate-pulse mb-1" />
            ) : (
              <p className="text-2xl font-bold text-red-600">{s.value.toLocaleString()}</p>
            )}
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">Sin cancelaciones registradas</p>
          </div>
        ) : (
          <div>
            <div className="px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">
                {total.toLocaleString()} cancelación{total !== 1 ? 'es' : ''} en total
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {orders.map(o => (
                <div key={o.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">{o.id.slice(0, 8).toUpperCase()}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{fmtDate(o.cancelled_at || o.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-900 font-medium truncate">{o.client_name || o.client_email}</p>
                    <p className="text-xs text-gray-400 truncate">Vendedor: {o.vendor_email}</p>
                    {o.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">Nota: {o.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {(o.final_price ?? o.total).toLocaleString('es-PY')} Gs
                    </p>
                    <p className="text-xs text-gray-400">
                      {Array.isArray(o.items) ? o.items.length : 0} ítem{Array.isArray(o.items) && o.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
