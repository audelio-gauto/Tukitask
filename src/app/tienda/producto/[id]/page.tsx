'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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
type BotTone = 'informal' | 'formal' | 'agresivo' | 'amigable';

const BOT_CONFIG_STORAGE_KEY = 'tukibot:config:default';

function getStoredBotTone(): BotTone {
  try {
    const raw = localStorage.getItem(BOT_CONFIG_STORAGE_KEY);
    if (!raw) return 'amigable';
    const parsed = JSON.parse(raw) as { botTone?: BotTone };
    if (parsed.botTone === 'informal' || parsed.botTone === 'formal' || parsed.botTone === 'agresivo' || parsed.botTone === 'amigable') {
      return parsed.botTone;
    }
  } catch {
    // Ignore parse/storage errors
  }
  return 'amigable';
}

/* ── Mock data ──────────────────────────────────────────────── */
const PRODUCTS: Record<string, {
  id: string; vendorId: string; vendorName: string; name: string;
  category: string; emoji: string; price: number; floorPrice: number;
  stock: number; desc: string;
}> = {
  p1: { id: 'p1', vendorId: 'techpy',      vendorName: 'TechPY Store',    name: 'iPhone 15 128GB',          category: 'Electrónica', emoji: '📱', price: 5000000, floorPrice: 4200000, stock: 3,  desc: 'iPhone 15 128GB en color negro. Garantía de 12 meses. Libre de fábrica, acepta cualquier operadora. Incluye cargador original y caja sellada.' },
  p2: { id: 'p2', vendorId: 'techpy',      vendorName: 'TechPY Store',    name: 'Auriculares Bluetooth Pro', category: 'Electrónica', emoji: '🎧', price:  350000, floorPrice:  280000, stock: 15, desc: 'Auriculares inalámbricos con cancelación de ruido activa. Batería de 30 horas. Compatible con todos los dispositivos Bluetooth 5.0.' },
  p3: { id: 'p3', vendorId: 'techpy',      vendorName: 'TechPY Store',    name: 'Laptop Gaming 16"',         category: 'Electrónica', emoji: '💻', price: 8500000, floorPrice: 7500000, stock: 2,  desc: 'Laptop gaming con Intel Core i7, 16GB RAM, RTX 4060, pantalla 16" 144Hz. Perfecta para gaming y trabajo exigente.' },
  p4: { id: 'p4', vendorId: 'modaexpress', vendorName: 'Moda Express',    name: 'Vestido Floral Verano',     category: 'Ropa',        emoji: '👗', price:  180000, floorPrice:  140000, stock: 8,  desc: 'Vestido liviano con estampado floral. Material 100% algodón, tallas S, M, L, XL disponibles. Colores vibrantes para el verano paraguayo.' },
  p5: { id: 'p5', vendorId: 'modaexpress', vendorName: 'Moda Express',    name: 'Zapatillas Running',        category: 'Ropa',        emoji: '👟', price:  420000, floorPrice:  340000, stock: 5,  desc: 'Zapatillas deportivas para running urbano y trail. Suela antideslizante, amortiguación premium. Tallas 37-44.' },
  p6: { id: 'p6', vendorId: 'sabores',     vendorName: 'Sabores del Sur', name: 'Empanadas x12 unidades',    category: 'Gastronomía', emoji: '🥟', price:   60000, floorPrice:   50000, stock: 20, desc: 'Empanadas caseras de carne, pollo o humita. Preparadas el mismo día con ingredientes frescos. Incluye salsa de ajíes de regalo.' },
  p7: { id: 'p7', vendorId: 'hogarfeliz',  vendorName: 'Hogar Feliz',     name: 'Mesa de Madera Maciza',     category: 'Hogar',       emoji: '🪑', price:  800000, floorPrice:  650000, stock: 1,  desc: 'Mesa de comedor de madera maciza cedro. 6 personas, 140x80cm. Acabado natural con aceite de lino. Fabricación artesanal local.' },
  p8: { id: 'p8', vendorId: 'librosmundo', vendorName: 'LibrosMundo',     name: 'Set Paulo Coelho x5',       category: 'Libros',      emoji: '📚', price:  250000, floorPrice:  200000, stock: 10, desc: 'Colección de 5 libros de Paulo Coelho: El Alquimista, Veronika Decide Morir, El Zahir, Once Minutos y El Peregrino. Tapa dura, edición especial.' },
};

const gs = (n: number) => `Gs. ${n.toLocaleString('es-PY')}`;

