'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type RatingRow = {
  score: number;
  comment?: string;
  rated_email: string;
  rater_email: string;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  vendor_email: string;
};

export default function ValoracionesProductosPage() {
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [ratingsRes, productsRes] = await Promise.all([
          supabase
            .from('ratings')
            .select('score, comment, rated_email, rater_email, created_at')
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('products')
            .select('id, name, vendor_email')
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(300),
        ]);

        if (ratingsRes.error) throw ratingsRes.error;
        if (productsRes.error) throw productsRes.error;

        setRatings((ratingsRes.data as RatingRow[]) || []);
        setProducts((productsRes.data as ProductRow[]) || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const vendorEmails = useMemo(() => new Set(products.map(p => p.vendor_email)), [products]);
  const vendorRatings = useMemo(
    () => ratings.filter(r => vendorEmails.has(r.rated_email)),
    [ratings, vendorEmails],
  );

  const avg = useMemo(() => {
    if (!vendorRatings.length) return 0;
    return Number((vendorRatings.reduce((acc, r) => acc + r.score, 0) / vendorRatings.length).toFixed(2));
  }, [vendorRatings]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/admin/vendors" className="hover:text-gray-600 transition-colors">Vendedores</Link>
          <span>/</span>
          <Link href="/admin/vendors/productos" className="hover:text-gray-600 transition-colors">Productos</Link>
          <span>/</span>
          <span className="text-gray-600 font-medium">Valoraciones</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Valoraciones de Tienda y Cliente</h1>
        <p className="text-gray-500 text-sm mt-0.5">Vista de valoraciones relacionadas a vendedores con productos activos.</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{vendorRatings.length}</p>
          <p className="text-xs text-gray-500">Valoraciones a vendedores</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{avg}</p>
          <p className="text-xs text-gray-500">Promedio</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{vendorEmails.size}</p>
          <p className="text-xs text-gray-500">Tiendas con productos</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : vendorRatings.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No hay valoraciones relacionadas a tiendas.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {vendorRatings.map((r, idx) => (
              <div key={`${r.rated_email}-${r.created_at}-${idx}`} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">Tienda: {r.rated_email}</p>
                    <p className="text-xs text-gray-400 truncate">Cliente: {r.rater_email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-amber-600">★ {r.score}</p>
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString('es-PY')}</p>
                  </div>
                </div>
                {r.comment && <p className="text-sm text-gray-600 mt-2">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
