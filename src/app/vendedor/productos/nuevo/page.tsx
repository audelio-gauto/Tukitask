'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ── Types ───────────────────────────────────────────────── */
type ProductStatus = 'published' | 'draft';
type ProductType   = 'physical' | 'digital' | 'service';

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
  negotiable: boolean;
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
  status:       'draft',
  negotiable:   true,
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

  function validate(): boolean {
    const errs: Partial<Record<keyof ProductForm, string>> = {};
    if (!form.name.trim())             errs.name       = 'El nombre es obligatorio';
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0)
                                       errs.price      = 'Precio inválido';
    if (form.negotiable) {
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
