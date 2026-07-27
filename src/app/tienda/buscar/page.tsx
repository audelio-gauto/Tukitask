'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { gs } from '../data';
import { useCart } from '../cart-context';
import { supabase } from '@/lib/supabaseClient';

/* ── Loader ──────────────────────────────────────────────── */
function Spinner() {
  return (
    <div className="tnd-buscar-loader" aria-label="Cargando resultados">
      <div className="tnd-buscar-spinner" />
    </div>
  );
}

/* ── Inner component (uses useSearchParams) ────────────────── */
function BuscarInner() {
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const q             = (searchParams.get('q') ?? '').trim();
  const { addItem }   = useCart();
  const [cat, setCat] = useState('Todos');
  const [added, setAdded] = useState<Record<string, boolean>>({});

  type DbProduct = {
    id: string; vendor_id: string; vendor_email: string; name: string;
    category: string; price: number; floor_price: number; stock: number; image: string | null;
  };
  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);
  const [storeConfigs, setStoreConfigs] = useState<Map<string, Record<string, unknown>>>(new Map());
  const [loading, setLoading] = useState(false);

  /* Redirect if no query */
  useEffect(() => {
    if (!q) router.replace('/tienda');
  }, [q, router]);

  /* Fetch real products from Supabase */
  useEffect(() => {
    if (!q) return;
    const run = async () => {
      setLoading(true);
      const { data: prods } = await supabase.from('products')
        .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image')
        .eq('status', 'published')
        .or(`name.ilike.%${q}%,category.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(60);
      const results = prods ?? [];
      setDbProducts(results);
      // Fetch store configs for display in vendor cards
      const vendorIds = [...new Set(results.map(p => p.vendor_id))];
      if (vendorIds.length > 0) {
        const { data: configs } = await supabase.from('store_configs')
          .select('vendor_id, config').in('vendor_id', vendorIds);
        setStoreConfigs(new Map(
          (configs ?? []).map(c => [c.vendor_id, c.config as Record<string, unknown>])
        ));
      }
      setLoading(false);
    };
    run();
  }, [q]);

  /* Derive unique vendor store cards from product results */
  const matchedVendors = [...new Map(dbProducts.map(p => [p.vendor_id, p])).values()].map(p => {
    const cfg = storeConfigs.get(p.vendor_id);
    return {
      id: p.vendor_id,
      name: (cfg?.storeName as string) || (p.vendor_email?.split('@')[0] || 'Tienda'),
      emoji: (cfg?.logoEmoji as string) || '🏪',
      grad: `linear-gradient(135deg, ${(cfg?.heroGrad1 as string) || '#1e3a5f'} 0%, ${(cfg?.heroGrad2 as string) || '#0d2035'} 100%)`,
      category: ((cfg?.categories as string[]))?.[1] || 'General',
    };
  });

  const filteredProducts = dbProducts.filter(p =>
    cat === 'Todos' || p.category === cat
  );

  const handleAdd = (productId: string) => {
    const p = dbProducts.find(x => x.id === productId);
    if (!p) return;
    addItem({ id: p.id, name: p.name, price: p.price, emoji: '📦', image: p.image, vendorName: p.vendor_email, vendorId: p.vendor_id, vendorEmail: p.vendor_email });
    setAdded(prev => ({ ...prev, [productId]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [productId]: false })), 1400);
  };

  /* Available categories from results */
  const availableCats = ['Todos', ...Array.from(new Set(dbProducts.map(p => p.category).filter(Boolean)))];

  if (!q) return null;
  if (loading) return <Spinner />;

  return (
    <div className="tnd-buscar-page">

      {/* ── Breadcrumb ─────────────────────────────────────── */}
      <nav className="tnd-buscar-breadcrumb" aria-label="Navegación">
        <Link href="/tienda" className="tnd-buscar-bc-link">TukiMarket</Link>
        <span className="tnd-buscar-bc-sep">›</span>
        <span className="tnd-buscar-bc-cur">Resultados para &ldquo;{q}&rdquo;</span>
      </nav>

      {/* ── Result header ──────────────────────────────────── */}
      <div className="tnd-buscar-header">
        <h1 className="tnd-buscar-title">
          <strong className="tnd-buscar-count">{filteredProducts.length}</strong>
          &nbsp;resultado{filteredProducts.length !== 1 ? 's' : ''} para&nbsp;
          <em className="tnd-buscar-query">&ldquo;{q}&rdquo;</em>
        </h1>
      </div>

      {/* ── Category chips ─────────────────────────────────── */}
      {availableCats.length > 1 && (
        <div className="tnd-buscar-cats" role="group" aria-label="Filtrar por categoría">
          {availableCats.map(c => (
            <button
              key={c}
              className={`tnd-buscar-cat${cat === c ? ' tnd-buscar-cat--active' : ''}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* ── Tiendas encontradas ────────────────────────────── */}
      {matchedVendors.length > 0 && cat === 'Todos' && (
        <section className="tnd-buscar-section">
          <h2 className="tnd-buscar-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
            Tiendas
          </h2>
          <div className="tnd-buscar-vendors">
            {matchedVendors.map(v => (
              <Link key={v.id} href={`/tienda/${v.id}`} className="tnd-buscar-vendor-card" style={{ background: v.grad }}>
                <span className="tnd-buscar-vendor-emoji">{v.emoji}</span>
                <div className="tnd-buscar-vendor-info">
                  <span className="tnd-buscar-vendor-name">{v.name}</span>
                  <span className="tnd-buscar-vendor-cat">{v.category}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Products grid ──────────────────────────────────── */}
      {filteredProducts.length > 0 ? (
        <section className="tnd-buscar-section">
          <h2 className="tnd-buscar-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Productos
          </h2>
          <div className="tnd-buscar-grid">
            {filteredProducts.map(p => {
              const disc = p.price > 0 ? Math.round((1 - p.floor_price / p.price) * 100) : 0;
              const isAdded = added[p.id];
              return (
                <div key={p.id} className="tnd-buscar-product-card">
                  {disc > 0 && <span className="tnd-buscar-product-disc">-{disc}%</span>}
                  <div className="tnd-buscar-product-img">
                    {p.image
                      ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span>📦</span>
                    }
                  </div>
                  <div className="tnd-buscar-product-body">
                    <p className="tnd-buscar-product-vendor">{p.vendor_email}</p>
                    <h3 className="tnd-buscar-product-name">{p.name}</h3>
                    <div className="tnd-buscar-product-prices">
                      <span className="tnd-buscar-product-price">{gs(p.price)}</span>
                      {p.floor_price < p.price && (
                        <span className="tnd-buscar-product-orig">Oferta desde {gs(p.floor_price)}</span>
                      )}
                    </div>
                    {p.stock <= 3 && p.stock > 0 && (
                      <p className="tnd-buscar-product-stock">¡Últimas {p.stock} unidades!</p>
                    )}
                    <button
                      className={`tnd-buscar-add-btn${isAdded ? ' tnd-buscar-add-btn--added' : ''}`}
                      onClick={() => handleAdd(p.id)}
                      disabled={p.stock === 0}
                    >
                      {isAdded ? '✓ Agregado' : p.stock === 0 ? 'Sin stock' : '+ Agregar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        /* ── Empty state ──────────────────────────────────── */
        <div className="tnd-buscar-empty">
          <div className="tnd-buscar-empty-icon">🔍</div>
          <h2 className="tnd-buscar-empty-title">Sin resultados para &ldquo;{q}&rdquo;</h2>
          <p className="tnd-buscar-empty-sub">
            Revisá la ortografía o intentá con términos más generales.
          </p>
          <Link href="/tienda" className="tnd-buscar-back-btn">
            ← Ver todo el catálogo
          </Link>
        </div>
      )}
    </div>
  );
}

/* ── Page export wrapped in Suspense ──────────────────────── */
export default function BuscarPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BuscarInner />
    </Suspense>
  );
}
