'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Icon } from '@/components/Icon';

interface AuditEntry {
  id: number;
  admin_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_COLOR: Record<string, string> = {
  cancel:        'bg-red-100 text-red-700',
  set_status:    'bg-blue-100 text-blue-700',
  reassign:      'bg-sky-100 text-sky-700',
  adjust_wallet: 'bg-emerald-100 text-emerald-700',
  suspend:       'bg-orange-100 text-orange-700',
  reactivate:    'bg-green-100 text-green-700',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [adminFilter, setAdminFilter] = useState('');
  const [adminInput, setAdminInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEntries = useCallback(async (p: number, action: string, admin: string, replace = false) => {
    setLoading(true);
    try {
      let q = supabase
        .from('admin_audit_log')
        .select('id, admin_email, action, target_type, target_id, metadata, created_at')
        .order('created_at', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);

      if (action) q = q.eq('action', action);
      if (admin) q = q.ilike('admin_email', `%${admin}%`);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as AuditEntry[];
      setEntries(prev => replace ? rows : [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset on filter change
  useEffect(() => {
    setPage(0);
    fetchEntries(0, actionFilter, adminFilter, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, adminFilter]);

  const handleAdminInput = (v: string) => {
    setAdminInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setAdminFilter(v.trim()), 500);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchEntries(next, actionFilter, adminFilter, false);
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });

  const allActions = ['cancel', 'set_status', 'reassign', 'adjust_wallet', 'suspend', 'reactivate'];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Auditoría de Admins</h1>
        <p className="text-gray-500 text-sm mt-0.5">Registro de todas las acciones administrativas</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActionFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${!actionFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
          >
            Todas
          </button>
          {allActions.map(a => (
            <button
              key={a}
              onClick={() => setActionFilter(actionFilter === a ? '' : a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${actionFilter === a ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
            >
              {a}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={adminInput}
          onChange={e => handleAdminInput(e.target.value)}
          placeholder="Filtrar por admin..."
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-[#F5C518] focus:border-[#F5C518] focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Acción</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Objetivo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Detalle</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${ACTION_COLOR[e.action] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs truncate max-w-[160px]">{e.admin_email}</td>
                <td className="px-4 py-3">
                  {e.target_type && <span className="text-[10px] text-gray-400 uppercase font-semibold">{e.target_type} </span>}
                  {e.target_id && <span className="text-xs text-gray-500 font-mono">{e.target_id.slice(0, 8)}…</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[220px] truncate">
                  {e.metadata ? Object.entries(e.metadata).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(e.created_at)}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">Sin registros</td>
              </tr>
            )}
          </tbody>
        </table>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-3 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && hasMore && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button onClick={loadMore} className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors flex items-center gap-2">
              <Icon name="chevron-down" size={14} />
              Cargar más
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
