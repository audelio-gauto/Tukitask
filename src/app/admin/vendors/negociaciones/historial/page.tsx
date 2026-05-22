'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Negotiation {
  id: string;
  vendor_id: string;
  product_id: string | null;
  product_name: string | null;
  listed_price: number;
  floor_price: number;
  buyer_offer: number;
  counter_amount: number | null;
  final_amount: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  accepted:            { label: 'Aceptada',         color: 'bg-emerald-100 text-emerald-700' },
  countered:           { label: 'Contraoferta',      color: 'bg-blue-100 text-blue-700'      },
  timeout_auto_counter:{ label: 'Auto-Contraoferta', color: 'bg-amber-100 text-amber-700'    },
  timeout_auto_accept: { label: 'Auto-Aceptada',     color: 'bg-purple-100 text-purple-700'  },
  timeout_pressure:    { label: 'Presión timeout',   color: 'bg-red-100 text-red-700'        },
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtGs = (n: number) => n.toLocaleString('es-PY') + ' Gs';

export default function HistorialNegociacionPage() {
  const [rows, setRows]           = useState<Negotiation[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [query, setQuery]         = useState('');
  const [statusFilter, setStatus] = useState('');

  const fetchData = useCallback(async (q: string, st: string) => {
    setLoading(true);
    setError('');
    try {
      let req = supabase
        .from('tukibot_negotiations')
        .select('id, vendor_id, product_id, product_name, listed_price, floor_price, buyer_offer, counter_amount, final_amount, status, created_at, updated_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(50);

      if (st && ALL_STATUSES.includes(st)) req = req.eq('status', st);
      if (q) {
        req = req.or(
          `vendor_id.ilike.%${q}%,product_name.ilike.%${q}%`
        );
      }

      const { data, count, error: err } = await req;
      if (err) throw err;
      setRows(data as Negotiation[] || []);
      setTotal(count ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(query, statusFilter); }, [fetchData, query, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search.trim().slice(0, 100));
  };

  const badge = (status: string) => {
    const s = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/negociaciones" className="hover:text-gray-600 transition-colors">Negociaciones</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Historial</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Historial de Negociación</h1>
        <p className="text-gray-500 text-sm mt-0.5">Registro completo de todas las negociaciones: ofertas iniciales, contraofertas y acuerdos finales.</p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex items-center gap-3 mb-5">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por vendedor o producto..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] w-64"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-[#F5C518] rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">Sin historial de negociaciones</p>
          </div>
        ) : (
          <div>
            <div className="px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">{total.toLocaleString()} negociación{total !== 1 ? 'es' : ''}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {rows.map(n => (
                <div key={n.id} className="px-5 py-4 grid grid-cols-[1fr_auto] gap-4 items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {badge(n.status)}
                      <span className="text-xs text-gray-400">{fmtDate(n.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{n.product_name || n.product_id || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">Vendedor: {n.vendor_id}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs text-gray-400">Precio: {fmtGs(n.listed_price)}</p>
                    <p className="text-xs text-gray-500">Oferta: {fmtGs(n.buyer_offer)}</p>
                    {n.final_amount != null && (
                      <p className="text-xs font-semibold text-emerald-600">Final: {fmtGs(n.final_amount)}</p>
                    )}
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
