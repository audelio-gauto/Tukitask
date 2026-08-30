'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { DEFAULT_DELIVERY_CITIES, PY_CITIES, type DeliveryCityConfig } from '@/app/tienda/data';

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
  deliveryCities: DeliveryCityConfig[];
}

interface BankData {
  banco: string;
  cuenta: string;
  alias: string;
  titular: string;
  tipo_cuenta: string;
}

const EMPTY_BANK: BankData = { banco: '', cuenta: '', alias: '', titular: '', tipo_cuenta: '' };

const makeDefaultDeliveryCities = (): DeliveryCityConfig[] => DEFAULT_DELIVERY_CITIES.map(city => ({ ...city }));

const VENDOR_DOCS = [
  { key: 'cedula_frente', label: 'Cédula — frente', hint: 'Identificación oficial del representante', requiresExpiry: false },
  { key: 'ruc_documento', label: 'RUC / documento tributario', hint: 'Documento fiscal o RUC', requiresExpiry: false },
  { key: 'constancia_bancaria', label: 'Constancia bancaria', hint: 'Extracto o comprobante del banco', requiresExpiry: false },
  { key: 'registro_comercial', label: 'Registro comercial', hint: 'Registro, acta o permiso comercial', requiresExpiry: false },
] as const;

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
    deliveryCities:      makeDefaultDeliveryCities(),
  });

  // ── Datos bancarios ──────────────────────────────────────
  const [bank, setBank] = useState<BankData>({ ...EMPTY_BANK });
  const [bankLoading, setBankLoading] = useState(true);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [globalTransferActive, setGlobalTransferActive] = useState<boolean | null>(null);
  const [vendorTransferAllowed, setVendorTransferAllowed] = useState<boolean>(true);
  const [vendorDocStatus, setVendorDocStatus] = useState<Record<string, { status: string; rejection_reason?: string; expires_at?: string }>>({});
  const [vendorDocUploading, setVendorDocUploading] = useState<Record<string, boolean>>({});
  const [vendorEmail, setVendorEmail] = useState('');
  const [availableCities, setAvailableCities] = useState<string[]>(PY_CITIES);
  const vendorFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setVendorEmail(session.user?.email || '');
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

  useEffect(() => {
    if (!vendorEmail) return;
    (async () => {
      try {
        const res = await authFetch(`/api/upload-driver-doc?email=${encodeURIComponent(vendorEmail)}`);
        const json = await res.json();
        const next: Record<string, { status: string; rejection_reason?: string; expires_at?: string }> = {};
        for (const d of (json.docs || []).filter((doc: { role: string }) => doc.role === 'vendedor')) {
          next[d.doc_type] = { status: d.status, rejection_reason: d.rejection_reason, expires_at: d.expires_at };
        }
        setVendorDocStatus(next);
      } catch {
        // no-op, endpoint may be unavailable for sellers before initial upload
      }
    })();
  }, [vendorEmail]);

  const handleVendorDocUpload = async (docType: string, file: File) => {
    if (!vendorEmail) return;
    setVendorDocUploading(prev => ({ ...prev, [docType]: true }));
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const res = await authFetch('/api/upload-driver-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: vendorEmail,
          doc_type: docType,
          base64,
          mimeType: file.type,
          role: 'vendedor',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setBankMsg({ ok: false, text: json.error || 'No se pudo subir el documento.' });
      } else {
        setVendorDocStatus(prev => ({ ...prev, [docType]: { status: 'pending' } }));
        setBankMsg({ ok: true, text: 'Documento enviado para revisión.' });
      }
    } catch {
      setBankMsg({ ok: false, text: 'Error al subir el documento.' });
    } finally {
      setVendorDocUploading(prev => ({ ...prev, [docType]: false }));
      const input = vendorFileRefs.current[docType];
      if (input) input.value = '';
      setTimeout(() => setBankMsg(null), 3500);
    }
  };

  useEffect(() => {
    const loadAdminCities = async () => {
      try {
        const res = await fetch('/api/admin/delivery-cities', {
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const json = await res.json();
          const cities = Array.isArray(json?.cities)
            ? json.cities.map((city: { city: string }) => city.city).filter(Boolean)
            : [];
          if (cities.length) setAvailableCities(Array.from(new Set([...PY_CITIES, ...cities])));
        }
      } catch {
        setAvailableCities(PY_CITIES);
      }
    };

    loadAdminCities();
  }, []);

  useEffect(() => {
    const loadStoreConfig = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('store_configs')
        .select('config')
        .eq('vendor_id', session.user.id)
        .maybeSingle();

      if (!error && data?.config) {
        const payload = { ...cfg, ...(data.config as Partial<StoreConfig>) };
        const storedCities = Array.isArray((data.config as Partial<StoreConfig>)?.deliveryCities)
          ? (data.config as Partial<StoreConfig>).deliveryCities as DeliveryCityConfig[]
          : makeDefaultDeliveryCities();

        setCfg({
          ...payload,
          deliveryCities: storedCities.length ? storedCities : makeDefaultDeliveryCities(),
        });
      }
    };

    loadStoreConfig();
  }, []);

  function upsertDeliveryCity(city: string) {
    setCfg(prev => {
      const existing = prev.deliveryCities.find(item => item.city === city);
      if (existing) {
        return {
          ...prev,
          deliveryCities: prev.deliveryCities.filter(item => item.city !== city),
        };
      }

      return {
        ...prev,
        deliveryCities: [
          ...prev.deliveryCities,
          {
            city,
            shipping_price: 25000,
            delivery_days: 4,
            free_shipping: false,
            cash_on_delivery: true,
            transfer: true,
          },
        ],
      };
    });
  }

  function updateDeliveryCity(city: string, patch: Partial<DeliveryCityConfig>) {
    setCfg(prev => ({
      ...prev,
      deliveryCities: prev.deliveryCities.map(item => item.city === city ? { ...item, ...patch } : item),
    }));
  }

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

  async function handleSave() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setSaved(false);
      return;
    }

    const payload: StoreConfig = {
      ...cfg,
      deliveryCities: cfg.deliveryCities
        .filter(city => city && city.city.trim())
        .map(city => ({
          city: city.city.trim(),
          shipping_price: city.free_shipping ? 0 : Number(city.shipping_price) || 0,
          delivery_days: Number(city.delivery_days) || 4,
          free_shipping: Boolean(city.free_shipping),
          cash_on_delivery: Boolean(city.cash_on_delivery),
          transfer: Boolean(city.transfer),
        })),
    };

    const { error } = await supabase.from('store_configs').upsert({
      vendor_id: session.user.id,
      config: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vendor_id' });

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
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

      {/* ── Cobertura de entrega por ciudad ─────────────────────────── */}
      <Section title="🚚 Cobertura de entrega por ciudad">
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, color: 'var(--vnd-text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
            Seleccioná las ciudades donde entregás y asigná el precio de envío. Los clientes solo verán las ciudades habilitadas con sus métodos de pago disponibles.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {availableCities.map(city => {
            const item = cfg.deliveryCities.find(entry => entry.city === city) ?? null;
            const enabled = Boolean(item);
            return (
              <div key={city} style={{ border: '1px solid var(--vnd-border)', borderRadius: 12, background: enabled ? 'rgba(245,197,24,0.04)' : 'var(--vnd-surface-2)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => upsertDeliveryCity(city)}
                    style={{
                      border: '1px solid var(--vnd-border)',
                      background: enabled ? '#F5C518' : 'transparent',
                      color: enabled ? '#111827' : 'var(--vnd-text-primary)',
                      borderRadius: 999,
                      padding: '6px 12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {enabled ? 'Habilitada' : 'Habilitar'}
                  </button>
                  <span style={{ fontWeight: 700, color: 'var(--vnd-text-primary)' }}>{city}</span>
                </div>

                {item && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
                    <div>
                      <label className="vnd-label">Precio de envío (₲)</label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        className="vnd-input"
                        value={item.free_shipping ? 0 : item.shipping_price || ''}
                        onChange={e => updateDeliveryCity(city, { shipping_price: Number(e.target.value) || 0, free_shipping: Number(e.target.value) === 0 })}
                        disabled={item.free_shipping}
                      />
                    </div>

                    <div>
                      <label className="vnd-label">Días hábiles</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="vnd-input"
                        value={item.delivery_days || 4}
                        onChange={e => updateDeliveryCity(city, { delivery_days: Number(e.target.value) || 4 })}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label className="vnd-label">Opciones</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--vnd-text-primary)' }}>
                        <input type="checkbox" checked={Boolean(item.free_shipping)} onChange={e => updateDeliveryCity(city, { free_shipping: e.target.checked, shipping_price: e.target.checked ? 0 : item.shipping_price || 25000 })} />
                        Envío gratis
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--vnd-text-primary)' }}>
                        <input type="checkbox" checked={Boolean(item.cash_on_delivery)} onChange={e => updateDeliveryCity(city, { cash_on_delivery: e.target.checked })} />
                        Contra entrega
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--vnd-text-primary)' }}>
                        <input type="checkbox" checked={Boolean(item.transfer)} onChange={e => updateDeliveryCity(city, { transfer: e.target.checked })} />
                        Transferencia
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Verificación de identidad del vendedor ─────────────────────── */}
      <Section title="✅ Verificación del vendedor">
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, color: 'var(--vnd-text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
            Subí tus documentos para validación del equipo. La revisión se hace como en Dokan: cada archivo queda en estado pendiente, aprobado o rechazado y se puede reenviar si se requiere.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {VENDOR_DOCS.map((doc) => {
            const status = vendorDocStatus[doc.key]?.status || 'missing';
            const rejectionReason = vendorDocStatus[doc.key]?.rejection_reason;
            const color = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : status === 'pending' ? '#d97706' : '#6b7280';
            const bg = status === 'approved' ? '#ecfdf5' : status === 'rejected' ? '#fef2f2' : status === 'pending' ? '#fffbeb' : '#f3f4f6';
            return (
              <div key={doc.key} style={{ border: '1px solid var(--vnd-border)', borderRadius: 14, background: 'var(--vnd-surface-2)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 14px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 800, color: 'var(--vnd-text-primary)', fontSize: '0.9rem' }}>{doc.label}</p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--vnd-text-muted)' }}>{doc.hint}</p>
                    </div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '4px 8px', borderRadius: 999, background: bg, color, border: `1px solid ${color}33` }}>
                      {status === 'approved' ? 'Aprobado' : status === 'rejected' ? 'Rechazado' : status === 'pending' ? 'Pendiente' : 'No cargado'}
                    </span>
                  </div>

                  {rejectionReason && (
                    <div style={{ marginBottom: 10, borderLeft: '3px solid #dc2626', background: 'rgba(239,68,68,0.05)', padding: '6px 8px', borderRadius: 8 }}>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: '#991b1b', fontWeight: 700 }}>Motivo del rechazo</p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#991b1b' }}>{rejectionReason}</p>
                    </div>
                  )}

                  <input
                    ref={el => { vendorFileRefs.current[doc.key] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    hidden
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleVendorDocUpload(doc.key, file);
                    }}
                  />

                  <button
                    className="vnd-btn vnd-btn-primary"
                    onClick={() => vendorFileRefs.current[doc.key]?.click()}
                    disabled={vendorDocUploading[doc.key]}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {vendorDocUploading[doc.key] ? 'Subiendo...' : status === 'approved' ? 'Reemplazar archivo' : 'Subir documento'}
                  </button>
                </div>
              </div>
            );
          })}
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
