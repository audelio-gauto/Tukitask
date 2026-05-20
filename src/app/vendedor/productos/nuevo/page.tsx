'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ── Types ───────────────────────────────────────────────── */
type ProductStatus = 'published' | 'draft';
type ProductType   = 'physical' | 'digital' | 'service';

/* Tramo de precio por cantidad */
interface PricingTier {
  id:             string;
  minQty:         number;
  maxQty:         number | null; // null = sin límite
  listedPrice:    number;
  floorPrice:     number;        // oculto al comprador
  autoAcceptFrom: number;        // acepta directo si oferta >=
}

interface ProductForm {
  name: string;
  sku: string;
  category: string;
  type: ProductType;
  description: string;
  price: string;
  floorPrice: string;
  stock: string;
  image: string;
  status: ProductStatus;
  negotiable:       boolean;
  hasTieredPricing: boolean;
  pricingTiers:     PricingTier[];
}

const CATEGORIES = [
  { value: 'electronica',   label: '📱 Electrónica' },
  { value: 'ropa',          label: '👗 Ropa & Moda' },
  { value: 'hogar',         label: '🏠 Hogar' },
  { value: 'alimentos',     label: '🍔 Alimentos' },
  { value: 'libros',        label: '📚 Libros' },
  { value: 'deportes',      label: '⚽ Deportes' },
  { value: 'juguetes',      label: '🧸 Juguetes' },
  { value: 'salud',         label: '💊 Salud & Belleza' },
  { value: 'servicios',     label: '🔧 Servicios' },
  { value: 'otros',         label: '📦 Otros' },
];

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'physical', label: '📦 Físico' },
  { value: 'digital',  label: '💾 Digital' },
  { value: 'service',  label: '🔧 Servicio' },
];

const EMOJI_SUGGESTIONS = ['📱','💻','👗','👟','🏠','🍔','📚','⚽','🧸','💄','🎮','🔧','💡','🎵','📷'];

