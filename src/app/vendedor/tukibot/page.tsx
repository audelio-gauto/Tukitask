'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Tone          = 'informal' | 'formal' | 'agresivo' | 'amigable';
type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';
type CounterFormula = 'midpoint' | 'percentage' | 'fixed';

const BOT_CONFIG_STORAGE_KEY = 'tukibot:config:default';

function getVendorBotConfigKey(vendorId: string) {
  return `tukibot:config:${vendorId}`;
}

interface BotConfig {
  botEnabled:         boolean;
  botTone:            Tone;
  botTimeoutMinutes:  number;
  botTimeoutAction:   TimeoutAction;
  botCounterFormula:  CounterFormula;
  botCounterPercent:  number;
  autoAcceptAbove:    number;
}

const TONES: { key: Tone; label: string; emoji: string; desc: string }[] = [
  { key: 'informal',  label: 'Informal',  emoji: '😎', desc: '"Che, te lo dejo en $18..."' },
  { key: 'formal',    label: 'Formal',    emoji: '👔', desc: '"Estimado, le ofrecemos..."' },
  { key: 'agresivo',  label: 'Agresivo',  emoji: '🔥', desc: '"¡Última oportunidad!"'     },
  { key: 'amigable',  label: 'Amigable',  emoji: '😊', desc: '"Hola! Gracias por..."'     },
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
  const [saved, setSaved] = useState(false);
  const [storageKey, setStorageKey] = useState(BOT_CONFIG_STORAGE_KEY);
  const [cfg, setCfg] = useState<BotConfig>({
    botEnabled:         true,
    botTone:            'informal',
    botTimeoutMinutes:  15,
    botTimeoutAction:   'auto_counter',
    botCounterFormula:  'midpoint',
    botCounterPercent:  10,
    autoAcceptAbove:    90,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const vendorId = user?.id || user?.user_metadata?.store_slug || user?.email || 'default';
      const key = getVendorBotConfigKey(String(vendorId));
      setStorageKey(key);

      try {
        const rawScoped = localStorage.getItem(key);
        const rawLegacy = localStorage.getItem(BOT_CONFIG_STORAGE_KEY);
        const raw = rawScoped || rawLegacy;
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<BotConfig>;
        setCfg(prev => ({
          ...prev,
          ...parsed,
        }));
      } catch {
        // Ignore malformed data and keep defaults
      }
    });
  }, []);

  function update<K extends keyof BotConfig>(key: K, value: BotConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cfg));
      // Backward compatibility while existing buyers still read legacy key
      localStorage.setItem(BOT_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // Non-blocking in restricted environments
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading">🤖 TukiBot</h1>
          <p className="vnd-page-sub">Robot Negociador — responde ofertas automáticamente 24/7</p>
        </div>
        <button className="vnd-btn vnd-btn-primary" onClick={handleSave}>
          {saved ? (
            <>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              ¡Guardado!
            </>
          ) : (
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

            {/* Timeout config */}
            <div style={{ padding: 18, background: 'var(--vnd-surface-2)', borderRadius: 12, border: '1px solid var(--vnd-border)', marginBottom: 22 }}>
              <p style={{ fontWeight: 800, color: 'var(--vnd-text-primary)', marginBottom: 14, fontSize: '0.875rem' }}>
                ⏱ Si no respondés en…
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                {[1, 5, 10, 15, 30, 60].map(min => (
                  <button key={min} onClick={() => update('botTimeoutMinutes', min)}
                    style={{
                      padding: '7px 16px', borderRadius: 8, border: '1px solid',
                      borderColor: cfg.botTimeoutMinutes === min ? '#F5C518' : 'var(--vnd-border)',
                      background: cfg.botTimeoutMinutes === min ? 'rgba(245,197,24,0.12)' : 'transparent',
                      color: cfg.botTimeoutMinutes === min ? '#F5C518' : 'var(--vnd-text-muted)',
                      fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.15s',
                    }}
                  >
                    {min} min
                  </button>
                ))}
              </div>
              <p style={{ fontWeight: 700, color: 'var(--vnd-text-secondary)', fontSize: '0.82rem', marginBottom: 10 }}>
                El robot debe…
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { key: 'auto_counter',    label: '🔁 Contraofertar automáticamente' },
                  { key: 'auto_accept',     label: '✅ Aceptar la oferta'             },
                  { key: 'pressure_client', label: '📢 Presionar al cliente'          },
                ].map(opt => (
                  <button key={opt.key}
                    onClick={() => update('botTimeoutAction', opt.key as TimeoutAction)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: '1px solid',
                      borderColor: cfg.botTimeoutAction === opt.key ? '#F5C518' : 'var(--vnd-border)',
                      background: cfg.botTimeoutAction === opt.key ? 'rgba(245,197,24,0.12)' : 'transparent',
                      color: cfg.botTimeoutAction === opt.key ? '#F5C518' : 'var(--vnd-text-secondary)',
                      fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Counter formula */}
            {cfg.botTimeoutAction === 'auto_counter' && (
              <div style={{ padding: 16, background: 'rgba(245,197,24,0.04)', borderRadius: 12, border: '1px solid rgba(245,197,24,0.15)' }}>
                <p style={{ fontWeight: 800, color: 'var(--vnd-text-primary)', marginBottom: 12, fontSize: '0.875rem' }}>
                  🧮 Fórmula de contraoferta automática
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[
                    { key: 'midpoint',   label: 'Punto medio', desc: '(Publicado + Oferta) ÷ 2' },
                    { key: 'percentage', label: 'Porcentaje',  desc: `Bajar ${cfg.botCounterPercent}% del publicado` },
                    { key: 'fixed',      label: 'Precio fijo', desc: 'Precio mínimo configurado' },
                  ].map(f => (
                    <button key={f.key} onClick={() => update('botCounterFormula', f.key as CounterFormula)}
                      style={{
                        padding: '10px 16px', borderRadius: 10, border: '1px solid', flex: 1, textAlign: 'left',
                        borderColor: cfg.botCounterFormula === f.key ? '#F5C518' : 'var(--vnd-border)',
                        background: cfg.botCounterFormula === f.key ? 'rgba(245,197,24,0.10)' : 'var(--vnd-surface-2)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                      <div style={{ fontWeight: 800, fontSize: '0.82rem', color: cfg.botCounterFormula === f.key ? '#F5C518' : 'var(--vnd-text-primary)' }}>{f.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', marginTop: 3 }}>{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Save bottom */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
        <button className="vnd-btn vnd-btn-secondary" onClick={() => setCfg({ botEnabled: true, botTone: 'informal', botTimeoutMinutes: 15, botTimeoutAction: 'auto_counter', botCounterFormula: 'midpoint', botCounterPercent: 10, autoAcceptAbove: 90 })}>
          Restaurar valores
        </button>
        <button className="vnd-btn vnd-btn-primary" onClick={handleSave}>
          {saved ? '✓ ¡Guardado!' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
