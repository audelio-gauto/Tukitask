'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SuspendUserModal, { SuspendTarget } from '../../components/SuspendUserModal';

interface DriverItem {
  id: string;
  email: string;
  role?: string;
  created_at?: string;
  first_name?: string;
  last_name?: string;
  transport_mode?: string;
  profile_photo?: string;
  avg_rating?: number;
  verified?: boolean;
  verification_status?: string;
}

const TRANSPORT_LABELS: Record<string, string> = {
  moto: 'Moto', auto: 'Auto', camion: 'Camión', van: 'Van', bici: 'Bici',
};

export default function DriverListPage() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);
  const [inactiveDays, setInactiveDays] = useState(0);
  const LIMIT = 50;

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchDrivers = useCallback(async (pg: number, q: string, inactive = 0) => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (q) params.set('search', q);
      if (inactive > 0) params.set('inactive_days', String(inactive));
      const res = await fetch(`/api/admin/drivers/list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error cargando conductores');
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
    fetchDrivers(1, search, inactiveDays);
  };

  const goPage = (pg: number) => { setPage(pg); fetchDrivers(pg, query, inactiveDays); };

  const setInactiveFilter = (days: number) => {
    const next = inactiveDays === days ? 0 : days;
    setInactiveDays(next);
    setPage(1);
    fetchDrivers(1, query, next);
  };

  const handleVerify = async (d: DriverItem, action: 'verify' | 'reject') => {
    setVerifying(d.id);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/drivers/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: d.email, action }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setDrivers(prev => prev.map(item => item.id === d.id
        ? { ...item, verified: action === 'verify', verification_status: action === 'verify' ? 'verified' : 'rejected' }
        : item
      ));
    } catch (err: any) {
      alert('Error: ' + String(err?.message || err));
    } finally {
      setVerifying(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fullName = (d: DriverItem) => [d.first_name, d.last_name].filter(Boolean).join(' ') || null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Conductores</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${total.toLocaleString('es-PY')} conductores registrados`}
          </p>
        </div>
        <button
          onClick={() => fetchDrivers(page, query)}
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
        <form onSubmit={handleSearch} className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 max-w-sm">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Buscar conductor</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Email del conductor..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800"
              />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors">Buscar</button>
          {query && (
            <button type="button" onClick={() => { setSearch(''); setQuery(''); fetchDrivers(1, '', inactiveDays); }}
              className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Limpiar</button>
          )}
        </form>
        {/* Inactivity filters */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-400 font-semibold">Sin actividad:</span>
          {[7, 14, 30].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setInactiveFilter(d)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                inactiveDays === d
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300 hover:text-orange-600'
              }`}
            >
              &gt;{d} días
            </button>
          ))}
          {inactiveDays > 0 && (
            <button
              type="button"
              onClick={() => setInactiveFilter(0)}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-colors"
            >
              Ver todos
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F5C518]" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="font-medium">No se encontraron conductores</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[36px_1fr_140px_110px_180px_110px_80px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div></div><div>Conductor</div><div>Vehículo</div><div className="text-center">Rating</div><div className="text-center">Verificación</div><div className="text-right">Registro</div><div className="text-center">Acción</div>
            </div>
            {drivers.map(d => {
              const name = fullName(d);
              const initials = (d.first_name?.[0] || d.email[0])?.toUpperCase();
              const isVerified = d.verified || d.verification_status === 'verified';
              const isRejected = d.verification_status === 'rejected';
              const isBusy = verifying === d.id;
              return (
                <div key={d.id}
                  className="grid grid-cols-[36px_1fr_140px_110px_180px_110px_80px] gap-3 px-5 py-3 border-b border-gray-100 hover:bg-yellow-50/40 transition-colors cursor-pointer"
                  onClick={() => router.push(`/admin/drivers/${d.id}`)}
                >
                  <div className="flex items-center">
                    {d.profile_photo
                      ? <img src={d.profile_photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-xs">{initials}</div>
                    }
                  </div>
                  <div className="flex flex-col justify-center min-w-0">
                    {name && <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>}
                    <span className={`truncate ${name ? 'text-xs text-gray-500' : 'text-sm font-medium text-gray-800'}`}>{d.email}</span>
                  </div>
                  <div className="flex items-center">
                    {d.transport_mode
                      ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{TRANSPORT_LABELS[d.transport_mode] || d.transport_mode}</span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </div>
                  <div className="flex items-center justify-center">
                    {d.avg_rating
                      ? <span className="text-sm font-semibold text-gray-700">⭐ {Number(d.avg_rating).toFixed(1)}</span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </div>
                  <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                    {isVerified ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Verificado
                        </span>
                        <button onClick={() => handleVerify(d, 'reject')} disabled={isBusy}
                          className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-40">Rechazar</button>
                      </>
                    ) : isRejected ? (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Rechazado
                        </span>
                        <button onClick={() => handleVerify(d, 'verify')} disabled={isBusy}
                          className="text-xs text-emerald-600 hover:text-emerald-800 underline disabled:opacity-40">Aprobar</button>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Pendiente
                        </span>
                        <button onClick={() => handleVerify(d, 'verify')} disabled={isBusy}
                          className="text-xs text-emerald-600 hover:text-emerald-800 underline disabled:opacity-40">{isBusy ? '...' : 'Verificar'}</button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="text-xs text-gray-400">{fmtDate(d.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                    <a
                      href={`/admin/profile/${encodeURIComponent(d.email)}`}
                      title="Ver perfil unificado"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </a>
                    <button
                      onClick={() => setSuspendTarget({
                        user_id: d.id,
                        email: d.email,
                        role: 'driver',
                        display_name: name,
                        profile_photo: d.profile_photo || null,
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
            <button disabled={page <= 1} onClick={() => goPage(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-700">← Anterior</button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button key={p} onClick={() => goPage(p)}
                  className={`w-8 h-8 text-sm rounded-lg font-medium transition-colors ${p === page ? 'bg-[#F5C518] text-[#1d2327] font-bold' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {p}
                </button>
              );
            })}
            <button disabled={page >= totalPages} onClick={() => goPage(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 text-gray-700">Siguiente →</button>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {suspendTarget && (
        <SuspendUserModal
          target={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onComplete={() => fetchDrivers(page, query)}
        />
      )}
    </div>
  );
}

