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
  if (action === 'auto_accept') return 'Aceptación automática';
  if (action === 'pressure_client') return 'Aviso al cliente';
  return 'Contraoferta automática';
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

function formatOfferGs(value: number) {
  return new Intl.NumberFormat('es-PY').format(value);
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

const DEFAULT_NEG_PHRASES = [
  'Dame 3 segundos…',
  'Le estoy convenciendo 😏',
  'Dame 3 segundos más, ya casi…',
  'El vendedor respiró hondo…',
  'Creo que acepta...',
  '🤖 Dame unos segundos… está dudando...',
  '📉 El precio acaba de tambalearse...',
];

const DEFAULT_NEG_CLIMAX = {
  accepted: '😮 ALTO… creo que va a aceptar',
  countered: '👀 El vendedor no cedió más, pero bajó bastante',
};

const ANIM_CLIMAX    = 100; // sentinel step → show climax phrase
const ANIM_MIN_STEPS = 20;  // 20 × 2 s = 40 s mínimo de animación

type PendingResult = {
  status: 'accepted';
  buyerOffer: number;
  acceptedAmount?: number;
  message?: string | null;
} | {
  status: 'countered';
  buyerOffer: number;
  counterAmount?: number;
  message?: string | null;
  timeoutAt?: string;
  timeoutAction?: TimeoutAction;
  timeoutMessage?: string;
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
  const [submitting,    setSubmitting]    = useState(false);
  const [animStep,      setAnimStep]      = useState(-1);
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null);
  const [negPhrases,    setNegPhrases]    = useState<string[]>(DEFAULT_NEG_PHRASES);
  const [negClimax,     setNegClimax]     = useState(DEFAULT_NEG_CLIMAX);
  const [shuffledPhrases, setShuffledPhrases] = useState<string[]>(DEFAULT_NEG_PHRASES);
  const [done,          setDone]          = useState<{ type: Mode; amount?: number; botResponse?: 'accepted' | 'countered'; counterAmount?: number; botMessage?: string; timeoutAt?: string; timeoutAction?: TimeoutAction; timeoutMessage?: string } | null>(null);

  useEffect(() => {
    fetch('/api/tienda/neg-phrases')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.phrases) && data.phrases.length > 0) {
          setNegPhrases(data.phrases);
          setShuffledPhrases(data.phrases);
        }
        if (data.climax) setNegClimax(data.climax);
      })
      .catch(() => {}); // keep defaults on error
  }, []);

  useEffect(() => {
    supabase
      .from('products')
      .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image, gallery, description, negotiable')
      .eq('id', id)
      .eq('status', 'published')
      .single()
      .then(({ data }) => { setP(data ?? null); setGalleryIdx(0); });
  }, [id]);

  useEffect(() => {
    if (animStep < 0) return;

    // Climax: mostrar frase final 2 s y luego revelar resultado
    if (animStep === ANIM_CLIMAX) {
      if (!pendingResult) return;
      const t = setTimeout(() => {
        if (pendingResult.status === 'accepted') {
          setDone({
            type: 'negotiate',
            amount: pendingResult.acceptedAmount ?? pendingResult.buyerOffer,
            botResponse: 'accepted',
            botMessage: pendingResult.message ?? undefined,
          });
        } else {
          setDone({
            type: 'negotiate',
            amount: pendingResult.buyerOffer,
            botResponse: 'countered',
            counterAmount: pendingResult.counterAmount,
            botMessage: pendingResult.message ?? undefined,
            timeoutAt: pendingResult.timeoutAt,
            timeoutAction: pendingResult.timeoutAction,
            timeoutMessage: pendingResult.timeoutMessage,
          });
        }
        setAnimStep(-1);
        setPendingResult(null);
        setSubmitting(false);
      }, 2000);
      return () => clearTimeout(t);
    }

    // Loop principal: avanza cada 2 s; pasa al clímax solo cuando
    // se cumplieron ≥40 s (ANIM_MIN_STEPS pasos) Y ya llegó el resultado
    const t = setTimeout(() => {
      const next = animStep + 1;
      if (next >= ANIM_MIN_STEPS && pendingResult) {
        setAnimStep(ANIM_CLIMAX);
      } else {
        setAnimStep(next);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [animStep, pendingResult]);

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
  const offerNum     = Number(offerAmount.replace(/\D/g, '')) || 0;
  const dealStrength = mode === 'negotiate' ? getDealStrength(offerNum, p.price, p.floor_price) : null;
  const clampQty     = (v: number) => Math.max(1, Math.min(p.stock, v));
  const vendorAlias = p.vendor_email.split('@')[0];
  const resultUnitAmount = done?.botResponse === 'countered'
    ? (done.counterAmount ?? done.amount ?? p.price)
    : (done?.amount ?? p.price);
  const resultTotalAmount = resultUnitAmount * quantity;
  const resultSavings = Math.max(0, (p.price - resultUnitAmount) * quantity);

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

  function handleProceedToPayment() {
    if (!p || !done || done.type !== 'negotiate') return;
    const negotiatedUnitPrice = done.amount && done.amount > 0 ? done.amount : p.price;
    const url = new URLSearchParams({
      product: p.id,
      qty: String(quantity),
      name: p.name,
      vendor: p.vendor_email,
      vid: p.vendor_id,
      price: String(negotiatedUnitPrice),
    });
    router.push(`/tienda/checkout?${url.toString()}`);
  }

  async function handleOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!p || !offerNum || offerNum <= 0) return;
    const capturedOffer = offerNum;
    setPendingResult(null);
    // Fisher-Yates shuffle for random phrase order each negotiation
    const arr = [...negPhrases];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledPhrases(arr);
    setAnimStep(0);
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      const res = await fetch('/api/tukibot/negotiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          vendorId: p.vendor_id,
          productId: p.id,
          buyerOffer: capturedOffer,
          quantity,
          listedPrice: p.price,
          floorPrice: p.floor_price,
          productName: p.name,
          vendorName: p.vendor_email,
        }),
      });
      if (!res.ok) throw new Error('Negociación fallida');
      const data = await res.json();
      if (data.status === 'accepted') {
        setPendingResult({ status: 'accepted', buyerOffer: capturedOffer, acceptedAmount: data.acceptedAmount ?? capturedOffer, message: data.message ?? null });
      } else {
        setPendingResult({ status: 'countered', buyerOffer: capturedOffer, counterAmount: data.counterAmount, message: data.message ?? null, timeoutAt: data.timeoutAt, timeoutAction: data.timeoutAction, timeoutMessage: data.timeoutMessage });
      }
    } catch {
      // Fallback: keep animation running, resolve with local logic
      if (capturedOffer >= p.floor_price) {
        setPendingResult({ status: 'accepted', buyerOffer: capturedOffer, acceptedAmount: capturedOffer, message: `Perfecto, te confirmo ${gs(capturedOffer)} por unidad.` });
      } else {
        const counter = Math.round((p.floor_price + capturedOffer) / 2 / 1000) * 1000;
        const counterAmount = Math.max(p.floor_price, counter);
        setPendingResult({ status: 'countered', buyerOffer: capturedOffer, counterAmount, message: `Te puedo mejorar la oferta: ${gs(counterAmount)} por unidad.` });
      }
    }
    // setSubmitting(false) is handled by the animation useEffect at step 7
  }

  function reset() {
    setDone(null); setMode('idle');
    setOfferAmount(''); setQuantity(1); setAnimStep(-1); setPendingResult(null);
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
                    Recibirás confirmación de <strong>{vendorAlias}</strong> pronto.
                  </p>
                </>
              ) : (
                <>
                  {done.botResponse === 'accepted' ? (
                    <div className="tnd-offer-success-card tnd-offer-success-card-accepted">
                      <div className="tnd-offer-success-topline">
                        <span className="tnd-offer-success-badge">CAPTURA ESTE MOMENTO</span>
                        <span className="tnd-offer-success-stamp">TukiBot cerró el trato</span>
                      </div>
                      <div className="tnd-offer-success-hero">✅</div>
                      <div className="tnd-offer-success-title">TukiBot salvó tu bolsillo</div>
                      <p className="tnd-offer-success-tagline">
                        {vendorAlias} aceptó tu oferta para <strong>{p.name}</strong>. Si querías una historia para subir, acá está.
                      </p>

                      <div className="tnd-offer-success-pricegrid">
                        <div className="tnd-offer-success-pricebox tnd-offer-success-pricebox-muted">
                          <span className="tnd-offer-success-pricebox-label">Precio publicado</span>
                          <strong>{gs(p.price * quantity)}</strong>
                          <small>{quantity} × {gs(p.price)}</small>
                        </div>
                        <div className="tnd-offer-success-pricebox tnd-offer-success-pricebox-highlight">
                          <span className="tnd-offer-success-pricebox-label">Precio logrado</span>
                          <strong>{gs(resultTotalAmount)}</strong>
                          <small>{quantity} × {gs(resultUnitAmount)}</small>
                        </div>
                      </div>

                      {resultSavings > 0 && (
                        <div className="tnd-offer-success-saving">Ahorro conseguido: {gs(resultSavings)}</div>
                      )}

                      {done.botMessage && (
                        <p className="tnd-offer-success-sub" style={{ marginTop: 8 }}>
                          {done.botMessage}
                        </p>
                      )}
                      <div className="tnd-offer-success-footnote">
                        Negociado en vivo por TukiBot para {vendorAlias}.
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--tnd-text-muted)', margin: '6px 0 0' }}>
                        Revisá el pedido y confirmá para reservarlo.
                      </p>
                      <button className="tnd-btn-buy" style={{ marginTop: 12 }} onClick={handleProceedToPayment}>
                        💳 Proceder al pago
                      </button>
                    </div>
                  ) : done.botResponse === 'countered' ? (
                    <div className="tnd-offer-success-card tnd-offer-success-card-countered">
                      <div className="tnd-offer-success-topline">
                        <span className="tnd-offer-success-badge">SIGUE VIVO</span>
                        <span className="tnd-offer-success-stamp">Casi cayó, pero volvió con oferta</span>
                      </div>
                      <div className="tnd-offer-success-hero">😮</div>
                      <div className="tnd-offer-success-title">No soltó del todo, pero te traje esto</div>
                      <p className="tnd-offer-success-tagline">
                        TukiBot preparó una nueva contraoferta para <strong>{p.name}</strong>.
                      </p>

                      <div className="tnd-offer-success-pricegrid">
                        <div className="tnd-offer-success-pricebox tnd-offer-success-pricebox-muted">
                          <span className="tnd-offer-success-pricebox-label">Tu oferta</span>
                          <strong>{gs((done.amount ?? offerNum) * quantity)}</strong>
                          <small>{quantity} × {gs(done.amount ?? offerNum)}</small>
                        </div>
                        <div className="tnd-offer-success-pricebox tnd-offer-success-pricebox-highlight tnd-offer-success-pricebox-counter">
                          <span className="tnd-offer-success-pricebox-label">Contraoferta final</span>
                          <strong>{gs(resultTotalAmount)}</strong>
                          <small>{quantity} × {gs(resultUnitAmount)}</small>
                        </div>
                      </div>

                      {done.botMessage && (
                        <p className="tnd-offer-success-sub" style={{ marginTop: 8 }}>
                          {done.botMessage}
                        </p>
                      )}
                      {done.timeoutMessage && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted)', marginTop: 4 }}>
                          {done.timeoutMessage.replace('{hora}', formatTimeoutAt(done.timeoutAt) ?? '')}
                        </p>
                      )}
                      <div className="tnd-offer-success-footnote">
                        UFFF, casi rechaza. TukiBot la sostuvo y dejó una chance real de cierre.
                      </div>
                      <div className="tnd-offer-success-actions">
                        <button
                          className="tnd-btn-buy"
                          onClick={() => setDone(prev => prev ? {
                            ...prev,
                            botResponse: 'accepted',
                            amount: prev.counterAmount,
                            botMessage: quantity > 1
                              ? `Tu oferta fue aceptada. ${quantity} und. × ${gs(prev.counterAmount!)} c/u = ${gs(prev.counterAmount! * quantity)} en total.`
                              : `Tu oferta fue aceptada. ${gs(prev.counterAmount!)} confirmado.`,
                          } : null)}
                        >
                          ✅ Aceptar {gs(done.counterAmount!)}
                        </button>
                        <button
                          className="tnd-offer-secondary"
                          onClick={reset}
                        >
                          Volver y reofertar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="tnd-offer-success-sub">
                      Tu oferta de <strong>{gs(done.amount!)}</strong> está siendo evaluada por el TukiBot de <strong>{vendorAlias}</strong>.
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
                    <span>🤝 Hacé tu oferta</span>
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

                  {animStep >= 0 ? (
                    <div className="tnd-neg-anim">
                      <div className="tnd-neg-anim-bot" aria-hidden="true">🤖</div>
                      <div key={animStep} className="tnd-neg-anim-phrase" aria-live="polite">
                        {animStep === ANIM_CLIMAX && pendingResult
                          ? negClimax[pendingResult.status]
                          : (shuffledPhrases[animStep % shuffledPhrases.length] ?? negPhrases[0])}
                      </div>
                      <div className="tnd-neg-anim-dots" aria-hidden="true">
                        <span /><span /><span />
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleOffer} className="tnd-offer-form" style={{ marginTop: 0 }}>
                      <div className="tnd-offer-field">
                        <label htmlFor="offerAmt" className="tnd-offer-label">
                          Tu oferta por unidad
                        </label>
                        <input
                          id="offerAmt"
                          type="text"
                          inputMode="numeric"
                          className="tnd-offer-input"
                          placeholder={`Hasta ${gs(p.price)}`}
                          value={offerAmount}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) {
                              setOfferAmount('');
                              return;
                            }
                            const clamped = Math.min(Number(digits), p.price);
                            setOfferAmount(formatOfferGs(clamped));
                          }}
                          required
                          autoFocus
                        />
                        <p style={{ margin: '6px 0 0', fontSize: '0.74rem', color: 'var(--tnd-text-muted)' }}>
                          Escribí solo números. Ejemplo: 25000
                        </p>
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
                        {submitting ? '⏳ Enviando...' : '🤝 Enviar oferta'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
