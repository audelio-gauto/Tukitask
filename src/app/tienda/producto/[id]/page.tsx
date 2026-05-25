'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { gs } from '../../data';

/* ── Deal strength meter (floor price never revealed to user) ── */
function getDealStrength(offer: number, price: number, floor: number) {
  if (!offer || offer <= 0) return null;
  if (offer >= price) return { pct: 100, color: '#4ade80', label: '🟢 ¡Precio completo!',   sub: 'Aceptación inmediata garantizada' };
  if (offer >= floor * 1.02) {
    const pct = 68 + ((offer - floor) / (price - floor)) * 31;
    return { pct, color: '#4ade80', label: '🟢 Oferta muy buena',         sub: 'Alta probabilidad de aceptación' };
  }
  if (offer >= floor * 0.80) {
    const pct = 38 + ((offer - floor * 0.80) / (floor * 0.22)) * 29;
    return { pct, color: '#fbbf24', label: '🟡 Puede funcionar',          sub: 'El TukiBot podría contra-ofertar' };
  }
  const pct = Math.max(5, (offer / (floor * 0.80)) * 37);
  return   { pct, color: '#f87171', label: '🔴 Oferta muy baja',              sub: 'El TukiBot te hará una contraoferta al mínimo' };
}

type Mode = 'idle' | 'buy' | 'negotiate';
type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';

function getTimeoutActionLabel(action?: TimeoutAction) {
  if (action === 'auto_accept') return 'el precio vuelve al normal';
  if (action === 'pressure_client') return 'el precio sube de vuelta';
  return 'el precio sube de vuelta'; // auto_counter
}

