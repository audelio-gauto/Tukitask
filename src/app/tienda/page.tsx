'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from './cart-context';

/* ── Mock data ─────────────────────────────────────────────── */
const VENDORS = [
  { id: 'techpy',      name: 'TechPY Store',     category: 'Electrónica',  emoji: '💻', rating: 4.8, products: 12, open: true,  grad: 'linear-gradient(135deg,#1e3a5f,#0d2035)' },
  { id: 'modaexpress', name: 'Moda Express',      category: 'Ropa',         emoji: '👗', rating: 4.5, products: 38, open: true,  grad: 'linear-gradient(135deg,#3b1f5e,#1e0f35)' },
  { id: 'sabores',     name: 'Sabores del Sur',   category: 'Gastronomía',  emoji: '🍽️', rating: 4.9, products:  8, open: false, grad: 'linear-gradient(135deg,#5e2a0d,#351508)' },
  { id: 'hogarfeliz',  name: 'Hogar Feliz',       category: 'Hogar',        emoji: '🏠', rating: 4.3, products: 21, open: true,  grad: 'linear-gradient(135deg,#1a4a2a,#0d2515)' },
  { id: 'librosmundo', name: 'LibrosMundo',        category: 'Libros',       emoji: '📚', rating: 4.7, products: 55, open: true,  grad: 'linear-gradient(135deg,#4a1a1a,#250d0d)' },
];

const PRODUCTS = [
  { id: 'p1', vendorId: 'techpy',      vendorName: 'TechPY Store',   name: 'iPhone 15 128GB',          category: 'Electrónica', emoji: '📱', price: 5000000, floorPrice: 4200000, stock: 3  },
  { id: 'p2', vendorId: 'techpy',      vendorName: 'TechPY Store',   name: 'Auriculares Bluetooth Pro', category: 'Electrónica', emoji: '🎧', price:  350000, floorPrice:  280000, stock: 15 },
  { id: 'p3', vendorId: 'techpy',      vendorName: 'TechPY Store',   name: 'Laptop Gaming 16"',         category: 'Electrónica', emoji: '💻', price: 8500000, floorPrice: 7500000, stock: 2  },
  { id: 'p4', vendorId: 'modaexpress', vendorName: 'Moda Express',   name: 'Vestido Floral Verano',     category: 'Ropa',        emoji: '👗', price:  180000, floorPrice:  140000, stock: 8  },
  { id: 'p5', vendorId: 'modaexpress', vendorName: 'Moda Express',   name: 'Zapatillas Running',        category: 'Ropa',        emoji: '👟', price:  420000, floorPrice:  340000, stock: 5  },
  { id: 'p6', vendorId: 'sabores',     vendorName: 'Sabores del Sur',name: 'Empanadas x12 unidades',    category: 'Gastronomía', emoji: '🥟', price:   60000, floorPrice:   50000, stock: 20 },
  { id: 'p7', vendorId: 'hogarfeliz',  vendorName: 'Hogar Feliz',    name: 'Mesa de Madera Maciza',     category: 'Hogar',       emoji: '🪑', price:  800000, floorPrice:  650000, stock: 1  },
  { id: 'p8', vendorId: 'librosmundo', vendorName: 'LibrosMundo',    name: 'Set Paulo Coelho x5',       category: 'Libros',      emoji: '📚', price:  250000, floorPrice:  200000, stock: 10 },
];

const CATEGORIES = ['Todos', 'Electrónica', 'Ropa', 'Gastronomía', 'Hogar', 'Libros'];

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

/* ── Component ─────────────────────────────────────────────── */
function TiendaPageInner() {
  const searchParams  = useSearchParams();
  const urlQ          = searchParams.get('q') ?? '';
  const { addItem }   = useCart();
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const [search, setSearch]           = useState(urlQ);
  const [activeCategory, setCategory] = useState('Todos');
  const [heroSearch, setHeroSearch]   = useState(urlQ);

  /* sync URL → local state */
  useEffect(() => {
    setSearch(urlQ);
    setHeroSearch(urlQ);
  }, [urlQ]);

  const handleHeroSearch = () => {
    setSearch(heroSearch);
    const el = document.getElementById('productos-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

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

      {/* ── Hero ── */}
      <div className="tnd-hero">
        <div className="tnd-hero-eyebrow">🛒 TukiMarket</div>
        <h1 className="tnd-hero-title">
          Comprá, ofertá y <span>negociá</span><br />al mejor precio
        </h1>
        <p className="tnd-hero-sub">
          Miles de productos de vendedores verificados en Paraguay.<br />
          Hacé tu oferta — el vendedor responde al instante con el Robot Negociador.
        </p>
        <div className="tnd-hero-search">
          <input
            className="tnd-hero-input"
            placeholder="Buscar productos, tiendas o categorías..."
            value={heroSearch}
            onChange={e => setHeroSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleHeroSearch(); }}
          />
          <button className="tnd-hero-btn" onClick={handleHeroSearch}>Buscar</button>
        </div>
        <div className="tnd-hero-stats">
          <div>
            <div className="tnd-hero-stat-value">5</div>
            <div className="tnd-hero-stat-label">Tiendas activas</div>
          </div>
          <div>
            <div className="tnd-hero-stat-value">134</div>
            <div className="tnd-hero-stat-label">Productos</div>
          </div>
          <div>
            <div className="tnd-hero-stat-value">🤖</div>
            <div className="tnd-hero-stat-label">Robot Negociador</div>
          </div>
        </div>
      </div>

      {/* ── Tiendas destacadas ── */}
      <div>
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">🏪 Tiendas destacadas</h2>
        </div>
        <div className="tnd-stores-grid">
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
        </div>
      </div>

      {/* ── Productos ── */}
      <div id="productos-section">
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">📦 Productos</h2>
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
              onClick={() => { setSearch(''); setHeroSearch(''); }}
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
