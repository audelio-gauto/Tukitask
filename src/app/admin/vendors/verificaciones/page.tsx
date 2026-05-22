'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Vendor {
  id: string;
  email: string;
  created_at: string;
  is_suspended?: boolean;
  is_blocked?: boolean;
  is_active?: boolean;
}

type TabKey = 'pending' | 'active' | 'blocked';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'Recientes'   },
  { key: 'active',  label: 'Aprobados'   },
  { key: 'blocked', label: 'Suspendidos' },
];

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

export default function VerificacionesPage() {
  const [tab, setTab]         = useState<TabKey>('pending');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchVendors = useCallback(async (t: TabKey) => {
    setLoading(true);
    setError('');
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let q = supabase
        .from('users')
        .select('id, email, created_at, is_suspended, is_blocked, is_active', { count: 'exact' })
        .eq('role', 'vendedor')
        .order('created_at', { ascending: false })
        .limit(50);

      if (t === 'pending') {
        // Vendors registered in last 30 days (new, awaiting review)
        q = q.gte('created_at', thirtyDaysAgo)
             .or('is_suspended.eq.false,is_suspended.is.null')
             .or('is_blocked.eq.false,is_blocked.is.null');
      } else if (t === 'active') {
        q = q.or('is_suspended.eq.false,is_suspended.is.null')
             .or('is_blocked.eq.false,is_blocked.is.null')
             .lt('created_at', thirtyDaysAgo);
      } else {
        q = q.or('is_suspended.eq.true,is_blocked.eq.true');
      }

      const { data, count, error: err } = await q;
      if (err) throw err;
      setVendors(data as Vendor[] || []);
      setTotal(count ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(tab); }, [fetchVendors, tab]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Verificaciones</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Verificaciones de Vendedores</h1>
        <p className="text-gray-500 text-sm mt-0.5">Revisar solicitudes de alta y gestión del estado de verificación de vendedores.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-[#F5C518] rounded-full animate-spin" />
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">
              {tab === 'pending' ? 'Sin vendedores recientes' : tab === 'active' ? 'Sin vendedores aprobados' : 'Sin vendedores suspendidos'}
            </p>
            <p className="text-xs text-gray-300 mt-1">Las solicitudes aparecerán aquí</p>
          </div>
        ) : (
          <div>
            <div className="px-5 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">{total.toLocaleString()} vendedor{total !== 1 ? 'es' : ''}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {vendors.map(v => (
                <div key={v.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{v.email}</p>
                    <p className="text-xs text-gray-400">Registrado: {fmtDate(v.created_at)}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    v.is_suspended || v.is_blocked
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {v.is_suspended ? 'Suspendido' : v.is_blocked ? 'Bloqueado' : 'Activo'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
