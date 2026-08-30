'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { gs } from '../data';
import type { DbProduct } from '@/types/market';

/* Inline type — mirrors StoreTemplateConfig from /vendedor/plantillas/page */
interface StoreTemplateConfig {
  templateId: 'vitrina';
  storeSlug: string;
  storeName: string;
  logoEmoji: string;
  whatsapp: string;
  heroTagline: string;
  heroDescription: string;
  heroGrad1: string;
  heroGrad2: string;
  accentColor: string;
  accentText: string;
  statNum: string;
  statLabel: string;
  robotEnabled: boolean;
  categories: string[];
  // Secciones visibles (undefined = visible)
  showReviewsStrip?: boolean;
  showHeroSearch?: boolean;
  showInfoBar?: boolean;
  showMasVendidos?: boolean;
  showStats?: boolean;
  showWhatsApp?: boolean;
  // Contenido personalizable
  reviewsCount?: string;
  reviewsAvatars?: string[];
  heroSearchPlaceholder?: string;
  masVendidosTitle?: string;
  // Orden de secciones
  sectionOrder?: string[];
  // Tipografía
  heroTitleFontSize?: number;
  heroTitleColor?: string;
  heroDescFontSize?: number;
  heroDescColor?: string;
  sectionTitleColor?: string;
  // Botones y fondo
  btnRadius?: number;
  bodyBg?: string;
  // Logo imagen
  logoImage?: string;
  // Robot
  robotLabel?: string;
  // Breadcrumb
  showBreadcrumb?: boolean;
  // Alineación de secciones
  sectionAlignment?: Record<string, 'left' | 'center' | 'right'>;
  // SEO
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  // Cover image for hero
  heroCoverImage?: string;
  // Font
  storeFont?: string;
  // About section
  aboutText?: string;
  aboutImage?: string;
  showAbout?: boolean;
  showStoreChip?: boolean;
  // Hero block order & alignment
  heroBlockOrder?: string[];
  heroBlockAlignment?: Record<string, 'left' | 'center' | 'right'>;
}

const FONT_URLS: Record<string, string> = {
  'Poppins':          'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&display=swap',
  'Montserrat':       'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap',
  'Oswald':           'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap',
  'Lato':             'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap',
};
const FONT_CSS: Record<string, string> = {
  'Poppins':          "'Poppins', sans-serif",
  'Montserrat':       "'Montserrat', sans-serif",
  'Playfair Display': "'Playfair Display', serif",
  'Oswald':           "'Oswald', sans-serif",
  'Lato':             "'Lato', sans-serif",
};
const DEFAULT_HERO_BLOCK_ORDER = ['header', 'description', 'reviews', 'search', 'stats'];

