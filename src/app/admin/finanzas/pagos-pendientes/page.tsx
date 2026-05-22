'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Pago {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
  description?: string;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

const fmtGs = (n: number) =>
  `Gs ${n.toLocaleString('es-PY', { minimumFractionDigits: 0 })}`;

const METHOD_ICONS: Record<string, string> = {
  transfer: 'Transferencia',
  cash_on_delivery: 'Contra entrega',
  wallet: 'Billetera',
};

export default function PagosPendientesPage() {
  const [rows, setRows] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalGs, setTotalGs] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('status', 'pending')
        .neq('type', 'withdrawal')
        .order('created_at', { ascending: false })
        .limit(100);
      const list = (data ?? []) as Pago[];
      setRows(list);
      setTotalGs(list.reduce((s, r) => s + (r.amount ?? 0), 0));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pagos Pendientes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Pagos que aun no han sido confirmados o procesados.</p>
        </div>
        {!loading && rows.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-right">
            <div className="text-xs text-blue-600 font-medium">Total pendiente</div>
            <div className="text-lg font-bold text-blue-700">{fmtGs(totalGs)}</div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Transferencia', method: 'transfer', color: 'blue' },
          { label: 'Contra entrega', method: 'cash_on_delivery', color: 'amber' },
          { label: 'Billetera', method: 'wallet', color: 'purple' },
        ].map(m => {
          const count = rows.filter(r => r.method === m.method).length;
          const sum = rows.filter(r => r.method === m.method).reduce((s, r) => s + (r.amount ?? 0), 0);
          const colors: Record<string, string> = {
            blue: 'border-blue-200 bg-blue-50',
            amber: 'border-amber-200 bg-amber-50',
            purple: 'border-purple-200 bg-purple-50',
          };
          const textColors: Record<string, string> = {
            blue: 'text-blue-700',
            amber: 'text-amber-700',
            purple: 'text-purple-700',
          };
          return (
            <div key={m.method} className={`rounded-xl border p-3 ${colors[m.color]}`}>
              <div className="text-xs font-medium text-gray-500">{m.label}</div>
              <div className={`text-lg font-bold ${textColors[m.color]}`}>{count}</div>
              <div className="text-xs text-gray-500">{fmtGs(sum)}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">Sin pagos pendientes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Metodo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Descripcion</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-gray-700 text-xs font-mono">{r.user_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">
                      {METHOD_ICONS[r.method] ?? r.method ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtGs(r.amount ?? 0)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[180px]">{r.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
