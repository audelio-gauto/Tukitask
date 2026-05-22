'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Commission {
  id: string;
  user_id: string;
  amount: number;
  percentage: number;
  type: string;
  status: string;
  created_at: string;
  user_email?: string;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

const fmtGs = (n: number) =>
  `Gs ${n.toLocaleString('es-PY', { minimumFractionDigits: 0 })}`;

export default function ComisionesPage() {
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('commissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const list = (data ?? []) as Commission[];
      setRows(list);
      setTotal(list.reduce((s, r) => s + (r.amount ?? 0), 0));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comisiones</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registro de comisiones generadas en la plataforma.</p>
        </div>
        {!loading && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-right">
            <div className="text-xs text-emerald-600 font-medium">Total acumulado</div>
            <div className="text-lg font-bold text-emerald-700">{fmtGs(total)}</div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">Sin comisiones registradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Porcentaje</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-gray-700 text-xs font-mono">{r.user_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs capitalize">{r.type || 'general'}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.percentage ?? '—'}%</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtGs(r.amount ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{r.status || 'pendiente'}</span>
                  </td>
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