/* ══════════════════════════════════════════════════════════════ */
export default function ProductDetailPage() {
  const params = useParams();
  const id     = params.id as string;
  const p      = PRODUCTS[id];

  const [mode,        setMode]        = useState<Mode>('idle');
  const [quantity,    setQuantity]    = useState(1);
  const [offerAmount, setOfferAmount] = useState('');
  const [message,     setMessage]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [done,        setDone]        = useState<{ type: Mode; amount?: number; botResponse?: 'accepted' | 'countered'; counterAmount?: number; botMessage?: string } | null>(null);

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

  const isNegotiable = p.floorPrice < p.price * 0.92;
  const offerNum     = parseInt(offerAmount, 10) || 0;
  const dealStrength = mode === 'negotiate' ? getDealStrength(offerNum, p.price, p.floorPrice) : null;
  const clampQty     = (v: number) => Math.max(1, Math.min(p.stock, v));

  async function handleBuy() {
    setMode('buy');
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);
    setDone({ type: 'buy' });
  }

  async function handleOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!offerNum || offerNum <= 0) return;
    setSubmitting(true);
    try {
      const autoAcceptFrom = Math.round((p.floorPrice + p.price) / 2 / 1000) * 1000;
      const botTone = getStoredBotTone();
      const res = await fetch('/api/tukibot/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerOffer: offerNum,
          quantity,
          listedPrice: p.price,
          floorPrice: p.floorPrice,
          autoAcceptFrom,
          productName: p.name,
          vendorName: p.vendorName,
          buyerMessage: message,
          botTone,
        }),
      });

      if (!res.ok) throw new Error('Negociación fallida');

      const data = await res.json();
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
        });
      }
    } catch {
      // Fallback local logic to keep UX responsive even if API fails
      if (offerNum >= p.floorPrice) {
        setDone({
          type: 'negotiate',
          amount: offerNum,
          botResponse: 'accepted',
          botMessage: `Perfecto, te confirmo ${gs(offerNum)} por unidad.`,
        });
      } else {
        const counter = Math.round((p.floorPrice + offerNum) / 2 / 1000) * 1000;
        const counterAmount = Math.max(p.floorPrice, counter);
        setDone({
          type: 'negotiate',
          amount: offerNum,
          botResponse: 'countered',
          counterAmount,
          botMessage: `Te puedo mejorar la oferta: ${gs(counterAmount)} por unidad.`,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null); setMode('idle');
    setOfferAmount(''); setQuantity(1); setMessage('');
  }

  return (
    <div className="tnd-page">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, fontSize: '0.82rem' }}>
        <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <Link href={`/tienda/${p.vendorId}`} className="tnd-back-link">{p.vendorName}</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <span style={{ color: 'var(--tnd-text-muted)' }}>{p.name}</span>
      </div>

      <div className="tnd-detail-grid">
        {/* ── Left: image ──────────────────────────────────── */}
        <div>
          <div className="tnd-detail-image">
            <span role="img" aria-label={p.name}>{p.emoji}</span>
            {isNegotiable && (
              <span className="tnd-negoable-badge tnd-negoable-badge-lg">🤖 Negociable</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="tnd-chip tnd-chip-stock">🏷️ {p.category}</span>
            <span className={`tnd-chip ${p.stock === 0 ? 'tnd-chip-out' : p.stock <= 3 ? 'tnd-chip-low' : 'tnd-chip-stock'}`}>
              {p.stock === 0 ? 'Sin stock' : p.stock <= 3 ? `⚠️ Últimas ${p.stock} unidades` : `✓ ${p.stock} en stock`}
            </span>
          </div>
        </div>

        {/* ── Right: info + actions ─────────────────────── */}
        <div>
          <div className="tnd-detail-vendor-link">
            <Link href={`/tienda/${p.vendorId}`}>{p.vendorName}</Link>
          </div>
          <h1 className="tnd-detail-name">{p.name}</h1>
          <div className="tnd-detail-price">{gs(p.price)}</div>
          <p className="tnd-detail-desc">{p.desc}</p>

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
                    Recibirás confirmación de <strong>{p.vendorName}</strong> pronto.
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
                      <p className="tnd-offer-success-sub">
                        El TukiBot de <strong>{p.vendorName}</strong> aceptó <strong>{gs(done.amount!)}</strong> × {quantity} und.<br />
                        Procedé al pago para confirmar tu compra.
                      </p>
                      <button className="tnd-btn-buy" style={{ marginTop: 12 }}>💳 Proceder al pago</button>
                    </>
                  ) : done.botResponse === 'countered' ? (
                    <>
                      {done.botMessage && (
                        <p className="tnd-offer-success-sub" style={{ marginTop: 8 }}>
                          {done.botMessage}
                        </p>
                      )}
                      <p className="tnd-offer-success-sub" style={{ marginTop: 8 }}>
                        Tu oferta de <strong>{gs(done.amount!)}</strong> fue baja.<br />
                        El Robot propone:
                      </p>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#F5C518', margin: '10px 0' }}>
                        {gs(done.counterAmount!)}
                      </div>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        <button
                          className="tnd-btn-buy"
                          onClick={() => setDone(prev => prev ? {
                            ...prev,
                            botResponse: 'accepted',
                            amount: prev.counterAmount,
                            botMessage: '¡Trato cerrado! Precio final confirmado por el TukiBot.',
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
                      Tu oferta de <strong>{gs(done.amount!)}</strong> está siendo evaluada por el TukiBot de <strong>{p.vendorName}</strong>.
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
                  disabled={submitting}
                >
                  {submitting && mode === 'buy' ? '⏳ Procesando...' : '🛒 Comprar ahora'}
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

                    <div className="tnd-offer-field">
                      <label htmlFor="msg" className="tnd-offer-label">
                        Mensaje <span style={{ color: 'var(--tnd-text-muted)', fontWeight: 400 }}>(opcional)</span>
                      </label>
                      <textarea
                        id="msg"
                        className="tnd-offer-input tnd-offer-textarea"
                        placeholder="Ej: ¿Hacés envío a San Lorenzo? ¿Tiene garantía?"
                        rows={2}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        maxLength={280}
                      />
                    </div>

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
                      {submitting ? '⏳ Enviando...' : '🤖 Enviar oferta al TukiBot'}
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
