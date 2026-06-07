'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Product {
  id: string;
  vendor_email: string;
  name: string;
  sku: string | null;
  category: string;
  type: string;
  description: string | null;
  price: number;
  floor_price: number;
  stock: number;
  image: string | null;
  status: string;
  negotiable: boolean;
  rejection_reason: string | null;
  created_at: string;
}

type TabKey = 'pending_review' | 'published' | 'rejected';

const TABS: { key: TabKey; label: string; badge?: string }[] = [
  { key: 'pending_review', label: 'Pendientes' },
  { key: 'published',      label: 'Aprobados'  },
  { key: 'rejected',       label: 'Rechazados' },
];

const fmtGs = (n: number) => n.toLocaleString('es-PY') + ' Gs';
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AprobarProductosPage() {
  const [tab, setTab]           = useState<TabKey>('pending_review');
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts]     = useState<Record<TabKey, number>>({ pending_review: 0, published: 0, rejected: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [acting, setActing]     = useState<string | null>(null);
  // Reject modal state
  const [rejectId, setRejectId]       = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }, []);

  const fetchProducts = useCallback(async (t: TabKey) => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/vendors/products-review?status=${t}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudieron cargar los productos');
      setProducts((json.items ?? []) as Product[]);
      setCounts(json.counts ?? { pending_review: 0, published: 0, rejected: 0 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchProducts(tab);
  }, [fetchProducts, tab]);

  const approve = async (id: string) => {
    setActing(id);
    const token = await getToken();
    const res = await fetch('/api/admin/vendors/products-review', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, action: 'approve' }),
    });
    const json = await res.json();
    if (res.ok) {
      setProducts(prev => prev.filter(p => p.id !== id));
      fetchProducts(tab);
    } else {
      setError(json.error || 'No se pudo aprobar el producto');
    }
    setActing(null);
  };

  const openReject = (id: string) => {
    setRejectId(id);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectId) return;
    setActing(rejectId);
    const token = await getToken();
    const res = await fetch('/api/admin/vendors/products-review', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: rejectId, action: 'reject', reason: rejectReason }),
    });
    const json = await res.json();
    if (res.ok) {
      setProducts(prev => prev.filter(p => p.id !== rejectId));
      fetchProducts(tab);
    } else {
      setError(json.error || 'No se pudo rechazar el producto');
    }
    setRejectId(null);
    setActing(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Aprobar Productos</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Aprobar Productos</h1>
        <p className="text-gray-500 text-sm mt-0.5">Revisar y aprobar productos enviados por vendedores antes de publicarlos en la plataforma.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                t.key === 'pending_review' ? 'bg-amber-400' : t.key === 'published' ? 'bg-emerald-500' : 'bg-red-400'
              }`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm font-medium text-gray-400">
              {tab === 'pending_review' ? 'No hay productos pendientes de aprobación' : tab === 'published' ? 'No hay productos aprobados' : 'No hay productos rechazados'}
            </p>
            <p className="text-xs text-gray-300 mt-1">Los productos enviados por vendedores aparecerán aquí</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {products.map(p => (
              <div key={p.id} className="p-5 flex gap-4">
                {/* Image */}
                <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  {p.image
                    ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Vendedor: {p.vendor_email}</p>
                      {p.rejection_reason && (
                        <p className="text-xs text-red-500 mt-0.5">Motivo: {p.rejection_reason}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{fmtDate(p.created_at)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.category}</span>
                    <span className="text-xs text-gray-500">Precio: <strong>{fmtGs(p.price)}</strong></span>
                    <span className="text-xs text-gray-500">Stock: <strong>{p.stock}</strong></span>
                    {p.negotiable && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">Negociable</span>}
                    {p.sku && <span className="text-xs font-mono text-gray-400">{p.sku}</span>}
                  </div>

                  {p.description && (
                    <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{p.description}</p>
                  )}

                  {/* Actions — only for pending */}
                  {tab === 'pending_review' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => approve(p.id)}
                        disabled={acting === p.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {acting === p.id ? '…' : '✓ Aprobar'}
                      </button>
                      <button
                        onClick={() => openReject(p.id)}
                        disabled={acting === p.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        ✕ Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">Rechazar producto</h3>
            <p className="text-sm text-gray-500 mb-4">Indica el motivo del rechazo. El vendedor podrá verlo para corregir su publicación.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Ej: Las imágenes no cumplen los requisitos de calidad mínima."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
              rows={3}
              maxLength={300}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={confirmReject}
                disabled={!!acting}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {acting ? 'Rechazando…' : 'Confirmar rechazo'}
              </button>
              <button
                onClick={() => setRejectId(null)}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
