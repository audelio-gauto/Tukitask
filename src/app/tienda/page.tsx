'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from './cart-context';
import { authFetch } from '@/lib/authFetch';
import { gs } from './data';
import { supabase } from '@/lib/supabaseClient';
import type { DbProduct } from '@/types/market';

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
    message_count: number;
  };

  type NegotiationMessage = {
    id: string;
    sender_role: 'buyer' | 'vendor' | 'system';
    sender_name: string | null;
    message: string;
    created_at: string;
  };

  const [realVendors, setRealVendors] = useState<Array<{
    id: string; name: string; emoji: string; grad: string; category: string; productCount: number;
    logoImage?: string; coverImage?: string;
  }>>([]); 

  // vendor_id → display name (storeName or email prefix)
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});

  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorBotEnabledMap, setVendorBotEnabledMap] = useState<Record<string, boolean>>({});
  const [blockedVendorIds, setBlockedVendorIds] = useState<Set<string>>(new Set());
  const [myOffers, setMyOffers] = useState<MarketNegotiation[]>([]);
  const [chatOffer, setChatOffer] = useState<MarketNegotiation | null>(null);
  const [chatMessages, setChatMessages] = useState<NegotiationMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  async function openOfferChat(offer: MarketNegotiation) {
    setChatOffer(offer);
    setMyOffers((prev) => prev.map((o) => o.id === offer.id ? { ...o, message_count: 0 } : o));
    setChatMessages([]);
    setChatDraft('');
    setChatLoading(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${offer.id}/messages`);
      const data = await res.json();
      if (res.ok) setChatMessages(data.items ?? []);
    } finally {
      setChatLoading(false);
    }
  }

  async function sendOfferChat() {
    if (!chatOffer || !chatDraft.trim()) return;
    setChatSending(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${chatOffer.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: chatDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el mensaje');
      setChatDraft('');

      const msgRes = await authFetch(`/api/tukibot/negotiations/${chatOffer.id}/messages`);
      const msgData = await msgRes.json();
      if (msgRes.ok) {
        const rows = msgData.items ?? [];
        setChatMessages(rows);
        setMyOffers((prev) => prev.map((o) => o.id === chatOffer.id ? { ...o, message_count: 0 } : o));
      }
    } finally {
      setChatSending(false);
    }
  }

  /* fetch real published products */
  useEffect(() => {
    setProductsLoading(true);
    fetch('/api/tienda/products?limit=100')
      .then(r => r.json())
      .then(({ products }) => {
        if (products) setDbProducts(products);
        setProductsLoading(false);
      })
      .catch(() => setProductsLoading(false));
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
        if (!cancelled && res.ok) {
          const now = Date.now();
          setMyOffers((data.items ?? []).filter((o: MarketNegotiation) => !o.expires_at || new Date(o.expires_at).getTime() > now));
        }
      } catch {
        if (!cancelled) setMyOffers([]);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const vendorIds = Array.from(new Set(dbProducts.map((p) => p.vendor_id))).filter(Boolean);
    if (vendorIds.length === 0) {
      setBlockedVendorIds(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(
      vendorIds.map(async (id) => {
        try {
          const res = await fetch(`/api/tienda/vendor-verification?vendor_id=${encodeURIComponent(id)}`);
          if (!res.ok) return { id, blocked: false };
          const data = await res.json();
          return { id, blocked: Boolean(data.blocked) };
        } catch {
          return { id, blocked: false };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const blocked = new Set<string>();
      results.forEach((item) => {
        if (item.blocked) blocked.add(item.id);
      });
      setBlockedVendorIds(blocked);
    });

    const controller = new AbortController();
    fetch(`/api/tienda/vendor-bot-config?vendorIds=${encodeURIComponent(vendorIds.join(','))}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        const configs = data?.configs || {};
        vendorIds.forEach((id) => {
          map[id] = configs[id]?.botEnabled !== false;
        });
        setVendorBotEnabledMap(map);
      })
      .catch(() => {
        if (!cancelled) setVendorBotEnabledMap({});
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dbProducts]);

  /* fetch real vendors with published products */
  useEffect(() => {
    const fetchVendors = async () => {
      setVendorsLoading(true);

      try {
        const { data: prods } = await supabase
          .from('products')
          .select('vendor_id, vendor_email')
          .eq('status', 'published');

        if (!prods?.length) {
          setRealVendors([]);
          setVendorNames({});
          setVendorsLoading(false);
          return;
        }

        const countMap: Record<string, number> = {};
        const emailMap: Record<string, string> = {};
        prods.forEach(p => {
          countMap[p.vendor_id] = (countMap[p.vendor_id] || 0) + 1;
          emailMap[p.vendor_id] = p.vendor_email;
        });
        const ids = Object.keys(countMap).filter((id) => !blockedVendorIds.has(id));

        let cfgMap = new Map<string, Record<string, unknown>>();
        try {
          const result = (await Promise.race([
            supabase.from('store_configs').select('vendor_id, config').in('vendor_id', ids),
            new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 600)),
          ])) as {
            data?: Array<{ vendor_id: string; config: Record<string, unknown> }> | null;
            error?: unknown;
          } | null;

          const configs = result?.data ?? null;
          if (configs && Array.isArray(configs)) {
            cfgMap = new Map(configs.map((c: { vendor_id: string; config: Record<string, unknown> }) => [c.vendor_id, c.config]));
          }
        } catch {
          cfgMap = new Map();
        }

        const nameMap: Record<string, string> = {};
        ids.forEach(id => {
          const cfg = cfgMap.get(id);
          nameMap[id] = (cfg?.storeName as string) || (emailMap[id]?.split('@')[0] ?? 'Tienda');
        });
        setVendorNames(nameMap);

        setRealVendors(
          ids.map(id => {
            const cfg = cfgMap.get(id);
            const fallbackName = (emailMap[id]?.split('@')[0] || 'Tienda').trim() || 'Tienda';
            const storeName = String((cfg?.storeName as string) || fallbackName).trim() || fallbackName;
            const primaryCategory = Array.isArray(cfg?.categories) ? String((cfg?.categories as string[])[0] || '').trim() : '';
            const secondaryCategory = Array.isArray(cfg?.categories) ? String((cfg?.categories as string[])[1] || '').trim() : '';

            return {
              id,
              name: storeName,
              emoji: (cfg?.logoEmoji as string) || (storeName.charAt(0)?.toUpperCase() || '🏪'),
              grad: `linear-gradient(135deg, ${(cfg?.heroGrad1 as string) || '#1e3a5f'} 0%, ${(cfg?.heroGrad2 as string) || '#0d2035'} 100%)`,
              category: secondaryCategory || primaryCategory || 'General',
              productCount: countMap[id] ?? 0,
              logoImage: (cfg?.logoImage as string) || undefined,
              coverImage: (cfg?.heroCoverImage as string) || undefined,
            };
          })
        );
      } catch {
        setRealVendors([]);
        setVendorNames({});
      } finally {
        setVendorsLoading(false);
      }
    };

    fetchVendors();
  }, [blockedVendorIds]);

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
    shortDescription?: string | null; avgRating?: number | null; reviewCount?: number;
  }

  const allProducts: DisplayProduct[] = dbProducts.map(p => ({
    id: p.id, vendorName: vendorNames[p.vendor_id] || (p.vendor_email?.split('@')[0] || 'Tienda'),
    vendorId: p.vendor_id, vendorEmail: p.vendor_email || '',
    name: p.name, category: p.category,
    emoji: '📦', image: p.image, price: p.price, floorPrice: p.floor_price, stock: p.stock,
    shortDescription: p.short_description, avgRating: p.avg_rating, reviewCount: p.review_count,
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
    <div className="tnd-page tnd-main-page">

      {myOffers.length > 0 && (
        <div>
          <div className="tnd-section-head">
            <div>
              <h2 className="tnd-section-title">Mis ofertas</h2>
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
                        {offer.product_image ? (
                          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                            <Image src={offer.product_image} alt={offer.product_name || 'Oferta'} fill style={{ objectFit: 'cover' }} unoptimized />
                          </div>
                        ) : <span>🛍️</span>}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void openOfferChat(offer);
                          }}
                          title={offer.message_count > 0 ? `${offer.message_count} mensaje(s)` : 'Abrir chat'}
                          style={{ position: 'absolute', right: 10, bottom: 10, width: 34, height: 34, borderRadius: 999, border: offer.message_count > 0 ? '2px solid #fff' : 'none', background: offer.message_count > 0 ? '#F5C518' : 'rgba(0,0,0,0.45)', color: offer.message_count > 0 ? '#1C1C2E' : '#fff', fontWeight: 900, fontSize: offer.message_count > 0 ? '0.74rem' : '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 3, cursor: 'pointer' }}
                          aria-label="Abrir chat"
                        >
                          {offer.message_count > 0 ? offer.message_count : '💬'}
                        </button>
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
                        <div className="tnd-market-offer-expiry">{offer.expires_at ? (() => {
                          const msLeft = new Date(offer.expires_at).getTime() - Date.now();
                          if (msLeft <= 0) return '⏰ Expirada';
                          const hLeft = Math.floor(msLeft / 3600000);
                          const mLeft = Math.floor((msLeft % 3600000) / 60000);
                          return hLeft > 0 ? `⏳ Expira en ${hLeft}h ${mLeft}m` : `⏳ Expira en ${mLeft}m`;
                        })() : '⏳ Expira en 48h'}</div>
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
          <h2 className="tnd-section-title">Tiendas destacadas</h2>
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
                    <div className="tnd-store-logo" aria-label={v.name}>
                      {v.logoImage
                        ? (
                          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                            <Image src={v.logoImage} alt={v.name} fill style={{ objectFit: 'cover', borderRadius: 'inherit' }} unoptimized />
                          </div>
                        ) : (
                          <span className="tnd-store-logo-fallback">{String(v.emoji || v.name?.charAt(0) || 'T').toUpperCase()}</span>
                        )}
                    </div>
                  </div>
                </div>
                <div className="tnd-store-body">
                  <div className="tnd-store-name" title={v.name}>{v.name}</div>
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
          <h2 className="tnd-section-title">Productos más vendidos</h2>
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
                      ? (
                        <Image src={p.image} alt={p.name} fill style={{ objectFit: 'cover' }} unoptimized />
                      ) : p.emoji
                    }
                    {p.floorPrice < p.price * 0.92 && (
                      <span className="tnd-negoable-badge">🤝 Neg.</span>
                    )}
                  </div>
                </Link>
                <div className="tnd-product-body">
                  <div className="tnd-product-store">{p.vendorName}</div>
                  <div className="tnd-product-name">{p.name}</div>
                  {p.shortDescription && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--tnd-text-muted)', lineHeight: 1.45, minHeight: 32, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.shortDescription}
                    </div>
                  )}
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
          <h2 className="tnd-section-title">Explorar todos los productos</h2>
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
                    ? <Image src={p.image} alt={p.name} fill style={{ objectFit: 'cover' }} unoptimized />
                    : p.emoji
                  }
                  {p.floorPrice < p.price * 0.92 && vendorBotEnabledMap[p.vendorId] !== false && (
                    <span className="tnd-negoable-badge">🤝 Negociable</span>
                  )}
                </div>
                <div className="tnd-product-body">
                  <div className="tnd-product-store">{p.vendorName}</div>
                  <div className="tnd-product-name">{p.name}</div>
                  {p.shortDescription && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--tnd-text-muted)', lineHeight: 1.45, minHeight: 32, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.shortDescription}
                    </div>
                  )}
                  {p.avgRating != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, margin: '3px 0 4px' }}>
                      {[1,2,3,4,5].map(s => (
                        <span key={s} style={{ color: s <= Math.round(p.avgRating!) ? '#F5C518' : '#d1d5db', fontSize: '0.72rem', lineHeight: 1 }}>★</span>
                      ))}
                      <span style={{ fontSize: '0.68rem', color: 'var(--tnd-text-muted)', marginLeft: 1 }}>{p.avgRating.toFixed(1)}</span>
                      {(p.reviewCount ?? 0) > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--tnd-text-muted)' }}>({p.reviewCount})</span>}
                    </div>
                  )}
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

      {chatOffer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setChatOffer(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div style={{ width: '100%', maxWidth: 540, background: 'var(--tnd-surface, #fff)', borderRadius: '24px 24px 0 0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85dvh', boxShadow: '0 -4px 32px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--tnd-text-primary, #111)' }}>Chat - {chatOffer.product_name || 'Negociacion'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted, #888)', marginTop: 2 }}>{chatOffer.vendor_email?.split('@')[0] || 'Vendedor'}</div>
              </div>
              <button onClick={() => setChatOffer(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--tnd-text-muted, #888)', lineHeight: 1 }}>x</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 180, maxHeight: 360 }}>
              {chatLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--tnd-text-muted, #888)', fontSize: '0.85rem', marginTop: 24 }}>Cargando mensajes...</p>
              ) : chatMessages.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--tnd-text-muted, #888)', fontSize: '0.85rem', marginTop: 24 }}>Todavia no hay mensajes. Escribi el primero.</p>
              ) : chatMessages.map((msg) => {
                const isMine = msg.sender_role === 'buyer';
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '78%', padding: '9px 14px', borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isMine ? '#F5C518' : 'var(--tnd-surface-2, #f3f4f6)', color: isMine ? '#1C1C2E' : 'var(--tnd-text-primary, #111)', fontSize: '0.88rem', fontWeight: 500 }}>
                      {msg.message}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--tnd-text-muted, #aaa)', marginTop: 3 }}>
                      {msg.sender_name || (isMine ? 'Vos' : 'Vendedor')} · {new Date(msg.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendOfferChat();
                  }
                }}
                placeholder="Escribi tu mensaje..."
                style={{ flex: 1, height: 46, borderRadius: 14, border: '1.5px solid var(--tnd-border, #e5e7eb)', background: 'var(--tnd-bg, #f9fafb)', color: 'var(--tnd-text-primary, #111)', padding: '0 14px', fontSize: '0.9rem' }}
              />
              <button
                onClick={() => void sendOfferChat()}
                disabled={chatSending || !chatDraft.trim()}
                style={{ height: 46, paddingInline: 20, borderRadius: 14, background: '#F5C518', color: '#1C1C2E', fontWeight: 800, border: 'none', cursor: 'pointer', opacity: chatSending || !chatDraft.trim() ? 0.5 : 1 }}
              >
                {chatSending ? '...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
