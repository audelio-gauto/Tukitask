'use client';
import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
export interface StoreTemplateConfig {
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
  // Logo como imagen
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
  // Typography font
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

const DEFAULTS: StoreTemplateConfig = {
  templateId:       'vitrina',
  storeSlug:        'mi-tienda',
  storeName:        'Mi Tienda',
  logoEmoji:        '🏪',
  whatsapp:         '0981000000',
  heroTagline:      'Comprá, ofertá y negociá\nal mejor precio',
  heroDescription:  'Encontrá los mejores productos con garantía y envío rápido. Hacé tu oferta — el Robot Negociador responde al instante.',
  heroGrad1:        '#0b1220',
  heroGrad2:        '#14213d',
  accentColor:      '#F5C518',
  accentText:       '#0b1220',
  statNum:          '0',
  statLabel:        'Productos',
  robotEnabled:     true,
  categories:       ['Todos', 'Electrónica', 'Ropa', 'Hogar', 'Libros'],
  showReviewsStrip: true,
  showStoreChip:    true,
  showHeroSearch:   true,
  showInfoBar:      true,
  showMasVendidos:  true,
  showStats:        true,
  showWhatsApp:     true,
  reviewsCount:     '+127 clientes satisfechos',
  reviewsAvatars:   ['👩', '👨', '👩🏽', '👨🏻'],
  heroSearchPlaceholder: 'Buscar productos...',
  masVendidosTitle: '🔥 Productos más vendidos',
  sectionOrder:      ['hero', 'infoBar', 'about', 'categories', 'masVendidos', 'products'],
  storeFont:         '',
  showAbout:         true,
  heroTitleFontSize: 28,
  heroTitleColor:    '#ffffff',
  heroDescFontSize:  14,
  heroDescColor:     '#94a3b8',
  sectionTitleColor: '#0f172a',
  btnRadius:         8,
  bodyBg:            '#f8fafc',
  robotLabel:        'Robot Negociador',
  showBreadcrumb:    true,
};

/* ═══════════════════════════════════════════════════════════════
   PALETTES
   ═══════════════════════════════════════════════════════════════ */
const PALETTES = [
  { name: 'TukiOro',     grad1: '#0b1220', grad2: '#14213d', accent: '#F5C518', text: '#0b1220' },
  { name: 'Medianoche',  grad1: '#0f0f1a', grad2: '#1a1a2e', accent: '#a855f7', text: '#fff'    },
  { name: 'Bosque',      grad1: '#0d1f13', grad2: '#1a3a27', accent: '#4ade80', text: '#0d1f13' },
  { name: 'Océano',      grad1: '#0c1a2e', grad2: '#0e3054', accent: '#38bdf8', text: '#0c1a2e' },
  { name: 'Fuego',       grad1: '#1a0a00', grad2: '#2d1100', accent: '#f97316', text: '#1a0a00' },
  { name: 'Rosa Neon',   grad1: '#1a0515', grad2: '#2d0d20', accent: '#f472b6', text: '#1a0515' },
];

const FONT_OPTIONS = [
  { name: 'Sistema',    value: '',                 css: 'system-ui,sans-serif',             url: '' },
  { name: 'Poppins',    value: 'Poppins',          css: "'Poppins', sans-serif",             url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;900&display=swap' },
  { name: 'Montserrat', value: 'Montserrat',       css: "'Montserrat', sans-serif",          url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap' },
  { name: 'Playfair',   value: 'Playfair Display', css: "'Playfair Display', serif",         url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap' },
  { name: 'Oswald',     value: 'Oswald',           css: "'Oswald', sans-serif",              url: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap' },
  { name: 'Lato',       value: 'Lato',             css: "'Lato', sans-serif",                url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap' },
];

/* ═══════════════════════════════════════════════════════════════
   SECTION META
   ═══════════════════════════════════════════════════════════════ */
const SECTION_LABELS: Record<string, string> = {
  hero:        '🎨 Hero / Portada',
  infoBar:     'ℹ️ Barra de info',
  about:       '📖 Sobre la tienda',
  categories:  '🏷️ Categorías',
  masVendidos: '🔥 Más vendidos',
  products:    '📦 Productos',
};
const DEFAULT_SECTION_ORDER = ['hero', 'infoBar', 'about', 'categories', 'masVendidos', 'products'];
const DEFAULT_HERO_BLOCK_ORDER = ['header', 'description', 'reviews', 'search', 'stats'];
const HERO_BLOCK_LABELS: Record<string, string> = {
  header:      '🖼️ Logo + Nombre + Título',
  description: '📄 Descripción',
  reviews:     '⭐ Strip de reseñas',
  search:      '🔍 Buscador',
  stats:       '📊 Stats + Robot + WhatsApp',
};

/* ═══════════════════════════════════════════════════════════════
   MINI PREVIEW — renders a scaled-down version of Template 1
   ═══════════════════════════════════════════════════════════════ */
function MiniPreview({ cfg }: { cfg: StoreTemplateConfig }) {
  const acc         = cfg.accentColor;
  const grad        = `linear-gradient(135deg, ${cfg.heroGrad1} 0%, ${cfg.heroGrad2} 100%)`;
  const avatars     = cfg.reviewsAvatars ?? ['👩','👨','👩🏽','👨🏻'];
  const reviewsText = cfg.reviewsCount ?? '+127 clientes satisfechos';
  const searchPH    = cfg.heroSearchPlaceholder || 'Buscar productos...';
  const masVTitle   = cfg.masVendidosTitle || '🔥 Más vendidos';
  const titleSz     = (cfg.heroTitleFontSize ?? 28) / 2.5;
  const titleClr    = cfg.heroTitleColor ?? '#ffffff';
  const descSz      = (cfg.heroDescFontSize ?? 14) / 1.85;
  const descClr     = cfg.heroDescColor ?? '#94a3b8';
  const secTitleClr = cfg.sectionTitleColor ?? '#0f172a';
  const radius      = Math.max(2, (cfg.btnRadius ?? 8) / 1.6);
  const bodyBg      = cfg.bodyBg ?? '#f8fafc';
  const order       = cfg.sectionOrder ?? DEFAULT_SECTION_ORDER;
  const fontCss     = FONT_OPTIONS.find(f => f.value === (cfg.storeFont ?? ''))?.css ?? 'system-ui,sans-serif';

  /* ── Section elements ── */
  const hbo = cfg.heroBlockOrder ?? DEFAULT_HERO_BLOCK_ORDER;
  const hba = cfg.heroBlockAlignment ?? {};
  const hAlign = (id: string) => {
    const a = (hba[id] ?? 'left') as 'left' | 'center' | 'right';
    return a === 'center' ? { display: 'flex', justifyContent: 'center' }
         : a === 'right'  ? { display: 'flex', justifyContent: 'flex-end' }
         : { display: 'flex', justifyContent: 'flex-start' };
  };
  const heroBlocks: Record<string, ReactNode> = {
    header: (
      <div style={{ ...hAlign('header'), marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 28, background: `${acc}22`, border: `1.5px solid ${acc}55`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, overflow: 'hidden' }}>
            {cfg.logoImage ? <img src={cfg.logoImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cfg.logoEmoji}
          </div>
          <div>
            {cfg.showStoreChip !== false && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${acc}18`, border: `1px solid ${acc}40`, borderRadius: 10, padding: '1px 7px', marginBottom: 3 }}>
                <span style={{ fontSize: 7, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🛒 {cfg.storeName}</span>
              </div>
            )}
            <div style={{ fontSize: titleSz, fontWeight: 900, color: titleClr, lineHeight: 1.2, whiteSpace: 'pre-line' }}>{cfg.heroTagline}</div>
          </div>
        </div>
      </div>
    ),
    description: (
      <div style={{ textAlign: (hba['description'] ?? 'left') as 'left' | 'center' | 'right', fontSize: descSz, color: descClr, marginBottom: 7, lineHeight: 1.45 }}>{cfg.heroDescription}</div>
    ),
    reviews: cfg.showReviewsStrip !== false ? (
      <div style={{ ...hAlign('reviews'), marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ display: 'flex' }}>
            {avatars.slice(0, 4).map((av, i) => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: `${acc}28`, border: `1px solid ${acc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, marginLeft: i > 0 ? -4 : 0, position: 'relative', zIndex: 4 - i }}>{av}</div>
            ))}
          </div>
          <div>
            <div style={{ display: 'flex', gap: 0.5 }}>{'★★★★★'.split('').map((s, i) => <span key={i} style={{ color: acc, fontSize: 5.5 }}>{s}</span>)}</div>
            <div style={{ fontSize: 5.5, color: descClr }}>{reviewsText}</div>
          </div>
        </div>
      </div>
    ) : null,
    search: cfg.showHeroSearch !== false ? (
      <div style={{ ...hAlign('search'), marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: radius, height: 20, display: 'flex', alignItems: 'center', padding: '0 7px', overflow: 'hidden' }}>
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{searchPH}</span>
          </div>
          <div style={{ background: acc, color: cfg.accentText, borderRadius: radius, padding: '0 8px', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', flexShrink: 0 }}>Buscar</div>
        </div>
      </div>
    ) : null,
    stats: (
      <div style={hAlign('stats')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {cfg.showStats !== false && (
            <>
              <div><div style={{ fontSize: 11, fontWeight: 900, color: acc }}>{cfg.statNum}</div><div style={{ fontSize: 6.5, color: descClr }}>{cfg.statLabel}</div></div>
              <div><div style={{ fontSize: 11, fontWeight: 900, color: acc }}>⭐ 4.8</div><div style={{ fontSize: 6.5, color: descClr }}>Calificación</div></div>
              {cfg.robotEnabled && <div><div style={{ fontSize: 11 }}>🤖</div><div style={{ fontSize: 6.5, color: descClr }}>{cfg.robotLabel ?? 'Robot'}</div></div>}
            </>
          )}
          {cfg.showWhatsApp !== false && (
            <div style={{ marginLeft: 'auto', background: '#25D366', color: '#fff', borderRadius: radius, padding: '3px 7px', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>📱</span> WhatsApp
            </div>
          )}
        </div>
      </div>
    ),
  };
  const heroEl = (
    <div style={{ backgroundImage: cfg.heroCoverImage ? `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${cfg.heroCoverImage})` : grad, backgroundSize: 'cover', backgroundPosition: 'center', padding: '16px 12px 14px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, background: `radial-gradient(circle, ${acc}20 0%, transparent 70%)`, borderRadius: '50%' }} />
      {hbo.map(id => heroBlocks[id] ? <div key={id}>{heroBlocks[id]}</div> : null)}
    </div>
  );

  const infoBarEl = cfg.showInfoBar !== false ? (
    <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '4px 10px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 6, color: '#64748b' }}>🕐 08:00–18:00</span>
      <span style={{ fontSize: 6, color: '#64748b' }}>📍 Asunción</span>
      <span style={{ fontSize: 6, fontWeight: 700, color: '#16a34a' }}>✓ Verificada</span>
      <span style={{ fontSize: 6, fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 2 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />Abierto
      </span>
    </div>
  ) : null;

  const catsEl = (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 10px 4px', background: bodyBg }}>
      {cfg.categories.map((c, i) => (
        <div key={c} style={{ padding: '2px 8px', borderRadius: radius * 2, fontSize: 7, fontWeight: 600, background: i === 0 ? acc : '#fff', color: i === 0 ? cfg.accentText : '#475569', border: '1px solid', borderColor: i === 0 ? acc : '#e2e8f0' }}>{c}</div>
      ))}
    </div>
  );

  const masVendidosEl = cfg.showMasVendidos !== false ? (
    <div style={{ padding: '6px 10px', background: bodyBg }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, color: secTitleClr, marginBottom: 5 }}>{masVTitle}</div>
      <div style={{ display: 'flex', gap: 5 }}>
        {[{ e: '📱', rank: '#1', b: '#FFD700', t: '#7a5c00' }, { e: '🎧', rank: '#2', b: '#C0C0C0', t: '#fff' }, { e: '💻', rank: '#3', b: '#CD7F32', t: '#fff' }].map((item, i) => (
          <div key={i} style={{ flex: 1, background: '#fff', border: `1px solid ${acc}44`, borderRadius: radius, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 3, left: 3, width: 14, height: 14, borderRadius: '50%', background: item.b, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 5.5, fontWeight: 900, color: item.t }}>{item.rank}</div>
            <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{item.e}</div>
            <div style={{ padding: '3px 4px 4px' }}>
              <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginBottom: 2 }} />
              <div style={{ fontSize: 6.5, fontWeight: 800, color: acc }}>Gs. X.XXX</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const productsEl = (
    <div style={{ padding: '6px 10px 10px', background: bodyBg }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: secTitleClr }}>Productos</span>
        <span style={{ fontSize: 7, color: '#64748b' }}>3 resultados</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {['📱', '🎧', '💻'].map((e, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: radius, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ height: 34, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{e}</div>
            <div style={{ padding: '4px 5px' }}>
              <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, marginBottom: 2 }} />
              <div style={{ fontSize: 7, fontWeight: 800, color: acc, marginBottom: 3 }}>Gs. X.XXX.XXX</div>
              <div style={{ background: acc, color: cfg.accentText, borderRadius: Math.max(2, radius / 1.5), textAlign: 'center', fontSize: 6.5, fontWeight: 700, padding: '2px 0' }}>Ver y ofertar</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const aboutEl = (cfg.showAbout !== false && cfg.aboutText) ? (
    <div style={{ padding: '8px 10px', background: bodyBg, borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 7.5, fontWeight: 800, color: secTitleClr, marginBottom: 3 }}>📖 Sobre la tienda</div>
      {cfg.aboutImage && (
        <img src={cfg.aboutImage} alt="" style={{ width: '100%', height: 32, objectFit: 'cover', borderRadius: 4, marginBottom: 4 }} />
      )}
      <div style={{ fontSize: 6.5, color: '#475569', lineHeight: 1.5 }}>{(cfg.aboutText ?? '').slice(0, 120)}{(cfg.aboutText ?? '').length > 120 ? '...' : ''}</div>
    </div>
  ) : null;

  const SECTION_ELS: Record<string, ReactNode> = {
    hero: heroEl, infoBar: infoBarEl, about: aboutEl, categories: catsEl,
    masVendidos: masVendidosEl, products: productsEl,
  };

  return (
    <div style={{ fontFamily: fontCss, background: '#f4f6fb', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', pointerEvents: 'none', userSelect: 'none', fontSize: '10px' }}>
      {/* ── App Header ── */}
      <div style={{ background: '#F5C518', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#0b1220', border: '1.5px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 800, flexShrink: 0 }}>V</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{ fontSize: 6, color: 'rgba(11,18,32,0.5)', lineHeight: 1 }}>Buen día,</span>
          <span style={{ fontSize: 7.5, color: '#0b1220', fontWeight: 800, lineHeight: 1 }}>Cliente</span>
        </div>
        <div style={{ flex: 1, height: 20, background: 'rgba(11,18,32,0.06)', borderRadius: 6, opacity: 0.25 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 3px' }}>
          <div style={{ width: 12, height: 1.5, background: '#0b1220', borderRadius: 1 }} />
          <div style={{ width: 12, height: 1.5, background: '#0b1220', borderRadius: 1 }} />
          <div style={{ width: 12, height: 1.5, background: '#0b1220', borderRadius: 1 }} />
        </div>
        <div style={{ width: 22, height: 22, background: '#0b1220', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🛒</div>
      </div>
      {/* ── Breadcrumb ── */}
      {cfg.showBreadcrumb !== false && (
        <div style={{ background: '#fff', padding: '4px 10px', display: 'flex', gap: 5, alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 7, color: '#3b82f6' }}>Catálogo</span>
          <span style={{ fontSize: 7, color: '#94a3b8' }}>›</span>
          <span style={{ fontSize: 7, color: '#64748b' }}>{cfg.storeName}</span>
        </div>
      )}
      {/* ── Sections in user-defined order ── */}
      {order.map(id => {
        const el = SECTION_ELS[id];
        if (!el) return null;
        const align = ((cfg.sectionAlignment ?? {})[id] ?? 'left') as 'left' | 'center' | 'right';
        return <div key={id} style={{ textAlign: align }}>{el}</div>;
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EDITOR FIELD HELPERS
   ═══════════════════════════════════════════════════════════════ */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="vnd-label">{label}</label>
      {hint && <span style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', marginTop: -2 }}>{hint}</span>}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="vnd-card" style={{ marginBottom: 16 }}>
      <div className="vnd-card-header">
        <span className="vnd-card-title"><span className="vnd-card-title-dot" />{title}</span>
      </div>
      <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: 'var(--vnd-bg)', borderRadius: 10, border: '1px solid var(--vnd-border)', cursor: 'pointer' }} onClick={onToggle}>
      <button
        type="button"
        style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: enabled ? 'var(--vnd-accent)' : '#cbd5e1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
        role="switch"
        aria-checked={enabled}
        onClick={e => { e.stopPropagation(); onToggle(); }}
      >
        <span style={{ position: 'absolute', top: 2, left: enabled ? 19 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
      <span style={{ fontSize: '0.82rem', color: enabled ? 'var(--vnd-text)' : 'var(--vnd-text-muted)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: enabled ? '#16a34a' : '#94a3b8' }}>{enabled ? 'ON' : 'OFF'}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function PlantillasPage() {
  const [cfg, setCfg]         = useState<StoreTemplateConfig>(DEFAULTS);
  const [saved, setSaved]     = useState(false);
  const [catInput, setCatInput] = useState('');
  const [view, setView]       = useState<'gallery' | 'editor'>('editor');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [heroDragIdx, setHeroDragIdx] = useState<number | null>(null);

  /* Load config — Supabase first (persists cross-device), localStorage as fallback */
  useEffect(() => {
    const load = async () => {
      const applyOrder = (parsed: StoreTemplateConfig) => {
        const order: string[] = parsed.sectionOrder ?? [...DEFAULT_SECTION_ORDER];
        if (!order.includes('about')) {
          const idx = order.indexOf('infoBar');
          order.splice(idx >= 0 ? idx + 1 : 2, 0, 'about');
          parsed.sectionOrder = order;
        }
        return parsed;
      };
      // 1. Try Supabase (source of truth)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('store_configs').select('config').eq('vendor_id', user.id).single();
        if (data?.config) {
          setCfg(applyOrder(data.config as StoreTemplateConfig));
          return;
        }
      }
      // 2. Fallback to localStorage — auto-sync to Supabase so client store page gets real data
      try {
        const raw = localStorage.getItem('tukimarket_template_mi-tienda');
        if (raw) {
          const parsed = applyOrder(JSON.parse(raw));
          setCfg(parsed);
          if (user) {
            const cfgForDb = { ...parsed, storeSlug: user.id };
            supabase.from('store_configs').upsert({
              vendor_id: user.id,
              config: cfgForDb,
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch { /* ignore */ }
    };
    load();
  }, []);

  useEffect(() => {
    const font = FONT_OPTIONS.find(f => f.value === (cfg.storeFont ?? ''));
    if (!font?.url) return;
    const existing = document.getElementById('store-font-link');
    if (existing) (existing as HTMLLinkElement).href = font.url;
    else {
      const link = document.createElement('link');
      link.id = 'store-font-link';
      link.rel = 'stylesheet';
      link.href = font.url;
      document.head.appendChild(link);
    }
  }, [cfg.storeFont]);

  function update<K extends keyof StoreTemplateConfig>(key: K, value: StoreTemplateConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  function applyPalette(p: typeof PALETTES[0]) {
    setCfg(prev => ({ ...prev, heroGrad1: p.grad1, heroGrad2: p.grad2, accentColor: p.accent, accentText: p.text }));
  }

  function addCategory() {
    const v = catInput.trim();
    if (!v || cfg.categories.includes(v)) { setCatInput(''); return; }
    setCfg(prev => ({ ...prev, categories: [...prev.categories, v] }));
    setCatInput('');
  }

  function removeCategory(cat: string) {
    setCfg(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }));
  }

  async function handleSave() {
    try {
      localStorage.setItem('tukimarket_template_mi-tienda', JSON.stringify(cfg));
      localStorage.setItem(`tukimarket_config_${cfg.storeSlug}`, JSON.stringify(cfg));
      // Save to Supabase so visitors can load vendor store branding by UUID
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const cfgForDb = { ...cfg, storeSlug: user.id };
        const { error } = await supabase.from('store_configs').upsert({
          vendor_id: user.id,
          config: cfgForDb,
          updated_at: new Date().toISOString(),
        });
        if (error) { alert('Error al guardar en la nube: ' + error.message); return; }
      }
    } catch (e) {
      alert('Error al guardar: ' + (e as Error).message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function moveHeroBlock(idx: number, dir: -1 | 1) {
    const order = [...(cfg.heroBlockOrder ?? DEFAULT_HERO_BLOCK_ORDER)];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    update('heroBlockOrder', order);
  }
  function setHeroBlockAlign(id: string, align: 'left' | 'center' | 'right') {
    update('heroBlockAlignment', { ...(cfg.heroBlockAlignment ?? {}), [id]: align });
  }

  const storeUrl = `/tienda/${cfg.storeSlug}`;

  /* ══ GALLERY VIEW ══════════════════════════════════════════ */
  if (view === 'gallery') {
    return (
      <div>
        {/* Template grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>

          {/* ── Plantilla 1: Mi Store ── */}
          <div style={{
            borderRadius: 18, overflow: 'hidden', background: 'var(--vnd-bg-elevated)',
            border: '1.5px solid var(--vnd-accent)', boxShadow: '0 0 0 4px rgba(245,197,24,0.12)',
          }}>
            {/* Colored top bar */}
            <div style={{ background: 'linear-gradient(90deg, #F5C518 0%, #f0b000 100%)', padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#16a34a', display: 'inline-block', boxShadow: '0 0 0 3px rgba(22,163,74,0.35)' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0b1220', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Activa</span>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(11,18,32,0.65)' }}>Mi Store</span>
            </div>

            {/* Preview thumbnail */}
            <div style={{ padding: '14px 14px 0' }}>
              <MiniPreview cfg={cfg} />
            </div>

            {/* Feature pills */}
            <div style={{ padding: '12px 18px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Hero', 'Buscador', 'Categorías', 'Grilla', '🔥 Más vendidos', 'WhatsApp'].map(f => (
                <span key={f} style={{ background: 'var(--vnd-bg)', border: '1px solid var(--vnd-border)', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600, color: 'var(--vnd-text)', padding: '2px 9px' }}>{f}</span>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ padding: '12px 18px 18px', display: 'flex', gap: 10 }}>
              <button
                className="vnd-btn vnd-btn-primary"
                style={{ flex: 1 }}
                onClick={() => setView('editor')}
              >
                ✏️ Personalizar
              </button>
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="vnd-btn vnd-btn-secondary"
                style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                👁️ Ver tienda
              </a>
            </div>
          </div>

          {/* ── Próximamente ── */}
          {['Catálogo Minimalista', 'Tienda Premium', 'Boutique'].map(name => (
            <div key={name} style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--vnd-bg-elevated)', border: '1.5px solid var(--vnd-border)', opacity: 0.5, pointerEvents: 'none' }}>
              <div style={{ height: 200, background: 'var(--vnd-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--vnd-border)' }}>
                <span style={{ fontSize: '2.5rem' }}>🔒</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', fontWeight: 600 }}>Próximamente</span>
              </div>
              <div style={{ padding: '14px 18px 18px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--vnd-text)' }}>{name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ══ EDITOR VIEW ════════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button
            type="button"
            onClick={() => setView('gallery')}
            style={{ background: 'none', border: 'none', color: 'var(--vnd-text-muted)', cursor: 'pointer', fontSize: '0.82rem', padding: 0, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Plantillas
          </button>

        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={storeUrl} target="_blank" rel="noreferrer" className="vnd-btn vnd-btn-secondary" style={{ textDecoration: 'none' }}>
            👁️ Ver mi tienda →
          </a>
          <button className="vnd-btn vnd-btn-primary" onClick={handleSave} disabled={saved}>
            {saved ? '✅ Guardado' : '💾 Guardar cambios'}
          </button>
        </div>
      </div>

      {saved && (
        <div style={{ background: '#16a34a22', border: '1px solid #4ade80', borderRadius: 10, padding: '10px 16px', marginBottom: 16, color: '#4ade80', fontSize: '0.85rem' }}>
          ✅ Cambios guardados. Compartí este link con tus clientes:
          <a href={storeUrl} target="_blank" rel="noreferrer" style={{ color: '#4ade80', fontWeight: 700, marginLeft: 8 }}>
            tukitask.vercel.app{storeUrl}
          </a>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ══ LEFT: EDITOR ══════════════════════════════════════ */}
        <div>

          {/* Identidad */}
          <Section title="🏪 Identidad">
            <Field label="Nombre de la tienda">
              <input className="vnd-input" value={cfg.storeName} onChange={e => update('storeName', e.target.value)} maxLength={60} />
            </Field>
            <Field label="Logo de la tienda">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--vnd-bg)', border: '2px dashed var(--vnd-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {cfg.logoImage
                    ? <img src={cfg.logoImage} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '1.8rem' }}>{cfg.logoEmoji || '🏪'}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', padding: '7px 10px', background: 'var(--vnd-bg)', border: '1px solid var(--vnd-border)', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, color: 'var(--vnd-text)' }}>
                    📸 Subir imagen
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { alert('Máx 2 MB'); return; }
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) { alert('Iniciá sesión primero'); return; }
                        const ext = file.name.split('.').pop() || 'jpg';
                        const path = `${user.id}/store-logo.${ext}`;
                        const { data, error } = await supabase.storage
                          .from('product-images').upload(path, file, { cacheControl: '3600', upsert: true });
                        if (error || !data) { alert('Error al subir: ' + (error?.message ?? 'desconocido')); return; }
                        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(data.path);
                        update('logoImage', publicUrl);
                      }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="vnd-input" value={cfg.logoEmoji} onChange={e => update('logoEmoji', e.target.value)} maxLength={4} style={{ width: 50, fontSize: '1.3rem', textAlign: 'center', flexShrink: 0 }} placeholder="🏪" title="Emoji si no hay imagen" />
                    {cfg.logoImage && (
                      <button type="button" onClick={() => update('logoImage', undefined)} style={{ flex: 1, padding: '6px', background: 'none', border: '1px solid #ef444430', borderRadius: 8, color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer' }}>
                        × Quitar imagen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Field>
            <Field label="WhatsApp">
              <input className="vnd-input" value={cfg.whatsapp} onChange={e => update('whatsapp', e.target.value)} placeholder="0981000000" maxLength={20} />
            </Field>
            <Field label="Slug (URL de tu tienda)" hint="Solo letras minúsculas, números y guiones">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--vnd-text-muted)', whiteSpace: 'nowrap' }}>tukitask.vercel.app/tienda/</span>
                <input
                  className="vnd-input"
                  value={cfg.storeSlug}
                  onChange={e => update('storeSlug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  maxLength={30}
                  style={{ flex: 1 }}
                />
              </div>
            </Field>
          </Section>

          {/* Hero */}
          <Section title="🎨 Portada (Hero)">
            {/* ── Orden y alineación de bloques del hero ── */}
            <div style={{ borderBottom: '1px solid var(--vnd-border)', paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: '0.76rem', color: 'var(--vnd-text-muted)', margin: 0 }}>⠿ Arrastrar · ▲▼ Mover · ◄●► Alinear elementos del hero</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(cfg.heroBlockOrder ?? DEFAULT_HERO_BLOCK_ORDER).map((id, idx) => {
                  const hbo2 = cfg.heroBlockOrder ?? DEFAULT_HERO_BLOCK_ORDER;
                  const align = ((cfg.heroBlockAlignment ?? {})[id] ?? 'left') as 'left' | 'center' | 'right';
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => setHeroDragIdx(idx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (heroDragIdx === null || heroDragIdx === idx) { setHeroDragIdx(null); return; }
                        const newOrder = [...(cfg.heroBlockOrder ?? DEFAULT_HERO_BLOCK_ORDER)];
                        const [moved] = newOrder.splice(heroDragIdx, 1);
                        newOrder.splice(idx, 0, moved);
                        update('heroBlockOrder', newOrder);
                        setHeroDragIdx(null);
                      }}
                      onDragEnd={() => setHeroDragIdx(null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                        borderRadius: 10, cursor: 'grab', userSelect: 'none',
                        background: heroDragIdx === idx ? 'rgba(245,197,24,0.12)' : 'var(--vnd-bg)',
                        border: `1px solid ${heroDragIdx === idx ? 'var(--vnd-accent)' : 'var(--vnd-border)'}`,
                        transition: 'background 0.15s, border-color 0.15s',
                        opacity: heroDragIdx !== null && heroDragIdx !== idx ? 0.55 : 1,
                      }}
                    >
                      <span style={{ color: 'var(--vnd-text-muted)', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>⠿</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text)', flex: 1 }}>{HERO_BLOCK_LABELS[id]}</span>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--vnd-text-muted)', background: 'var(--vnd-bg-elevated)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>#{idx + 1}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <button type="button" onClick={e => { e.stopPropagation(); moveHeroBlock(idx, -1); }} disabled={idx === 0}
                          style={{ width: 20, height: 17, border: '1px solid var(--vnd-border)', borderRadius: 4, background: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', color: 'var(--vnd-text)', fontSize: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                        <button type="button" onClick={e => { e.stopPropagation(); moveHeroBlock(idx, 1); }} disabled={idx === hbo2.length - 1}
                          style={{ width: 20, height: 17, border: '1px solid var(--vnd-border)', borderRadius: 4, background: 'none', cursor: idx === hbo2.length - 1 ? 'not-allowed' : 'pointer', color: 'var(--vnd-text)', fontSize: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: idx === hbo2.length - 1 ? 0.3 : 1 }}>▼</button>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        {(['left', 'center', 'right'] as const).map(a => (
                          <button key={a} type="button" onClick={e => { e.stopPropagation(); setHeroBlockAlign(id, a); }}
                            title={a === 'left' ? 'Izquierda' : a === 'center' ? 'Centro' : 'Derecha'}
                            style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${align === a ? 'var(--vnd-accent)' : 'var(--vnd-border)'}`, background: align === a ? 'var(--vnd-accent)' : 'none', color: align === a ? '#0b1220' : 'var(--vnd-text-muted)', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                            {a === 'left' ? '◀' : a === 'center' ? '●' : '▶'}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Toggle enabled={cfg.showStoreChip !== false} onToggle={() => update('showStoreChip', cfg.showStoreChip === false)} label='Chip "Mi Tienda" en portada' />
            <Field label="Título principal" hint="Usá \\n para salto de línea">
              <textarea
                className="vnd-input"
                value={cfg.heroTagline}
                onChange={e => update('heroTagline', e.target.value)}
                rows={2}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                maxLength={100}
              />
            </Field>
            <Field label="Descripción">
              <textarea
                className="vnd-input"
                value={cfg.heroDescription}
                onChange={e => update('heroDescription', e.target.value)}
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                maxLength={220}
              />
            </Field>
            <Field label="Imagen de fondo del hero" hint="Foto de tu local, productos o equipo (máx 1 MB)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cfg.heroCoverImage && (
                  <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', height: 80 }}>
                    <img src={cfg.heroCoverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => update('heroCoverImage', undefined)}
                      style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '0.7rem', cursor: 'pointer', padding: '3px 7px' }}
                    >× Quitar</button>
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', padding: '10px', background: 'var(--vnd-bg)', border: '2px dashed var(--vnd-border)', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600, color: 'var(--vnd-text-muted)' }}>
                  🖼️ {cfg.heroCoverImage ? 'Cambiar imagen de fondo' : 'Subir imagen de fondo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 1024 * 1024) { alert('Máx 1 MB'); return; }
                      const reader = new FileReader();
                      reader.onload = ev => { if (ev.target?.result) update('heroCoverImage', ev.target.result as string); };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </Field>
            <div className="vnd-form-grid">
              <Field label="Estadística (número)">
                <input className="vnd-input" value={cfg.statNum} onChange={e => update('statNum', e.target.value)} maxLength={8} />
              </Field>
              <Field label="Etiqueta">
                <input className="vnd-input" value={cfg.statLabel} onChange={e => update('statLabel', e.target.value)} maxLength={20} />
              </Field>
            </div>

            {/* Robot toggle */}
            <Toggle
              enabled={cfg.robotEnabled}
              onToggle={() => update('robotEnabled', !cfg.robotEnabled)}
              label="🤖 Robot Negociador en portada"
            />
            <div style={{ opacity: cfg.robotEnabled ? 1 : 0.45, pointerEvents: cfg.robotEnabled ? 'auto' : 'none' }}>
              <Field label="Etiqueta del Robot">
                <input className="vnd-input" value={cfg.robotLabel ?? 'Robot Negociador'} onChange={e => update('robotLabel', e.target.value)} placeholder="Robot Negociador" maxLength={30} />
              </Field>
            </div>
            <Field label="Buscador — placeholder" hint="Texto que aparece en el campo de búsqueda del hero">
              <input className="vnd-input" value={cfg.heroSearchPlaceholder ?? ''} onChange={e => update('heroSearchPlaceholder', e.target.value)} placeholder="Buscar productos..." maxLength={60} />
            </Field>

            {/* Sobre la tienda — dentro del hero */}
            <div style={{ borderTop: '1px solid var(--vnd-border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Toggle
                enabled={cfg.showAbout !== false}
                onToggle={() => update('showAbout', cfg.showAbout !== false ? false : true)}
                label="📖 Sobre la tienda"
              />
              <div style={{ opacity: cfg.showAbout === false ? 0.45 : 1, pointerEvents: cfg.showAbout === false ? 'none' : 'auto' }}>
                <Field label="Descripción de tu negocio" hint="Hasta 400 caracteres">
                  <textarea
                    className="vnd-input"
                    value={cfg.aboutText ?? ''}
                    onChange={e => update('aboutText', e.target.value)}
                    rows={4}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    maxLength={400}
                    placeholder="Contá quiénes son, cuánto tiempo llevan en el mercado, qué los hace especiales..."
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Secciones */}
          <Section title="🧩 Secciones">
            {/* Sección reorder — drag */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(cfg.sectionOrder ?? DEFAULT_SECTION_ORDER).map((id, idx) => {
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx === null || dragIdx === idx) { setDragIdx(null); return; }
                      const newOrder = [...(cfg.sectionOrder ?? DEFAULT_SECTION_ORDER)];
                      const [moved] = newOrder.splice(dragIdx, 1);
                      newOrder.splice(idx, 0, moved);
                      update('sectionOrder', newOrder);
                      setDragIdx(null);
                    }}
                    onDragEnd={() => setDragIdx(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
                      borderRadius: 10, cursor: 'grab', userSelect: 'none',
                      background: dragIdx === idx ? 'rgba(245,197,24,0.12)' : 'var(--vnd-bg)',
                      border: `1px solid ${dragIdx === idx ? 'var(--vnd-accent)' : 'var(--vnd-border)'}`,
                      transition: 'background 0.15s, border-color 0.15s',
                      opacity: dragIdx !== null && dragIdx !== idx ? 0.55 : 1,
                    }}
                  >
                    <span style={{ color: 'var(--vnd-text-muted)', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>⠿</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text)', flex: 1 }}>{SECTION_LABELS[id]}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--vnd-text-muted)', background: 'var(--vnd-bg-elevated)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>#{idx + 1}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ height: 1, background: 'var(--vnd-border)' }} />

            <Toggle enabled={cfg.showReviewsStrip !== false} onToggle={() => update('showReviewsStrip', cfg.showReviewsStrip === false)} label="⭐ Strip de reseñas en portada" />
            <div style={{ opacity: cfg.showReviewsStrip === false ? 0.45 : 1, pointerEvents: cfg.showReviewsStrip === false ? 'none' : 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Avatares de clientes" hint="Emojis separados por coma">
                <input className="vnd-input" value={(cfg.reviewsAvatars ?? ['👩','👨','👩🏽','👨🏻']).join(', ')} onChange={e => update('reviewsAvatars', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="👩, 👨, 👩🏽, 👨🏻" maxLength={40} />
              </Field>
              <Field label="Texto de satisfacción">
                <input className="vnd-input" value={cfg.reviewsCount ?? ''} onChange={e => update('reviewsCount', e.target.value)} placeholder="+127 clientes satisfechos" maxLength={50} />
              </Field>
            </div>

            <Toggle enabled={cfg.showHeroSearch !== false} onToggle={() => update('showHeroSearch', cfg.showHeroSearch === false)} label="🔍 Buscador en portada" />
            <Toggle enabled={cfg.showStats !== false} onToggle={() => update('showStats', cfg.showStats === false)} label="📊 Estadísticas en portada" />
            <Toggle enabled={cfg.showWhatsApp !== false} onToggle={() => update('showWhatsApp', cfg.showWhatsApp === false)} label="💬 Botón WhatsApp" />
            <Toggle enabled={cfg.showInfoBar !== false} onToggle={() => update('showInfoBar', cfg.showInfoBar === false)} label="ℹ️ Barra de info (horario y dirección)" />
            <Toggle enabled={cfg.showMasVendidos !== false} onToggle={() => update('showMasVendidos', cfg.showMasVendidos === false)} label="🔥 Sección de más vendidos" />
            <div style={{ opacity: cfg.showMasVendidos === false ? 0.45 : 1, pointerEvents: cfg.showMasVendidos === false ? 'none' : 'auto' }}>
              <Field label="Título de más vendidos">
                <input className="vnd-input" value={cfg.masVendidosTitle ?? ''} onChange={e => update('masVendidosTitle', e.target.value)} placeholder="🔥 Productos más vendidos" maxLength={40} />
              </Field>
            </div>
            <Toggle enabled={cfg.showBreadcrumb !== false} onToggle={() => update('showBreadcrumb', cfg.showBreadcrumb === false)} label="🗺️ Miga de pan (Catálogo › Mi Tienda)" />
          </Section>

          {/* Tipografía */}
          <Section title="📐 Tipografía">
            <Field label="Fuente tipográfica">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {FONT_OPTIONS.map(f => {
                  const selected = (cfg.storeFont ?? '') === f.value;
                  return (
                    <button
                      key={f.value || 'system'}
                      type="button"
                      onClick={() => update('storeFont', f.value)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: 8,
                        border: selected ? '2px solid var(--vnd-accent)' : '1px solid var(--vnd-border)',
                        background: selected ? 'rgba(245,197,24,0.12)' : 'var(--vnd-bg)',
                        cursor: 'pointer',
                        fontFamily: f.css,
                        fontSize: '0.72rem',
                        fontWeight: selected ? 700 : 400,
                        color: selected ? 'var(--vnd-accent)' : 'var(--vnd-text)',
                      }}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Título de portada" hint={`Tamaño: ${cfg.heroTitleFontSize ?? 28}px`}>
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={cfg.heroTitleColor ?? '#ffffff'}
                  onChange={e => update('heroTitleColor', e.target.value)}
                  title="Color del título"
                  style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--vnd-border)' }}
                />
                <input
                  type="range" min={16} max={52} step={2}
                  value={cfg.heroTitleFontSize ?? 28}
                  onChange={e => update('heroTitleFontSize', Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--vnd-accent)' }}
                />
              </div>
            </Field>
            <Field label="Descripción de portada" hint={`Tamaño: ${cfg.heroDescFontSize ?? 14}px`}>
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={cfg.heroDescColor ?? '#94a3b8'}
                  onChange={e => update('heroDescColor', e.target.value)}
                  title="Color de la descripción"
                  style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--vnd-border)' }}
                />
                <input
                  type="range" min={10} max={22} step={1}
                  value={cfg.heroDescFontSize ?? 14}
                  onChange={e => update('heroDescFontSize', Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--vnd-accent)' }}
                />
              </div>
            </Field>
            <Field label="Títulos de sección">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={cfg.sectionTitleColor ?? '#0f172a'}
                  onChange={e => update('sectionTitleColor', e.target.value)}
                  style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--vnd-border)', flexShrink: 0 }}
                />
                <input className="vnd-input" value={cfg.sectionTitleColor ?? '#0f172a'} onChange={e => update('sectionTitleColor', e.target.value)} maxLength={9} style={{ flex: 1 }} />
              </div>
            </Field>
          </Section>

          {/* Botones y fondo */}
          <Section title="🔲 Botones y Fondo">
            <Field label="Radio de esquinas de botones" hint={`${cfg.btnRadius ?? 8}px`}>
              <input
                type="range" min={0} max={32} step={2}
                value={cfg.btnRadius ?? 8}
                onChange={e => update('btnRadius', Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--vnd-accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--vnd-text-muted)', marginTop: -2 }}>
                <span>Cuadrado</span><span>Redondeado</span>
              </div>
            </Field>
            <Field label="Color de fondo del contenido">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={cfg.bodyBg ?? '#f8fafc'}
                  onChange={e => update('bodyBg', e.target.value)}
                  style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--vnd-border)', flexShrink: 0 }}
                />
                <input className="vnd-input" value={cfg.bodyBg ?? '#f8fafc'} onChange={e => update('bodyBg', e.target.value)} maxLength={9} style={{ flex: 1 }} />
              </div>
            </Field>
          </Section>

          {/* Colors */}
          <Section title="🎨 Colores">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PALETTES.map(p => {
                const selected = cfg.heroGrad1 === p.grad1 && cfg.accentColor === p.accent;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPalette(p)}
                    style={{
                      border: selected ? `2px solid ${p.accent}` : '2px solid transparent',
                      borderRadius: 10, cursor: 'pointer', overflow: 'hidden', padding: 0,
                      outline: selected ? `3px solid ${p.accent}55` : 'none',
                    }}
                  >
                    <div style={{ background: `linear-gradient(135deg, ${p.grad1}, ${p.grad2})`, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.accent, border: '2px solid rgba(255,255,255,0.3)' }} />
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{p.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="vnd-form-grid">
              <Field label="Color acento">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={cfg.accentColor} onChange={e => update('accentColor', e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0, background: 'none' }} />
                  <input className="vnd-input" value={cfg.accentColor} onChange={e => update('accentColor', e.target.value)} maxLength={7} style={{ flex: 1 }} />
                </div>
              </Field>
              <Field label="Texto sobre acento">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={cfg.accentText} onChange={e => update('accentText', e.target.value)} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0, background: 'none' }} />
                  <input className="vnd-input" value={cfg.accentText} onChange={e => update('accentText', e.target.value)} maxLength={7} style={{ flex: 1 }} />
                </div>
              </Field>
            </div>
          </Section>

          {/* Categories */}
          <Section title="🏷️ Categorías / Filtros">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cfg.categories.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--vnd-bg-elevated)', border: '1px solid var(--vnd-border)', borderRadius: 20, padding: '3px 10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text)' }}>{c}</span>
                  <button
                    type="button"
                    onClick={() => removeCategory(c)}
                    style={{ background: 'none', border: 'none', color: 'var(--vnd-text-muted)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="vnd-input"
                placeholder="Nueva categoría..."
                value={catInput}
                onChange={e => setCatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                style={{ flex: 1 }}
              />
              <button type="button" className="vnd-btn vnd-btn-secondary vnd-btn-sm" onClick={addCategory}>+ Agregar</button>
            </div>
          </Section>

          {/* SEO */}
          <Section title="🔍 SEO">
            <Field label="Meta título" hint="Título en Google (máx 60 caracteres)">
              <input className="vnd-input" value={cfg.seoTitle ?? ''} onChange={e => update('seoTitle', e.target.value)} placeholder={`${cfg.storeName} – TukiTask`} maxLength={60} />
            </Field>
            <Field label="Meta descripción" hint="Descripción en resultados de búsqueda (máx 160 caracteres)">
              <textarea className="vnd-input" value={cfg.seoDescription ?? ''} onChange={e => update('seoDescription', e.target.value)} rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} maxLength={160} />
            </Field>
            <Field label="Palabras clave" hint="Separadas por coma">
              <input className="vnd-input" value={cfg.seoKeywords ?? ''} onChange={e => update('seoKeywords', e.target.value)} placeholder="electrónica, computadoras, Paraguay" maxLength={120} />
            </Field>
          </Section>

        </div>

        {/* ══ RIGHT: LIVE PREVIEW ═══════════════════════════════ */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--vnd-text-muted)' }}>Vista previa en tiempo real</span>
            <a href={storeUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--vnd-accent)', fontWeight: 600, textDecoration: 'none' }}>
              Abrir tamaño real ↗
            </a>
          </div>

          {/* Preview card */}
          <div style={{ background: 'var(--vnd-bg-elevated)', borderRadius: 16, padding: 16, border: '1px solid var(--vnd-border)' }}>
            <MiniPreview cfg={cfg} />
          </div>

          {/* Share section */}
          <div className="vnd-card" style={{ marginTop: 20 }}>
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />🔗 Link de tu tienda</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'var(--vnd-bg-elevated)', border: '1px solid var(--vnd-border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--vnd-text-muted)', wordBreak: 'break-all' }}>
                https://tukitask.vercel.app{storeUrl}
              </div>
              <button
                type="button"
                className="vnd-btn vnd-btn-secondary vnd-btn-sm"
                onClick={() => navigator.clipboard?.writeText(`https://tukitask.vercel.app${storeUrl}`).catch(() => {})}
                style={{ alignSelf: 'flex-start' }}
              >
                📋 Copiar link
              </button>
              <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', margin: 0 }}>
                Compartí este link con tus clientes en WhatsApp, Instagram o Facebook para que visiten tu tienda directamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
