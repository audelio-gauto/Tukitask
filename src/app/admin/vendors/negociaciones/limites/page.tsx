'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Limite {
  id: string;
  name: string;
  key: string;
  value: number;
  effective_value: number;
  unit: string | null;
  is_active: boolean;
  description: string | null;
}

export default function LimitesPage() {
  const [limits, setLimits]   = useState<Limite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/negotiation-limits', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'No se pudieron cargar los límites.');
        if (active) setLimits((json.limits ?? []) as Limite[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar los límites.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/negociaciones" className="hover:text-gray-600 transition-colors">Negociaciones</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Límites Automáticos</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Límites Automáticos</h1>
            <p className="text-gray-500 text-sm mt-0.5">Reglas que el sistema aplica automáticamente a las negociaciones.</p>
          </div>
          <Link
            href="/admin/configuracion/limites-negociacion"
            className="flex items-center gap-2 px-4 py-2 bg-[#F5C518] text-[#1d2327] rounded-lg font-bold text-sm hover:bg-yellow-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar límites
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse">
              <div className="h-4 w-48 bg-gray-100 rounded mb-2" />
              <div className="h-3 w-72 bg-gray-100 rounded" />
            </div>
          ))
        ) : limits.map(rule => (
          <div key={rule.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {rule.is_active ? 'Activo' : 'Predeterminado'}
                </span>
              </div>
              {rule.description && <p className="text-xs text-gray-400">{rule.description}</p>}
            </div>
            <span className="text-sm font-bold text-[#F5C518] bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg shrink-0">
              {rule.effective_value.toLocaleString('es-PY')} {rule.unit ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


