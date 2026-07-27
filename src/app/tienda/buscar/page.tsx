'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { gs } from '../data';
import { useCart } from '../cart-context';
import type { DbProduct } from '@/types/market';

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

  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);
  const [loading, setLoading] = useState(false);

  /* Redirect if no query */
  useEffect(() => {
    if (!q) router.replace('/tienda');
  }, [q, router]);

  /* Fetch real products via API route (injection-safe, server-side) */
  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/tienda/products?q=${encodeURIComponent(q)}&limit=60`,
          { signal: controller.signal },
        );
        const { products } = await res.json();
        setDbProducts(products ?? []);
      } catch {
        // aborted or network error
      } finally {
        setLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [q]);

  /* Derive unique vendor store cards from product results (hidden — kept for future use) */
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

      {/* ── Tiendas encontradas — oculto por decisión de producto ── */}

      {/* ── Products grid ──────────────────────────────────── */}
      {filteredProducts.length > 0 ? (
        <section className="tnd-buscar-section">
          <h2 className="tnd-buscar-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Productos
          </h2>
          <div className="tnd-buscar-grid">
            {filteredProducts.map(p => {
              const isNegotiable = p.floor_price > 0 && p.floor_price < p.price * 0.92;
              const isAdded = added[p.id];
              return (
                <div key={p.id} className="tnd-buscar-product-card">
                  {isNegotiable && <span className="tnd-buscar-product-disc">🤝 Neg.</span>}
                  <Link href={`/tienda/producto/${p.id}`} className="tnd-buscar-product-img-link">
                    <div className="tnd-buscar-product-img">
                      {p.image
                        ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span>📦</span>
                      }
                    </div>
                  </Link>
                  <div className="tnd-buscar-product-body">
                    <p className="tnd-buscar-product-vendor">{p.vendor_email?.split('@')[0] || 'Tienda'}</p>
                    <Link href={`/tienda/producto/${p.id}`} className="tnd-buscar-product-name-link">
                      <h3 className="tnd-buscar-product-name">{p.name}</h3>
                    </Link>
                    <div className="tnd-buscar-product-prices">
                      <span className="tnd-buscar-product-price">{gs(p.price)}</span>
                      {isNegotiable && (
                        <span className="tnd-buscar-product-orig">Precio negociable</span>
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
