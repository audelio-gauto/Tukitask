'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Commission {
  id: string;
  email: string;
  source: 'delivery' | 'service' | 'marketplace';
  amount: number;
  note: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<Commission['source'], { label: string; color: string }> = {
  delivery:    { label: 'Envío',        color: 'bg-emerald-100 text-emerald-700' },
  service:     { label: 'Servicio',    color: 'bg-sky-100 text-sky-700' },
  marketplace: { label: 'Marketplace', color: 'bg-amber-100 text-amber-700' },
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

const fmtGs = (n: number) =>
  `Gs ${n.toLocaleString('es-PY', { minimumFractionDigits: 0 })}`;

export default function ComisionesPage() {
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/finanzas?section=commissions', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(json.error || 'No se pudieron cargar las comisiones.');
        } else {
          setRows((json.rows ?? []) as Commission[]);
          setTotal(json.total ?? 0);
          setTruncated(Boolean(json.truncated));
        }
      } catch {
        if (active) setError('Error de conexión al cargar las comisiones.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comisiones</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registro de comisiones cobradas en la plataforma (últimas 100).</p>
        </div>
        {!loading && !error && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-right">
            <div className="text-xs text-emerald-600 font-medium">Total acumulado{truncated ? ' (parcial)' : ''}</div>
            <div className="text-lg font-bold text-emerald-700">{fmtGs(total)}</div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Origen</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Detalle</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const source = SOURCE_LABELS[r.source] ?? { label: r.source, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={`${r.source}-${r.id}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-gray-700 text-xs truncate max-w-[200px]">{r.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${source.color}`}>{source.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[260px]">{r.note || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtGs(r.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.created_at)}</td>
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