const INITIAL: ProductForm = {
  name:         '',
  sku:          '',
  category:     'electronica',
  type:         'physical',
  description:  '',
  price:        '',
  floorPrice:   '',
  stock:        '',
  image:        '📦',
  status:           'draft',
  negotiable:       true,
  hasTieredPricing: false,
  pricingTiers:     [],
};

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="vnd-label">{label}</label>
      {hint && <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: -2 }}>{hint}</span>}
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function NuevoProductoPage() {
  const router = useRouter();
  const [form, setForm]         = useState<ProductForm>(INITIAL);
  const [saving, setSaving]     = useState(false);
  const [errors, setErrors]     = useState<Partial<Record<keyof ProductForm, string>>>({});
  const [saved, setSaved]       = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  }

  function addTier() {
    const last = form.pricingTiers[form.pricingTiers.length - 1];
    const newMin = last ? (last.maxQty !== null ? last.maxQty + 1 : last.minQty + 1) : 1;
    update('pricingTiers', [...form.pricingTiers, {
      id:             String(Date.now()),
      minQty:         newMin,
      maxQty:         null,
      listedPrice:    0,
      floorPrice:     0,
      autoAcceptFrom: 0,
    }]);
  }

  function removeTier(id: string) {
    update('pricingTiers', form.pricingTiers.filter(t => t.id !== id));
  }

  function updateTier(id: string, field: keyof Omit<PricingTier, 'id'>, value: number | null) {
    update('pricingTiers', form.pricingTiers.map(t => t.id === id ? { ...t, [field]: value } : t));
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof ProductForm, string>> = {};
    if (!form.name.trim())             errs.name       = 'El nombre es obligatorio';
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0)
                                       errs.price      = 'Precio inválido';
    if (form.negotiable && !form.hasTieredPricing) {
      if (!form.floorPrice || isNaN(Number(form.floorPrice)) || Number(form.floorPrice) <= 0)
                                       errs.floorPrice = 'Precio suelo inválido';
      if (Number(form.floorPrice) >= Number(form.price))
                                       errs.floorPrice = 'El precio suelo debe ser menor al precio';
    }
    if (!form.stock || isNaN(Number(form.stock)) || Number(form.stock) < 0)
                                       errs.stock      = 'Stock inválido';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave(status: ProductStatus) {
    if (!validate()) return;
    setSaving(true);
    /* TODO: persist to Supabase products table */
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => router.push('/vendedor/productos'), 1200);
  }

  const marginPct = form.price && form.floorPrice && !isNaN(Number(form.price)) && !isNaN(Number(form.floorPrice)) && Number(form.price) > 0
    ? (((Number(form.price) - Number(form.floorPrice)) / Number(form.price)) * 100).toFixed(0)
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/vendedor/productos" className="vnd-btn vnd-btn-secondary vnd-btn-sm" style={{ textDecoration: 'none' }}>
          ← Volver
        </Link>
        <div>
          <h1 className="vnd-page-heading" style={{ marginBottom: 0 }}>Nuevo producto</h1>
          <p style={{ color: 'var(--vnd-text-muted)', fontSize: '0.82rem', marginTop: 2 }}>
            Completa los datos y guarda como borrador o publica directamente.
          </p>
        </div>
      </div>

      {saved && (
        <div style={{ background: '#16a34a22', border: '1px solid #4ade80', borderRadius: 10, padding: '10px 16px', marginBottom: 20, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
          ✅ Producto guardado — redirigiendo…
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* ── Left column ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Información básica */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />Información básica</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FieldGroup label="Nombre del producto *">
                <input
                  className="vnd-input"
                  placeholder="Ej: Auricular JBL Tune 510 BT"
                  value={form.name}
                  onChange={e => update('name', e.target.value)}
                  maxLength={120}
                />
                {errors.name && <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{errors.name}</span>}
              </FieldGroup>

              <div className="vnd-form-grid">
                <FieldGroup label="Categoría">
                  <select className="vnd-select" value={form.category} onChange={e => update('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </FieldGroup>
                <FieldGroup label="Tipo de producto">
                  <select className="vnd-select" value={form.type} onChange={e => update('type', e.target.value as ProductType)}>
                    {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </FieldGroup>
              </div>

              <FieldGroup label="SKU / Código" hint="Opcional — código interno de referencia">
                <input
                  className="vnd-input"
                  placeholder="Ej: JBL-510-BLK"
                  value={form.sku}
                  onChange={e => update('sku', e.target.value)}
                  maxLength={60}
                />
              </FieldGroup>

              <FieldGroup label="Descripción">
                <textarea
                  className="vnd-input"
                  placeholder="Describe el producto: características, materiales, garantía…"
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  rows={4}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  maxLength={800}
                />
              </FieldGroup>
            </div>
          </div>

          {/* Precio y stock */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />Precio y stock</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div className="vnd-form-grid">
                <FieldGroup label="Precio de venta ₲ *">
                  <input
                    className="vnd-input"
                    type="number"
                    min="0"
                    placeholder="Ej: 180000"
                    value={form.price}
                    onChange={e => update('price', e.target.value)}
                  />
                  {errors.price && <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{errors.price}</span>}
                </FieldGroup>

                <FieldGroup label="Stock disponible *">
                  <input
                    className="vnd-input"
                    type="number"
                    min="0"
                    placeholder="Ej: 50"
                    value={form.stock}
                    onChange={e => update('stock', e.target.value)}
                  />
                  {errors.stock && <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{errors.stock}</span>}
                </FieldGroup>
              </div>

              {/* Negociable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--vnd-bg-elevated)', borderRadius: 10, border: '1px solid var(--vnd-border)' }}>
                <button
                  type="button"
                  onClick={() => update('negotiable', !form.negotiable)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: form.negotiable ? '#F5C518' : 'var(--vnd-border)',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                  aria-checked={form.negotiable}
                  role="switch"
                >
                  <span style={{
                    position: 'absolute', top: 3, left: form.negotiable ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--vnd-text)' }}>
                    🤖 Precio negociable
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)' }}>
                    El Robot Negociador puede aceptar ofertas entre el precio suelo y el precio de venta
                  </div>
                </div>
              </div>

              {form.negotiable && (
                <FieldGroup label="Precio suelo ₲ *" hint="Mínimo que el robot puede aceptar automáticamente">
                  <input
                    className="vnd-input"
                    type="number"
                    min="0"
                    placeholder="Ej: 130000"
                    value={form.floorPrice}
                    onChange={e => update('floorPrice', e.target.value)}
                  />
                  {errors.floorPrice && <span style={{ color: '#f87171', fontSize: '0.75rem' }}>{errors.floorPrice}</span>}
                  {marginPct !== null && Number(marginPct) > 0 && (
                    <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>
                      Margen negociable: {marginPct}%
                    </span>
                  )}
                </FieldGroup>
              )}
            </div>
          </div>

          {/* ── Precios por cantidad (TukiBot) ──────────── */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />📦 Precios por cantidad — TukiBot</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--vnd-bg-elevated)', borderRadius: 10, border: '1px solid var(--vnd-border)' }}>
                <button
                  type="button"
                  onClick={() => update('hasTieredPricing', !form.hasTieredPricing)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: form.hasTieredPricing ? '#F5C518' : 'var(--vnd-border)',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                  role="switch"
                  aria-checked={form.hasTieredPricing}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: form.hasTieredPricing ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--vnd-text)' }}>
                    Precios escalonados por cantidad
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)' }}>
                    Precio piso y auto-aceptación distintos según cuántas unidades pide el comprador
                  </div>
                </div>
              </div>

              {form.hasTieredPricing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '68px 68px 1fr 1fr 1fr 30px', gap: 6, padding: '0 2px' }}>
                    {['Qty mín', 'Qty máx', 'Precio lista ₲', 'Precio piso ₲ 🔒', 'Auto-aceptar ≥ ₲', ''].map((h, i) => (
                      <span key={i} style={{ fontSize: '0.62rem', color: 'var(--vnd-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{h}</span>
                    ))}
                  </div>

                  {/* Empty state */}
                  {form.pricingTiers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--vnd-text-muted)', fontSize: '0.82rem', background: 'var(--vnd-bg-elevated)', borderRadius: 8, border: '1px dashed var(--vnd-border)' }}>
                      Sin tramos aún — hacé clic en <strong>+ Agregar tramo</strong>
                    </div>
                  )}

                  {/* Tier rows */}
                  {form.pricingTiers.map((tier, idx) => (
                    <div key={tier.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '68px 68px 1fr 1fr 1fr 30px',
                      gap: 6,
                      padding: '8px 10px',
                      background: 'var(--vnd-bg-elevated)',
                      borderRadius: 8,
                      border: '1px solid var(--vnd-border)',
                      alignItems: 'center',
                    }}>
                      <input
                        className="vnd-input" type="number" min="1"
                        value={tier.minQty}
                        onChange={e => updateTier(tier.id, 'minQty', Number(e.target.value))}
                        style={{ padding: '5px 7px', fontSize: '0.82rem' }}
                        title={`Tramo ${idx + 1}: cantidad mínima`}
                      />
                      <input
                        className="vnd-input" type="number" min={tier.minQty + 1}
                        placeholder="∞"
                        value={tier.maxQty ?? ''}
                        onChange={e => updateTier(tier.id, 'maxQty', e.target.value ? Number(e.target.value) : null)}
                        style={{ padding: '5px 7px', fontSize: '0.82rem' }}
                        title="Dejar vacío = sin límite"
                      />
                      <input
                        className="vnd-input" type="number" min="0"
                        placeholder="45000"
                        value={tier.listedPrice || ''}
                        onChange={e => updateTier(tier.id, 'listedPrice', Number(e.target.value))}
                        style={{ padding: '5px 7px', fontSize: '0.82rem' }}
                      />
                      <input
                        className="vnd-input" type="number" min="0"
                        placeholder="30000"
                        value={tier.floorPrice || ''}
                        onChange={e => updateTier(tier.id, 'floorPrice', Number(e.target.value))}
                        style={{ padding: '5px 7px', fontSize: '0.82rem', borderColor: 'rgba(248,113,113,0.5)' }}
                        title="Mínimo absoluto (oculto al comprador)"
                      />
                      <input
                        className="vnd-input" type="number" min="0"
                        placeholder="40000"
                        value={tier.autoAcceptFrom || ''}
                        onChange={e => updateTier(tier.id, 'autoAcceptFrom', Number(e.target.value))}
                        style={{ padding: '5px 7px', fontSize: '0.82rem', borderColor: 'rgba(74,222,128,0.5)' }}
                        title="Auto-aceptar si oferta ≥ este valor"
                      />
                      <button
                        type="button"
                        onClick={() => removeTier(tier.id)}
                        style={{
                          width: 28, height: 28, borderRadius: 6, border: 'none',
                          background: 'rgba(248,113,113,0.12)', color: '#f87171',
                          cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        title="Eliminar tramo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="vnd-btn vnd-btn-secondary vnd-btn-sm"
                    onClick={addTier}
                    style={{ alignSelf: 'flex-start', marginTop: 2 }}
                  >
                    + Agregar tramo
                  </button>

                  {/* Info box */}
                  <div style={{ padding: '10px 14px', background: 'rgba(245,197,24,0.05)', borderRadius: 8, border: '1px solid rgba(245,197,24,0.18)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', lineHeight: 1.65, margin: 0 }}>
                      🔒 <strong style={{ color: 'var(--vnd-text)' }}>Precio piso</strong> es invisible para el comprador — mínimo absoluto que el TukiBot puede aceptar.&nbsp;
                      Si la oferta ≥ <strong style={{ color: '#4ade80' }}>Auto-aceptar</strong>, el bot acepta al instante.&nbsp;
                      Si está entre el piso y el auto-aceptar, el bot negocia con IA.&nbsp;
                      Si es menor al piso, el bot contraoferta automáticamente — <em>nunca rechaza</em>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column ────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Imagen / ícono */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />Imagen / Ícono</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Preview */}
              <div style={{ width: '100%', aspectRatio: '1', background: 'var(--vnd-bg-elevated)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '5rem', border: '2px dashed var(--vnd-border)' }}>
                {form.image}
              </div>

              <FieldGroup label="URL de imagen o emoji">
                <input
                  className="vnd-input"
                  placeholder="https://... o un emoji 📱"
                  value={form.image}
                  onChange={e => update('image', e.target.value)}
                />
              </FieldGroup>

              <button
                type="button"
                className="vnd-btn vnd-btn-secondary vnd-btn-sm"
                onClick={() => setShowEmoji(v => !v)}
                style={{ alignSelf: 'flex-start' }}
              >
                {showEmoji ? 'Ocultar' : '😀 Seleccionar emoji'}
              </button>
              {showEmoji && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {EMOJI_SUGGESTIONS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { update('image', e); setShowEmoji(false); }}
                      style={{ fontSize: '1.5rem', background: 'var(--vnd-bg-elevated)', border: '1px solid var(--vnd-border)', borderRadius: 8, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Estado */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />Estado</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(['published', 'draft'] as ProductStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update('status', s)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 10, border: form.status === s ? '2px solid #F5C518' : '1px solid var(--vnd-border)',
                    background: form.status === s ? '#F5C51812' : 'var(--vnd-bg-elevated)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: s === 'published' ? '#4ade80' : '#9aa8ba', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--vnd-text)' }}>
                      {s === 'published' ? 'Publicado' : 'Borrador'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>
                      {s === 'published' ? 'Visible en tu tienda pública' : 'Solo tú puedes verlo'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="vnd-btn vnd-btn-primary"
              onClick={() => handleSave(form.status)}
              disabled={saving || saved}
              style={{ width: '100%' }}
            >
              {saving ? 'Guardando…' : saved ? '✅ Guardado' : form.status === 'published' ? '🚀 Publicar producto' : '💾 Guardar borrador'}
            </button>
            <Link href="/vendedor/productos" style={{ textAlign: 'center' }}>
              <button type="button" className="vnd-btn vnd-btn-secondary" style={{ width: '100%' }} disabled={saving}>
                Cancelar
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
