'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  short_description: string | null;
  description: string | null;
  negotiable: boolean;
  warranty_days: number | null;
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

type Review = {
  id: string;
  buyer_email: string;
  rating: number;
  comment: string | null;
  created_at: string;
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
  const [openSection,   setOpenSection]   = useState<string | null>('descripcion');

  // ── Reviews state ──────────────────────────────────────────
  const [reviews,          setReviews]          = useState<Review[]>([]);
  const [reviewsLoading,   setReviewsLoading]   = useState(false);
  const [userEmail,        setUserEmail]        = useState<string | null>(null);
  const [vendorStoreName,  setVendorStoreName]  = useState<string | null>(null);
  const [linkCopied,       setLinkCopied]       = useState(false);
  const [reviewRating,     setReviewRating]     = useState(5);
  const [reviewComment,    setReviewComment]    = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError,      setReviewError]      = useState<string | null>(null);
  const [reviewDone,       setReviewDone]       = useState(false);

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
    let isActive = true;

    const loadProduct = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, vendor_id, vendor_email, name, category, price, floor_price, stock, image, gallery, short_description, description, negotiable, warranty_days')
          .eq('id', id)
          .eq('status', 'published')
          .maybeSingle();

        if (!isActive) return;

        if (error) {
          setP(null);
          setGalleryIdx(0);
          return;
        }

        setP(data ?? null);
        setGalleryIdx(0);
      } catch {
        if (isActive) {
          setP(null);
          setGalleryIdx(0);
        }
      }
    };

    void loadProduct();

    return () => {
      isActive = false;
    };
  }, [id]);

  // Get session email once (shared across reviews + offer flow)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  // Load reviews on product mount — used for avg rating widget + tab count + tab panel
  useEffect(() => {
    if (!p?.id) return;
    setReviewsLoading(true);
    fetch(`/api/tienda/reviews?product_id=${p.id}`)
      .then(r => r.json())
      .then(({ reviews: data }: { reviews?: Review[] }) => setReviews(data ?? []))
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [p?.id]);

  // Fetch vendor store name for breadcrumb
  useEffect(() => {
    if (!p?.vendor_id) return;
    supabase
      .from('store_configs')
      .select('config')
      .eq('vendor_id', p.vendor_id)
      .single()
      .then(({ data }) => {
        const cfg = data?.config as { storeName?: string } | null;
        if (cfg?.storeName) setVendorStoreName(cfg.storeName);
      });
  }, [p?.vendor_id]);

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
  const vendorEmail = p.vendor_email || 'tienda@tukimarket.local';
  const vendorAlias = vendorStoreName ?? (vendorEmail.split('@')[0] || 'Tienda');
  const avgRating   = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;
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
      vendor:  vendorEmail,
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
      vendor: vendorEmail,
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

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!p || !userEmail) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await authFetch('/api/tienda/reviews', {
        method: 'POST',
        body: JSON.stringify({ product_id: p.id, rating: reviewRating, comment: reviewComment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la reseña');
      setReviewDone(true);
      setReviewComment('');
      // Refresh list
      fetch(`/api/tienda/reviews?product_id=${p.id}`)
        .then(r => r.json())
        .then(({ reviews: data }: { reviews?: Review[] }) => setReviews(data ?? []))
        .catch(() => {});
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setReviewSubmitting(false);
    }
  }

  function reset() {
    setDone(null); setMode('idle');
    setOfferAmount(''); setQuantity(1); setAnimStep(-1); setPendingResult(null);
  }

  return (
    <div className="tnd-page tnd-pdp2-page">

      {/* ── Breadcrumb ── */}
      <nav className="tnd-pdp2-breadcrumb" aria-label="Navegación">
        <Link href="/tienda" className="tnd-pdp2-bc-link">TukiMarket</Link>
        <span className="tnd-pdp2-bc-sep">›</span>
        <Link href={`/tienda/${p.vendor_id}`} className="tnd-pdp2-bc-link">{vendorStoreName ?? vendorAlias}</Link>
        <span className="tnd-pdp2-bc-sep">›</span>
        <span className="tnd-pdp2-bc-cur">{p.category}</span>
        <span className="tnd-pdp2-bc-sep">›</span>
        <span className="tnd-pdp2-bc-cur" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
      </nav>

      {/* ══ MAIN GRID ══════════════════════════════════════════ */}
      <div className="tnd-pdp2-grid">

        {/* ── COL A: Galería ── */}
        <div className="tnd-pdp2-gallery-col">
          <div className="tnd-pdp2-gallery">
            {/* Imagen principal */}
            <div className="tnd-pdp2-gallery-main">
              {allImages.length > 0
                ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Image
                      src={allImages[galleryIdx] ?? allImages[0]}
                      alt={p.name}
                      fill
                      style={{ objectFit: 'contain' }}
                      unoptimized
                      priority
                    />
                  </div>
                )
                : <span style={{ fontSize: '6rem' }}>📦</span>
              }
              {isNegotiable && (
                <span className="tnd-pdp2-bot-badge">🤖 Negociable con IA</span>
              )}
              {allImages.length > 1 && (
                <>
                  <button className="tnd-pdp2-arrow tnd-pdp2-arrow-l"
                    onClick={() => setGalleryIdx(i => (i - 1 + allImages.length) % allImages.length)}
                    aria-label="Anterior">‹</button>
                  <button className="tnd-pdp2-arrow tnd-pdp2-arrow-r"
                    onClick={() => setGalleryIdx(i => (i + 1) % allImages.length)}
                    aria-label="Siguiente">›</button>
                </>
              )}
              {allImages.length > 1 && (
                <div className="tnd-pdp2-dots">
                  {allImages.map((_, i) => (
                    <button key={i} onClick={() => setGalleryIdx(i)}
                      className={`tnd-pdp2-dot${galleryIdx === i ? ' active' : ''}`}
                      aria-label={`Imagen ${i + 1}`} />
                  ))}
                </div>
              )}
            </div>
            {/* Miniaturas */}
              {allImages.length > 1 && (
                <div className="tnd-pdp2-thumbs">
                  {allImages.map((url, idx) => (
                    <button key={url + idx}
                      className={`tnd-pdp2-thumb${galleryIdx === idx ? ' active' : ''}`}
                      onClick={() => setGalleryIdx(idx)}>
                      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <Image src={url} alt={`Vista ${idx + 1}`} fill style={{ objectFit: 'cover' }} unoptimized />
                      </div>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
        {/* ── COL A row 2: Tabs (desktop: bajo galería / móvil: tras compartir) ── */}
          <div className="tnd-pdp2-tabs-section">
            <div className="tnd-pdp2-tabs" role="tablist">
              {([
                { id: 'descripcion', label: 'Descripción' },
                { id: 'envio',       label: '🚚 Envío' },
                { id: 'garantias',   label: '🛡️ Garantía' },
                { id: 'resenas',     label: reviews.length > 0 ? `⭐ Reseñas (${reviews.length})` : '⭐ Reseñas' },
              ] as const).map(t => (
                <button key={t.id} role="tab"
                  id={`tab-${t.id}`}
                  aria-controls={`panel-${t.id}`}
                  aria-selected={openSection === t.id}
                  className={`tnd-pdp2-tab${openSection === t.id ? ' active' : ''}`}
                  onClick={() => setOpenSection(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="tnd-pdp2-tab-panel">
              {openSection === 'descripcion' && (
                <div>
                  {p.short_description && (
                    <p id={`panel-descripcion`} role="tabpanel" aria-labelledby={`tab-descripcion`} className="tnd-pdp2-short-desc">{p.short_description}</p>
                  )}
                  {p.description
                    ? <p id={`panel-descripcion-long`} role="tabpanel" aria-labelledby={`tab-descripcion`} className="tnd-pdp2-long-desc">{p.description}</p>
                    : !p.short_description && <p id={`panel-descripcion-long`} role="tabpanel" aria-labelledby={`tab-descripcion`} className="tnd-pdp2-long-desc" style={{ color: 'var(--tnd-text-muted)' }}>Sin descripción disponible.</p>
                  }
                </div>
              )}
              {openSection === 'envio' && (
                <div id={`panel-envio`} role="tabpanel" aria-labelledby={`tab-envio`} className="tnd-pdp2-info-grid">
                  <div className="tnd-pdp2-info-row"><span>Modalidad</span><strong>A coordinar con el vendedor</strong></div>
                  <div className="tnd-pdp2-info-row"><span>Cobertura</span><strong>Depende del vendedor</strong></div>
                  <div className="tnd-pdp2-info-row"><span>Tiempo estimado</span><strong>A confirmar al comprar</strong></div>
                  <p style={{ margin: '14px 0 0', fontSize: '0.83rem', color: 'var(--tnd-text-muted)', lineHeight: 1.6 }}>
                    <strong>{vendorAlias}</strong> coordinará el método y costo de envío directamente con vos una vez confirmado el pedido.
                  </p>
                </div>
              )}
              {openSection === 'garantias' && (
                <div id="panel-garantias" role="tabpanel" aria-labelledby="tab-garantias">
                  {p?.warranty_days != null && p.warranty_days > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid #86efac', borderRadius: 14, marginBottom: 14 }}>
                      <span style={{ fontSize: '2rem', lineHeight: 1 }}>🛡️</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: '#15803d' }}>
                          Garantía de {p.warranty_days} días
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#166534' }}>
                          El vendedor ofrece {p.warranty_days} días de garantía en este producto
                        </p>
                      </div>
                    </div>
                  )}
                  <ul className="tnd-pdp2-warranty">
                    {[
                      'Comunicación directa con el vendedor ante cualquier inconveniente',
                      `Garantía sujeta a la política de ${vendorAlias}`,
                      'Devoluciones coordinadas directamente entre comprador y vendedor',
                    ].map((item, i) => (
                      <li key={i} className="tnd-pdp2-warranty-item">
                        <span className="tnd-pdp2-warranty-icon">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openSection === 'resenas' && (
                <div id="panel-resenas" role="tabpanel" aria-labelledby="tab-resenas">

                  {/* ── Success banner ── */}
                  {reviewDone && (
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, marginBottom: 14, color: '#15803d', fontSize: '0.85rem', fontWeight: 600 }}>
                      ✅ ¡Reseña publicada! Gracias por tu opinión.
                    </div>
                  )}

                  {/* ── Write review form ── */}
                  {userEmail && !reviewDone && !reviews.some(r => r.buyer_email === userEmail) && (
                    <form onSubmit={handleReviewSubmit} style={{ marginBottom: 20, padding: '14px', background: 'var(--tnd-surface-2)', borderRadius: 12, border: '1px solid var(--tnd-border)' }}>
                      <p style={{ margin: '0 0 10px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--tnd-text-primary)' }}>
                        Dejá tu reseña
                      </p>
                      {/* Star selector */}
                      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                        {[1,2,3,4,5].map(star => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewRating(star)}
                            aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.7rem', color: star <= reviewRating ? '#F5C518' : 'var(--tnd-border)', padding: 0, lineHeight: 1 }}
                          >★</button>
                        ))}
                      </div>
                      <textarea
                        value={reviewComment}
                        onChange={e => setReviewComment(e.target.value)}
                        placeholder="Contá tu experiencia con este producto (opcional)"
                        maxLength={500}
                        rows={3}
                        style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--tnd-border)', background: 'var(--tnd-surface)', color: 'var(--tnd-text-primary)', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--tnd-text-muted)' }}>{reviewComment.length}/500</span>
                        <button
                          type="submit"
                          disabled={reviewSubmitting}
                          style={{ padding: '7px 16px', background: 'var(--tnd-accent)', color: 'var(--tnd-accent-text)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.83rem', cursor: reviewSubmitting ? 'not-allowed' : 'pointer', opacity: reviewSubmitting ? 0.7 : 1 }}
                        >
                          {reviewSubmitting ? 'Enviando...' : 'Publicar reseña'}
                        </button>
                      </div>
                      {reviewError && <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#ef4444' }}>{reviewError}</p>}
                      <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: 'var(--tnd-text-muted)' }}>⚠️ Solo compradores verificados pueden publicar reseñas</p>
                    </form>
                  )}

                  {/* ── Reviews list ── */}
                  {reviewsLoading ? (
                    <p style={{ textAlign: 'center', color: 'var(--tnd-text-muted)', padding: '20px 0', fontSize: '0.85rem' }}>Cargando reseñas...</p>
                  ) : reviews.length === 0 ? (
                    <div className="tnd-pdp2-reviews-empty">
                      <span style={{ fontSize: '2rem' }}>⭐</span>
                      <p>Aún no hay reseñas para este producto.</p>
                      {!userEmail && <p style={{ fontSize: '0.8rem', color: 'var(--tnd-text-muted)' }}>Iniciá sesión y comprá el producto para dejar tu opinión.</p>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {reviews.map(review => {
                        const parts = review.buyer_email.split('@');
                        const maskedEmail = `${parts[0].slice(0, 3)}***@${parts[1] ?? ''}` ;
                        const date = new Date(review.created_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                        return (
                          <div key={review.id} style={{ padding: '12px 14px', background: 'var(--tnd-surface)', border: '1px solid var(--tnd-border)', borderRadius: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                              <div>
                                <div style={{ display: 'flex', gap: 1, marginBottom: 2 }}>
                                  {[1,2,3,4,5].map(s => (
                                    <span key={s} style={{ color: s <= review.rating ? '#F5C518' : 'var(--tnd-border)', fontSize: '0.9rem' }}>★</span>
                                  ))}
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--tnd-text-muted)' }}>{maskedEmail}</span>
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--tnd-text-muted)', flexShrink: 0, marginLeft: 8 }}>{date}</span>
                            </div>
                            {review.comment && (
                              <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--tnd-text-primary)', lineHeight: 1.5 }}>
                                {review.comment}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        {/* ── COL B: Info + Acciones ── */}
        <div className="tnd-pdp2-info-col">

          {/* Categoría + nombre */}
          <div className="tnd-pdp2-cat-chip">{p.category}</div>
          <h1 className="tnd-pdp2-title">{p.name}</h1>

          {/* Descripción corta inline (visible arriba del precio) */}
          {p.short_description && (
            <p className="tnd-pdp2-inline-short">{p.short_description}</p>
          )}

          {/* Rating promedio */}
          {avgRating !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '-4px 0 8px' }}>
              {[1,2,3,4,5].map(s => (
                <span key={s} style={{ color: s <= Math.round(avgRating) ? '#F5C518' : 'var(--tnd-border)', fontSize: '0.95rem', lineHeight: 1 }}>★</span>
              ))}
              <span style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--tnd-text-primary)', marginLeft: 2 }}>{avgRating.toFixed(1)}</span>
              <button
                onClick={() => setOpenSection('resenas')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--tnd-text-muted)', textDecoration: 'underline', padding: 0 }}
              >
                ({reviews.length} {reviews.length === 1 ? 'reseña' : 'reseñas'})
              </button>
            </div>
          )}

          {/* Precio */}
          <div className="tnd-pdp2-price-row">
            <span className="tnd-pdp2-price">{gs(p.price)}</span>
            {isNegotiable && (
              <span className="tnd-pdp2-negoable-pill">🤝 Precio negociable</span>
            )}
          </div>

          {/* Stock badge */}
          <div className={`tnd-pdp2-stock${p.stock === 0 ? ' out' : p.stock <= 3 ? ' low' : ' ok'}`}>
            {p.stock === 0
              ? <><span className="tnd-pdp2-stock-dot" />Sin stock</>
              : p.stock <= 3
                ? <><span className="tnd-pdp2-stock-dot" />¡Últimas {p.stock} unidades!</>
                : <><span className="tnd-pdp2-stock-dot" />En stock — {p.stock} disponibles</>
            }
          </div>

          {/* ══ DONE state ═══════════════════════════════════ */}
          {done ? (
            <div className="tnd-pdp2-result">
              {done.type === 'buy' ? (
                <div className="tnd-pdp2-result-card tnd-pdp2-result-ok">
                  <div className="tnd-pdp2-result-icon">🛒</div>
                  <div className="tnd-pdp2-result-title">¡Pedido procesado!</div>
                  <p className="tnd-pdp2-result-sub">Tu pedido de <strong>{quantity} × {p.name}</strong> fue confirmado. El vendedor <strong>{vendorAlias}</strong> te contactará pronto.</p>
                </div>
              ) : done.botResponse === 'accepted' ? (
                <div className="tnd-pdp2-result-card tnd-pdp2-result-ok">
                  <div className="tnd-pdp2-result-topline">
                    <span className="tnd-pdp2-result-label">TukiBot cerró el trato</span>
                    <span className="tnd-pdp2-result-stamp">✅ ACEPTADO</span>
                  </div>
                  <div className="tnd-pdp2-result-icon">🎉</div>
                  <div className="tnd-pdp2-result-title">¡TukiBot te consiguió el precio!</div>
                  {done.botMessage && <p className="tnd-pdp2-result-msg">{done.botMessage}</p>}
                  <div className="tnd-pdp2-price-compare">
                    <div className="tnd-pdp2-price-compare-item muted">
                      <span>Precio publicado</span>
                      <strong>{gs(p.price * quantity)}</strong>
                      <small>{quantity} × {gs(p.price)}</small>
                    </div>
                    <div className="tnd-pdp2-price-compare-item highlight">
                      <span>Tu precio logrado</span>
                      <strong>{gs(resultTotalAmount)}</strong>
                      <small>{quantity} × {gs(resultUnitAmount)}</small>
                    </div>
                  </div>
                  {resultSavings > 0 && (
                    <div className="tnd-pdp2-savings">Ahorraste: {gs(resultSavings)}</div>
                  )}
                  <button className="tnd-pdp2-btn-buy" onClick={handleProceedToPayment}>
                    💳 Proceder al pago
                  </button>
                </div>
              ) : done.botResponse === 'countered' ? (
                <div className="tnd-pdp2-result-card tnd-pdp2-result-counter">
                  <div className="tnd-pdp2-result-topline">
                    <span className="tnd-pdp2-result-label">Contraoferta en vivo</span>
                    <span className="tnd-pdp2-result-stamp" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)' }}>😮 CONTRAOFERTA</span>
                  </div>
                  {done.botMessage && <p className="tnd-pdp2-result-msg">{done.botMessage}</p>}
                  <div className="tnd-pdp2-price-compare">
                    <div className="tnd-pdp2-price-compare-item muted">
                      <span>Tu oferta</span>
                      <strong>{gs((done.amount ?? offerNum) * quantity)}</strong>
                    </div>
                    <div className="tnd-pdp2-price-compare-item counter">
                      <span>Contraoferta</span>
                      <strong>{gs(resultTotalAmount)}</strong>
                      <small>{quantity} × {gs(resultUnitAmount)}</small>
                      {resultSavings > 0 && <em>Ahorro: {gs(resultSavings)}</em>}
                    </div>
                  </div>
                  {done.timeoutMessage && (
                    <p style={{ fontSize: '0.77rem', color: 'var(--tnd-text-muted)', margin: '8px 0 0' }}>
                      {done.timeoutMessage.replace('{hora}', formatTimeoutAt(done.timeoutAt) ?? '')}
                    </p>
                  )}
                  <div className="tnd-pdp2-result-actions">
                    <button className="tnd-pdp2-btn-buy" onClick={handleAcceptCounter} disabled={acceptingCounter}>
                      {acceptingCounter ? '⏳ Confirmando...' : `✅ Aceptar ${gs(done.counterAmount!)}`}
                    </button>
                    <button className="tnd-pdp2-btn-secondary" onClick={reset}>Reofertar</button>
                  </div>
                </div>
              ) : null}
            </div>

          ) : p.stock === 0 ? (
            <div className="tnd-pdp2-out-of-stock">
              <span>❌</span> Producto sin stock — no disponible en este momento
            </div>

          ) : (
            <div className="tnd-pdp2-actions-panel">

              {/* Cantidad */}
              <div className="tnd-pdp2-qty-row">
                <span className="tnd-pdp2-qty-label">Cantidad</span>
                <div className="tnd-pdp2-qty-ctrl">
                  <button className="tnd-pdp2-qty-btn"
                    onClick={() => setQuantity(clampQty(quantity - 1))}
                    disabled={quantity <= 1}>−</button>
                  <span className="tnd-pdp2-qty-val">{quantity}</span>
                  <button className="tnd-pdp2-qty-btn"
                    onClick={() => setQuantity(clampQty(quantity + 1))}
                    disabled={quantity >= p.stock}>+</button>
                </div>
                {quantity > 1 && (
                  <span className="tnd-pdp2-qty-total">= {gs(p.price * quantity)}</span>
                )}
              </div>

              {/* Botones principales */}
              <button className="tnd-pdp2-btn-buy" onClick={handleBuy} disabled={submitting}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>
                Comprar ahora
              </button>
              <button
                className={`tnd-pdp2-btn-cart${cartAdded ? ' added' : ''}`}
                onClick={handleAddToCart} disabled={submitting}>
                {cartAdded
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ¡Agregado al carrito!</>
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg> Agregar al carrito</>
                }
              </button>

              {cartAdded && (
                <p className="tnd-pdp2-cart-feedback">✓ {quantity} unidad{quantity > 1 ? 'es' : ''} en tu carrito</p>
              )}

              {/* Botón negociar */}
              {isNegotiable && !cartAdded && (
                <button
                  className={`tnd-pdp2-btn-negotiate${mode === 'negotiate' ? ' open' : ''}`}
                  onClick={() => setMode(m => m === 'negotiate' ? 'idle' : 'negotiate')}
                  disabled={submitting}>
                  🤖 {mode === 'negotiate' ? 'Cerrar negociador' : 'Negociar precio con IA'}
                </button>
              )}

              {/* Panel de negociación */}
              {mode === 'negotiate' && (
                <div className="tnd-pdp2-neg-panel">
                  <div className="tnd-pdp2-neg-notice">
                    <span className="tnd-pdp2-neg-notice-icon">🤖</span>
                    <div>
                      <strong>TukiBot Negociador IA</strong>
                      <span>Intentemos conseguirte un mejor precio antes de comprar</span>
                    </div>
                  </div>

                  {animStep >= 0 ? (
                    <div className="tnd-neg-anim">
                      <div className="tnd-neg-anim-bot">🤖</div>
                      <div key={animStep} className="tnd-neg-anim-phrase" aria-live="polite">
                        {animStep === ANIM_CLIMAX && pendingResult
                          ? negClimax[pendingResult.status]
                          : (negPhrases[animStep % negPhrases.length] ?? negPhrases[0])}
                      </div>
                      <div className="tnd-neg-anim-dots"><span /><span /><span /></div>
                    </div>
                  ) : (
                    <form onSubmit={handleOffer} className="tnd-pdp2-neg-form">
                      <div className="tnd-pdp2-neg-field">
                        <label htmlFor="offerAmt2">Tu oferta por unidad</label>
                        <input
                          id="offerAmt2" type="text" inputMode="numeric"
                          className="tnd-pdp2-neg-input"
                          placeholder={`Hasta ${gs(p.price)}`}
                          value={offerAmount}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '');
                            if (!digits) { setOfferAmount(''); return; }
                            setOfferAmount(formatOfferGs(Math.min(Number(digits), p.price)));
                          }}
                          required autoFocus
                        />
                        <span className="tnd-pdp2-neg-hint">Solo números · Ej: 25000</span>
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
                        <div className="tnd-pdp2-neg-total">
                          Total: <strong>{gs(offerNum * quantity)}</strong> ({quantity} × {gs(offerNum)})
                        </div>
                      )}
                      <button type="submit" className="tnd-pdp2-neg-submit" disabled={submitting || offerNum <= 0}>
                        {submitting ? '⏳ Negociando...' : '🤝 Enviar oferta'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Garantías rápidas ── */}
          <div className="tnd-pdp2-trust-strip">
            <div className="tnd-pdp2-trust-item">
              <span>🔒</span> Compra segura
            </div>
            <div className="tnd-pdp2-trust-item">
              <span>📦</span> Envío coordinado
            </div>
            <div className="tnd-pdp2-trust-item">
              <span>💬</span> Soporte directo
            </div>
          </div>

          {/* ── Compartir ── */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }).catch(() => {});
            }}
            style={{ width: '100%', marginTop: 6, padding: '9px 14px', background: 'transparent', border: '1px solid var(--tnd-border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', fontSize: '0.83rem', color: linkCopied ? '#16a34a' : 'var(--tnd-text-muted)', fontWeight: 600, transition: 'color 0.2s' }}
          >
            {linkCopied ? '✅ ¡Enlace copiado!' : '🔗 Compartir producto'}
          </button>

          {/* ── Tarjeta vendedor ── */}
          <Link href={`/tienda/${p.vendor_id}`} className="tnd-pdp2-seller">
            <div className="tnd-pdp2-seller-avatar">
              {vendorAlias.charAt(0).toUpperCase()}
            </div>
            <div className="tnd-pdp2-seller-info">
              <span className="tnd-pdp2-seller-label">Vendido por</span>
              <span className="tnd-pdp2-seller-name">{vendorAlias}</span>
              <span className="tnd-pdp2-seller-verified">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#16a34a"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Vendedor en TukiMarket
              </span>
            </div>
            <svg className="tnd-pdp2-seller-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
