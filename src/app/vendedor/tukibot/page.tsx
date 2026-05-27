'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Tone          = 'informal' | 'formal' | 'agresivo' | 'amigable';
type NegotiationProfile = 'balanced' | 'high_close' | 'high_margin';

interface BotConfig {
  botEnabled:           boolean;
  botTone:              Tone;
  negotiationProfile:   NegotiationProfile;
  autoAcceptAbove:      number;
}


const TONES: { key: Tone; label: string; emoji: string; desc: string }[] = [
  { key: 'informal',  label: 'Informal',  emoji: '😎', desc: '"Che, te lo dejo en $18..."' },
  { key: 'formal',    label: 'Formal',    emoji: '👔', desc: '"Estimado, le ofrecemos..."' },
  { key: 'agresivo',  label: 'Agresivo',  emoji: '🔥', desc: '"¡Última oportunidad!"'     },
  { key: 'amigable',  label: 'Amigable',  emoji: '😊', desc: '"Hola! Gracias por..."'     },
];

const NEGOTIATION_PROFILES: {
  key: NegotiationProfile;
  label: string;
  emoji: string;
  desc: string;
}[] = [
  {
    key: 'high_close',
    label: 'Cierre alto',
    emoji: '🚀',
    desc: 'Más flexible para cerrar rápido, con menor margen promedio.',
  },
  {
    key: 'balanced',
    label: 'Balanceado',
    emoji: '⚖️',
    desc: 'Equilibrio entre cierre de ventas y protección de margen.',
  },
  {
    key: 'high_margin',
    label: 'Margen alto',
    emoji: '🛡️',
    desc: 'Más estricto para proteger precio y evitar lowballing.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vnd-card" style={{ marginBottom: 20 }}>
      <div className="vnd-card-header">
        <span className="vnd-card-title">
          <span className="vnd-card-title-dot" />
          {title}
        </span>
      </div>
      <div className="vnd-card-body">{children}</div>
    </div>
  );
}

