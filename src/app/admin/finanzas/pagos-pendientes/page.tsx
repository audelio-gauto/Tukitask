'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

interface Pago {
  id: string;
  email: string;
  role: 'driver' | 'vendor';
  amount: number;
  receipt_url: string | null;
  created_at: string;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

const fmtGs = (n: number) =>
  `Gs ${n.toLocaleString('es-PY', { minimumFractionDigits: 0 })}`;

const ROLE_INFO: Record<Pago['role'], { label: string; reviewHref: string }> = {
  driver: { label: 'Conductor / Técnico', reviewHref: '/admin/wallets?tab=pending' },
  vendor: { label: 'Vendedor', reviewHref: '/admin/billetera/vendedores' },
};

export default function PagosPendientesPage() {
  const [rows, setRows] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/finanzas?section=pending', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(json.error || 'No se pudieron cargar los pagos pendientes.');
        } else {
          setRows((json.rows ?? []) as Pago[]);
          setTruncated(Boolean(json.truncated));
        }
      } catch {
        if (active) setError('Error de conexión al cargar los pagos pendientes.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const totalGs = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pagos Pendientes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Recargas de saldo enviadas con comprobante que esperan aprobación{truncated ? ' (se muestran las 100 más recientes de cada tipo)' : ''}.</p>
        </div>
        {!loading && !error && rows.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-right">
            <div className="text-xs text-blue-600 font-medium">Total pendiente</div>
            <div className="text-lg font-bold text-blue-700">{fmtGs(totalGs)}</div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {(Object.keys(ROLE_INFO) as Array<Pago['role']>).map(role => {
          const group = rows.filter(r => r.role === role);
          const sum = group.reduce((s, r) => s + (r.amount ?? 0), 0);
          return (
            <Link key={role} href={ROLE_INFO[role].reviewHref} className={`rounded-xl border p-3 transition-colors ${role === 'driver' ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'}`}>
              <div className="text-xs font-medium text-gray-500">{ROLE_INFO[role].label}</div>
              <div className={`text-lg font-bold ${role === 'driver' ? 'text-blue-700' : 'text-amber-700'}`}>{group.length}</div>
              <div className="text-xs text-gray-500">{fmtGs(sum)} · Revisar →</div>
            </Link>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Comprobante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={`${r.role}-${r.id}`} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-gray-700 text-xs truncate max-w-[220px]">{r.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{ROLE_INFO[r.role].label}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtGs(r.amount ?? 0)}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.receipt_url
                      ? <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver comprobante</a>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-xs">
                    <Link href={ROLE_INFO[r.role].reviewHref} className="text-blue-600 hover:underline">Revisar</Link>
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
