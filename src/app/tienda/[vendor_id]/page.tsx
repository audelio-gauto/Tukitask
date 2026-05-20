'use client';
import { useState, useEffect, type ReactElement } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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
  robotEmoji?: string;
  robotLabel?: string;
  categories: string[];
  // Secciones visibles (undefined = visible)
  showReviewsStrip?: boolean;
  showHeroSearch?: boolean;
  showInfoBar?: boolean;
  showMasVendidos?: boolean;
  showStats?: boolean;
  showWhatsApp?: boolean;
  showBreadcrumb?: boolean;
  showStoreBadge?: boolean;
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
}

/* ── Mock vendor data (fallback) ─────────────────────────── */
const VENDORS: Record<string, {
  id: string; name: string; category: string; emoji: string;
  rating: number; products: number; open: boolean;
  grad1: string; grad2: string; desc: string; address: string; hours: string; phone: string;
}> = {
  techpy:     { id: 'techpy',     name: 'TechPY Store',    category: 'Electrónica', emoji: '💻', rating: 4.8, products: 12, open: true,  grad1: '#1e3a5f', grad2: '#0d2035', desc: 'Los mejores productos electrónicos en Paraguay, con garantía en todo.',              address: 'Asunción, Shopping del Sol',    hours: '08:00 – 18:00', phone: '0981123456' },
  modaexpress:{ id: 'modaexpress',name: 'Moda Express',    category: 'Ropa',        emoji: '👗', rating: 4.5, products: 38, open: true,  grad1: '#3b1f5e', grad2: '#1e0f35', desc: 'Moda actual a precios accesibles. Nuevas colecciones cada semana.',             address: 'Luque, Av. Mcal. López',        hours: '09:00 – 19:00', phone: '0991234567' },
  sabores:    { id: 'sabores',    name: 'Sabores del Sur', category: 'Gastronomía', emoji: '🍽️', rating: 4.9, products: 8,  open: false, grad1: '#5e2a0d', grad2: '#351508', desc: 'Comida casera con ingredientes frescos. Pedidos con entrega a domicilio.',        address: 'San Lorenzo, Barrio San Blas',  hours: '11:00 – 21:00', phone: '0972345678' },
  hogarfeliz: { id: 'hogarfeliz', name: 'Hogar Feliz',     category: 'Hogar',       emoji: '🏠', rating: 4.3, products: 21, open: true,  grad1: '#1a4a2a', grad2: '#0d2515', desc: 'Muebles artesanales de madera maciza y decoración de alta calidad.',             address: 'Fernando de la Mora',           hours: '08:00 – 17:00', phone: '0981456789' },
  librosmundo:{ id: 'librosmundo',name: 'LibrosMundo',     category: 'Libros',      emoji: '📚', rating: 4.7, products: 55, open: true,  grad1: '#4a1a1a', grad2: '#250d0d', desc: 'La librería más completa de Paraguay. Más de 3000 títulos disponibles.',         address: 'Asunción, Centro',              hours: '08:30 – 18:30', phone: '0961567890' },
};

const ALL_PRODUCTS = [
  { id: 'p1', vendorId: 'techpy',      name: 'iPhone 15 128GB',          category: 'Electrónica', emoji: '📱', price: 5000000, floorPrice: 4200000, stock: 3  },
  { id: 'p2', vendorId: 'techpy',      name: 'Auriculares Bluetooth Pro', category: 'Electrónica', emoji: '🎧', price:  350000, floorPrice:  280000, stock: 15 },
  { id: 'p3', vendorId: 'techpy',      name: 'Laptop Gaming 16"',         category: 'Electrónica', emoji: '💻', price: 8500000, floorPrice: 7500000, stock: 2  },
  { id: 'p4', vendorId: 'modaexpress', name: 'Vestido Floral Verano',     category: 'Ropa',        emoji: '👗', price:  180000, floorPrice:  140000, stock: 8  },
  { id: 'p5', vendorId: 'modaexpress', name: 'Zapatillas Running',        category: 'Ropa',        emoji: '👟', price:  420000, floorPrice:  340000, stock: 5  },
  { id: 'p6', vendorId: 'sabores',     name: 'Empanadas x12 unidades',    category: 'Gastronomía', emoji: '🥟', price:   60000, floorPrice:   50000, stock: 20 },
  { id: 'p7', vendorId: 'hogarfeliz',  name: 'Mesa de Madera Maciza',     category: 'Hogar',       emoji: '🪑', price:  800000, floorPrice:  650000, stock: 1  },
  { id: 'p8', vendorId: 'librosmundo', name: 'Set Paulo Coelho x5',       category: 'Libros',      emoji: '📚', price:  250000, floorPrice:  200000, stock: 10 },
];

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

