'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

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

/* ── Component ─────────────────────────────────────────────── */
export default function ProductDetailPage() {
  const params = useParams();
  const id     = params.id as string;
  const p      = PRODUCTS[id];

  const [offerAmount, setOfferAmount] = useState('');
  const [quantity,    setQuantity]    = useState(1);
  const [message,     setMessage]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

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

  const discount = Math.round((1 - p.floorPrice / p.price) * 100);
  const isNegotiable = p.floorPrice < p.price * 0.92;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(offerAmount, 10);
    if (!amount || amount < p.floorPrice) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="tnd-page">
      {/* Back trail */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, fontSize: '0.82rem' }}>
        <Link href="/tienda" className="tnd-back-link">Catálogo</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <Link href={`/tienda/${p.vendorId}`} className="tnd-back-link">{p.vendorName}</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <span style={{ color: 'var(--tnd-text-muted)' }}>{p.name}</span>
      </div>

      {/* ── 2-col detail grid ── */}
      <div className="tnd-detail-grid">

        {/* Left — image */}
        <div>
          <div className="tnd-detail-image">
            <span role="img" aria-label={p.name}>{p.emoji}</span>
            {isNegotiable && (
              <span className="tnd-negoable-badge tnd-negoable-badge-lg">
                🤝 Negociable hasta {discount}% dto.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="tnd-chip tnd-chip-stock">🏷️ {p.category}</span>
            <span className={`tnd-chip ${p.stock === 0 ? 'tnd-chip-out' : p.stock <= 3 ? 'tnd-chip-low' : 'tnd-chip-stock'}`}>
              {p.stock === 0 ? 'Sin stock' : p.stock <= 3 ? `⚠️ Últimas ${p.stock} unidades` : `✓ ${p.stock} en stock`}
            </span>
          </div>
        </div>

        {/* Right — info + offer */}
        <div>
          <div className="tnd-detail-vendor-link">
            <Link href={`/tienda/${p.vendorId}`}>{p.vendorName}</Link>
          </div>
          <h1 className="tnd-detail-name">{p.name}</h1>
          <div className="tnd-detail-price">{gs(p.price)}</div>
          <div className="tnd-detail-floor">
            Precio mínimo de oferta: <strong>{gs(p.floorPrice)}</strong>
          </div>
          <p className="tnd-detail-desc">{p.desc}</p>

          <div className="tnd-divider" />

          {/* ── Offer box ── */}
          {p.stock === 0 ? (
            <div className="tnd-chip tnd-chip-out" style={{ fontSize: '0.95rem', padding: '12px 18px', display: 'inline-block' }}>
              ❌ Sin stock — producto no disponible
            </div>
          ) : submitted ? (
            <div className="tnd-offer-success">
              <div className="tnd-offer-success-icon">✅</div>
              <div className="tnd-offer-success-title">¡Oferta enviada!</div>
              <p className="tnd-offer-success-sub">
                Tu oferta de <strong>{gs(parseInt(offerAmount, 10))}</strong> × {quantity} unidades fue enviada a <strong>{p.vendorName}</strong>.<br />
                El vendedor (o nuestro Robot Negociador 🤖) te responderá pronto.
              </p>
              <button
                className="tnd-offer-submit"
                style={{ marginTop: 10 }}
                onClick={() => { setSubmitted(false); setOfferAmount(''); setQuantity(1); setMessage(''); }}
              >
                Hacer otra oferta
              </button>
            </div>
          ) : (
            <div className="tnd-offer-box">
              <h3 className="tnd-offer-title">🤝 Hacer una oferta</h3>

              {/* Robot notice */}
              <div className="tnd-robot-notice">
                <div className="tnd-robot-notice-icon">🤖</div>
                <div>
                  <strong>Robot Negociador activo</strong><br />
                  Tu oferta será procesada por el Robot Negociador de TukiTask. Podría contra-ofertarte, aceptar o declinar de forma automática según los parámetros del vendedor.
                </div>
              </div>

              <form onSubmit={handleSubmit} className="tnd-offer-form">
                <div className="tnd-offer-field">
                  <label htmlFor="offerAmt" className="tnd-offer-label">
                    Tu oferta <span style={{ color: 'var(--tnd-text-muted)', fontWeight: 400 }}>(mín: {gs(p.floorPrice)})</span>
                  </label>
                  <input
                    id="offerAmt"
                    type="number"
                    className="tnd-offer-input"
                    placeholder={`Mínimo ${p.floorPrice}`}
                    value={offerAmount}
                    min={p.floorPrice}
                    max={p.price}
                    onChange={e => setOfferAmount(e.target.value)}
                    required
                  />
                  {offerAmount && parseInt(offerAmount, 10) < p.floorPrice && (
                    <div className="tnd-offer-error">
                      ⚠️ La oferta mínima aceptada es {gs(p.floorPrice)}
                    </div>
                  )}
                </div>

                <div className="tnd-offer-field">
                  <label htmlFor="qty" className="tnd-offer-label">Cantidad</label>
                  <input
                    id="qty"
                    type="number"
                    className="tnd-offer-input"
                    min={1}
                    max={p.stock}
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, Math.min(p.stock, parseInt(e.target.value, 10) || 1)))}
                  />
                </div>

                <div className="tnd-offer-field">
                  <label htmlFor="msg" className="tnd-offer-label">Mensaje al vendedor <span style={{ color: 'var(--tnd-text-muted)', fontWeight: 400 }}>(opcional)</span></label>
                  <textarea
                    id="msg"
                    className="tnd-offer-input tnd-offer-textarea"
                    placeholder="Ej: ¿Podría hacer envío a Luque? ¿Tiene garantía?"
                    rows={3}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    maxLength={300}
                  />
                </div>

                {offerAmount && parseInt(offerAmount, 10) >= p.floorPrice && (
                  <div className="tnd-offer-summary">
                    Total estimado: <strong>{gs(parseInt(offerAmount, 10) * quantity)}</strong>
                    &nbsp;({quantity} × {gs(parseInt(offerAmount, 10))})
                  </div>
                )}

                <button
                  type="submit"
                  className="tnd-offer-submit"
                  disabled={submitting || !offerAmount || parseInt(offerAmount, 10) < p.floorPrice}
                >
                  {submitting ? '⏳ Enviando oferta...' : '🚀 Enviar oferta'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
