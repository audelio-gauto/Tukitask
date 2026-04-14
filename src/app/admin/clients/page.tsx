'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Client {
  id: string;
  email: string;
  created_at: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const goPage = (pg: number) => {
    setPage(pg);
    fetchClients(pg, query);
  };

  const totalPages = Math.ceil(total / LIMIT);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-[rgba(255,255,255,0.45)] text-sm mt-1">
            {loading ? '…' : `${total.toLocaleString()} clientes registrados`}
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por email…"
            className="px-3 py-2 rounded-lg bg-[#1C1C2E] border border-[rgba(255,255,255,0.1)] text-white text-sm outline-none focus:border-[#F5C518] w-56"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-[#F5C518] text-[#1C1C2E] font-bold text-sm hover:opacity-90">
            Buscar
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.3)] rounded-lg text-[#f87171] text-sm">{error}</div>
      )}

      <div className="bg-[#1C1C2E] rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center text-[rgba(255,255,255,0.35)]">
            <div className="text-4xl mb-3">👤</div>
            <p className="font-semibold">No se encontraron clientes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.07)]">
                <th className="text-left py-3 px-4 text-xs font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-wider hidden sm:table-cell">Nombre</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-wider hidden md:table-cell">Registrado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gradient-to-br from-rose-500 to-rose-700 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">{c.email?.[0]?.toUpperCase()}</span>
                      </div>
                      <span className="text-[rgba(255,255,255,0.75)] truncate max-w-[200px]">{c.email}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[rgba(255,255,255,0.5)] hidden sm:table-cell">
                    <span className="text-[rgba(255,255,255,0.2)]">—</span>
                  </td>
                  <td className="py-3 px-4 text-[rgba(255,255,255,0.4)] hidden md:table-cell">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-[rgba(255,255,255,0.4)]">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#1C1C2E] border border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.6)] disabled:opacity-30 hover:border-[rgba(255,255,255,0.2)]"
            >← Anterior</button>
            <button
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#1C1C2E] border border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.6)] disabled:opacity-30 hover:border-[rgba(255,255,255,0.2)]"
            >Siguiente →</button>
          </div>
        </div>
      )}
    </div>
  );
}

