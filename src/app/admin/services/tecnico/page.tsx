'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface TecnicoItem {
  id: string;
  email: string;
  role?: string;
  created_at?: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string;
  subscription_active?: boolean;
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
  is_verified?: boolean;
  verified_at?: string | null;
}

export default function TecnicoListPage() {
  const router = useRouter();
  const [tecnicos, setTecnicos] = useState<TecnicoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState<string | null>(null);
  const LIMIT = 50;

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchTecnicos = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/services/tecnico?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error cargando técnicos');
      setTecnicos(json.data || []);
      setTotal(json.total || 0);
    } catch (err: unknown) {
      setError(String(err instanceof Error ? err.message : err));
      setTecnicos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTecnicos(1, ''); }, [fetchTecnicos]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(search);
    fetchTecnicos(1, search);
  };

  const goPage = (pg: number) => { setPage(pg); fetchTecnicos(pg, query); };

  const handleVerify = async (t: TecnicoItem, action: 'verify' | 'reject') => {
    setVerifying(t.id);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/services/tecnico', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: t.email, action }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setTecnicos(prev => prev.map(item => item.id === t.id
        ? { ...item, is_verified: action === 'verify', verified_at: action === 'verify' ? new Date().toISOString() : null }
        : item
      ));
    } catch (err: unknown) {
      alert('Error: ' + String(err instanceof Error ? err.message : err));
    } finally {
      setVerifying(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fullName = (t: TecnicoItem) => [t.first_name, t.last_name].filter(Boolean).join(' ') || null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Técnicos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${total.toLocaleString('es-PY')} técnicos registrados`}
          </p>
        </div>
        <button
          onClick={() => fetchTecnicos(page, query)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 shadow-sm">
        <form onSubmit={handleSearch} className="flex gap-3 items-end">
          <div className="flex-1 max-w-sm">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Buscar técnico</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Email del técnico..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors">Buscar</button>
          {query && (
            <button type="button" onClick={() => { setSearch(''); setQuery(''); fetchTecnicos(1, ''); }}
              className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Limpiar</button>
          )}
        </form>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F5C518]" />
          </div>
        ) : tecnicos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="font-medium">No se encontraron técnicos</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[36px_1fr_160px_120px_120px_140px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div></div>
              <div>Email / Nombre</div>
              <div>Suscripción</div>
              <div>Registro</div>
              <div>Estado</div>
              <div className="text-right">Acciones</div>
            </div>

            {tecnicos.map(t => {
              const name = fullName(t);
              const isVerified = t.is_verified;
              const subActive = t.subscription_active;
              const subExpires = t.subscription_expires_at;
              const subExpired = subExpires ? new Date(subExpires) < new Date() : false;

              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[36px_1fr_160px_120px_120px_140px] gap-3 px-5 py-3 border-b border-gray-100 hover:bg-sky-50/30 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex items-center">
                    {t.profile_photo
                      ? <img src={t.profile_photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-700 font-bold text-xs">
                          {t.email[0]?.toUpperCase()}
                        </div>
                    }
                  </div>

                  {/* Email & name */}
                  <div className="flex flex-col justify-center min-w-0 cursor-pointer" onClick={() => router.push(`/admin/drivers/${t.id}`)}>
                    <span className="text-sm text-gray-700 truncate">{t.email}</span>
                    {name && <span className="text-xs text-gray-400 truncate">{name}</span>}
                  </div>

                  {/* Subscription */}
                  <div className="flex items-center">
                    {subActive && !subExpired ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        ✓ {t.subscription_plan || 'Activa'}
                        {subExpires && <span className="opacity-60 text-[10px]">· {fmtDate(subExpires)}</span>}
                      </span>
                    ) : subExpires && subExpired ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        Expiró {fmtDate(subExpires)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Sin suscripción</span>
                    )}
                  </div>

                  {/* Fecha registro */}
                  <div className="flex items-center">
                    <span className="text-xs text-gray-400">{fmtDate(t.created_at)}</span>
                  </div>

                  {/* Estado verificación */}
                  <div className="flex items-center">
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        ✓ Verificado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                        Pendiente
                      </span>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center justify-end gap-2">
                    {!isVerified ? (
                      <button
                        onClick={() => handleVerify(t, 'verify')}
                        disabled={verifying === t.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {verifying === t.id ? '...' : 'Verificar'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleVerify(t, 'reject')}
                        disabled={verifying === t.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                      >
                        {verifying === t.id ? '...' : 'Revocar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              Página {page} de {totalPages} · {total.toLocaleString('es-PY')} técnicos
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => goPage(page - 1)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors text-gray-700">
                ← Anterior
              </button>
              <button disabled={page >= totalPages} onClick={() => goPage(page + 1)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors text-gray-700">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
