'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Retiro {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  method: string;
  created_at: string;
  notes?: string;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

const fmtGs = (n: number) =>
  `Gs ${n.toLocaleString('es-PY', { minimumFractionDigits: 0 })}`;

const STATUS_TABS = ['todos', 'pending', 'approved', 'rejected'] as const;
type StatusTab = typeof STATUS_TABS[number];

export default function RetirosPage() {
  const [rows, setRows] = useState<Retiro[]>([]);
  const [tab, setTab] = useState<StatusTab>('todos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from('wallet_transactions')
        .select('*')
        .eq('type', 'withdrawal')
        .order('created_at', { ascending: false })
        .limit(100);
      if (tab !== 'todos') q = q.eq('status', tab);
      const { data } = await q;
      setRows((data ?? []) as Retiro[]);
      setLoading(false);
    })();
  }, [tab]);

  const tabLabel = (t: StatusTab) => ({ todos: 'Todos', pending: 'Pendientes', approved: 'Aprobados', rejected: 'Rechazados' })[t];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Retiros de Vendedores</h1>
        <p className="text-gray-500 text-sm mt-0.5">Solicitudes de retiro de fondos de los vendedores.</p>
      </div>

      <div className="flex gap-1 mb-4">
        {STATUS_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm">Sin retiros para este filtro</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendedor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Metodo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-gray-700 text-xs font-mono">{r.user_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-600 text-xs capitalize">{r.method || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtGs(r.amount ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                      r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <div className="flex gap-1">
                        <button className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors font-medium">Aprobar</button>
                        <button className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors font-medium">Rechazar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