/* ════════════════════════════════════════════════════════════ */
export default function VendorStorePage() {
  const params   = useParams();
  const vendorId = params.vendor_id as string;
  const vendor   = VENDORS[vendorId];
  const products = ALL_PRODUCTS.filter(p => p.vendorId === vendorId);

  const [cfg,      setCfg]      = useState<StoreTemplateConfig | null>(null);
  const [activeCat, setActiveCat] = useState('Todos');
  const [search,   setSearch]   = useState('');

  /* Build default config from mock vendor data */
  const defaultCfg: StoreTemplateConfig | null = vendor ? {
    templateId:      'vitrina',
    storeSlug:       vendor.id,
    storeName:       vendor.name,
    logoEmoji:       vendor.emoji,
    whatsapp:        vendor.phone,
    heroTagline:     `${vendor.name}\n${vendor.category} · Paraguay`,
    heroDescription: vendor.desc,
    heroGrad1:       vendor.grad1,
    heroGrad2:       vendor.grad2,
    accentColor:     '#F5C518',
    accentText:      '#0b1220',
    statNum:         String(vendor.products),
    statLabel:       'Productos',
    robotEnabled:    true,
    categories:      ['Todos', ...Array.from(new Set(products.map(p => p.category)))],
  } : null;

  useEffect(() => {
    try {
      /* Try saved template first, then slug-specific key */
      const raw = localStorage.getItem(`tukimarket_config_${vendorId}`)
               || localStorage.getItem('tukimarket_template');
      if (raw) {
        const parsed: StoreTemplateConfig = JSON.parse(raw);
        if (parsed.storeSlug === vendorId) {
          setCfg(parsed);
          return;
        }
      }
    } catch { /* ignore */ }
    setCfg(defaultCfg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const activeCfg = cfg ?? defaultCfg;

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

  const acc          = activeCfg.accentColor;
  const accText      = activeCfg.accentText;
  const heroGrad     = `linear-gradient(135deg, ${activeCfg.heroGrad1} 0%, ${activeCfg.heroGrad2} 60%, ${activeCfg.heroGrad1} 100%)`;
  const waUrl        = `https://wa.me/595${activeCfg.whatsapp.replace(/^0/, '')}`;
  const heroTitleSz  = activeCfg.heroTitleFontSize ?? 28;
  const heroTitleClr = activeCfg.heroTitleColor    ?? '#ffffff';
  const heroDescSz   = activeCfg.heroDescFontSize  ?? 15;
  const heroDescClr  = activeCfg.heroDescColor     ?? '#94a3b8';
  const secTitleClr  = activeCfg.sectionTitleColor ?? '#0f172a';
  const btnRad       = activeCfg.btnRadius         ?? 13;
  const bgBody       = activeCfg.bodyBg            ?? '#f8fafc';
  const sectionOrd   = activeCfg.sectionOrder      ?? ['hero', 'infoBar', 'categories', 'masVendidos', 'products'];

  /* Filter products */
  const cats = activeCfg.categories.length > 0 ? activeCfg.categories : ['Todos'];
  const visibleProducts = products.filter(p => {
    const catMatch = activeCat === 'Todos' || p.category === activeCat;
    const srchMatch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && srchMatch;
  });

  /* ── Section JSX definitions ── */
  const heroEl = (
    <div style={{ background: heroGrad, padding: '48px 24px 40px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, background: `radial-gradient(circle, ${acc}18 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -40, left: -40, width: 220, height: 220, background: `radial-gradient(circle, ${acc}10 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, background: `${acc}22`, border: `2px solid ${acc}55`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
            {activeCfg.logoEmoji}
          </div>
          <div>
            {activeCfg.showStoreBadge !== false && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${acc}18`, border: `1px solid ${acc}40`, borderRadius: 20, padding: '3px 12px', marginBottom: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🛒 {activeCfg.storeName}</span>
              </div>
            )}
            <div style={{ fontSize: heroTitleSz, fontWeight: 900, color: heroTitleClr, lineHeight: 1.15, whiteSpace: 'pre-line' }}>{activeCfg.heroTagline}</div>
          </div>
        </div>
        <p style={{ fontSize: heroDescSz, color: heroDescClr, maxWidth: 560, lineHeight: 1.65, marginBottom: 20 }}>
          {activeCfg.heroDescription}
        </p>
        {activeCfg.showReviewsStrip !== false && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ display: 'flex' }}>
              {(activeCfg.reviewsAvatars ?? ['👩','👨','👩🏽','👨🏻']).map((av, i) => (
                <div key={i} style={{ width: 30, height: 30, borderRadius: '50%', background: `${acc}28`, border: `2px solid ${acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', marginLeft: i > 0 ? -9 : 0, position: 'relative', zIndex: 4 - i }}>{av}</div>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', gap: 1, marginBottom: 2 }}>
                {'★★★★★'.split('').map((s, i) => <span key={i} style={{ color: acc, fontSize: '0.88rem' }}>{s}</span>)}
              </div>
              <div style={{ fontSize: '0.74rem', color: heroDescClr }}>{activeCfg.reviewsCount ?? '+127 clientes satisfechos'}</div>
            </div>
          </div>
        )}
        {activeCfg.showHeroSearch !== false && (
          <div style={{ display: 'flex', gap: 10, maxWidth: 540, marginBottom: 28 }}>
            <input
              type="search"
              placeholder={activeCfg.heroSearchPlaceholder || 'Buscar productos...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, height: 50, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: btnRad, padding: '0 18px', color: '#fff', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              style={{ height: 50, padding: '0 22px', background: acc, color: accText, border: 'none', borderRadius: btnRad, fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              onClick={() => {}}
            >Buscar</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          {activeCfg.showStats !== false && (
            <>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: acc }}>{activeCfg.statNum || products.length}</div>
                <div style={{ fontSize: '0.72rem', color: heroDescClr }}>{activeCfg.statLabel}</div>
              </div>
              {vendor && (
                <div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: acc }}>⭐ {vendor.rating}</div>
                  <div style={{ fontSize: '0.72rem', color: heroDescClr }}>Calificación</div>
                </div>
              )}
              {activeCfg.robotEnabled && (
                <div>
                  <div style={{ fontSize: '1.4rem' }}>{activeCfg.robotEmoji ?? '🤖'}</div>
                  <div style={{ fontSize: '0.72rem', color: heroDescClr }}>{activeCfg.robotLabel ?? 'Robot Negociador'}</div>
                </div>
              )}
            </>
          )}
          {activeCfg.showWhatsApp !== false && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', background: '#25D366', color: '#fff', borderRadius: btnRad, fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', marginLeft: 'auto' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.17 1.542 5.953L.057 23.887a.5.5 0 0 0 .615.615l5.95-1.48A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.948 0-3.808-.524-5.408-1.449l-.388-.222-4.01.996.999-3.935-.244-.401A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );

  const infoBarEl = (activeCfg.showInfoBar !== false && vendor) ? (
    <div style={{ background: 'var(--tnd-surface)', borderBottom: '1px solid var(--tnd-border)', padding: '10px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--tnd-text-muted)' }}>
          🕐 <span>{vendor.hours}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--tnd-text-muted)' }}>
          📍 <span>{vendor.address}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>
          ✓ Tienda verificada
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: vendor.open ? '#16a34a' : '#ef4444' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: vendor.open ? '#16a34a' : '#ef4444', display: 'inline-block', boxShadow: vendor.open ? '0 0 0 3px rgba(22,163,74,0.25)' : 'none' }} />
          {vendor.open ? 'Abierto ahora' : 'Cerrado'}
        </div>
      </div>
    </div>
  ) : null;

  const masVendidosEl = (activeCfg.showMasVendidos !== false && products.length >= 2) ? (
    <div className="tnd-page" style={{ paddingBottom: 0, background: bgBody }}>
      <div className="tnd-section-head" style={{ marginBottom: 16 }}>
        <h2 className="tnd-section-title" style={{ color: secTitleClr }}>{activeCfg.masVendidosTitle ?? '🔥 Productos más vendidos'}</h2>
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none', alignItems: 'flex-end' }}>
        {products.slice(0, Math.min(4, products.length)).map((p, i) => {
          const rankStyle = [
            { border: '2px solid #FFD700', shadow: '0 4px 20px rgba(255,215,0,0.35)', imgH: 100, crown: '👑' },
            { border: '2px solid #C0C0C0', shadow: '0 2px 12px rgba(192,192,192,0.3)', imgH: 86,  crown: '🥈' },
            { border: '2px solid #CD7F32', shadow: '0 2px 10px rgba(205,127,50,0.3)',  imgH: 78,  crown: '🥉' },
            { border: `1.5px solid ${acc}40`, shadow: `0 2px 8px ${acc}14`,            imgH: 72,  crown: ''   },
          ][i] ?? { border: `1.5px solid ${acc}40`, shadow: `0 2px 8px ${acc}14`, imgH: 72, crown: '' };
          return (
            <Link
              key={p.id}
              href={`/tienda/producto/${p.id}`}
              style={{ minWidth: i === 0 ? 165 : 145, flex: '0 0 auto', borderRadius: Math.max(8, btnRad), background: 'var(--tnd-surface)', border: rankStyle.border, textDecoration: 'none', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: rankStyle.shadow }}
            >
              {rankStyle.crown && (
                <div style={{ position: 'absolute', top: 6, right: 8, fontSize: i === 0 ? '1.2rem' : '1rem', zIndex: 2 }}>{rankStyle.crown}</div>
              )}
              <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 900, color: i === 0 ? '#7a5c00' : '#fff' }}>#{i + 1}</div>
              <div style={{ height: rankStyle.imgH, background: `linear-gradient(135deg, var(--tnd-surface-2), var(--tnd-surface))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: i === 0 ? '2.8rem' : '2.2rem' }}>{p.emoji}</div>
              <div style={{ padding: '8px 10px 12px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--tnd-text-primary)', marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: acc }}>{gs(p.price)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  ) : null;

  const catsEl = (
    <div className="tnd-section-padded" style={{ background: bgBody }}>
      <div className="tnd-cats-sticky" style={{ background: bgBody }}>
        <div className="tnd-cats">
          {cats.map(c => (
            <button
              key={c}
              className={`tnd-cat${activeCat === c ? ' active' : ''}`}
              style={activeCat === c ? { background: acc, color: accText, borderColor: acc } : {}}
              onClick={() => setActiveCat(c)}
            >{c}</button>
          ))}
        </div>
      </div>
    </div>
  );

  const productsEl = (
    <div className="tnd-page" style={{ paddingTop: 16, background: bgBody }}>
      <div className="tnd-section-head">
        <h2 className="tnd-section-title" style={{ color: secTitleClr }}>
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
                {p.emoji}
                {p.floorPrice < p.price * 0.92 && (
                  <span className="tnd-negoable-badge">🤖 Negociable</span>
                )}
              </div>
              <div className="tnd-product-body">
                <div className="tnd-product-store">{activeCfg.storeName}</div>
                <div className="tnd-product-name">{p.name}</div>
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
                <span className="tnd-product-action" style={{ background: acc, color: accText, borderRadius: btnRad }}>Ver y ofertar</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  const SECTION_ELS: Record<string, ReactElement | null> = {
    hero: heroEl, infoBar: infoBarEl, categories: catsEl,
    masVendidos: masVendidosEl, products: productsEl,
  };

  return (
    <div>
      {activeCfg.showBreadcrumb !== false && (
        <div style={{ padding: '12px 24px 0', maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 8, fontSize: '0.8rem', alignItems: 'center' }}>
          <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
          <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
          <span style={{ color: 'var(--tnd-text-muted)' }}>{activeCfg.storeName}</span>
        </div>
      )}
      {sectionOrd.map(id => SECTION_ELS[id] ? <div key={id}>{SECTION_ELS[id]}</div> : null)}
    </div>
  );
}


