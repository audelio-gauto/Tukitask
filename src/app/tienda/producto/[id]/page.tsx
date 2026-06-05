'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { useCart } from '../../cart-context';
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

type PendingResult = {
  status: 'accepted';
  buyerOffer: number;
  acceptedAmount?: number;
  negotiationId?: string;
  message?: string | null;
} | {
  status: 'countered';
  buyerOffer: number;
  counterAmount?: number;
  negotiationId?: string;
  message?: string | null;
  timeoutAt?: string;
  timeoutAction?: TimeoutAction;
  timeoutMessage?: string;
};

type DoneState = {
  type: Mode;
  amount?: number;
  botResponse?: 'accepted' | 'countered';
  counterAmount?: number;
  botMessage?: string;
  negotiationId?: string;
  timeoutAt?: string;
  timeoutAction?: TimeoutAction;
  timeoutMessage?: string;
};

/* ══════════════════════════════════════════════════════════════ */
export default function ProductDetailPage() {
  const params = useParams();
  const router  = useRouter();
  const id      = params.id as string;
  const { addItem } = useCart();

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
  const [animMinSteps,  setAnimMinSteps]  = useState(13); // ≈40s ÷ 3s/paso
  const [cartAdded,     setCartAdded]     = useState(false);
  const [acceptingCounter, setAcceptingCounter] = useState(false);
  const [done,          setDone]          = useState<DoneState | null>(null);
  const [openSection,   setOpenSection]   = useState<string>('descripcion');

  useEffect(() => {
    fetch('/api/tienda/neg-phrases')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.phrases) && data.phrases.length > 0) {
          setNegPhrases(data.phrases);
        }
        if (data.climax) setNegClimax(data.climax);
        if (typeof data.minSeconds === 'number' && data.minSeconds >= 10) {
          setAnimMinSteps(Math.max(1, Math.round(data.minSeconds / 3)));
        }
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
            negotiationId: pendingResult.negotiationId,
            botMessage: pendingResult.message ?? undefined,
          });
        } else {
          setDone({
            type: 'negotiate',
            amount: pendingResult.buyerOffer,
            botResponse: 'countered',
            counterAmount: pendingResult.counterAmount,
            negotiationId: pendingResult.negotiationId,
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

    // Loop principal: avanza cada 3 s; pasa al clímax cuando
    // se mostraron todas las frases (mínimo) Y ya llegó el resultado
    const effectiveMin = Math.max(animMinSteps, negPhrases.length);
    const t = setTimeout(() => {
      const next = animStep + 1;
      if (next >= effectiveMin && pendingResult) {
        setAnimStep(ANIM_CLIMAX);
      } else {
        setAnimStep(next);
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [animStep, pendingResult, animMinSteps, negPhrases.length]);

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

  function handleAddToCart() {
    if (!p || p.stock <= 0) return;

    for (let i = 0; i < quantity; i += 1) {
      addItem({
        id: p.id,
        name: p.name,
        price: p.price,
        emoji: '📦',
        image: p.image,
        vendorName: vendorAlias,
        vendorId: p.vendor_id,
        vendorEmail: p.vendor_email,
      });
    }

    setCartAdded(true);
    setTimeout(() => setCartAdded(false), 1600);
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
    if (done.negotiationId) {
      url.set('negotiationId', done.negotiationId);
    }
    router.push(`/tienda/checkout?${url.toString()}`);
  }

  async function handleAcceptCounter() {
    if (!done?.negotiationId || !done.counterAmount) return;
    setAcceptingCounter(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${done.negotiationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept_counter' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo aceptar la contraoferta');

      setDone(prev => prev ? {
        ...prev,
        botResponse: 'accepted',
        amount: prev.counterAmount,
        botMessage: quantity > 1
          ? `Tu oferta fue aceptada. ${quantity} und. × ${gs(prev.counterAmount!)} c/u = ${gs(prev.counterAmount! * quantity)} en total.`
          : `Tu oferta fue aceptada. ${gs(prev.counterAmount!)} confirmado.`,
        timeoutAt: data.expiresAt ?? prev.timeoutAt,
      } : null);
    } catch {
      // keep current card unchanged on failure
    } finally {
      setAcceptingCounter(false);
    }
  }

  async function handleOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!p || !offerNum || offerNum <= 0) return;
    const capturedOffer = offerNum;
    setPendingResult(null);
    setAnimStep(0);
    setSubmitting(true);

    // Best-effort: refresh animation phrases with AI, without blocking negotiation.
    void fetch('/api/tienda/neg-phrases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: p.name,
        listedPrice: p.price,
        floorPrice: p.floor_price,
        buyerOffer: capturedOffer,
        quantity,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.phrases) && data.phrases.length > 0) {
          setNegPhrases(data.phrases);
        }
      })
      .catch(() => {
        // keep current phrases on any error
      });

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
          productImage: p.image,
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
        setPendingResult({ status: 'accepted', buyerOffer: capturedOffer, acceptedAmount: data.acceptedAmount ?? capturedOffer, negotiationId: data.negotiationId, message: data.message ?? null });
      } else {
        setPendingResult({ status: 'countered', buyerOffer: capturedOffer, counterAmount: data.counterAmount, negotiationId: data.negotiationId, message: data.message ?? null, timeoutAt: data.timeoutAt, timeoutAction: data.timeoutAction, timeoutMessage: data.timeoutMessage });
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

  const toggleSection = (key: string) =>
    setOpenSection(key);

  return (
    <div className="tnd-page">
      {/* Breadcrumb */}
      <nav className="tnd-pdp-breadcrumb">
        <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
        <span className="tnd-pdp-bc-sep">›</span>
        <Link href={`/tienda/${p.vendor_id}`} className="tnd-back-link">{vendorAlias}</Link>
        <span className="tnd-pdp-bc-sep">›</span>
        <span className="tnd-pdp-bc-cur">{p.category}</span>
      </nav>

      <section className="tnd-pdp-shell">
        <header className="tnd-pdp-topbar">
          <h1 className="tnd-pdp-title-main">{p.name}</h1>
          <div className="tnd-pdp-top-meta">
            {isNegotiable && <span className="tnd-pdp-meta-pill">Negociable</span>}
            <span className="tnd-pdp-meta-pill tnd-pdp-meta-pill-soft">Publicación activa</span>
          </div>
        </header>

        <div className="tnd-pdp-grid">
        {/* ── Col 1: Gallery ─────────────────────────────── */}
        <div className="tnd-pdp-gallery-col">
          <div className="tnd-gallery">
            <div className="tnd-gallery-main">
              {allImages.length > 0
                ? <img src={allImages[galleryIdx] ?? allImages[0]} alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 12 }} />
                : <span role="img" aria-label={p.name} style={{ fontSize: '5rem' }}>📦</span>
              }
              {isNegotiable && (
                <span className="tnd-negoable-badge tnd-negoable-badge-lg">🤖 Negociable</span>
              )}
              {allImages.length > 1 && (
                <>
                  <button className="tnd-gallery-arrow tnd-gallery-arrow-prev"
                    onClick={() => setGalleryIdx(i => (i - 1 + allImages.length) % allImages.length)}
                    aria-label="Imagen anterior">‹</button>
                  <button className="tnd-gallery-arrow tnd-gallery-arrow-next"
                    onClick={() => setGalleryIdx(i => (i + 1) % allImages.length)}
                    aria-label="Imagen siguiente">›</button>
                </>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="tnd-gallery-thumbs">
                {allImages.map((url, idx) => (
                  <button key={url + String(idx)}
                    className={`tnd-gallery-thumb${galleryIdx === idx ? ' tnd-gallery-thumb-active' : ''}`}
                    onClick={() => setGalleryIdx(idx)} aria-label={`Ver imagen ${idx + 1}`}>
                    <img src={url} alt={`Vista ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tnd-pdp-gallery-tags">
            <span className="tnd-chip tnd-chip-cat">{p.category}</span>
            <span className={`tnd-chip ${p.stock === 0 ? 'tnd-chip-out' : p.stock <= 3 ? 'tnd-chip-low' : 'tnd-chip-stock'}`}>
              {p.stock === 0 ? 'Sin stock' : p.stock <= 3 ? `Ultimas ${p.stock} unidades` : `${p.stock} disponibles`}
            </span>
          </div>
        </div>

        {/* ── Col 2: Info + Actions ──────────────────────── */}
        <div className="tnd-pdp-info-col">
          {/* Vendor + Category */}
          <div className="tnd-pdp-meta-row">
            <Link href={`/tienda/${p.vendor_id}`} className="tnd-pdp-vendor-badge">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              {vendorAlias}
            </Link>
            <span className="tnd-pdp-cat-tag">{p.category}</span>
          </div>

          {/* Price block */}
          <div className="tnd-pdp-price-block">
            <span className="tnd-pdp-price">{gs(p.price)}</span>
            {isNegotiable && (
              <span className="tnd-pdp-neg-pill">🤖 Precio negociable</span>
            )}
          </div>

          {/* Stock & condition row */}
          <div className="tnd-pdp-stock-row">
            <span className={`tnd-pdp-stock-badge ${p.stock === 0 ? 'out' : p.stock <= 3 ? 'low' : 'ok'}`}>
              {p.stock === 0
                ? '❌ Sin stock'
                : p.stock <= 3
                  ? `⚠ Últimas ${p.stock} unidades`
                  : `✓ ${p.stock} disponibles`}
            </span>
            <span className="tnd-pdp-condition">Nuevo</span>
          </div>

          <div className="tnd-pdp-divider" />

          {/* Seller card */}
          <div className="tnd-pdp-seller-caption">Vendido por</div>
          <div className="tnd-pdp-seller-card">
            <div className="tnd-pdp-seller-avatar">{vendorAlias.charAt(0).toUpperCase()}</div>
            <div className="tnd-pdp-seller-info">
              <span className="tnd-pdp-seller-label">Vendido por</span>
              <Link href={`/tienda/${p.vendor_id}`} className="tnd-pdp-seller-name">{vendorAlias}</Link>
            </div>
            <svg className="tnd-pdp-seller-chevron" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          <div className="tnd-pdp-divider" />

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
                      {done.botMessage && (
                        <p className="tnd-offer-success-tagline">{done.botMessage}</p>
                      )}
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
                      <div className="tnd-offer-success-footnote">Negociado en vivo por TukiBot para {vendorAlias}.</div>
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
                      {(done.botMessage || p.name) && (
                        <p className="tnd-offer-success-tagline">
                          {done.botMessage ?? <>TukiBot preparó una contraoferta para <strong>{p.name}</strong>.</>}
                        </p>
                      )}
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
                          {resultSavings > 0 && (
                            <span className="tnd-offer-success-savings-badge">Total que podrias ahorrar: {gs(resultSavings)}</span>
                          )}
                        </div>
                      </div>
                      {done.timeoutMessage && (
                        <p style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted)', marginTop: 4 }}>
                          {done.timeoutMessage.replace('{hora}', formatTimeoutAt(done.timeoutAt) ?? '')}
                        </p>
                      )}
                      <div className="tnd-offer-success-footnote">
                        UFFF, casi rechaza. TukiBot la sostuvo y dejó una chance real de cierre.
                      </div>
                      <div className="tnd-offer-success-actions">
                        <button className="tnd-btn-buy" onClick={handleAcceptCounter} disabled={acceptingCounter}>
                          {acceptingCounter ? '⏳ Confirmando...' : `✅ Aceptar ${gs(done.counterAmount!)}`}
                        </button>
                        <button className="tnd-offer-secondary" onClick={reset}>Volver y reofertar</button>
                      </div>
                    </div>
                  ) : (
                    <p className="tnd-offer-success-sub">
                      Tu oferta de <strong>{gs(done.amount!)}</strong> está siendo evaluada por el TukiBot de <strong>{vendorAlias}</strong>.
                    </p>
                  )}
                </>
              )}
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
              <div className="tnd-detail-cta-card">
                <div className="tnd-detail-cta-head">
                  <span className="tnd-detail-total-label">Total por {quantity} unidad{quantity > 1 ? 'es' : ''}</span>
                  <strong className="tnd-detail-total-chip">{gs(p.price * quantity)}</strong>
                </div>

                <div className="tnd-detail-cta-grid">
                  <button className="tnd-btn-buy" onClick={handleBuy} disabled={submitting}>
                    <svg className="tnd-cta-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
                    </svg>
                    Comprar Ahora
                  </button>

                  <button className={`tnd-btn-add-cart-detail${cartAdded ? ' added' : ''}`} onClick={handleAddToCart} disabled={submitting}>
                    {cartAdded ? (
                      <><svg className="tnd-cta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>Añadido al carrito</>
                    ) : (
                      <><svg className="tnd-cta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>Añadir al Carrito</>
                    )}
                  </button>
                </div>

                {isNegotiable && (
                  <button className="tnd-btn-negotiate" onClick={() => setMode(m => m === 'negotiate' ? 'idle' : 'negotiate')} disabled={submitting}>
                    <svg className="tnd-cta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 13a5 5 0 0 1 7.54.54l2.46 2.46a2 2 0 0 1-2.83 2.83l-2.46-2.46a5 5 0 0 1-.54-7.54" />
                      <path d="M13 11a5 5 0 0 1-7.54-.54L3 8a2 2 0 0 1 2.83-2.83l2.46 2.46a5 5 0 0 1 .54 7.54" />
                    </svg>
                    Ofrecer tu Oferta
                  </button>
                )}

                {cartAdded && (
                  <p className="tnd-detail-cart-feedback">Listo, agregaste {quantity} unidad{quantity > 1 ? 'es' : ''} al carrito.</p>
                )}
              </div>

              {/* ── Negotiate panel ── */}
              {mode === 'negotiate' && (
                <div className="tnd-negotiate-panel">
                  <div className="tnd-robot-notice">
                    <div className="tnd-robot-notice-icon">🤖</div>
                    <div>
                      <strong>TukiBot Negociador IA</strong><br />
                      <span className="tnd-robot-notice-text">
                        Antes de aceptar el precio completo… probemos conseguirte un ahorro en tu bolsillo
                      </span>
                    </div>
                  </div>

                  {animStep >= 0 ? (
                    <div className="tnd-neg-anim">
                      <div className="tnd-neg-anim-bot" aria-hidden="true">🤖</div>
                      <div key={animStep} className="tnd-neg-anim-phrase" aria-live="polite">
                        {animStep === ANIM_CLIMAX && pendingResult
                          ? negClimax[pendingResult.status]
                          : (negPhrases[animStep % negPhrases.length] ?? negPhrases[0])}
                      </div>
                      <div className="tnd-neg-anim-dots" aria-hidden="true">
                        <span /><span /><span />
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleOffer} className="tnd-offer-form" style={{ marginTop: 0 }}>
                      <div className="tnd-offer-field">
                        <label htmlFor="offerAmt" className="tnd-offer-label">Tu oferta por unidad</label>
                        <input
                          id="offerAmt"
                          type="text"
                          inputMode="numeric"
                          className="tnd-offer-input"
                          placeholder={`Hasta ${gs(p.price)}`}
                          value={offerAmount}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) { setOfferAmount(''); return; }
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

                      {dealStrength && (
                        <div className="tnd-deal-meter">
                          <div className="tnd-deal-meter-track">
                            <div className="tnd-deal-meter-fill" style={{ width: `${Math.min(100, dealStrength.pct)}%`, background: dealStrength.color }} />
                          </div>
                          <div className="tnd-deal-meter-labels">
                            <span className="tnd-deal-meter-status" style={{ color: dealStrength.color }}>{dealStrength.label}</span>
                            <span className="tnd-deal-meter-sub">{dealStrength.sub}</span>
                          </div>
                        </div>
                      )}

                      {offerNum > 0 && (
                        <div className="tnd-offer-summary">
                          Total estimado: <strong>{gs(offerNum * quantity)}</strong>&nbsp;({quantity} × {gs(offerNum)})
                        </div>
                      )}

                      <button type="submit" className="tnd-offer-submit" disabled={submitting || offerNum <= 0}>
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

        <div className="tnd-pdp-tabs-wrap">
          <div className="tnd-pdp-tabs" role="tablist" aria-label="Secciones del producto">
            {p.description && (
              <button
                role="tab"
                aria-selected={openSection === 'descripcion'}
                className={`tnd-pdp-tab${openSection === 'descripcion' ? ' active' : ''}`}
                onClick={() => toggleSection('descripcion')}
              >
                Descripcion
              </button>
            )}
            <button
              role="tab"
              aria-selected={openSection === 'detalles'}
              className={`tnd-pdp-tab${openSection === 'detalles' ? ' active' : ''}`}
              onClick={() => toggleSection('detalles')}
            >
              Detalles
            </button>
            <button
              role="tab"
              aria-selected={openSection === 'garantia'}
              className={`tnd-pdp-tab${openSection === 'garantia' ? ' active' : ''}`}
              onClick={() => toggleSection('garantia')}
            >
              Garantias y devoluciones
            </button>
          </div>

          <div className="tnd-pdp-tab-panel" role="tabpanel">
            {openSection === 'descripcion' && p.description && (
              <p className="tnd-pdp-accordion-text">{p.description}</p>
            )}

            {openSection === 'detalles' && (
              <table className="tnd-pdp-details-table">
                <tbody>
                  <tr><td>Categoria</td><td>{p.category}</td></tr>
                  <tr><td>Estado</td><td>Nuevo</td></tr>
                  <tr><td>Stock disponible</td><td>{p.stock} {p.stock === 1 ? 'unidad' : 'unidades'}</td></tr>
                  <tr><td>Precio negociable</td><td>{isNegotiable ? 'Si - con TukiBot IA' : 'No'}</td></tr>
                  <tr><td>Vendedor</td><td>{vendorAlias}</td></tr>
                </tbody>
              </table>
            )}

            {openSection === 'garantia' && (
              <ul className="tnd-pdp-warranty-list">
                <li>
                  <svg width="14" height="14" fill="none" stroke="var(--tnd-success)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Comunicacion directa con el vendedor para cualquier inconveniente
                </li>
                <li>
                  <svg width="14" height="14" fill="none" stroke="var(--tnd-success)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Garantia sujeta a la politica del vendedor <strong>{vendorAlias}</strong>
                </li>
                <li>
                  <svg width="14" height="14" fill="none" stroke="var(--tnd-success)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  Devoluciones coordinadas directamente entre comprador y vendedor
                </li>
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
