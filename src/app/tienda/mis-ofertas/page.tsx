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
  message_count: number;
};

type MessageRow = {
  id: string;
  sender_role: 'buyer' | 'vendor' | 'system';
  sender_name: string | null;
  message: string;
  created_at: string;
};

const gs = (n?: number | null) => `Gs. ${(n ?? 0).toLocaleString('es-PY')}`;

export default function MisOfertasMarketplacePage() {
  const router = useRouter();
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [acceptedInline, setAcceptedInline] = useState<Record<string, true>>({});

  // Chat modal state
  const [chatOffer, setChatOffer] = useState<OfferRow | null>(null);
  const [chatMessages, setChatMessages] = useState<MessageRow[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  async function loadOffers() {
    setLoading(true);
    try {
      const res = await authFetch('/api/tukibot/negotiations?role=buyer&status=all&limit=50');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar tus ofertas');
      const now = Date.now();
      setOffers((data.items ?? []).filter((o: OfferRow) => !o.expires_at || new Date(o.expires_at).getTime() > now));
      setAcceptedInline({});
    } finally {
      setLoading(false);
    }
  }

  function expiryLabel(expiresAt: string | null): string {
    if (!expiresAt) return '⏳ Expira en 48h';
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    if (msLeft <= 0) return '⏰ Expirada';
    const hLeft = Math.floor(msLeft / 3600000);
    const mLeft = Math.floor((msLeft % 3600000) / 60000);
    return hLeft > 0 ? `⏳ Expira en ${hLeft}h ${mLeft}m` : `⏳ Expira en ${mLeft}m`;
  }

  useEffect(() => {
    void loadOffers();
  }, []);

  const grouped = useMemo(() => ({
    // Keep just-accepted offers visible in-place so payment CTA appears immediately.
    countered: offers.filter((offer) => offer.status === 'countered' || Boolean(acceptedInline[offer.id])),
    accepted: offers.filter((offer) => offer.status === 'accepted_pending_payment' && !acceptedInline[offer.id]),
  }), [offers, acceptedInline]);

  async function handleAccept(offer: OfferRow) {
    setBusyId(offer.id);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${offer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept_counter' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo aceptar la oferta');
      const finalAmount = Number(data.finalAmount ?? offer.counter_amount ?? offer.buyer_offer);
      setOffers((prev) => prev.map((o) => o.id === offer.id
        ? { ...o, status: 'accepted_pending_payment', final_amount: finalAmount }
        : o,
      ));
      setAcceptedInline((prev) => ({ ...prev, [offer.id]: true }));
    } finally {
      setBusyId(null);
    }
  }

  function handlePay(offer: OfferRow) {
    if (!offer.product_id) return;
    const finalPrice = offer.final_amount ?? offer.counter_amount ?? offer.buyer_offer;
    router.push(`/tienda/checkout?product=${offer.product_id}&qty=${offer.quantity}&name=${encodeURIComponent(offer.product_name || '')}&vendor=${encodeURIComponent(offer.vendor_email || '')}&vid=${offer.vendor_id}&price=${finalPrice}&negotiationId=${offer.id}`);
  }

  async function openChat(offer: OfferRow) {
    setChatOffer(offer);
    setOffers((prev) => prev.map((o) => o.id === offer.id ? { ...o, message_count: 0 } : o));
    setChatMessages([]);
    setChatDraft('');
    setChatLoading(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${offer.id}/messages`);
      const data = await res.json();
      if (res.ok) setChatMessages(data.items ?? []);
    } finally {
      setChatLoading(false);
    }
  }

  async function sendChatMessage() {
    if (!chatOffer || !chatDraft.trim()) return;
    setChatSending(true);
    try {
      const res = await authFetch(`/api/tukibot/negotiations/${chatOffer.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: chatDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el mensaje');
      setChatDraft('');
      // reload messages and update count in offers list
      const msgRes = await authFetch(`/api/tukibot/negotiations/${chatOffer.id}/messages`);
      const msgData = await msgRes.json();
      if (msgRes.ok) {
        setChatMessages(msgData.items ?? []);
        setOffers((prev) => prev.map((o) => o.id === chatOffer.id ? { ...o, message_count: 0 } : o));
      }
    } finally {
      setChatSending(false);
    }
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
                        {/* Chat button — always visible; shows count badge when there are messages */}
                        <button
                          onClick={() => void openChat(offer)}
                          title={offer.message_count > 0 ? `${offer.message_count} mensaje(s) — tocar para responder` : 'Abrir chat con el vendedor'}
                          style={{ position: 'absolute', bottom: 8, right: 8, width: 36, height: 36, borderRadius: 999, background: offer.message_count > 0 ? '#F5C518' : 'rgba(0,0,0,0.45)', color: offer.message_count > 0 ? '#1C1C2E' : '#fff', fontSize: offer.message_count > 0 ? '0.78rem' : '1rem', fontWeight: 900, border: offer.message_count > 0 ? '2px solid #fff' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.22)', zIndex: 2, backdropFilter: offer.message_count > 0 ? 'none' : 'blur(2px)' }}
                        >
                          {offer.message_count > 0 ? offer.message_count : '💬'}
                        </button>
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
                        <div className="tnd-my-offer-expiry">{expiryLabel(offer.expires_at)}</div>
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

      {/* Chat modal */}
      {chatOffer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setChatOffer(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 0 0' }}
        >
          <div style={{ width: '100%', maxWidth: 540, background: 'var(--tnd-surface, #fff)', borderRadius: '24px 24px 0 0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '85dvh', boxShadow: '0 -4px 32px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--tnd-text-primary, #111)' }}>Chat — {chatOffer.product_name || 'Negociación'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted, #888)', marginTop: 2 }}>{chatOffer.vendor_email?.split('@')[0] || 'Vendedor'}</div>
              </div>
              <button onClick={() => setChatOffer(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--tnd-text-muted, #888)', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 180, maxHeight: 360 }}>
              {chatLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--tnd-text-muted, #888)', fontSize: '0.85rem', marginTop: 24 }}>Cargando mensajes...</p>
              ) : chatMessages.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--tnd-text-muted, #888)', fontSize: '0.85rem', marginTop: 24 }}>Todavía no hay mensajes. ¡Escribí el primero!</p>
              ) : chatMessages.map((msg) => {
                const isMine = msg.sender_role === 'buyer';
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '78%', padding: '9px 14px', borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isMine ? '#F5C518' : 'var(--tnd-surface-2, #f3f4f6)', color: isMine ? '#1C1C2E' : 'var(--tnd-text-primary, #111)', fontSize: '0.88rem', fontWeight: 500 }}>
                      {msg.message}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--tnd-text-muted, #aaa)', marginTop: 3 }}>
                      {msg.sender_name || (isMine ? 'Vos' : 'Vendedor')} · {new Date(msg.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChatMessage(); } }}
                placeholder="Escribí tu mensaje..."
                style={{ flex: 1, height: 46, borderRadius: 14, border: '1.5px solid var(--tnd-border, #e5e7eb)', background: 'var(--tnd-bg, #f9fafb)', color: 'var(--tnd-text-primary, #111)', padding: '0 14px', fontSize: '0.9rem' }}
              />
              <button
                onClick={() => void sendChatMessage()}
                disabled={chatSending || !chatDraft.trim()}
                style={{ height: 46, paddingInline: 20, borderRadius: 14, background: '#F5C518', color: '#1C1C2E', fontWeight: 800, border: 'none', cursor: 'pointer', opacity: chatSending || !chatDraft.trim() ? 0.5 : 1 }}
              >
                {chatSending ? '...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}