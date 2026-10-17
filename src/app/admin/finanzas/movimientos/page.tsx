'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Movimiento {
  id: string;
  email: string;
  role: 'driver' | 'vendor';
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtGs = (n: number) =>
  `Gs ${Math.abs(n).toLocaleString('es-PY', { minimumFractionDigits: 0 })}`;

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  recharge:        { label: 'Recarga',          color: 'bg-emerald-100 text-emerald-700' },
  commission:      { label: 'Comisión',         color: 'bg-purple-100 text-purple-700' },
  sale_commission: { label: 'Comisión de venta', color: 'bg-purple-100 text-purple-700' },
  access_fee:      { label: 'Acceso',           color: 'bg-blue-100 text-blue-700' },
  admin_credit:    { label: 'Crédito admin',    color: 'bg-emerald-100 text-emerald-700' },
  admin_debit:     { label: 'Débito admin',     color: 'bg-red-100 text-red-700' },
  refund:          { label: 'Reembolso',        color: 'bg-red-100 text-red-700' },
  bonus:           { label: 'Bonificación',     color: 'bg-amber-100 text-amber-700' },
  adjustment:      { label: 'Ajuste',           color: 'bg-gray-100 text-gray-700' },
};

const ALL_TYPES = ['todos', ...Object.keys(TYPE_LABELS)];

export default function MovimientosPage() {
  const [rows, setRows] = useState<Movimiento[]>([]);
  const [typeFilter, setTypeFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const params = new URLSearchParams({ section: 'movements' });
        if (typeFilter !== 'todos') params.set('type', typeFilter);
        if (debouncedSearch) params.set('q', debouncedSearch);
        const res = await fetch(`/api/admin/finanzas?${params}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(json.error || 'No se pudieron cargar los movimientos.');
          setRows([]);
        } else {
          setRows((json.rows ?? []) as Movimiento[]);
        }
      } catch {
        if (active) {
          setError('Error de conexión al cargar los movimientos.');
          setRows([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [typeFilter, debouncedSearch]);

  const filtered = rows;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Movimientos Financieros</h1>
        <p className="text-gray-500 text-sm mt-0.5">Historial completo de transacciones en la plataforma.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 flex-wrap">
          {ALL_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                typeFilter === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'todos' ? 'Todos' : (TYPE_LABELS[t]?.label ?? t)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por usuario o descripción..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="sm:ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 w-full sm:w-64"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {error && (
          <div role="alert" className="bg-red-50 border-b border-red-200 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">Sin movimientos para este filtro</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => {
                const typeInfo = TYPE_LABELS[r.type] ?? { label: r.type, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={`${r.role}-${r.id}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-gray-700 text-xs truncate max-w-[220px]">
                      {r.email}
                      <span className="ml-1 text-gray-400">({r.role === 'vendor' ? 'vendedor' : 'conductor/técnico'})</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.amount >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {r.amount >= 0 ? '+' : '-'}{fmtGs(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[220px]">{r.note || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
