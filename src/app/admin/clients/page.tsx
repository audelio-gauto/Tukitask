'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SuspendUserModal, { SuspendTarget } from '../components/SuspendUserModal';

interface Client {
  id: string;
  email: string;
  created_at: string;
  display_name?: string;
  phone?: string;
  photo_url?: string;
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);
  const LIMIT = 50;

  const fetchClients = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/clients?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error');
      setClients(json.data || []);
      setTotal(json.total || 0);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(1, ''); }, [fetchClients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(search);
    fetchClients(1, search);
  };

  const goPage = (pg: number) => { setPage(pg); fetchClients(pg, query); };

  const totalPages = Math.ceil(total / LIMIT);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${total.toLocaleString('es-PY')} clientes registrados`}
          </p>
        </div>
        <button onClick={() => fetchClients(page, query)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors shadow-sm">
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
            <label className="block text-xs font-semibold text-gray-500 mb-1">Buscar cliente</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Email del cliente..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] text-gray-800" />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors">Buscar</button>
          {query && (
            <button type="button" onClick={() => { setSearch(''); setQuery(''); fetchClients(1, ''); }}
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
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="font-medium">No se encontraron clientes</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[36px_1fr_1fr_130px_80px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div></div><div>Email</div><div>Nombre</div><div className="text-right">Registro</div><div className="text-center">Cuenta</div>
            </div>
            {clients.map(c => (
              <div key={c.id}
                className="grid grid-cols-[36px_1fr_1fr_130px_80px] gap-3 px-5 py-3 border-b border-gray-100 hover:bg-blue-50/30 transition-colors cursor-pointer"
                onClick={() => router.push(`/admin/clients/${c.id}`)}
              >
                <div className="flex items-center">
                  {c.photo_url
                    ? <img src={c.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    : <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">{c.email[0]?.toUpperCase()}</div>
                  }
                </div>
                <div className="flex items-center min-w-0">
                  <span className="text-sm text-gray-700 truncate">{c.email}</span>
                </div>
                <div className="flex items-center">
                  {c.display_name
                    ? <span className="text-sm font-medium text-gray-800 truncate">{c.display_name}</span>
                    : <span className="text-gray-300 text-sm">—</span>
                  }
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                </div>
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setSuspendTarget({
                      user_id: c.id,
                      email: c.email,
                      role: 'cliente',
                      display_name: c.display_name || null,
                      profile_photo: c.photo_url || null,
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
          onComplete={() => fetchClients(page, query)}
        />
      )}
    </div>
  );
}

