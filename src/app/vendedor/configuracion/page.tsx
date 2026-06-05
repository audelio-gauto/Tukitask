'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface StoreConfig {
  storeName: string;
  storeDescription: string;
  storeCategory: string;
  pickupAddress: string;
  pickupCity: string;
  pickupReference: string;
  whatsapp: string;
  openFrom: string;
  openTo: string;
  openDays: string[];
  freeDeliveryAbove: number;
  commissionToDriver: boolean;
}

interface BankData {
  banco: string;
  cuenta: string;
  alias: string;
  titular: string;
  tipo_cuenta: string;
}

const EMPTY_BANK: BankData = { banco: '', cuenta: '', alias: '', titular: '', tipo_cuenta: '' };

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_FULL = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

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

/* ══════════════════════════════════════════════════════════ */
export default function ConfiguracionPage() {
  const [saved, setSaved] = useState(false);
  const [cfg, setCfg] = useState<StoreConfig>({
    storeName:           'Mi Tienda',
    storeDescription:    '',
    storeCategory:       'electronica',
    pickupAddress:       '',
    pickupCity:          'Asunción',
    pickupReference:     '',
    whatsapp:            '',
    openFrom:            '08:00',
    openTo:              '20:00',
    openDays:            ['lunes','martes','miercoles','jueves','viernes'],
    freeDeliveryAbove:   0,
    commissionToDriver:  true,
  });

  // ── Datos bancarios ──────────────────────────────────────
  const [bank, setBank] = useState<BankData>({ ...EMPTY_BANK });
  const [bankLoading, setBankLoading] = useState(true);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [globalTransferActive, setGlobalTransferActive] = useState<boolean | null>(null);
  const [vendorTransferAllowed, setVendorTransferAllowed] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const [bankRes, paymentRes] = await Promise.all([
        fetch('/api/vendor/bank-data', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/payment-info'),
      ]);
      if (bankRes.ok) {
        const d = await bankRes.json();
        setBank({ ...EMPTY_BANK, ...d });
      }
      if (paymentRes.ok) {
        const p = await paymentRes.json();
        const transferMethod = (p.methods ?? []).find((m: { key: string; is_active: boolean }) => m.key === 'transfer');
        setGlobalTransferActive(transferMethod?.is_active ?? false);
        setVendorTransferAllowed(p.vendor_methods?.transfer_allowed ?? true);
      }
      setBankLoading(false);
    })();
  }, []);

  async function handleSaveBank() {
    setBankSaving(true);
    setBankMsg(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setBankSaving(false); return; }
    const res = await fetch('/api/vendor/bank-data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(bank),
    });
    setBankMsg(res.ok
      ? { ok: true, text: 'Datos bancarios guardados.' }
      : { ok: false, text: 'Error al guardar. Intentá de nuevo.' });
    setBankSaving(false);
    setTimeout(() => setBankMsg(null), 3500);
  }

  function update<K extends keyof StoreConfig>(key: K, value: StoreConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  function toggleDay(day: string) {
    setCfg(prev => ({
      ...prev,
      openDays: prev.openDays.includes(day)
        ? prev.openDays.filter(d => d !== day)
        : [...prev.openDays, day],
    }));
  }

  function handleSave() {
    /* TODO: persist to Supabase vendor_settings table */
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading">Configuración de Tienda</h1>
          <p className="vnd-page-sub">Personalizá tu tienda y configurá el Robot Negociador</p>
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

      {/* ── Perfil de tienda ──────────────────────────────── */}
      <Section title="🏪 Perfil de Mi Tienda">
        <div className="vnd-form-grid">
          <div className="vnd-field">
            <label className="vnd-label">Nombre de la tienda *</label>
            <input className="vnd-input" value={cfg.storeName}
              onChange={e => update('storeName', e.target.value)}
              placeholder="Ej: ElectroParaguay" />
          </div>

          <div className="vnd-field">
            <label className="vnd-label">Categoría principal</label>
            <select className="vnd-input" value={cfg.storeCategory}
              onChange={e => update('storeCategory', e.target.value)}>
              <option value="electronica">📱 Electrónica</option>
              <option value="ropa">👗 Ropa y Accesorios</option>
              <option value="hogar">🏠 Hogar y Decoración</option>
              <option value="alimentos">🍔 Alimentos</option>
              <option value="herramientas">🔧 Herramientas</option>
              <option value="belleza">💄 Belleza y Cuidado</option>
              <option value="deportes">⚽ Deportes</option>
              <option value="otros">📦 Otros</option>
            </select>
          </div>

          <div className="vnd-field vnd-form-grid-full">
            <label className="vnd-label">Descripción de la tienda</label>
            <textarea className="vnd-input" rows={3} value={cfg.storeDescription}
              onChange={e => update('storeDescription', e.target.value)}
              placeholder="Contá qué vendés, qué te hace especial..."
              style={{ resize: 'vertical', minHeight: 80 }}
            />
          </div>

          <div className="vnd-field">
            <label className="vnd-label">WhatsApp de contacto</label>
            <input className="vnd-input" value={cfg.whatsapp}
              onChange={e => update('whatsapp', e.target.value)}
              placeholder="0981-000000" type="tel" />
          </div>
        </div>
      </Section>

      {/* ── Punto de recogida ─────────────────────────────── */}
      <Section title="📍 Punto de Recogida para Drivers">
        <div className="vnd-form-grid">
          <div className="vnd-field">
            <label className="vnd-label">Dirección de recogida *</label>
            <input className="vnd-input" value={cfg.pickupAddress}
              onChange={e => update('pickupAddress', e.target.value)}
              placeholder="Av. Mcal. López 1234" />
          </div>

          <div className="vnd-field">
            <label className="vnd-label">Ciudad</label>
            <select className="vnd-input" value={cfg.pickupCity}
              onChange={e => update('pickupCity', e.target.value)}>
              <option>Asunción</option>
              <option>Fernando de la Mora</option>
              <option>San Lorenzo</option>
              <option>Luque</option>
              <option>Lambaré</option>
              <option>Capiatá</option>
              <option>Otra</option>
            </select>
          </div>

          <div className="vnd-field vnd-form-grid-full">
            <label className="vnd-label">Referencia de ubicación</label>
            <input className="vnd-input" value={cfg.pickupReference}
              onChange={e => update('pickupReference', e.target.value)}
              placeholder="Frente al supermercado, portón azul..." />
          </div>
        </div>

        {/* Horarios */}
        <div style={{ marginTop: 20 }}>
          <p className="vnd-label" style={{ marginBottom: 10 }}>Horario de atención</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="vnd-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Desde</label>
              <input type="time" className="vnd-input" style={{ width: 120 }}
                value={cfg.openFrom} onChange={e => update('openFrom', e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="vnd-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Hasta</label>
              <input type="time" className="vnd-input" style={{ width: 120 }}
                value={cfg.openTo} onChange={e => update('openTo', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DAYS.map((d, i) => {
              const key = DAYS_FULL[i];
              const active = cfg.openDays.includes(key);
              return (
                <button key={d}
                  onClick={() => toggleDay(key)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: '1px solid',
                    borderColor: active ? '#F5C518' : 'var(--vnd-border)',
                    background:  active ? 'rgba(245,197,24,0.12)' : 'var(--vnd-surface-2)',
                    color:       active ? '#F5C518' : 'var(--vnd-text-muted)',
                    fontWeight:  700, fontSize: '0.8rem', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ── Robot Negociador — movido a /vendedor/tukibot ─── */}
      <Section title="🤖 Robot Negociador (TukiBot)">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'rgba(245,197,24,0.05)', borderRadius: 12, border: '1px solid rgba(245,197,24,0.20)' }}>
          <div>
            <p style={{ fontWeight: 800, color: 'var(--vnd-text-primary)', fontSize: '0.9rem', marginBottom: 4 }}>
              🤖 TukiBot tiene su propia sección
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)' }}>
              Configurá el robot negociador desde el menú <strong>TukiBot</strong> en la barra lateral
            </p>
          </div>
          <a href="/vendedor/tukibot" className="vnd-btn vnd-btn-primary" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
            Ir a TukiBot →
          </a>
        </div>
      </Section>

      {/* ── Delivery config ───────────────────────────────── */}
      <Section title="🚗 Configuración de Delivery">
        <div className="vnd-form-grid">
          <div className="vnd-field">
            <label className="vnd-label">Envío gratis a partir de (₲)</label>
            <input type="number" className="vnd-input"
              value={cfg.freeDeliveryAbove || ''}
              onChange={e => update('freeDeliveryAbove', +e.target.value)}
              placeholder="0 = no aplica" min={0} step={10000}
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>
              {cfg.freeDeliveryAbove > 0 ? `El delivery es gratis en pedidos mayores a ₲${cfg.freeDeliveryAbove.toLocaleString('es-PY')}` : 'Sin descuento por monto mínimo'}
            </p>
          </div>

          <div className="vnd-field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--vnd-surface-2)', borderRadius: 10, border: '1px solid var(--vnd-border)' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--vnd-text-primary)' }}>Incluir costo de driver</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 2 }}>La plataforma asigna y gestiona el driver</p>
              </div>
              <button onClick={() => update('commissionToDriver', !cfg.commissionToDriver)}
                style={{
                  width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: cfg.commissionToDriver ? '#F5C518' : 'var(--vnd-border)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}>
                <span style={{
                  position: 'absolute', top: 2, left: cfg.commissionToDriver ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: cfg.commissionToDriver ? '#0b1220' : 'var(--vnd-text-muted)',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Datos Bancarios ───────────────────────────────── */}
      <Section title="🏦 Datos para Transferencia Bancaria">
        {!vendorTransferAllowed ? (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10 }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#991b1b', margin: 0 }}>
              🚫 Transferencia bancaria deshabilitada
            </p>
            <p style={{ fontSize: '0.72rem', color: '#7f1d1d', marginTop: 4, lineHeight: 1.5 }}>
              El administrador deshabilitó este método de pago para vendedores.
              Contactá al soporte si creés que es un error.
            </p>
          </div>
        ) : (
          <>
            {globalTransferActive === true && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 10 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7a6010', margin: 0 }}>
                  ⚠️ Transferencia Bancaria Global activa
                </p>
                <p style={{ fontSize: '0.72rem', color: '#7a6010', marginTop: 4, lineHeight: 1.5 }}>
                  El admin activó la transferencia global del marketplace. Los clientes actualmente ven los datos bancarios del marketplace.
                  Podés configurar tus datos igual para cuando se desactive.
                </p>
              </div>
            )}
            {globalTransferActive === false && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', margin: 0 }}>
                  ✅ Transferencia independiente activada
                </p>
                <p style={{ fontSize: '0.72rem', color: '#166534', marginTop: 4, lineHeight: 1.5 }}>
                  Los clientes verán tus datos bancarios al pagar por transferencia en tu tienda.
                </p>
              </div>
            )}
            {bankLoading ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--vnd-text-muted)' }}>Cargando...</p>
            ) : (
              <>
                <div className="vnd-form-grid">
                  {([
                    { field: 'banco',       label: 'Banco',            placeholder: 'Ej: Banco Itaú, Tigo Money, Personal Pay' },
                    { field: 'titular',     label: 'Titular de cuenta', placeholder: 'Nombre completo o razón social' },
                    { field: 'cuenta',      label: 'Número de cuenta',  placeholder: 'Ej: 0123456789' },
                    { field: 'alias',       label: 'Alias / CBU',       placeholder: 'Ej: mitienda.pagos' },
                    { field: 'tipo_cuenta', label: 'Tipo de cuenta',    placeholder: 'Ej: Cuenta corriente, Caja de ahorro' },
                  ] as { field: keyof BankData; label: string; placeholder: string }[]).map(({ field, label, placeholder }) => (
                    <div key={field} className="vnd-field">
                      <label className="vnd-label">{label}</label>
                      <input
                        className="vnd-input"
                        value={bank[field]}
                        onChange={e => setBank(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={placeholder}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                  <button
                    className="vnd-btn vnd-btn-primary"
                    onClick={handleSaveBank}
                    disabled={bankSaving}
                  >
                    {bankSaving ? 'Guardando...' : 'Guardar datos bancarios'}
                  </button>
                  {bankMsg && (
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: bankMsg.ok ? '#16a34a' : '#dc2626' }}>
                      {bankMsg.text}
                    </span>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </Section>

      {/* Save button bottom */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
        <button className="vnd-btn vnd-btn-secondary">Descartar cambios</button>
        <button className="vnd-btn vnd-btn-primary" onClick={handleSave}>
          {saved ? '✓ ¡Guardado!' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
