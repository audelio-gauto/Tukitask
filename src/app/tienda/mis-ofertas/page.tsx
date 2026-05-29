'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';

type OfferStatus = 'countered' | 'accepted_pending_payment';

type OfferRow = {
  id: string;
  vendor_id: string;
  vendor_email: string | null;
  product_id: string | null;
  product_name: string | null;
  product_image: string | null;
  listed_price: number;
  buyer_offer: number;
  counter_amount: number | null;
  final_amount: number | null;
  quantity: number;
  status: OfferStatus;
  bot_message: string | null;
  expires_at: string | null;
};

const gs = (n?: number | null) => `Gs. ${(n ?? 0).toLocaleString('es-PY')}`;

export default function MisOfertasMarketplacePage() {
  const router = useRouter();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadOffers() {
    setLoading(true);
    try {
      const res = await authFetch('/api/tukibot/negotiations?role=buyer&status=all&limit=50');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar tus ofertas');
      setOffers(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOffers();
  }, []);

  const grouped = useMemo(() => ({
    countered: offers.filter((offer) => offer.status === 'countered'),
    accepted: offers.filter((offer) => offer.status === 'accepted_pending_payment'),
  }), [offers]);

  async function handleAccept(offer: OfferRow) {
    setBusyId(offer.id);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${offer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept_counter' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo aceptar la oferta');
      await loadOffers();
    } finally {
      setBusyId(null);
    }
  }

  function handlePay(offer: OfferRow) {
    if (!offer.product_id) return;
    const finalPrice = offer.final_amount ?? offer.counter_amount ?? offer.buyer_offer;
    router.push(`/tienda/checkout?product=${offer.product_id}&qty=${offer.quantity}&name=${encodeURIComponent(offer.product_name || '')}&vendor=${encodeURIComponent(offer.vendor_email || '')}&vid=${offer.vendor_id}&price=${finalPrice}&negotiationId=${offer.id}`);
  }

  return (
    <div className="tnd-page">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, fontSize: '0.82rem' }}>
        <Link href="/tienda" className="tnd-back-link">Marketplace</Link>
        <span style={{ color: 'var(--tnd-text-muted)' }}>›</span>
        <span style={{ color: 'var(--tnd-text-muted)' }}>Mis ofertas</span>
      </div>

      <div className="tnd-section-head">
        <div>
          <h1 className="tnd-section-title">Mis ofertas</h1>
          <p className="tnd-offers-subtitle">Seguimiento de tus negociaciones activas con vendedores.</p>
        </div>
        <Link href="/tienda" className="tnd-section-link">Volver al marketplace</Link>
      </div>

      {loading ? (
        <div className="tnd-empty">
          <div className="tnd-empty-icon">⏳</div>
          <div className="tnd-empty-title">Cargando ofertas</div>
          <div className="tnd-empty-sub">Un momento...</div>
        </div>
      ) : offers.length === 0 ? (
        <div className="tnd-empty">
          <div className="tnd-empty-icon">💬</div>
          <div className="tnd-empty-title">Todavía no tenés ofertas activas</div>
          <div className="tnd-empty-sub">Cuando negocies un producto, lo vas a poder retomar desde acá.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {[{ title: 'Esperando tu decisión', rows: grouped.countered }, { title: 'Listas para pagar', rows: grouped.accepted }].map((section) => (
            <section key={section.title}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tnd-text-primary)', margin: '0 0 14px' }}>{section.title}</h2>
              {section.rows.length === 0 ? (
                <div style={{ padding: 18, borderRadius: 16, border: '1px solid var(--tnd-border)', background: 'var(--tnd-surface)', color: 'var(--tnd-text-muted)', fontSize: '0.85rem' }}>
                  No hay ofertas en este estado.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  {section.rows.map((offer) => (
                    <article key={offer.id} className="tnd-my-offer-card">
                      <div className="tnd-my-offer-media">
                        {offer.product_image ? <img src={offer.product_image} alt={offer.product_name || 'Producto'} /> : <span>🛍️</span>}
                      </div>
                      <div className="tnd-my-offer-body">
                        <div className="tnd-my-offer-title">{offer.product_name || 'Producto'}</div>
                        <div className="tnd-my-offer-vendor">{offer.vendor_email?.split('@')[0] || 'Tienda'}</div>
                        {offer.bot_message && <p className="tnd-my-offer-message">{offer.bot_message}</p>}
                        <div className="tnd-my-offer-prices">
                          <span>Precio publicado: {gs(offer.listed_price)}</span>
                          <span>Tu oferta: {gs(offer.buyer_offer)}</span>
                          <strong>{offer.status === 'accepted_pending_payment' ? `Total a pagar: ${gs(offer.final_amount ?? offer.counter_amount)}` : `Contraoferta: ${gs(offer.counter_amount)}`}</strong>
                        </div>
                        <div className="tnd-my-offer-expiry">{offer.expires_at ? `Expira ${new Date(offer.expires_at).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Sin vencimiento'}</div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                          {offer.status === 'countered' ? (
                            <button className="tnd-btn-buy" style={{ marginTop: 0 }} onClick={() => void handleAccept(offer)} disabled={busyId === offer.id}>
                              {busyId === offer.id ? 'Confirmando...' : `Aceptar ${gs(offer.counter_amount)}`}
                            </button>
                          ) : (
                            <button className="tnd-btn-buy" style={{ marginTop: 0 }} onClick={() => handlePay(offer)}>
                              Proceder al pago
                            </button>
                          )}
                          <Link href={`/tienda/producto/${offer.product_id ?? ''}`} className="tnd-my-offer-link">Ver producto</Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}