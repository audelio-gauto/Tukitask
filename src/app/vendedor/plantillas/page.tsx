'use client';
import { useState, useEffect } from 'react';
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
   MINI PREVIEW — renders a scaled-down version of Template 1
   ═══════════════════════════════════════════════════════════════ */
function MiniPreview({ cfg }: { cfg: StoreTemplateConfig }) {
  const acc  = cfg.accentColor;
  const grad = `linear-gradient(135deg, ${cfg.heroGrad1} 0%, ${cfg.heroGrad2} 100%)`;

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: '#f4f6fb', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', pointerEvents: 'none', userSelect: 'none', fontSize: '10px' }}>

      {/* Navbar */}
      <div style={{ background: '#0b1220', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 20, height: 20, background: acc, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: cfg.accentText, flexShrink: 0 }}>TK</div>
        <div style={{ fontSize: 9, color: '#fff', fontWeight: 800 }}>TukiTask</div>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ fontSize: 14 }}>{cfg.logoEmoji}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{cfg.storeName}</div>
        <div style={{ flex: 1 }} />
        <div style={{ background: '#25D366', color: '#fff', borderRadius: 5, padding: '2px 7px', fontSize: 8, fontWeight: 700 }}>WhatsApp</div>
        <div style={{ background: acc, color: cfg.accentText, borderRadius: 5, padding: '2px 7px', fontSize: 8, fontWeight: 700 }}>Ingresar</div>
      </div>

      {/* Hero */}
      <div style={{ background: grad, padding: '22px 16px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, background: `radial-gradient(circle, ${acc}22 0%, transparent 70%)`, borderRadius: '50%' }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${acc}18`, border: `1px solid ${acc}40`, borderRadius: 10, padding: '2px 8px', marginBottom: 8 }}>
          <span style={{ fontSize: 10 }}>🛒</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: acc }}>{cfg.storeName}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', lineHeight: 1.25, marginBottom: 5, whiteSpace: 'pre-line' }}>{cfg.heroTagline}</div>
        <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.5)', marginBottom: 10, maxWidth: 260, lineHeight: 1.5 }}>{cfg.heroDescription}</div>

        {/* Search */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 7, height: 22, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
            <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.32)' }}>Buscar productos, tiendas o categorías...</span>
          </div>
          <div style={{ background: acc, color: cfg.accentText, borderRadius: 7, padding: '0 10px', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center' }}>Buscar</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: acc }}>{cfg.statNum}</div>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.38)' }}>{cfg.statLabel}</div>
          </div>
          {cfg.robotEnabled && (
            <div>
              <div style={{ fontSize: 12 }}>🤖</div>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.38)' }}>Robot Negociador</div>
            </div>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>🏪 Tiendas destacadas</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {cfg.categories.map((c, i) => (
            <div key={c} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 7.5, fontWeight: 600, background: i === 0 ? acc : '#f1f5f9', color: i === 0 ? cfg.accentText : '#475569', border: '1px solid', borderColor: i === 0 ? acc : '#e2e8f0' }}>{c}</div>
          ))}
        </div>
      </div>

      {/* Products grid mock */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#0f172a' }}>Productos destacados</span>
          <span style={{ fontSize: 7.5, color: acc, fontWeight: 600 }}>Ver todos →</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
          {['📱','🎧','💻','👗','👟','📚','🥟','🪑'].map((e, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ height: 34, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{e}</div>
              <div style={{ padding: '4px 5px' }}>
                <div style={{ height: 5, background: '#e2e8f0', borderRadius: 2, marginBottom: 3 }} />
                <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, width: '60%', marginBottom: 4 }} />
                <div style={{ fontSize: 7.5, fontWeight: 800, color: acc, marginBottom: 4 }}>Gs. X.XXX.XXX</div>
                <div style={{ background: acc, color: cfg.accentText, borderRadius: 4, textAlign: 'center', fontSize: 7, fontWeight: 700, padding: '2px 0' }}>Ver producto</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EDITOR FIELD HELPERS
   ═══════════════════════════════════════════════════════════════ */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="vnd-label">{label}</label>
      {hint && <span style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', marginTop: -2 }}>{hint}</span>}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

/* ═══════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function PlantillasPage() {
  const [cfg, setCfg]         = useState<StoreTemplateConfig>(DEFAULTS);
  const [saved, setSaved]     = useState(false);
  const [catInput, setCatInput] = useState('');

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

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading" style={{ marginBottom: 2 }}>Plantillas de Tienda</h1>
          <p style={{ color: 'var(--vnd-text-muted)', fontSize: '0.82rem' }}>
            Personalizá tu tienda pública · Template: <strong style={{ color: 'var(--vnd-accent)' }}>Vitrina Marketplace</strong>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--vnd-bg-elevated)', borderRadius: 10, border: '1px solid var(--vnd-border)' }}>
              <button
                type="button"
                onClick={() => update('robotEnabled', !cfg.robotEnabled)}
                style={{ width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: cfg.robotEnabled ? 'var(--vnd-accent)' : 'var(--vnd-border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                role="switch"
                aria-checked={cfg.robotEnabled}
              >
                <span style={{ position: 'absolute', top: 2, left: cfg.robotEnabled ? 19 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
              <div style={{ fontSize: '0.82rem', color: 'var(--vnd-text)' }}>🤖 Mostrar Robot Negociador en hero</div>
            </div>
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
