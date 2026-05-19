'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from './cart-context';
import { VENDORS, PRODUCTS, CATEGORIES, gs } from './data';

/* ── Component ─────────────────────────────────────────────── */
function TiendaPageInner() {
  const searchParams  = useSearchParams();
  const urlQ          = searchParams.get('q') ?? '';
  const { addItem }   = useCart();
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const [search, setSearch]           = useState(urlQ);
  const [activeCategory, setCategory] = useState('Todos');
  const storesRef   = useRef<HTMLDivElement>(null);
  const featuredRef = useRef<HTMLDivElement>(null);

  /* sync URL → local state */
  useEffect(() => {
    setSearch(urlQ);
  }, [urlQ]);

  /* auto-scroll carousels */
  useEffect(() => {
    const advance = (el: HTMLDivElement | null) => {
      if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: 220, behavior: 'smooth' });
      }
    };
    const sEl = storesRef.current;
    const fEl = featuredRef.current;
    let t1: ReturnType<typeof setInterval>;
    let t2: ReturnType<typeof setInterval>;
    const startS = () => { t1 = setInterval(() => advance(sEl), 3200); };
    const stopS  = () => clearInterval(t1);
    const startF = () => { t2 = setInterval(() => advance(fEl), 2800); };
    const stopF  = () => clearInterval(t2);
    startS(); startF();
    sEl?.addEventListener('mouseenter', stopS);
    sEl?.addEventListener('mouseleave', startS);
    sEl?.addEventListener('touchstart',  stopS,  { passive: true });
    sEl?.addEventListener('touchend',    startS, { passive: true });
    fEl?.addEventListener('mouseenter', stopF);
    fEl?.addEventListener('mouseleave', startF);
    fEl?.addEventListener('touchstart',  stopF,  { passive: true });
    fEl?.addEventListener('touchend',    startF, { passive: true });
    return () => {
      clearInterval(t1); clearInterval(t2);
      sEl?.removeEventListener('mouseenter', stopS);
      sEl?.removeEventListener('mouseleave', startS);
      sEl?.removeEventListener('touchstart', stopS);
      sEl?.removeEventListener('touchend',   startS);
      fEl?.removeEventListener('mouseenter', stopF);
      fEl?.removeEventListener('mouseleave', startF);
      fEl?.removeEventListener('touchstart', stopF);
      fEl?.removeEventListener('touchend',   startF);
    };
  }, []);

  const handleAddToCart = (p: typeof PRODUCTS[0]) => {
    addItem({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, vendorName: p.vendorName });
    setAdded(prev => ({ ...prev, [p.id]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [p.id]: false })), 1800);
  };

  const filtered = PRODUCTS.filter(p => {
    const matchCat    = activeCategory === 'Todos' || p.category === activeCategory;
    const q           = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.vendorName.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="tnd-page">

      {/* ── Tiendas destacadas (carousel) ── */}
      <div>
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">🏪 Tiendas destacadas</h2>
        </div>
        <div className="tnd-carousel-wrap">
          <button className="tnd-carousel-btn tnd-carousel-prev" onClick={() => storesRef.current?.scrollBy({ left: -240, behavior: 'smooth' })} aria-label="Anterior">&#8249;</button>
          <div className="tnd-stores-carousel" ref={storesRef}>
            {VENDORS.map(v => (
              <Link key={v.id} href={`/tienda/${v.id}`} className="tnd-store-card">
                <div className="tnd-store-banner" style={{ background: v.grad }}>
                  <div className="tnd-store-logo-wrap">
                    <div className="tnd-store-logo">{v.emoji}</div>
                  </div>
                </div>
                <div className="tnd-store-body">
                  <div className="tnd-store-name">{v.name}</div>
                  <div className="tnd-store-cat">{v.category}</div>
                  <div className="tnd-store-meta">
                    <span className="tnd-store-rating">⭐ {v.rating}</span>
                    <span className="tnd-store-prod">{v.products} productos</span>
                  </div>
                  {v.open
                    ? <div className="tnd-store-open"><span className="tnd-store-dot" />Abierto ahora</div>
                    : <div className="tnd-store-open tnd-store-closed">Cerrado</div>
                  }
                </div>
              </Link>
            ))}
          </div>          <button className="tnd-carousel-btn tnd-carousel-next" onClick={() => storesRef.current?.scrollBy({ left: 240, behavior: 'smooth' })} aria-label="Siguiente">&#8250;</button>        </div>
      </div>

      {/* ── Productos más vendidos (carousel) ── */}
      <div>
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">🔥 Productos más vendidos</h2>
        </div>
        <div className="tnd-carousel-wrap">
          <button className="tnd-carousel-btn tnd-carousel-prev" onClick={() => featuredRef.current?.scrollBy({ left: -240, behavior: 'smooth' })} aria-label="Anterior">&#8249;</button>
          <div className="tnd-featured-carousel" ref={featuredRef}>
            {PRODUCTS.map(p => (
              <div key={p.id} className="tnd-product-card tnd-featured-card">
                <Link href={`/tienda/producto/${p.id}`} style={{ textDecoration: 'none', display: 'contents' }}>
                  <div
                    className="tnd-product-img"
                    style={{ background: 'linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))' }}
                  >
                    {p.emoji}
                    {p.floorPrice < p.price * 0.92 && (
                      <span className="tnd-negoable-badge">🤝 Neg.</span>
                    )}
                  </div>
                </Link>
                <div className="tnd-product-body">
                  <div className="tnd-product-store">{p.vendorName}</div>
                  <div className="tnd-product-name">{p.name}</div>
                  <div className="tnd-product-price">{gs(p.price)}</div>
                  <button
                    className={`tnd-product-action${added[p.id] ? ' tnd-added' : ''}`}
                    onClick={() => handleAddToCart(p)}
                  >
                    {added[p.id] ? '✓ Agregado' : 'Agregar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="tnd-carousel-btn tnd-carousel-next" onClick={() => featuredRef.current?.scrollBy({ left: 240, behavior: 'smooth' })} aria-label="Siguiente">&#8250;</button>
        </div>
      </div>

      {/* ── Productos ── */}
      <div id="productos-section">
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">📦 Explorar todos los productos</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--tnd-text-muted)' }}>
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Category filter */}
        <div className="tnd-cats">
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`tnd-cat${activeCategory === c ? ' active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Search bar */}
        {search && (
          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--tnd-text-muted)' }}>
              Buscando: <strong style={{ color: 'var(--tnd-text-primary)' }}>&quot;{search}&quot;</strong>
            </span>
            <button
              onClick={() => { setSearch(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tnd-accent)', fontSize: '0.78rem', fontWeight: 700 }}
            >
              ✕ Limpiar
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="tnd-empty">
            <div className="tnd-empty-icon">🔍</div>
            <div className="tnd-empty-title">No se encontraron productos</div>
            <div className="tnd-empty-sub">Probá con otra búsqueda o categoría</div>
          </div>
        ) : (
          <div className="tnd-products-grid">
            {filtered.map(p => (
              <Link key={p.id} href={`/tienda/producto/${p.id}`} className="tnd-product-card">
                <div
                  className="tnd-product-img"
                  style={{ background: `linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))` }}
                >
                  {p.emoji}
                  {p.floorPrice < p.price * 0.92 && (
                    <span className="tnd-negoable-badge">🤝 Negociable</span>
                  )}
                </div>
                <div className="tnd-product-body">
                  <div className="tnd-product-store">{p.vendorName}</div>
                  <div className="tnd-product-name">{p.name}</div>
                  <div className="tnd-product-price">{gs(p.price)}</div>
                  <div className="tnd-product-floor">Ofertá desde {gs(p.floorPrice)}</div>
                  <div className="tnd-product-card-actions">
                    <Link href={`/tienda/producto/${p.id}`} className="tnd-product-action">Ver y ofertar</Link>
                    <button
                      className={`tnd-add-cart-btn${added[p.id] ? ' added' : ''}`}
                      onClick={e => { e.preventDefault(); handleAddToCart(p); }}
                      aria-label="Agregar al carrito"
                    >
                      {added[p.id]
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

export default function TiendaPage() {
  return (
    <Suspense>
      <TiendaPageInner />
    </Suspense>
  );
}
