'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface DriverItem {
  id: string;
  email: string;
  role?: string | null;
  created_at?: string;
  is_verified?: boolean;
}

export default function DriverListPage() {
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const LIMIT = 50;

  const fetchDrivers = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/drivers/list?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error cargando drivers');
      setDrivers(json.data || []);
      setTotal(json.total || 0);
    } catch (err: any) {
      setError(String(err?.message || err));
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDrivers(1, ''); }, [fetchDrivers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(search);
    fetchDrivers(1, search);
  };

  const goPage = (pg: number) => {
    setPage(pg);
    fetchDrivers(pg, query);
  };

  const totalPages = Math.ceil(total / LIMIT);
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Conductores (Drivers)</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${total.toLocaleString('es-PY')} conductores registrados`}
          </p>
        </div>
        <button
          onClick={() => fetchDrivers(page, query)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Filters (Buscador) */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 shadow-sm">
        <form onSubmit={handleSearch} className="flex gap-3 items-end">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Buscar conductor</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Email del conductor..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800 placeholder:text-gray-400"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-[#F5C518] text-[#1C1C2E] rounded-lg font-bold text-sm hover:bg-[#E6A800] transition-colors shadow-sm">
            Buscar
          </button>
          {query && (
            <button
              type="button"
              onClick={() => { setSearch(''); setQuery(''); fetchDrivers(1, ''); }}
              className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Limpiar
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F5C518]" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="font-medium">No se encontraron conductores</p>
            {query && <p className="text-sm mt-0.5">Probá limpiando el buscador</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_200px_150px_150px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div>Email</div>
              <div className="hidden sm:block">Rol</div>
              <div className="text-center">Estado</div>
              <div className="text-right">Registrado</div>
            </div>
            {drivers.map((d, i) => (
              <div key={d.id} className={`grid grid-cols-[1fr_200px_150px_150px] gap-4 px-6 py-4 border-b border-gray-100 transition-colors hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 font-bold border border-amber-200">
                    {d.email[0]?.toUpperCase() || 'D'}
                  </div>
                  <span className="text-sm font-medium text-gray-800 truncate">{d.email}</span>
                </div>
                <div className="hidden sm:flex items-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                    {d.role || 'driver'}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    d.is_verified 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${d.is_verified ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    {d.is_verified ? 'Verificado' : 'Pendiente'}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-sm text-gray-500">{fmtDate(d.created_at)}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total.toLocaleString('es-PY')}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
            >
              ← Anterior
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-8 h-8 text-sm rounded-lg transition-colors font-medium ${
                      p === page
                        ? 'bg-[#F5C518] text-[#1C1C2E] font-bold'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <button
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
            >
              Siguiente →
            </button>
      )}
    </div>
  );
}
