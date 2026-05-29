'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from './cart-context';
import { authFetch } from '@/lib/authFetch';
import { gs } from './data';
import { supabase } from '@/lib/supabaseClient';

/* ── Component ─────────────────────────────────────────────── */
function TiendaPageInner() {
  const searchParams  = useSearchParams();
  const urlQ          = searchParams.get('q') ?? '';
  const { addItem }   = useCart();
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const [search, setSearch]           = useState(urlQ);
  const [activeCategory, setCategory] = useState('Todos');
  const storesRef    = useRef<HTMLDivElement>(null);
  const featuredRef  = useRef<HTMLDivElement>(null);
  const offersRef    = useRef<HTMLDivElement>(null);

  type MarketNegotiation = {
    id: string;
    vendor_id: string;
    vendor_email: string | null;
    product_id: string | null;
    product_name: string | null;
    product_image: string | null;
    buyer_offer: number;
    counter_amount: number | null;
    final_amount: number | null;
    quantity: number;
    status: 'countered' | 'accepted_pending_payment';
    bot_message: string | null;
    expires_at: string | null;
  };

  const [realVendors, setRealVendors] = useState<Array<{
    id: string; name: string; emoji: string; grad: string; category: string; productCount: number;
    logoImage?: string; coverImage?: string;
  }>>([]); 

  // vendor_id → display name (storeName or email prefix)
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});

  const [dbProducts, setDbProducts] = useState<Array<{
    id: string; vendor_id: string; vendor_email: string; name: string;
    category: string; price: number; floor_price: number; stock: number;
    image: string | null; negotiable: boolean;
  }>>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorBotEnabledMap, setVendorBotEnabledMap] = useState<Record<string, boolean>>({});
  const [myOffers, setMyOffers] = useState<MarketNegotiation[]>([]);

  /* fetch real published products */
  useEffect(() => {
    setProductsLoading(true);
    supabase.from('products')
      .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image, negotiable')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setDbProducts(data);
        setProductsLoading(false);
      }, () => {
        setProductsLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) setMyOffers([]);
        return;
      }
      try {
        const res = await authFetch('/api/tukibot/negotiations?role=buyer&status=all&limit=12');
        const data = await res.json();
        if (!cancelled && res.ok) setMyOffers(data.items ?? []);
      } catch {
        if (!cancelled) setMyOffers([]);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const vendorIds = Array.from(new Set(dbProducts.map((p) => p.vendor_id))).filter(Boolean);
    if (vendorIds.length === 0) return;

    const controller = new AbortController();
    fetch(`/api/tienda/vendor-bot-config?vendorIds=${encodeURIComponent(vendorIds.join(','))}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, boolean> = {};
        const configs = data?.configs || {};
        vendorIds.forEach((id) => {
          map[id] = configs[id]?.botEnabled !== false;
        });
        setVendorBotEnabledMap(map);
      })
      .catch(() => {
        setVendorBotEnabledMap({});
      });

    return () => controller.abort();
  }, [dbProducts]);

  /* fetch real vendors with published products */
  useEffect(() => {
    const fetchVendors = async () => {
      setVendorsLoading(true);
      // Derive vendors directly from published products — no dependency on users.role
      const { data: prods } = await supabase
        .from('products')
        .select('vendor_id, vendor_email')
        .eq('status', 'published');
      if (!prods?.length) {
        setVendorsLoading(false);
        return;
      }

      const countMap: Record<string, number> = {};
      const emailMap: Record<string, string> = {};
      prods.forEach(p => {
        countMap[p.vendor_id] = (countMap[p.vendor_id] || 0) + 1;
        emailMap[p.vendor_id] = p.vendor_email;
      });
      const ids = Object.keys(countMap);

      // Enrich with store_configs if table exists (graceful fallback)
      let cfgMap = new Map<string, Record<string, unknown>>();
      const { data: configs } = await supabase
        .from('store_configs').select('vendor_id, config').in('vendor_id', ids);
      if (configs) cfgMap = new Map(configs.map(c => [c.vendor_id, c.config as Record<string, unknown>]));

      // Build display-name map for use in product cards too
      const nameMap: Record<string, string> = {};
      ids.forEach(id => {
        const cfg = cfgMap.get(id);
        nameMap[id] = (cfg?.storeName as string) || emailMap[id].split('@')[0];
      });
      setVendorNames(nameMap);

      setRealVendors(
        ids.map(id => {
          const cfg = cfgMap.get(id);
          return {
            id,
            name: nameMap[id],
            emoji: (cfg?.logoEmoji as string) || '🏪',
            grad: `linear-gradient(135deg, ${(cfg?.heroGrad1 as string) || '#1e3a5f'} 0%, ${(cfg?.heroGrad2 as string) || '#0d2035'} 100%)`,
            category: ((cfg?.categories as string[]))?.[1] || 'General',
            productCount: countMap[id] ?? 0,
            logoImage: (cfg?.logoImage as string) || undefined,
            coverImage: (cfg?.heroCoverImage as string) || undefined,
          };
        })
      );
      setVendorsLoading(false);
    };
    fetchVendors().catch(() => setVendorsLoading(false));
  }, []);

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

  interface DisplayProduct {
    id: string; vendorName: string; vendorId: string; vendorEmail: string; name: string; category: string;
    emoji: string; image?: string | null; price: number; floorPrice: number; stock: number;
  }

  const allProducts: DisplayProduct[] = dbProducts.map(p => ({
    id: p.id, vendorName: vendorNames[p.vendor_id] || p.vendor_email.split('@')[0],
    vendorId: p.vendor_id, vendorEmail: p.vendor_email,
    name: p.name, category: p.category,
    emoji: '📦', image: p.image, price: p.price, floorPrice: p.floor_price, stock: p.stock,
  }));

  const allCategories = ['Todos', ...Array.from(new Set(dbProducts.map(p => p.category).filter(Boolean)))];

  const handleAddToCart = (p: DisplayProduct) => {
    addItem({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, image: p.image, vendorName: p.vendorName, vendorId: p.vendorId, vendorEmail: p.vendorEmail });
    setAdded(prev => ({ ...prev, [p.id]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [p.id]: false })), 1800);
  };

  const filtered = allProducts.filter(p => {
    const matchCat    = activeCategory === 'Todos' || p.category === activeCategory;
    const q           = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.vendorName.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="tnd-page">

      {myOffers.length > 0 && (
        <div>
          <div className="tnd-section-head">
            <div>
              <h2 className="tnd-section-title">💬 Mis ofertas</h2>
              <p className="tnd-offers-subtitle">Retomá tus negociaciones activas y pagos pendientes.</p>
            </div>
            <Link href="/tienda/mis-ofertas" className="tnd-section-link">Ver todos</Link>
          </div>
          <div className="tnd-carousel-wrap">
            <button className="tnd-carousel-btn tnd-carousel-prev" onClick={() => offersRef.current?.scrollBy({ left: -260, behavior: 'smooth' })} aria-label="Anterior">&#8249;</button>
            <div className="tnd-offers-carousel" ref={offersRef}>
              {myOffers.map((offer) => {
                const actionHref = offer.status === 'accepted_pending_payment' && offer.product_id
                  ? `/tienda/checkout?product=${offer.product_id}&qty=${offer.quantity}&name=${encodeURIComponent(offer.product_name || '')}&vendor=${encodeURIComponent(offer.vendor_email || '')}&vid=${offer.vendor_id}&price=${offer.final_amount ?? offer.counter_amount ?? offer.buyer_offer}&negotiationId=${offer.id}`
                  : '/tienda/mis-ofertas';

                return (
                  <Link key={offer.id} href={actionHref} className="tnd-offer-card-link">
                    <article className="tnd-market-offer-card">
                      <div className="tnd-market-offer-media">
                        {offer.product_image ? <img src={offer.product_image} alt={offer.product_name || 'Oferta'} /> : <span>🛍️</span>}
                        <span className={`tnd-market-offer-status tnd-market-offer-status-${offer.status}`}>
                          {offer.status === 'countered' ? 'Esperando tu decisión' : 'Lista para pagar'}
                        </span>
                      </div>
                      <div className="tnd-market-offer-body">
                        <div className="tnd-market-offer-title">{offer.product_name || 'Producto'}</div>
                        <div className="tnd-market-offer-vendor">{offer.vendor_email?.split('@')[0] || 'Tienda'}</div>
                        <div className="tnd-market-offer-prices">
                          <span>Tu oferta: {gs(offer.buyer_offer)}</span>
                          <strong>{offer.status === 'accepted_pending_payment' ? `Pagar ${gs(offer.final_amount ?? offer.counter_amount ?? offer.buyer_offer)}` : `Contraoferta ${gs(offer.counter_amount ?? offer.buyer_offer)}`}</strong>
                        </div>
                        <div className="tnd-market-offer-expiry">{offer.expires_at ? `Expira ${new Date(offer.expires_at).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Sin vencimiento'}</div>
                        <div className="tnd-market-offer-cta">{offer.status === 'accepted_pending_payment' ? 'Proceder al pago' : 'Ver oferta'}</div>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
            <button className="tnd-carousel-btn tnd-carousel-next" onClick={() => offersRef.current?.scrollBy({ left: 260, behavior: 'smooth' })} aria-label="Siguiente">&#8250;</button>
          </div>
        </div>
      )}

      {/* ── Tiendas destacadas (carousel) ── */}
      <div>
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">🏪 Tiendas destacadas</h2>
        </div>
        <div className="tnd-carousel-wrap">
          <button className="tnd-carousel-btn tnd-carousel-prev" onClick={() => storesRef.current?.scrollBy({ left: -240, behavior: 'smooth' })} aria-label="Anterior">&#8249;</button>
          <div className="tnd-stores-carousel" ref={storesRef}>
            {vendorsLoading && (
              <div style={{ padding: '2rem 1rem', color: 'var(--tnd-text-muted)', fontSize: '0.85rem' }}>
                Cargando tiendas...
              </div>
            )}
            {!vendorsLoading && realVendors.length === 0 && (
              <div style={{ padding: '2rem 1rem', color: 'var(--tnd-text-muted)', fontSize: '0.85rem' }}>
                No hay tiendas disponibles aún.
              </div>
            )}
            {realVendors.map(v => (
              <Link key={v.id} href={`/tienda/${v.id}`} className="tnd-store-card">
                <div className="tnd-store-banner" style={v.coverImage ? { backgroundImage: `url(${v.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: v.grad }}>
                  <div className="tnd-store-logo-wrap">
                    <div className="tnd-store-logo">
                      {v.logoImage
                        ? <img src={v.logoImage} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                        : v.emoji}
                    </div>
                  </div>
                </div>
                <div className="tnd-store-body">
                  <div className="tnd-store-name">{v.name}</div>
                  <div className="tnd-store-cat">{v.category}</div>
                  <div className="tnd-store-meta">
                    <span className="tnd-store-prod">{v.productCount} productos</span>
                  </div>
                  <div className="tnd-store-open"><span className="tnd-store-dot" />Activo</div>
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
            {allProducts.map(p => (
              <div key={p.id} className="tnd-product-card tnd-featured-card">
                <Link href={`/tienda/producto/${p.id}`} style={{ textDecoration: 'none', display: 'contents' }}>
                  <div
                    className="tnd-product-img"
                    style={{ background: 'linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))' }}
                  >
                    {p.image
                      ? <img src={p.image} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : p.emoji
                    }
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
          {allCategories.map(c => (
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

        {productsLoading ? (
          <div className="tnd-empty">
            <div className="tnd-empty-icon">⏳</div>
            <div className="tnd-empty-title">Cargando productos</div>
            <div className="tnd-empty-sub">Un momento por favor...</div>
          </div>
        ) : filtered.length === 0 ? (
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
                  {p.image
                    ? <img src={p.image} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    : p.emoji
                  }
                  {p.floorPrice < p.price * 0.92 && vendorBotEnabledMap[p.vendorId] !== false && (
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
