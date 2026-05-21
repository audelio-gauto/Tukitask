'use client';
import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';

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
  showHeroSearch:   true,
  showInfoBar:      true,
  showMasVendidos:  true,
  showStats:        true,
  showWhatsApp:     true,
  reviewsCount:     '+127 clientes satisfechos',
  reviewsAvatars:   ['👩', '👨', '👩🏽', '👨🏻'],
  heroSearchPlaceholder: 'Buscar productos...',
  masVendidosTitle: '🔥 Productos más vendidos',
  sectionOrder:      ['hero', 'infoBar', 'categories', 'masVendidos', 'products'],
  heroTitleFontSize: 28,
  heroTitleColor:    '#ffffff',
  heroDescFontSize:  14,
  heroDescColor:     '#94a3b8',
  sectionTitleColor: '#0f172a',
  btnRadius:         8,
  bodyBg:            '#f8fafc',
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

/* ═══════════════════════════════════════════════════════════════
   SECTION META
   ═══════════════════════════════════════════════════════════════ */
const SECTION_LABELS: Record<string, string> = {
  hero:        '🎨 Hero / Portada',
  infoBar:     'ℹ️ Barra de info',
  categories:  '🏷️ Categorías',
  masVendidos: '🔥 Más vendidos',
  products:    '📦 Productos',
};
const DEFAULT_SECTION_ORDER = ['hero', 'infoBar', 'categories', 'masVendidos', 'products'];

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

  /* ── Section elements ── */
  const heroEl = (
    <div style={{ background: grad, padding: '16px 12px 14px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, background: `radial-gradient(circle, ${acc}20 0%, transparent 70%)`, borderRadius: '50%' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 28, height: 28, background: `${acc}22`, border: `1.5px solid ${acc}55`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{cfg.logoEmoji}</div>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `${acc}18`, border: `1px solid ${acc}40`, borderRadius: 10, padding: '1px 7px', marginBottom: 3 }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🛒 {cfg.storeName}</span>
          </div>
          <div style={{ fontSize: titleSz, fontWeight: 900, color: titleClr, lineHeight: 1.2, whiteSpace: 'pre-line' }}>{cfg.heroTagline}</div>
        </div>
      </div>
      <div style={{ fontSize: descSz, color: descClr, marginBottom: 7, lineHeight: 1.45 }}>{cfg.heroDescription}</div>
      {cfg.showReviewsStrip !== false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
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
      )}
      {cfg.showHeroSearch !== false && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: radius, height: 20, display: 'flex', alignItems: 'center', padding: '0 7px', overflow: 'hidden' }}>
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{searchPH}</span>
          </div>
          <div style={{ background: acc, color: cfg.accentText, borderRadius: radius, padding: '0 8px', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', flexShrink: 0 }}>Buscar</div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {cfg.showStats !== false && (
          <>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: acc }}>{cfg.statNum}</div><div style={{ fontSize: 6.5, color: descClr }}>{cfg.statLabel}</div></div>
            <div><div style={{ fontSize: 11, fontWeight: 900, color: acc }}>⭐ 4.8</div><div style={{ fontSize: 6.5, color: descClr }}>Calificación</div></div>
            {cfg.robotEnabled && <div><div style={{ fontSize: 11 }}>🤖</div><div style={{ fontSize: 6.5, color: descClr }}>Robot</div></div>}
          </>
        )}
        {cfg.showWhatsApp !== false && (
          <div style={{ marginLeft: 'auto', background: '#25D366', color: '#fff', borderRadius: radius, padding: '3px 7px', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>📱</span> WhatsApp
          </div>
        )}
      </div>
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

  const SECTION_ELS: Record<string, JSX.Element | null> = {
    hero: heroEl, infoBar: infoBarEl, categories: catsEl,
    masVendidos: masVendidosEl, products: productsEl,
  };

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: '#f4f6fb', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', pointerEvents: 'none', userSelect: 'none', fontSize: '10px' }}>
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
      <div style={{ background: '#fff', padding: '4px 10px', display: 'flex', gap: 5, alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: 7, color: '#3b82f6' }}>Catálogo</span>
        <span style={{ fontSize: 7, color: '#94a3b8' }}>›</span>
        <span style={{ fontSize: 7, color: '#64748b' }}>{cfg.storeName}</span>
      </div>
      {/* ── Sections in user-defined order ── */}
      {order.map(id => SECTION_ELS[id] ? <div key={id}>{SECTION_ELS[id]}</div> : null)}
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
  const [view, setView]       = useState<'gallery' | 'editor'>('gallery');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  /* Load from localStorage on mount */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tukimarket_template');
      if (raw) setCfg(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

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

  function handleSave() {
    try {
      localStorage.setItem('tukimarket_template', JSON.stringify(cfg));
      localStorage.setItem(`tukimarket_config_${cfg.storeSlug}`, JSON.stringify(cfg));
    } catch { /* ignore */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const storeUrl = `/tienda/${cfg.storeSlug}`;

  /* ══ GALLERY VIEW ══════════════════════════════════════════ */
  if (view === 'gallery') {
    return (
      <div>
        {/* Template grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>

          {/* ── Plantilla 1: Mi Store ── */
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
          <h1 className="vnd-page-heading" style={{ marginBottom: 2 }}>Mi Store</h1>
          <p style={{ color: 'var(--vnd-text-muted)', fontSize: '0.82rem' }}>
            Personalizá tu tienda pública en tiempo real
          </p>
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
            <div className="vnd-form-grid">
              <Field label="Emoji / Logo">
                <input className="vnd-input" value={cfg.logoEmoji} onChange={e => update('logoEmoji', e.target.value)} maxLength={4} style={{ fontSize: '1.4rem', textAlign: 'center' }} />
              </Field>
              <Field label="WhatsApp">
                <input className="vnd-input" value={cfg.whatsapp} onChange={e => update('whatsapp', e.target.value)} placeholder="0981000000" maxLength={20} />
              </Field>
            </div>
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
            <Field label="Buscador — placeholder" hint="Texto que aparece en el campo de búsqueda del hero">
              <input className="vnd-input" value={cfg.heroSearchPlaceholder ?? ''} onChange={e => update('heroSearchPlaceholder', e.target.value)} placeholder="Buscar productos..." maxLength={60} />
            </Field>
          </Section>

          {/* Secciones */}
          <Section title="🧩 Secciones">
            <p style={{ fontSize: '0.76rem', color: 'var(--vnd-text-muted)', margin: 0 }}>Arrastrá para reordenar · Activá o desactivá con el toggle.</p>

            {/* Drag-to-reorder section list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(cfg.sectionOrder ?? DEFAULT_SECTION_ORDER).map((id, idx) => (
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
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 10, cursor: 'grab', userSelect: 'none',
                    background: dragIdx === idx ? 'rgba(245,197,24,0.12)' : 'var(--vnd-bg)',
                    border: `1px solid ${dragIdx === idx ? 'var(--vnd-accent)' : 'var(--vnd-border)'}`,
                    transition: 'background 0.15s, border-color 0.15s',
                    opacity: dragIdx !== null && dragIdx !== idx ? 0.55 : 1,
                  }}
                >
                  <span style={{ color: 'var(--vnd-text-muted)', fontSize: '1.1rem', lineHeight: 1 }}>⠿</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--vnd-text)', flex: 1 }}>{SECTION_LABELS[id]}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--vnd-text-muted)', background: 'var(--vnd-bg-elevated)', borderRadius: 6, padding: '1px 6px' }}>#{idx + 1}</span>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--vnd-border)' }} />

            <Toggle enabled={cfg.showReviewsStrip !== false} onToggle={() => update('showReviewsStrip', cfg.showReviewsStrip === false)} label="⭐ Strip de reseñas en portada" />
            {cfg.showReviewsStrip !== false && (
              <>
                <Field label="Avatares de clientes" hint="Emojis separados por coma">
                  <input className="vnd-input" value={(cfg.reviewsAvatars ?? ['👩','👨','👩🏽','👨🏻']).join(', ')} onChange={e => update('reviewsAvatars', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="👩, 👨, 👩🏽, 👨🏻" maxLength={40} />
                </Field>
                <Field label="Texto de satisfacción">
                  <input className="vnd-input" value={cfg.reviewsCount ?? ''} onChange={e => update('reviewsCount', e.target.value)} placeholder="+127 clientes satisfechos" maxLength={50} />
                </Field>
              </>
            )}

            <Toggle enabled={cfg.showHeroSearch !== false} onToggle={() => update('showHeroSearch', cfg.showHeroSearch === false)} label="🔍 Buscador en portada" />
            <Toggle enabled={cfg.showStats !== false} onToggle={() => update('showStats', cfg.showStats === false)} label="📊 Estadísticas en portada" />
            <Toggle enabled={cfg.showWhatsApp !== false} onToggle={() => update('showWhatsApp', cfg.showWhatsApp === false)} label="💬 Botón WhatsApp" />
            <Toggle enabled={cfg.showInfoBar !== false} onToggle={() => update('showInfoBar', cfg.showInfoBar === false)} label="ℹ️ Barra de info (horario y dirección)" />
            <Toggle enabled={cfg.showMasVendidos !== false} onToggle={() => update('showMasVendidos', cfg.showMasVendidos === false)} label="🔥 Sección de más vendidos" />
            {cfg.showMasVendidos !== false && (
              <Field label="Título de más vendidos">
                <input className="vnd-input" value={cfg.masVendidosTitle ?? ''} onChange={e => update('masVendidosTitle', e.target.value)} placeholder="🔥 Productos más vendidos" maxLength={40} />
              </Field>
            )}
          </Section>

          {/* Tipografía */}
          <Section title="📐 Tipografía">
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
