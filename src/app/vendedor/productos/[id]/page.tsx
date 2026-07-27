'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/* ── Types ───────────────────────────────────────────────── */
type ProductStatus = 'published' | 'draft';
type ProductType   = 'physical' | 'digital' | 'service';

interface PricingTier {
  id:             string;
  minQty:         number;
  maxQty:         number | null;
  listedPrice:    number;
  floorPrice:     number;
  autoAcceptFrom: number;
}

interface ProductForm {
  name:             string;
  sku:              string;
  category:         string;
  type:             ProductType;
  shortDescription: string;
  description:      string;
  price:            string;
  floorPrice:       string;
  stock:            string;
  image:            string;
  gallery:          string[];
  status:           ProductStatus;
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

const EMPTY: ProductForm = {
  name: '', sku: '', category: 'electronica', type: 'physical',
  shortDescription: '', description: '', price: '', floorPrice: '', stock: '',
  image: '', gallery: [], status: 'draft',
  negotiable: true, hasTieredPricing: false, pricingTiers: [],
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
export default function EditarProductoPage() {
  const router   = useRouter();
  const params   = useParams();
  const productId = params.id as string;

  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [productName,  setProductName]  = useState('');
  const [form,         setForm]         = useState<ProductForm>(EMPTY);
  const [saving,       setSaving]       = useState(false);
  const [errors,       setErrors]       = useState<Partial<Record<keyof ProductForm, string>>>({});
  const [tierError,    setTierError]    = useState<string | null>(null);
  const [saved,        setSaved]        = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string | null>(null);
  const [userId,       setUserId]       = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Load product ─────────────────────────────────────── */
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('vendor_id', user.id)
        .single();

      if (!data) { setNotFound(true); setLoading(false); return; }

      const tiers: PricingTier[] = Array.isArray(data.pricing_tiers)
        ? data.pricing_tiers.map((t: PricingTier) => ({ ...t, id: t.id ?? String(Date.now() + Math.random()) }))
        : [];

      const gallery: string[] = Array.isArray(data.gallery) ? data.gallery : (data.image ? [data.image] : []);

      // Map DB status → form status
      const formStatus: ProductStatus =
        data.status === 'published' || data.status === 'pending_review' ? 'published' : 'draft';

      setProductName(data.name ?? '');
      setForm({
        name:             data.name         ?? '',
        sku:              data.sku           ?? '',
        category:         data.category      ?? 'electronica',
        type:             (data.type         ?? 'physical') as ProductType,
        description:      data.description   ?? '',
        shortDescription: data.short_description ?? '',
        price:            String(data.price   ?? ''),
        floorPrice:       String(data.floor_price ?? ''),
        stock:            String(data.stock   ?? ''),
        image:            data.image         ?? '',
        gallery,
        status:           formStatus,
        negotiable:       data.negotiable    ?? true,
        hasTieredPricing: tiers.length > 0,
        pricingTiers:     tiers,
      });
      setLoading(false);
    }
    load();
  }, [productId, router]);

  /* ── Form helpers ────────────────────────────────────── */
  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  }

  function addTier() {
    const last = form.pricingTiers[form.pricingTiers.length - 1];
    const newMin = last ? (last.maxQty !== null ? last.maxQty + 1 : last.minQty + 1) : 1;
    update('pricingTiers', [...form.pricingTiers, {
      id: String(Date.now()), minQty: newMin, maxQty: null,
      listedPrice: 0, floorPrice: 0, autoAcceptFrom: 0,
    }]);
    setTierError(null);
  }

  function removeTier(id: string) {
    update('pricingTiers', form.pricingTiers.filter(t => t.id !== id));
    setTierError(null);
  }

  function updateTier(id: string, field: keyof Omit<PricingTier, 'id'>, value: number | null) {
    update('pricingTiers', form.pricingTiers.map(t => t.id === id ? { ...t, [field]: value } : t));
    setTierError(null);
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof ProductForm, string>> = {};
    let tiersErr: string | null = null;
    if (!form.name.trim())             errs.name      = 'El nombre es obligatorio';
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0)
                                       errs.price     = 'Precio inválido';
    if (form.negotiable && !form.hasTieredPricing) {
      if (!form.floorPrice || isNaN(Number(form.floorPrice)) || Number(form.floorPrice) <= 0)
                                       errs.floorPrice = 'Precio suelo inválido';
      if (Number(form.floorPrice) >= Number(form.price))
                                       errs.floorPrice = 'El precio suelo debe ser menor al precio';
    }
    if (form.hasTieredPricing) {
      if (form.pricingTiers.length === 0) {
        tiersErr = 'Debes agregar al menos 1 tramo.';
      } else {
        const sorted = [...form.pricingTiers].sort((a, b) => a.minQty - b.minQty);
        for (let i = 0; i < sorted.length; i++) {
          const tier = sorted[i];
          if (!Number.isFinite(tier.minQty) || tier.minQty < 1) { tiersErr = `Tramo ${i + 1}: cantidad mínima debe ser ≥ 1.`; break; }
          if (tier.maxQty !== null && tier.maxQty < tier.minQty) { tiersErr = `Tramo ${i + 1}: Qty máx no puede ser menor que Qty mín.`; break; }
          if (tier.listedPrice <= 0 || tier.floorPrice <= 0 || tier.autoAcceptFrom <= 0) { tiersErr = `Tramo ${i + 1}: todos los precios deben ser > 0.`; break; }
          if (!(tier.floorPrice <= tier.autoAcceptFrom && tier.autoAcceptFrom <= tier.listedPrice)) { tiersErr = `Tramo ${i + 1}: debe cumplirse piso ≤ auto-aceptar ≤ precio lista.`; break; }
          if (i === 0 && tier.minQty !== 1) { tiersErr = 'El primer tramo debe iniciar en cantidad 1.'; break; }
          if (i > 0) {
            const prev = sorted[i - 1];
            if (prev.maxQty === null) { tiersErr = `Tramo ${i}: el tramo anterior no tiene límite.`; break; }
            if (tier.minQty !== prev.maxQty + 1) { tiersErr = `Tramo ${i + 1}: debe iniciar en ${prev.maxQty + 1}.`; break; }
          }
        }
      }
    }
    if (!form.stock || isNaN(Number(form.stock)) || Number(form.stock) < 0)
                                       errs.stock = 'Stock inválido';
    setErrors(errs);
    setTierError(tiersErr);
    return Object.keys(errs).length === 0 && !tiersErr;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = 7 - form.gallery.length;
    const toUpload  = files.slice(0, remaining);
    setUploading(true);
    setUploadError(null);
    const newUrls: string[] = [];
    for (const file of toUpload) {
      if (file.size > 5 * 1024 * 1024) { setUploadError(`"${file.name}" supera los 5 MB.`); break; }
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `${userId ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) { setUploadError(error.message); break; }
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(data.path);
      newUrls.push(publicUrl);
    }
    if (newUrls.length > 0) {
      const newGallery = [...form.gallery, ...newUrls];
      update('gallery', newGallery);
      update('image', newGallery[0]);
    }
    setUploading(false);
    e.target.value = '';
  }

  function removeImage(idx: number) {
    const newGallery = form.gallery.filter((_, i) => i !== idx);
    update('gallery', newGallery);
    update('image', newGallery[0] ?? '');
  }

  function setMainImage(idx: number) {
    const reordered = [form.gallery[idx], ...form.gallery.filter((_, i) => i !== idx)];
    update('gallery', reordered);
    update('image', reordered[0]);
  }

  async function handleSave(targetStatus: ProductStatus) {
    if (!validate()) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // Re-submitting for publish → goes to pending_review again
    const dbStatus = targetStatus === 'published' ? 'pending_review' : 'draft';

    const row = {
      name:          form.name.trim(),
      sku:           form.sku.trim() || null,
      category:      form.category,
      type:          form.type,
      short_description: form.shortDescription.trim() || null,
      description:   form.description.trim() || null,
      price:         Number(form.price),
      floor_price:   Number(form.floorPrice) || 0,
      stock:         Number(form.stock),
      image:         form.image || null,
      gallery:       form.gallery,
      status:        dbStatus,
      negotiable:    form.negotiable,
      pricing_tiers: form.hasTieredPricing ? form.pricingTiers : [],
    };

    const { error } = await supabase
      .from('products')
      .update(row)
      .eq('id', productId)
      .eq('vendor_id', user.id);

    if (error) {
      setSaving(false);
      setErrors({ name: error.message });
      return;
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => router.push('/vendedor/productos'), 1200);
  }

  const marginPct = form.price && form.floorPrice && !isNaN(Number(form.price)) && !isNaN(Number(form.floorPrice)) && Number(form.price) > 0
    ? (((Number(form.price) - Number(form.floorPrice)) / Number(form.price)) * 100).toFixed(0)
    : null;

  /* ── Loading / Not found ─────────────────────────────── */
  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--vnd-text-muted)' }}>
        ⏳ Cargando producto…
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>📦</div>
        <h2 style={{ color: 'var(--vnd-text)', marginBottom: 8 }}>Producto no encontrado</h2>
        <p style={{ color: 'var(--vnd-text-muted)', marginBottom: 20 }}>Este producto no existe o no te pertenece.</p>
        <Link href="/vendedor/productos" className="vnd-btn vnd-btn-secondary" style={{ textDecoration: 'none' }}>← Volver a productos</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/vendedor/productos" className="vnd-btn vnd-btn-secondary vnd-btn-sm" style={{ textDecoration: 'none' }}>
          ← Volver
        </Link>
        <div>
          <h1 className="vnd-page-heading" style={{ marginBottom: 0 }}>Editar producto</h1>
          <p style={{ color: 'var(--vnd-text-muted)', fontSize: '0.82rem', marginTop: 2 }}>
            {productName}
          </p>
        </div>
      </div>

      {saved && (
        <div style={{ background: '#16a34a22', border: '1px solid #4ade80', borderRadius: 10, padding: '10px 16px', marginBottom: 20, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
          ✅ Cambios guardados — redirigiendo…
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
            </div>
          </div>

          {/* ── Descripción del producto ─────────────────── */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />📝 Descripción del producto</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Descripción corta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <label className="vnd-label">Descripción corta</label>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em', color: '#F5C518', background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.25)', padding: '2px 8px', borderRadius: 999 }}>
                    📌 Tarjetas y debajo del precio
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>
                  Resumen breve — 1 ó 2 oraciones que convencen al comprador a primera vista
                </span>
                <textarea
                  className="vnd-input"
                  placeholder="Ej: Zapatillas ultralivianas con suela EVA, ideales para running y entrenamiento diario."
                  value={form.shortDescription}
                  onChange={e => update('shortDescription', e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  maxLength={300}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '0.68rem', color: form.shortDescription.length >= 280 ? '#f87171' : 'var(--vnd-text-muted)' }}>
                    {form.shortDescription.length}/300
                  </span>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--vnd-border)' }} />

              {/* Descripción larga */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <label className="vnd-label">Descripción detallada</label>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', padding: '2px 8px', borderRadius: 999 }}>
                    📄 Ficha completa del producto
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>
                  Características, materiales, dimensiones, garantía y todo lo que el comprador necesita saber
                </span>
                <textarea
                  className="vnd-input"
                  placeholder="Ej: La mediasuela de EVA LIGHTSTRIKE ofrece resiliencia optimizada para cada pisada. El exterior está hecho de malla técnica suave, zonificada en áreas clave…"
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  rows={9}
                  style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65 }}
                  maxLength={3000}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '0.68rem', color: form.description.length >= 2800 ? '#f87171' : 'var(--vnd-text-muted)' }}>
                    {form.description.length}/3000
                  </span>
                </div>
              </div>

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
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--vnd-text)' }}>🤖 Precio negociable</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)' }}>El Robot Negociador puede aceptar ofertas entre el precio suelo y el precio de venta</div>
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
                    <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>Margen negociable: {marginPct}%</span>
                  )}
                </FieldGroup>
              )}
            </div>
          </div>

          {/* Precios por cantidad */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />📦 Precios por cantidad — TukiBot</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--vnd-bg-elevated)', borderRadius: 10, border: '1px solid var(--vnd-border)' }}>
                <button
                  type="button"
                  onClick={() => { update('hasTieredPricing', !form.hasTieredPricing); setTierError(null); }}
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
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--vnd-text)' }}>Precios escalonados por cantidad</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)' }}>Precio piso y auto-aceptación distintos según cuántas unidades pide el comprador</div>
                </div>
              </div>

              {form.hasTieredPricing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '68px 68px 1fr 1fr 1fr 30px', gap: 6, padding: '0 2px' }}>
                    {['Qty mín', 'Qty máx', 'Precio lista ₲', 'Precio piso ₲ 🔒', 'Auto-aceptar ≥ ₲', ''].map((h, i) => (
                      <span key={i} style={{ fontSize: '0.62rem', color: 'var(--vnd-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{h}</span>
                    ))}
                  </div>

                  {form.pricingTiers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '18px 0', color: 'var(--vnd-text-muted)', fontSize: '0.82rem', background: 'var(--vnd-bg-elevated)', borderRadius: 8, border: '1px dashed var(--vnd-border)' }}>
                      Sin tramos aún — hacé clic en <strong>+ Agregar tramo</strong>
                    </div>
                  )}

                  {form.pricingTiers.map((tier, idx) => (
                    <div key={tier.id} style={{ display: 'grid', gridTemplateColumns: '68px 68px 1fr 1fr 1fr 30px', gap: 6, padding: '8px 10px', background: 'var(--vnd-bg-elevated)', borderRadius: 8, border: '1px solid var(--vnd-border)', alignItems: 'center' }}>
                      <input className="vnd-input" type="number" min="1" value={tier.minQty} onChange={e => updateTier(tier.id, 'minQty', Number(e.target.value))} style={{ padding: '5px 7px', fontSize: '0.82rem' }} title={`Tramo ${idx + 1}: cantidad mínima`} />
                      <input className="vnd-input" type="number" min={tier.minQty + 1} placeholder="∞" value={tier.maxQty ?? ''} onChange={e => updateTier(tier.id, 'maxQty', e.target.value ? Number(e.target.value) : null)} style={{ padding: '5px 7px', fontSize: '0.82rem' }} title="Dejar vacío = sin límite" />
                      <input className="vnd-input" type="number" min="0" placeholder="45000" value={tier.listedPrice || ''} onChange={e => updateTier(tier.id, 'listedPrice', Number(e.target.value))} style={{ padding: '5px 7px', fontSize: '0.82rem' }} />
                      <input className="vnd-input" type="number" min="0" placeholder="30000" value={tier.floorPrice || ''} onChange={e => updateTier(tier.id, 'floorPrice', Number(e.target.value))} style={{ padding: '5px 7px', fontSize: '0.82rem', borderColor: 'rgba(248,113,113,0.5)' }} title="Mínimo absoluto (oculto al comprador)" />
                      <input className="vnd-input" type="number" min="0" placeholder="40000" value={tier.autoAcceptFrom || ''} onChange={e => updateTier(tier.id, 'autoAcceptFrom', Number(e.target.value))} style={{ padding: '5px 7px', fontSize: '0.82rem', borderColor: 'rgba(74,222,128,0.5)' }} title="Auto-aceptar si oferta ≥ este valor" />
                      <button type="button" onClick={() => removeTier(tier.id)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(248,113,113,0.12)', color: '#f87171', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Eliminar tramo">✕</button>
                    </div>
                  ))}

                  <button type="button" className="vnd-btn vnd-btn-secondary vnd-btn-sm" onClick={addTier} style={{ alignSelf: 'flex-start', marginTop: 2 }}>+ Agregar tramo</button>

                  {tierError && <div style={{ color: '#f87171', fontSize: '0.78rem', fontWeight: 600 }}>{tierError}</div>}

                  <div style={{ padding: '10px 14px', background: 'rgba(245,197,24,0.05)', borderRadius: 8, border: '1px solid rgba(245,197,24,0.18)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', lineHeight: 1.65, margin: 0 }}>
                      🔒 <strong style={{ color: 'var(--vnd-text)' }}>Precio piso</strong> es invisible para el comprador — mínimo absoluto que el TukiBot puede aceptar.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column ────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Imágenes del producto */}
          <div className="vnd-card">
            <div className="vnd-card-header">
              <span className="vnd-card-title"><span className="vnd-card-title-dot" />Imágenes del producto</span>
            </div>
            <div className="vnd-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {form.gallery.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {form.gallery.map((url, idx) => (
                    <div
                      key={url + idx}
                      style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: idx === 0 ? '2px solid #F5C518' : '1px solid var(--vnd-border)', cursor: idx !== 0 ? 'pointer' : 'default' }}
                      title={idx !== 0 ? 'Clic para poner como imagen principal' : 'Imagen principal'}
                      onClick={() => idx !== 0 && setMainImage(idx)}
                    >
                      <img src={url} alt={`Imagen ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {idx === 0 && (
                        <span style={{ position: 'absolute', top: 4, left: 4, background: '#F5C518', color: '#000', fontSize: '0.58rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, lineHeight: 1.4 }}>PRINCIPAL</span>
                      )}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeImage(idx); }}
                        style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                        title="Eliminar imagen"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              {form.gallery.length < 7 && (
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 16px', borderRadius: 10, border: '2px dashed var(--vnd-border)', cursor: uploading ? 'wait' : 'pointer', background: 'var(--vnd-bg-elevated)' }}>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
                  {uploading ? (
                    <span style={{ color: 'var(--vnd-text-muted)', fontSize: '0.85rem' }}>Subiendo imagen…</span>
                  ) : (
                    <>
                      <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: 'var(--vnd-text-muted)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span style={{ fontSize: '0.82rem', color: 'var(--vnd-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>Subir imágenes<br /><span style={{ fontSize: '0.7rem' }}>JPG, PNG, WebP · Máx 5 MB c/u</span></span>
                    </>
                  )}
                </label>
              )}

              <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', margin: 0 }}>
                {form.gallery.length}/7 imágenes · La primera es la portada · Clic en otra para hacerla principal
              </p>

              {uploadError && <span style={{ color: '#f87171', fontSize: '0.78rem' }}>{uploadError}</span>}
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
                      {s === 'published' ? 'Enviar para revisión' : 'Borrador'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>
                      {s === 'published' ? 'El admin revisará y aprobará tu producto' : 'Solo tú puedes verlo'}
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
              {saving ? 'Guardando…' : saved ? '✅ Guardado' : form.status === 'published' ? '📤 Enviar para revisión' : '💾 Guardar cambios'}
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
