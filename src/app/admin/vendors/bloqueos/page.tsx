'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import SuspendUserModal, { SuspendTarget } from '../../components/SuspendUserModal';

interface Vendor {
  id: string;
  email: string;
  created_at: string;
  is_suspended?: boolean;
  is_blocked?: boolean;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { year: 'numeric', month: 'short', day: 'numeric' });

export default function BloqueosPage() {
  const [vendors, setVendors]             = useState<Vendor[]>([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);

  const fetchSuspended = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id, email, created_at, is_suspended, is_blocked')
        .eq('role', 'vendedor')
        .or('is_suspended.eq.true,is_blocked.eq.true')
        .order('created_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      setVendors(data || []);
      setTotal(data?.length ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuspended(); }, [fetchSuspended]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Bloqueos / Suspensiones</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bloqueos y Suspensiones</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {loading ? 'Cargando...' : `${total} vendedor${total !== 1 ? 'es' : ''} suspendido${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={fetchSuspended}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F5C518]" />
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-gray-400">No hay vendedores suspendidos</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_140px_120px_100px] gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div>Email</div>
              <div className="text-right">Registro</div>
              <div className="text-center">Estado</div>
              <div className="text-center">Acciones</div>
            </div>
            {vendors.map(v => (
              <div key={v.id} className="grid grid-cols-[1fr_140px_120px_100px] gap-3 px-5 py-3 border-b border-gray-100 hover:bg-red-50/30 transition-colors">
                <div className="flex items-center min-w-0">
                  <div className="w-7 h-7 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-700 font-bold text-xs mr-2 flex-shrink-0">
                    {v.email[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 truncate">{v.email}</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-xs text-gray-400">{fmtDate(v.created_at)}</span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                    {v.is_blocked ? 'Bloqueado' : 'Suspendido'}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => setSuspendTarget({ user_id: v.id, email: v.email, role: 'vendedor', display_name: null, profile_photo: null })}
                    title="Gestionar"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {suspendTarget && (
        <SuspendUserModal
          target={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onComplete={fetchSuspended}
        />
      )}
    </div>
  );
}