function formatTimeoutAt(timeoutAt?: string) {
  if (!timeoutAt) return null;
  try {
    const date = new Date(timeoutAt);
    return date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

type Product = {
  id: string;
  vendor_id: string;
  vendor_email: string;
  name: string;
  category: string;
  price: number;
  floor_price: number;
  stock: number;
  image: string | null;
  gallery: string[] | null;
  description: string | null;
  negotiable: boolean;
};

/* ══════════════════════════════════════════════════════════════ */
export default function ProductDetailPage() {
  const params = useParams();
  const router  = useRouter();
  const id      = params.id as string;

  const [p,           setP]           = useState<Product | null | undefined>(undefined); // undefined=loading
  const [galleryIdx,  setGalleryIdx]  = useState(0);
  const [mode,        setMode]        = useState<Mode>('idle');
  const [quantity,    setQuantity]    = useState(1);
  const [offerAmount, setOfferAmount] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [analyzing,   setAnalyzing]   = useState(false);
  const [done,        setDone]        = useState<{ type: Mode; amount?: number; botResponse?: 'accepted' | 'countered'; counterAmount?: number; botMessage?: string; timeoutAt?: string; timeoutAction?: TimeoutAction; timeoutMessage?: string } | null>(null);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image, gallery, description, negotiable')
      .eq('id', id)
      .eq('status', 'published')
      .single()
      .then(({ data }) => { setP(data ?? null); setGalleryIdx(0); });
  }, [id]);

  // Loading
  if (p === undefined) {
    return (
      <div className="tnd-page">
        <div className="tnd-not-found">
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
          <p style={{ color: 'var(--tnd-text-muted)' }}>Cargando producto...</p>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="tnd-page">
        <div className="tnd-not-found">
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📦</div>
          <h2 style={{ color: 'var(--tnd-text-primary)', marginBottom: 8 }}>Producto no encontrado</h2>
          <p style={{ color: 'var(--tnd-text-muted)', marginBottom: 24 }}>Este producto no existe o fue removido.</p>
          <Link href="/tienda" className="tnd-back">← Volver al catálogo</Link>
        </div>
      </div>
    );
  }

  const isNegotiable = p.negotiable && p.floor_price < p.price * 0.92;
  const allImages    = (p.gallery && p.gallery.length > 0) ? p.gallery : (p.image ? [p.image] : []);
  const offerNum     = parseInt(offerAmount, 10) || 0;
  const dealStrength = mode === 'negotiate' ? getDealStrength(offerNum, p.price, p.floor_price) : null;
  const clampQty     = (v: number) => Math.max(1, Math.min(p.stock, v));

  const humanDelay = () => new Promise<void>(r => setTimeout(r, 1200 + Math.random() * 1800));

  function handleBuy() {
    if (!p) return;
    const url = new URLSearchParams({
      product: p.id,
      qty:     String(quantity),
      name:    p.name,
      vendor:  p.vendor_email,
      vid:     p.vendor_id,
    });
    router.push(`/tienda/checkout?${url.toString()}`);
  }

  async function handleOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!p || !offerNum || offerNum <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/tukibot/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: p.vendor_id,
          productId: p.id,
          buyerOffer: offerNum,
          quantity,
          listedPrice: p.price,
          floorPrice: p.floor_price,
          productName: p.name,
          vendorName: p.vendor_email,
        }),
      });

      if (!res.ok) throw new Error('Negociación fallida');

      const data = await res.json();
      setAnalyzing(true);
      await humanDelay();
      if (data.status === 'accepted') {
        setDone({
          type: 'negotiate',
          amount: data.acceptedAmount ?? offerNum,
          botResponse: 'accepted',
          botMessage: data.message,
        });
      } else {
        setDone({
          type: 'negotiate',
          amount: offerNum,
          botResponse: 'countered',
          counterAmount: data.counterAmount,
          botMessage: data.message,
          timeoutAt: data.timeoutAt,
          timeoutAction: data.timeoutAction,
          timeoutMessage: data.timeoutMessage,
        });
      }
    } catch {
      // Fallback local logic to keep UX responsive even if API fails
      setAnalyzing(true);
      await humanDelay();
      if (offerNum >= p.floor_price) {
        setDone({
          type: 'negotiate',
          amount: offerNum,
          botResponse: 'accepted',
          botMessage: `Perfecto, te confirmo ${gs(offerNum)} por unidad.`,
        });
      } else {
        const counter = Math.round((p.floor_price + offerNum) / 2 / 1000) * 1000;
        const counterAmount = Math.max(p.floor_price, counter);
        setDone({
          type: 'negotiate',
          amount: offerNum,
          botResponse: 'countered',
          counterAmount,
          botMessage: `Te puedo mejorar la oferta: ${gs(counterAmount)} por unidad.`,
        });
      }
    } finally {
      setAnalyzing(false);
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null); setMode('idle');
    setOfferAmount(''); setQuantity(1);
  }

  return (
    <div className="tnd-page">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: '0.82rem' }}>
        <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <Link href={`/tienda/${p.vendor_id}`} className="tnd-back-link">{p.vendor_email.split('@')[0]}</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <span style={{ color: 'var(--tnd-text-muted)' }}>{p.category}</span>
      </div>

      {/* Title — above the grid, full width */}
      <h1 className="tnd-detail-name" style={{ marginBottom: 20 }}>{p.name}</h1>

      <div className="tnd-detail-grid">
        {/* ── Left: gallery ────────────────────────────────── */}
        <div>
          <div className="tnd-gallery">
            {/* Main image */}
            <div className="tnd-gallery-main">
              {allImages.length > 0
                ? <img
                    src={allImages[galleryIdx] ?? allImages[0]}
                    alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }}
                  />
                : <span role="img" aria-label={p.name} style={{ fontSize: '5rem' }}>📦</span>
              }
              {isNegotiable && (
                <span className="tnd-negoable-badge tnd-negoable-badge-lg">🤖 Negociable</span>
              )}
              {allImages.length > 1 && (
                <>
                  <button
                    className="tnd-gallery-arrow tnd-gallery-arrow-prev"
                    onClick={() => setGalleryIdx(i => (i - 1 + allImages.length) % allImages.length)}
                    aria-label="Imagen anterior"
                  >‹</button>
                  <button
                    className="tnd-gallery-arrow tnd-gallery-arrow-next"
                    onClick={() => setGalleryIdx(i => (i + 1) % allImages.length)}
                    aria-label="Imagen siguiente"
                  >›</button>
                </>
              )}
            </div>

            {/* Thumbnail strip */}
            {allImages.length > 1 && (
              <div className="tnd-gallery-thumbs">
                {allImages.map((url, idx) => (
                  <button
                    key={url + String(idx)}
                    className={`tnd-gallery-thumb${galleryIdx === idx ? ' tnd-gallery-thumb-active' : ''}`}
                    onClick={() => setGalleryIdx(idx)}
                    aria-label={`Ver imagen ${idx + 1}`}
                  >
                    <img src={url} alt={`Vista ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="tnd-chip tnd-chip-cat">🏷️ {p.category}</span>
            <span className={`tnd-chip ${p.stock === 0 ? 'tnd-chip-out' : p.stock <= 3 ? 'tnd-chip-low' : 'tnd-chip-stock'}`}>
              {p.stock === 0 ? 'Sin stock' : p.stock <= 3 ? `⚠️ Últimas ${p.stock} unidades` : `✓ ${p.stock} en stock`}
            </span>
          </div>
        </div>

        {/* ── Right: info + actions ─────────────────────── */}
        <div>
          <div className="tnd-detail-vendor-link">
            <Link href={`/tienda/${p.vendor_id}`}>{p.vendor_email.split('@')[0]}</Link>
          </div>
          <div className="tnd-detail-price">{gs(p.price)}</div>
          <p className="tnd-detail-desc">{p.description}</p>

          <div className="tnd-divider" />

          {/* ══ DONE state ══════════════════════════════════ */}
          {done ? (
            <div className="tnd-offer-success">
              {done.type === 'buy' ? (
                <>
                  <div className="tnd-offer-success-icon">🛒</div>
                  <div className="tnd-offer-success-title">¡Compra confirmada!</div>
                  <p className="tnd-offer-success-sub">
                    Tu pedido de <strong>{quantity} × {p.name}</strong> fue procesado.<br />
                    Recibirás confirmación de <strong>{p.vendor_email.split('@')[0]}</strong> pronto.
                  </p>
                </>
              ) : (
                <>
                  <div className="tnd-offer-success-icon">🤖</div>
                  <div className="tnd-offer-success-title">¡Oferta enviada al TukiBot!</div>
                  {done.botResponse === 'accepted' ? (
                    <>
                      <div className="tnd-offer-success-icon" style={{ fontSize: '2rem', marginTop: 4 }}>✅</div>
                      <div className="tnd-offer-success-title" style={{ color: '#4ade80' }}>¡Oferta aceptada!</div>
                      {done.botMessage && (
                        <p className="tnd-offer-success-sub" style={{ marginTop: 8 }}>
                          {done.botMessage}
                        </p>
                      )}
                      {quantity > 1 ? (
                        <div style={{ margin: '8px 0' }}>
                          <div style={{ fontSize: '0.9rem', color: 'var(--tnd-text-muted)' }}>
                            {quantity} und. × {gs(done.amount!)} c/u
                          </div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#4ade80' }}>
                            Total: {gs(done.amount! * quantity)}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#4ade80', margin: '8px 0' }}>
                          {gs(done.amount!)}
                        </div>
                      )}
                      <button className="tnd-btn-buy" style={{ marginTop: 12 }}>💳 Proceder al pago</button>
                    </>
                  ) : done.botResponse === 'countered' ? (
                    <>
                      {done.botMessage && (
                        <p className="tnd-offer-success-sub" style={{ marginTop: 8 }}>
                          {done.botMessage}
                        </p>
                      )}
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#F5C518', margin: '12px 0 4px' }}>
                        {gs(done.counterAmount!)}
                      </div>
                      {done.timeoutMessage && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted)', marginTop: 4 }}>
                          {done.timeoutMessage.replace('{hora}', formatTimeoutAt(done.timeoutAt) ?? '')}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                        <button
                          className="tnd-btn-buy"
                          onClick={() => setDone(prev => prev ? {
                            ...prev,
                            botResponse: 'accepted',
                            amount: prev.counterAmount,
                            botMessage: quantity > 1
                              ? `¡Trato cerrado! ${quantity} und. × ${gs(prev.counterAmount!)} c/u = ${gs(prev.counterAmount! * quantity)} en total. ¡Procedé al pago para asegurar tu pedido!`
                              : `¡Trato cerrado! ${gs(prev.counterAmount!)} confirmado. ¡Procedé al pago para asegurar tu pedido!`,
                          } : null)}
                        >
                          ✅ Aceptar {gs(done.counterAmount!)}
                        </button>
                        <button
                          className="tnd-offer-submit"
                          style={{ background: 'transparent', border: '1px solid var(--tnd-border)', color: 'var(--tnd-text-secondary)' }}
                          onClick={reset}
                        >
                          Volver y reofertar
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="tnd-offer-success-sub">
                      Tu oferta de <strong>{gs(done.amount!)}</strong> está siendo evaluada por el TukiBot de <strong>{p.vendor_email.split('@')[0]}</strong>.
                    </p>
                  )}
                </>
              )}
              <button className="tnd-offer-submit" style={{ marginTop: 10 }} onClick={reset}>
                Volver al producto
              </button>
            </div>

          ) : p.stock === 0 ? (
            <div className="tnd-chip tnd-chip-out" style={{ fontSize: '0.95rem', padding: '12px 18px', display: 'inline-block' }}>
              ❌ Sin stock — producto no disponible
            </div>

          ) : (
            <>
              {/* ── Quantity selector ── */}
              <div className="tnd-qty-row">
                <span style={{ color: 'var(--tnd-text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>Cantidad</span>
                <div className="tnd-qty-ctrl">
                  <button onClick={() => setQuantity(clampQty(quantity - 1))} disabled={quantity <= 1} className="tnd-qty-btn">−</button>
                  <span className="tnd-qty-val">{quantity}</span>
                  <button onClick={() => setQuantity(clampQty(quantity + 1))} disabled={quantity >= p.stock} className="tnd-qty-btn">+</button>
                </div>
              </div>

              {/* ── Primary CTAs ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                <button
                  className="tnd-btn-buy"
                  onClick={handleBuy}
                >
                  🛒 Comprar ahora
                </button>

                {isNegotiable && (
                  <button
                    className="tnd-btn-negotiate"
                    onClick={() => setMode(m => m === 'negotiate' ? 'idle' : 'negotiate')}
                    disabled={submitting}
                  >
                    <span>🤖 Regatear al TukiBot</span>
                    <span style={{ opacity: 0.55, fontSize: '0.75rem', marginLeft: 'auto' }}>
                      {mode === 'negotiate' ? '▲ cerrar' : '▼ abrir'}
                    </span>
                  </button>
                )}
              </div>

              {/* ── Negotiate panel (collapsible) ── */}
              {mode === 'negotiate' && (
                <div className="tnd-negotiate-panel">
                  <div className="tnd-robot-notice">
                    <div className="tnd-robot-notice-icon">🤖</div>
                    <div>
                      <strong>Robot Negociador activo</strong><br />
                      <span className="tnd-robot-notice-text">
                        Ponele tu mejor precio — si es justo lo acepta, si es bajo te contraoferta. Nunca rechaza.
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleOffer} className="tnd-offer-form" style={{ marginTop: 0 }}>
                    <div className="tnd-offer-field">
                      <label htmlFor="offerAmt" className="tnd-offer-label">
                        Tu oferta <span style={{ color: 'var(--tnd-text-muted)', fontWeight: 400 }}>— precio por unidad</span>
                      </label>
                      <input
                        id="offerAmt"
                        type="number"
                        className="tnd-offer-input"
                        placeholder={`Hasta ${gs(p.price)}`}
                        value={offerAmount}
                        min={1}
                        max={p.price}
                        onChange={e => setOfferAmount(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>

                    {/* Deal meter */}
                    {dealStrength && (
                      <div className="tnd-deal-meter">
                        <div className="tnd-deal-meter-track">
                          <div
                            className="tnd-deal-meter-fill"
                            style={{ width: `${Math.min(100, dealStrength.pct)}%`, background: dealStrength.color }}
                          />
                        </div>
                        <div className="tnd-deal-meter-labels">
                          <span className="tnd-deal-meter-status" style={{ color: dealStrength.color }}>
                            {dealStrength.label}
                          </span>
                          <span className="tnd-deal-meter-sub">{dealStrength.sub}</span>
                        </div>
                      </div>
                    )}

                    {offerNum > 0 && (
                      <div className="tnd-offer-summary">
                        Total estimado: <strong>{gs(offerNum * quantity)}</strong>
                        &nbsp;({quantity} × {gs(offerNum)})
                      </div>
                    )}

                    <button
                      type="submit"
                      className="tnd-offer-submit"
                      disabled={submitting || offerNum <= 0}
                    >
                      {analyzing ? '💬 Analizando tu oferta...' : submitting ? '⏳ Enviando...' : '🤖 Enviar oferta al TukiBot'}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
