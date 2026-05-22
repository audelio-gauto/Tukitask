'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import SuspendUserModal, { SuspendTarget } from '../../components/SuspendUserModal';

interface Vendor {
  id: string;
  email: string;
  role: string;
  created_at: string;
  is_suspended?: boolean;
  is_blocked?: boolean;
  is_active?: boolean;
}

const STATUS_FILTERS = [
  { key: 'all',       label: 'Todos'      },
  { key: 'active',    label: 'Activos'    },
  { key: 'suspended', label: 'Suspendidos'},
] as const;

type StatusFilter = typeof STATUS_FILTERS[number]['key'];

const LIMIT = 25;

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

export default function VendorsPage() {
  const [vendors, setVendors]             = useState<Vendor[]>([]);
  const [total, setTotal]                 = useState(0);
  const [newThisWeek, setNewThisWeek]     = useState(0);
  const [page, setPage]                   = useState(1);
  const [search, setSearch]               = useState('');
  const [query, setQuery]                 = useState('');
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);

  const fetchVendors = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/vendors?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error al cargar vendedores');
      setVendors(json.data || []);
      setTotal(json.total || 0);
      setNewThisWeek(json.newThisWeek || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(1, ''); }, [fetchVendors]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(search);
    fetchVendors(1, search);
  };

  const goPage = (pg: number) => { setPage(pg); fetchVendors(pg, query); };

  // Client-side filter by suspension status
  const filtered = vendors.filter(v => {
    if (statusFilter === 'active')    return !v.is_suspended && !v.is_blocked;
    if (statusFilter === 'suspended') return v.is_suspended || v.is_blocked;
    return true;
  });

  const totalPages  = Math.ceil(total / LIMIT);
  const activoCount = vendors.filter(v => !v.is_suspended && !v.is_blocked).length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vendedores</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${total.toLocaleString('es-PY')} vendedores registrados`}
          </p>
        </div>
        <button
          onClick={() => fetchVendors(page, query)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : total.toLocaleString('es-PY')}</p>
            <p className="text-xs text-gray-500">Total vendedores</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : activoCount.toLocaleString('es-PY')}</p>
            <p className="text-xs text-gray-500">Activos (esta página)</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : newThisWeek.toLocaleString('es-PY')}</p>
            <p className="text-xs text-gray-500">Nuevos esta semana</p>
          </div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 shadow-sm flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                statusFilter === f.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por email..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors">
            Buscar
          </button>
          {query && (
            <button
              type="button"
              onClick={() => { setSearch(''); setQuery(''); fetchVendors(1, ''); }}
              className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Limpiar
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F5C518]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="font-medium">No se encontraron vendedores</p>
            {query && <p className="text-sm mt-1">Prueba con otro email</p>}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-[36px_1fr_140px_110px_96px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div></div>
              <div>Email</div>
              <div className="text-right">Registro</div>
              <div className="text-center">Estado</div>
              <div className="text-center">Acciones</div>
            </div>

            {/* Rows */}
            {filtered.map(v => {
              const suspended = v.is_suspended || v.is_blocked;
              return (
                <div
                  key={v.id}
                  className="grid grid-cols-[36px_1fr_140px_110px_96px] gap-3 px-5 py-3 border-b border-gray-100 hover:bg-emerald-50/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xs">
                      {v.email[0]?.toUpperCase()}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center min-w-0">
                    <span className="text-sm text-gray-700 truncate">{v.email}</span>
                  </div>

                  {/* Date */}
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-gray-400">{fmtDate(v.created_at)}</span>
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center justify-center">
                    {suspended ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                        Suspendido
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Activo
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-1">
                    <a
                      href={`/admin/profile/${encodeURIComponent(v.email)}`}
                      title="Ver perfil"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </a>
                    <button
                      onClick={() => setSuspendTarget({
                        user_id: v.id,
                        email: v.email,
                        role: 'vendedor',
                        display_name: null,
                        profile_photo: null,
                      })}
                      title="Gestionar cuenta"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Mostrando {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total.toLocaleString('es-PY')}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-700"
            >
              ← Anterior
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 7)             p = i + 1;
              else if (page <= 4)              p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else                             p = page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => goPage(p)}
                  className={`w-8 h-8 text-sm rounded-lg font-medium transition-colors ${
                    p === page
                      ? 'bg-[#F5C518] text-[#1d2327] font-bold'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-700"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {suspendTarget && (
        <SuspendUserModal
          target={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onComplete={() => fetchVendors(page, query)}
        />
      )}
    </div>
  );
}