/* ════════════════════════════════════════════════════════════ */
export default function VendorStorePage() {
  const params   = useParams();
  const vendorId = params.vendor_id as string;

  const [cfg,       setCfg]       = useState<StoreTemplateConfig | null>(null);
  const [loadingStore, setLoadingStore] = useState(true);
  const [vendorBotEnabled, setVendorBotEnabled] = useState(true);
  const [verificationBlocked, setVerificationBlocked] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState('');
  const [activeCat, setActiveCat] = useState('Todos');
  const [search,    setSearch]    = useState('');

  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);

  const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(vendorId);
  const DEFAULT_CFG: StoreTemplateConfig = {
    templateId: 'vitrina', storeSlug: vendorId, storeName: 'Tienda',
    logoEmoji: '🏪', whatsapp: '', heroTagline: 'Tienda\nTukiMarket',
    heroDescription: 'Explorá nuestra selección de productos.',
    heroGrad1: '#1a1a2e', heroGrad2: '#16213e', accentColor: '#F5C518', accentText: '#0b1220',
    statNum: '', statLabel: 'Productos', robotEnabled: false, categories: ['Todos'],
  };

  useEffect(() => {
    const loadConfig = async () => {
      setLoadingStore(true);

      if (vendorId === 'mi-tienda') {
        try {
          const raw = localStorage.getItem('tukimarket_template_mi-tienda');
          if (raw) {
            setCfg(JSON.parse(raw));
            setLoadingStore(false);
            return;
          }
        } catch { /* ignore */ }

        setCfg({ ...DEFAULT_CFG, storeSlug: 'mi-tienda', storeName: 'Mi Tienda' });
        setLoadingStore(false);
        return;
      }

      if (!IS_UUID) {
        setCfg(null);
        setLoadingStore(false);
        return;
      }

      const fallbackToDefault = () => {
        setCfg(DEFAULT_CFG);
        setLoadingStore(false);
      };

      let timeoutId: number | undefined;
      timeoutId = window.setTimeout(fallbackToDefault, 700);

      try {
        const { data, error } = await supabase
          .from('store_configs')
          .select('config')
          .eq('vendor_id', vendorId)
          .maybeSingle();

        if (timeoutId) window.clearTimeout(timeoutId);

        if (!error && data?.config) {
          // Merge over DEFAULT_CFG so any missing field (e.g. categories saved from
          // configuracion page) falls back to a safe default instead of crashing.
          setCfg({ ...DEFAULT_CFG, ...(data.config as StoreTemplateConfig) });
          setLoadingStore(false);
          return;
        }

        setCfg(DEFAULT_CFG);
      } catch {
        if (timeoutId) window.clearTimeout(timeoutId);
        setCfg(DEFAULT_CFG);
      } finally {
        setLoadingStore(false);
      }
    };

    loadConfig().catch(() => setLoadingStore(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId || !IS_UUID) return;
    fetch(`/api/tienda/vendor-verification?vendor_id=${encodeURIComponent(vendorId)}`)
      .then(async (res) => {
        if (!res.ok) {
          setVerificationBlocked(false);
          setVerificationMsg('');
          return;
        }
        const json = await res.json();
        setVerificationBlocked(Boolean(json.blocked));
        setVerificationMsg(json.message || '');
      })
      .catch(() => {
        setVerificationBlocked(false);
        setVerificationMsg('');
      });
  }, [vendorId, IS_UUID]);

  useEffect(() => {
    if (!vendorId || vendorId === 'mi-tienda') return;
    const controller = new AbortController();
    fetch(`/api/tienda/vendor-bot-config?vendorId=${encodeURIComponent(vendorId)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setVendorBotEnabled(data?.config?.botEnabled !== false))
      .catch(() => setVendorBotEnabled(true));
    return () => controller.abort();
  }, [vendorId]);

  /* fetch real published products for this vendor via API route */
  useEffect(() => {
    const fetchVendorProducts = async () => {
      let uid = vendorId;
      if (vendorId === 'mi-tienda') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        uid = user.id;
      } else if (!IS_UUID) {
        return; // unknown slug — no products
      }
      const res = await fetch(`/api/tienda/products?vendor_id=${encodeURIComponent(uid)}&limit=100`);
      if (res.ok) {
        const { products } = await res.json();
        if (products) setDbProducts(products);
      }
    };
    fetchVendorProducts();
  }, [vendorId, IS_UUID]);

  const activeCfg = cfg;

  type MergedProduct = {
    id: string; vendorId: string; name: string; category: string;
    emoji: string; image?: string | null; price: number; floorPrice: number; stock: number;
    shortDescription?: string | null; avgRating?: number | null; reviewCount?: number;
  };
  const dbMapped: MergedProduct[] = dbProducts.map(p => ({
    id: p.id, vendorId: p.vendor_id, name: p.name, category: p.category,
    emoji: '📦', image: p.image, price: p.price, floorPrice: p.floor_price, stock: p.stock,
    shortDescription: p.short_description, avgRating: p.avg_rating, reviewCount: p.review_count,
  }));
  const products: MergedProduct[] = dbMapped;

  useEffect(() => {
    const fontName = activeCfg?.storeFont;
    if (!fontName || !FONT_URLS[fontName]) return;
    const existing = document.getElementById('store-font-link');
    if (existing) (existing as HTMLLinkElement).href = FONT_URLS[fontName];
    else {
      const link = document.createElement('link');
      link.id = 'store-font-link';
      link.rel = 'stylesheet';
      link.href = FONT_URLS[fontName];
      document.head.appendChild(link);
    }
  }, [activeCfg?.storeFont]);

  if (loadingStore) {
    return (
      <div className="tnd-page">
        <div className="tnd-not-found">
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: 'var(--tnd-text-primary)', marginBottom: 8 }}>Cargando tienda...</h2>
          <p style={{ color: 'var(--tnd-text-muted)' }}>Estamos preparando la información.</p>
        </div>
      </div>
    );
  }

  if (!activeCfg) {
    return (
      <div className="tnd-page">
        <div className="tnd-not-found">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
          <h2 style={{ color: 'var(--tnd-text-primary)', marginBottom: 8 }}>Tienda no encontrada</h2>
          <p style={{ color: 'var(--tnd-text-muted)', marginBottom: 24 }}>Esta tienda no existe o fue removida.</p>
          <Link href="/tienda" className="tnd-back">← Volver al catálogo</Link>
        </div>
      </div>
    );
  }

  if (verificationBlocked) {
    return (
      <div className="tnd-page">
        <div className="tnd-not-found" style={{ maxWidth: 680 }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: 'var(--tnd-text-primary)', marginBottom: 8 }}>Tienda en verificación</h2>
          <p style={{ color: 'var(--tnd-text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
            {verificationMsg || 'Esta tienda está pendiente de aprobación documental. Cuando los documentos del vendedor sean validados, la tienda volverá a estar disponible.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <Link href="/tienda" className="tnd-back">← Volver al catálogo</Link>
          </div>
        </div>
      </div>
    );
  }

  const acc       = activeCfg.accentColor;
  const accText   = activeCfg.accentText;
  const heroGrad  = `linear-gradient(135deg, ${activeCfg.heroGrad1} 0%, ${activeCfg.heroGrad2} 60%, ${activeCfg.heroGrad1} 100%)`;
  const waUrl     = `https://wa.me/595${activeCfg.whatsapp.replace(/^0/, '')}`;

  /* Filter products */
  const baseCats  = Array.isArray(activeCfg.categories) && activeCfg.categories.length > 0 ? activeCfg.categories : ['Todos'];
  const extraCats = Array.from(new Set(dbMapped.map(p => p.category).filter(c => !baseCats.includes(c))));
  const cats      = extraCats.length > 0 ? [...baseCats, ...extraCats] : baseCats;
  const visibleProducts = products.filter(p => {
    const catMatch = activeCat === 'Todos' || p.category === activeCat;
    const srchMatch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && srchMatch;
  });

  const storeFontFamily = activeCfg.storeFont ? (FONT_CSS[activeCfg.storeFont] ?? '') : '';
  const hbo = activeCfg.heroBlockOrder ?? DEFAULT_HERO_BLOCK_ORDER;
  const hba = activeCfg.heroBlockAlignment ?? {};
  const hBlockAlign = (id: string) => {
    const a = (hba[id] ?? 'left') as 'left' | 'center' | 'right';
    if (a === 'center') return { display: 'flex' as const, justifyContent: 'center' as const };
    if (a === 'right')  return { display: 'flex' as const, justifyContent: 'flex-end' as const };
    return {};
  };
  return (
    <div style={storeFontFamily ? { fontFamily: storeFontFamily } : {}}>
      {/* ── Breadcrumb ── */}
      {activeCfg.showBreadcrumb !== false && (
        <div style={{ padding: '12px 24px 0', maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 8, fontSize: '0.8rem', alignItems: 'center' }}>
          <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
          <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
          <span style={{ color: 'var(--tnd-text-muted)' }}>{activeCfg.storeName}</span>
        </div>
      )}

      {/* ══ HERO ══════════════════════════════════════════════ */}
      <div style={{ backgroundImage: activeCfg.heroCoverImage ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${activeCfg.heroCoverImage})` : heroGrad, backgroundSize: 'cover', backgroundPosition: 'center', padding: '48px 24px 40px', position: 'relative', overflow: 'hidden', marginBottom: 0 }}>
        {/* glow orbs */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, background: `radial-gradient(circle, ${acc}18 0%, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 220, height: 220, background: `radial-gradient(circle, ${acc}10 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          {hbo.map(blockId => {
            const bs = hBlockAlign(blockId);
            if (blockId === 'header') return (
              <div key="header" style={{ ...bs, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 52, height: 52, background: `${acc}22`, border: `2px solid ${acc}55`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0, overflow: 'hidden' }}>
                    {activeCfg.logoImage
                      ? <img src={activeCfg.logoImage} alt={activeCfg.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : activeCfg.logoEmoji}
                  </div>
                  <div>
                    {activeCfg.showStoreChip !== false && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${acc}18`, border: `1px solid ${acc}40`, borderRadius: 20, padding: '3px 12px', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🛒 {activeCfg.storeName}</span>
                    </div>
                  )}
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', lineHeight: 1.15, whiteSpace: 'pre-line' }}>{activeCfg.heroTagline}</div>
                  </div>
                </div>
              </div>
            );
            if (blockId === 'description') return (
              <p key="description" style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.58)', maxWidth: 560, lineHeight: 1.65, margin: '0 0 20px', textAlign: (hba['description'] ?? 'left') as 'left' | 'center' | 'right' }}>
                {activeCfg.heroDescription}
              </p>
            );
            if (blockId === 'reviews') return activeCfg.showReviewsStrip !== false ? (
              <div key="reviews" style={{ ...bs, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex' }}>
                    {(activeCfg.reviewsAvatars ?? ['👩','👨','👩🏽','👨🏻']).map((av, i) => (
                      <div key={i} style={{ width: 30, height: 30, borderRadius: '50%', background: `${acc}28`, border: `2px solid ${acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', marginLeft: i > 0 ? -9 : 0, position: 'relative', zIndex: 4 - i }}>{av}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 1, marginBottom: 2 }}>
                      {'★★★★★'.split('').map((s, i) => <span key={i} style={{ color: acc, fontSize: '0.88rem' }}>{s}</span>)}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)' }}>{activeCfg.reviewsCount ?? '+127 clientes satisfechos'}</div>
                  </div>
                </div>
              </div>
            ) : null;
            if (blockId === 'search') return activeCfg.showHeroSearch !== false ? (
              <div key="search" style={{ ...bs, marginBottom: 28 }}>
                <div style={{ display: 'flex', gap: 10, maxWidth: 540, width: '100%' }}>
                  <input
                    type="search"
                    placeholder={activeCfg.heroSearchPlaceholder || 'Buscar productos...'}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, height: 50, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 13, padding: '0 18px', color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button style={{ height: 50, padding: '0 22px', background: acc, color: accText, border: 'none', borderRadius: 13, fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }} onClick={() => {}}>Buscar</button>
                </div>
              </div>
            ) : null;
            if (blockId === 'stats') return (
              <div key="stats" style={bs}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
                  {activeCfg.showStats !== false && (
                    <>
                      <div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: acc }}>{activeCfg.statNum || products.length}</div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{activeCfg.statLabel}</div>
                      </div>
                      {activeCfg.robotEnabled && (
                        <div>
                          <div style={{ fontSize: '1.4rem' }}>🤖</div>
                          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{activeCfg.robotLabel ?? 'Robot Negociador'}</div>
                        </div>
                      )}
                    </>
                  )}
                  {activeCfg.showWhatsApp !== false && (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', background: '#25D366', color: '#fff', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', marginLeft: 'auto' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.17 1.542 5.953L.057 23.887a.5.5 0 0 0 .615.615l5.95-1.48A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.948 0-3.808-.524-5.408-1.449l-.388-.222-4.01.996.999-3.935-.244-.401A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
            return null;
          })}
        </div>
      </div>

      {/* ── Barra de info de la tienda ── */}
      {activeCfg.showInfoBar !== false && (
        <div style={{ background: 'var(--tnd-surface)', borderBottom: '1px solid var(--tnd-border)', padding: '10px 24px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>
              ✓ Tienda verificada
            </div>
          </div>
        </div>
      )}

      {/* ── Sobre la tienda ── */}
      {activeCfg.showAbout !== false && activeCfg.aboutText && (
        <div style={{ background: 'var(--tnd-surface)', borderBottom: '1px solid var(--tnd-border)', padding: '24px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {activeCfg.aboutImage && (
              <img src={activeCfg.aboutImage} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tnd-text-primary)', margin: '0 0 8px' }}>📖 Sobre la tienda</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--tnd-text-muted)', lineHeight: 1.65, margin: 0 }}>{activeCfg.aboutText}</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONTENT ═══════════════════════════════════════════ */}
      <div className="tnd-page" style={{ paddingTop: 32 }}>

        {/* ══ MÁS VENDIDOS ══════════════════════════════════ */}
        {activeCfg.showMasVendidos !== false && products.length >= 2 && (
          <div style={{ marginBottom: 32 }}>
            <div className="tnd-section-head" style={{ marginBottom: 16 }}>
              <h2 className="tnd-section-title">{activeCfg.masVendidosTitle ?? 'Productos más vendidos'}</h2>
            </div>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none', alignItems: 'flex-end' }}>
              {products.slice(0, Math.min(4, products.length)).map((p, i) => {
                const rankStyle = [
                  { border: '2px solid #FFD700', shadow: '0 4px 20px rgba(255,215,0,0.35)', imgH: 100, crown: '👑' },
                  { border: '2px solid #C0C0C0', shadow: '0 2px 12px rgba(192,192,192,0.3)', imgH: 86, crown: '🥈' },
                  { border: '2px solid #CD7F32', shadow: '0 2px 10px rgba(205,127,50,0.3)', imgH: 78, crown: '🥉' },
                  { border: `1.5px solid ${acc}40`, shadow: `0 2px 8px ${acc}14`,              imgH: 72, crown: ''  },
                ][i] ?? { border: `1.5px solid ${acc}40`, shadow: `0 2px 8px ${acc}14`, imgH: 72, crown: '' };
                return (
                  <Link
                    key={p.id}
                    href={`/tienda/producto/${p.id}`}
                    style={{
                      minWidth: i === 0 ? 165 : 145, flex: '0 0 auto', borderRadius: 16,
                      background: 'var(--tnd-surface)', border: rankStyle.border,
                      textDecoration: 'none', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column',
                      boxShadow: rankStyle.shadow,
                    }}
                  >
                    {/* Crown / rank icon */}
                    {rankStyle.crown && (
                      <div style={{ position: 'absolute', top: 6, right: 8, fontSize: i === 0 ? '1.2rem' : '1rem', zIndex: 2 }}>{rankStyle.crown}</div>
                    )}
                    {/* Rank number badge */}
                    <div style={{
                      position: 'absolute', top: 8, left: 8, zIndex: 2,
                      width: 22, height: 22, borderRadius: '50%',
                      background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.62rem', fontWeight: 900, color: i === 0 ? '#7a5c00' : '#fff',
                    }}>#{i + 1}</div>
                    {/* Image area */}
                    <div style={{ height: rankStyle.imgH, background: `linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i === 0 ? '2.8rem' : '2.2rem', position: 'relative', overflow: 'hidden' }}>
                      {p.image
                        ? <img src={p.image} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : p.emoji
                      }
                    </div>
                    <div style={{ padding: '8px 10px 12px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--tnd-text-primary)', marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 900, color: acc }}>{gs(p.price)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Category tabs — sticky */}
        <div className="tnd-cats-sticky">
          <div className="tnd-cats">
            {cats.map(c => (
              <button
                key={c}
                className={`tnd-cat${activeCat === c ? ' active' : ''}`}
                style={activeCat === c ? { background: acc, color: accText, borderColor: acc } : {}}
                onClick={() => setActiveCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Products heading */}
        <div className="tnd-section-head">
          <h2 className="tnd-section-title">
            Productos <span style={{ color: 'var(--tnd-text-muted)', fontWeight: 500, fontSize: '0.9rem' }}>({visibleProducts.length} resultado{visibleProducts.length !== 1 ? 's' : ''})</span>
          </h2>
        </div>

        {visibleProducts.length === 0 ? (
          <div className="tnd-empty">
            <div className="tnd-empty-icon">📦</div>
            <div className="tnd-empty-title">Sin resultados</div>
            <div className="tnd-empty-sub">Probá con otro filtro o búsqueda.</div>
          </div>
        ) : (
          <div className="tnd-products-grid">
            {visibleProducts.map(p => (
              <Link key={p.id} href={`/tienda/producto/${p.id}`} className="tnd-product-card">
                <div className="tnd-product-img" style={{ background: `linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))` }}>
                  {p.image
                    ? <img src={p.image} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    : p.emoji
                  }
                  {p.floorPrice < p.price * 0.92 && vendorBotEnabled && (
                    <span className="tnd-negoable-badge">🤖 Negociable</span>
                  )}
                </div>
                <div className="tnd-product-body">
                  <div className="tnd-product-store">{activeCfg.storeName}</div>
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
                  <div className="tnd-product-floor">{p.category}</div>
                  <div style={{ marginBottom: 10 }}>
                    {p.stock === 0
                      ? <span className="tnd-chip tnd-chip-out">Sin stock</span>
                      : p.stock <= 3
                        ? <span className="tnd-chip tnd-chip-low">⚠️ {p.stock} disponibles</span>
                        : <span className="tnd-chip tnd-chip-stock">✓ En stock</span>
                    }
                  </div>
                  <span className="tnd-product-action" style={{ background: acc, color: accText }}>Ver y ofertar</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


