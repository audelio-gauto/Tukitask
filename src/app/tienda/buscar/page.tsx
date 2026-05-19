'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PRODUCTS, VENDORS, CATEGORIES, gs } from '../data';
import { useCart } from '../cart-context';

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

  /* Reset category filter when query changes */
  useEffect(() => { setCat('Todos'); }, [q]);

  /* Redirect if no query */
  useEffect(() => {
    if (!q) router.replace('/tienda');
  }, [q, router]);

  const filteredProducts = PRODUCTS.filter(p => {
    const matchQ = !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.vendorName.toLowerCase().includes(q.toLowerCase()) ||
      p.category.toLowerCase().includes(q.toLowerCase());
    const matchCat = cat === 'Todos' || p.category === cat;
    return matchQ && matchCat;
  });

  const matchedVendors = VENDORS.filter(v =>
    !q ||
    v.name.toLowerCase().includes(q.toLowerCase()) ||
    v.category.toLowerCase().includes(q.toLowerCase())
  );

  const handleAdd = (productId: string) => {
    const p = PRODUCTS.find(x => x.id === productId);
    if (!p) return;
    addItem({ id: p.id, name: p.name, price: p.floorPrice, emoji: p.emoji, vendorName: p.vendorName });
    setAdded(prev => ({ ...prev, [productId]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [productId]: false })), 1400);
  };

  /* Available categories for filter (based on all results for this q) */
  const availableCats = ['Todos', ...CATEGORIES.slice(1).filter(c =>
    PRODUCTS.some(p => p.category === c && (
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.vendorName.toLowerCase().includes(q.toLowerCase()) ||
      p.category.toLowerCase().includes(q.toLowerCase())
    ))
  )];

  if (!q) return null;

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
                  <span className="tnd-buscar-vendor-rating">★ {v.rating}</span>
                </div>
                {v.open
                  ? <span className="tnd-buscar-vendor-badge tnd-buscar-vendor-badge--open">Abierto</span>
                  : <span className="tnd-buscar-vendor-badge tnd-buscar-vendor-badge--closed">Cerrado</span>
                }
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
              const disc = Math.round((1 - p.floorPrice / p.price) * 100);
              const isAdded = added[p.id];
              return (
                <div key={p.id} className="tnd-buscar-product-card">
                  {disc > 0 && <span className="tnd-buscar-product-disc">-{disc}%</span>}
                  <div className="tnd-buscar-product-img">
                    <span>{p.emoji}</span>
                  </div>
                  <div className="tnd-buscar-product-body">
                    <p className="tnd-buscar-product-vendor">{p.vendorName}</p>
                    <h3 className="tnd-buscar-product-name">{p.name}</h3>
                    <div className="tnd-buscar-product-prices">
                      <span className="tnd-buscar-product-price">{gs(p.floorPrice)}</span>
                      {p.floorPrice < p.price && (
                        <span className="tnd-buscar-product-orig">{gs(p.price)}</span>
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
          <div className="tnd-buscar-empty-suggestions">
            <p>Categorías populares:</p>
            <div className="tnd-buscar-cats" style={{ justifyContent: 'center', marginTop: 8 }}>
              {CATEGORIES.slice(1).map(c => (
                <Link key={c} href={`/tienda/buscar?q=${encodeURIComponent(c)}`} className="tnd-buscar-cat">
                  {c}
                </Link>
              ))}
            </div>
          </div>
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
