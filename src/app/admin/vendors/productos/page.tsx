'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Product = {
  id: string;
  name: string;
  vendor_email: string;
  category: string;
  price: number;
  stock: number;
  status: string;
  created_at: string;
  image: string | null;
};

const STATUS_OPTIONS = ['all', 'pending_review', 'published', 'rejected', 'paused', 'out_of_stock'] as const;
type StatusFilter = typeof STATUS_OPTIONS[number];

const fmtGs = (n: number) => `${n.toLocaleString('es-PY')} Gs`;

export default function AdminVendorsProductosPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        let query = supabase
          .from('products')
          .select('id, name, vendor_email, category, price, stock, status, created_at, image')
          .order('created_at', { ascending: false })
          .limit(300);

        if (status !== 'all') query = query.eq('status', status);
        if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);

        const { data, error: err } = await query;
        if (err) throw err;
        setItems((data as Product[]) || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [q, status]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const s of STATUS_OPTIONS) {
      if (s === 'all') continue;
      map[s] = items.filter(i => i.status === s).length;
    }
    return map;
  }, [items]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Productos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Todos los Productos</h1>
        <p className="text-gray-500 text-sm mt-0.5">Vista global de productos de todos los vendedores.</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>
              {s === 'all' ? 'Todos los estados' : s} ({statusCounts[s] ?? 0})
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No hay productos para mostrar.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(p => (
              <div key={p.id} className="p-4 flex gap-3 items-start">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                  {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">📦</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 truncate">Vendedor: {p.vendor_email}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{new Date(p.created_at).toLocaleDateString('es-PY')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{p.category || 'Sin categoria'}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">{fmtGs(p.price)}</span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">Stock: {p.stock}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{p.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