export default function TukiBotPage() {
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<BotConfig>({
    botEnabled:           true,
    botTone:              'informal',
    negotiationProfile:   'balanced',
    autoAcceptAbove:      90,
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setLoading(false); return; }
      try {
        const res = await fetch('/api/vendedor/tukibot-config', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const { config } = await res.json();
          setCfg(prev => ({ ...prev, ...config }));
        }
      } catch { /* keep defaults */ }
      setLoading(false);
    });
  }, []);

  function update<K extends keyof BotConfig>(key: K, value: BotConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/vendedor/tukibot-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch { /* silent */ }
    setSaving(false);
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--vnd-text-muted)' }}>Cargando configuración…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading">🤖 TukiBot</h1>
          <p className="vnd-page-sub">Robot Negociador — responde ofertas automáticamente 24/7</p>
        </div>
        <button className="vnd-btn vnd-btn-primary" onClick={handleSave} disabled={saving}>
          {saved ? (
            <>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              ¡Guardado!
            </>
          ) : saving ? 'Guardando…' : (
            <>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Guardar cambios
            </>
          )}
        </button>
      </div>

      <Section title="🤖 Robot Negociador (TukiBot)">
        {/* Enable toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: cfg.botEnabled ? 'rgba(245,197,24,0.06)' : 'var(--vnd-surface-2)', borderRadius: 12, border: `1px solid ${cfg.botEnabled ? 'rgba(245,197,24,0.20)' : 'var(--vnd-border)'}`, marginBottom: 22, transition: 'all 0.2s' }}>
          <div>
            <p style={{ fontWeight: 800, color: 'var(--vnd-text-primary)', fontSize: '0.9rem' }}>
              {cfg.botEnabled ? '🟢 Robot activo' : '⚫ Robot inactivo'}
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', marginTop: 2 }}>
              {cfg.botEnabled ? 'TukiBot responde automáticamente mientras dormís' : 'Activá el robot para negociar 24/7'}
            </p>
          </div>
          <button
            onClick={() => update('botEnabled', !cfg.botEnabled)}
            style={{
              width: 48, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
              background: cfg.botEnabled ? '#F5C518' : 'var(--vnd-border)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: cfg.botEnabled ? 26 : 3,
              width: 20, height: 20, borderRadius: '50%', background: cfg.botEnabled ? '#0b1220' : 'var(--vnd-text-muted)',
              transition: 'left 0.2s', display: 'block',
            }} />
          </button>
        </div>

        {cfg.botEnabled && (
          <>
            {/* Tone picker */}
            <div style={{ marginBottom: 22 }}>
              <p className="vnd-label" style={{ marginBottom: 10 }}>Personalidad del robot</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {TONES.map(t => (
                  <button key={t.key} onClick={() => update('botTone', t.key)}
                    style={{
                      padding: '12px 10px', borderRadius: 12, border: '1px solid',
                      borderColor: cfg.botTone === t.key ? '#F5C518' : 'var(--vnd-border)',
                      background: cfg.botTone === t.key ? 'rgba(245,197,24,0.10)' : 'var(--vnd-surface-2)',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{t.emoji}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.8rem', color: cfg.botTone === t.key ? '#F5C518' : 'var(--vnd-text-primary)' }}>{t.label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--vnd-text-muted)', marginTop: 3 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Price thresholds */}
            <div className="vnd-form-grid" style={{ marginBottom: 22 }}>
              <div className="vnd-field">
                <label className="vnd-label" style={{ marginBottom: 8, display: 'block' }}>
                  Perfil de negociación
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
                  {NEGOTIATION_PROFILES.map(p => (
                    <button key={p.key} onClick={() => update('negotiationProfile', p.key)}
                      style={{
                        padding: '10px 10px', borderRadius: 10, border: '1px solid',
                        borderColor: cfg.negotiationProfile === p.key ? '#F5C518' : 'var(--vnd-border)',
                        background: cfg.negotiationProfile === p.key ? 'rgba(245,197,24,0.10)' : 'var(--vnd-surface-2)',
                        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.8rem', color: cfg.negotiationProfile === p.key ? '#F5C518' : 'var(--vnd-text-primary)' }}>
                        <span>{p.emoji}</span>
                        <span>{p.label}</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--vnd-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                        {p.desc}
                      </div>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginBottom: 10 }}>
                  El perfil se aplica solo dentro de los límites globales definidos por Admin.
                </p>

                <label className="vnd-label">
                  ✅ Auto-aceptar si ofrecen ≥ (% del precio publicado)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={50} max={100} value={cfg.autoAcceptAbove}
                    onChange={e => update('autoAcceptAbove', +e.target.value)}
                    style={{ flex: 1, accentColor: '#4ade80' }}
                  />
                  <span style={{ fontWeight: 800, color: '#4ade80', fontSize: '1rem', width: 40, textAlign: 'right' }}>
                    {cfg.autoAcceptAbove}%
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>
                  Si publiqués a ₲100.000 → acepta desde ₲{(100000 * cfg.autoAcceptAbove / 100).toLocaleString('es-PY')}
                </p>
              </div>

              <div className="vnd-field">
                <div style={{ padding: '14px 16px', background: 'rgba(74,222,128,0.06)', borderRadius: 10, border: '1px solid rgba(74,222,128,0.20)' }}>
                  <p style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--vnd-text-primary)', marginBottom: 6 }}>
                    💡 El TukiBot nunca rechaza
                  </p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--vnd-text-muted)', lineHeight: 1.5 }}>
                    Si la oferta es menor al precio mínimo configurado en el producto (<em>Precio piso</em>), el robot automáticamente contraoferta en vez de rechazar — así jamás perdés una venta.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* Save bottom */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
        <button className="vnd-btn vnd-btn-secondary" onClick={() => setCfg({ botEnabled: true, botTone: 'informal', negotiationProfile: 'balanced', autoAcceptAbove: 90 })}>
          Restaurar valores
        </button>
        <button className="vnd-btn vnd-btn-primary" onClick={handleSave} disabled={saving}>
          {saved ? '✓ ¡Guardado!' : saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
