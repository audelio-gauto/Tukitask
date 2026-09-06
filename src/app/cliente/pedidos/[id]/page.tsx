'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import OrderStatusTimeline from '@/components/OrderStatusTimeline';
import RatingModal from '@/components/RatingModal';

interface OrderDetail {
  id: string;
  status: string;
  vendor_email: string;
  vendor_id?: string | null;
  client_name: string | null;
  items: Array<{ productId: string; name: string; price: number; qty: number; image?: string | null }>;
  total: number;
  shipping_price?: number | null;
  address?: string | null;
  payment_method?: string | null;
  payment_proof_url?: string | null;
  negotiated?: boolean;
  notes?: string | null;
  billing?: { name?: string; email?: string; phone?: string; cedula?: string; wants_invoice?: boolean } | null;
  delivery: { ciudad?: string; barrio?: string; referencia?: string; nombre?: string } | null;
  created_at: string;
  cancelled_at?: string | null;
  store_name?: string | null;
  store_logo?: string | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:            { label: 'En espera',  color: '#F5C518' },
  preparing:          { label: 'Preparando', color: '#60a5fa' },
  ready:              { label: 'Listo',      color: '#F5C518' },
  in_transit:         { label: 'En camino',  color: '#a78bfa' },
  delivered:          { label: 'Entregado',  color: '#4ade80' },
  commission_charged: { label: 'Completado', color: '#4ade80' },
  cancelled:          { label: 'Cancelado',  color: '#f87171' },
};

const RATEABLE_STATUSES = ['delivered', 'commission_charged'];

export default function PedidoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params?.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [ratingTarget, setRatingTarget] = useState<{ productId: string; name: string; image?: string | null } | null>(null);
  const [ratingSaved, setRatingSaved] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await authFetch(`/api/tienda/mis-pedidos/${orderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el pedido');
      setOrder(data);

      const items: OrderDetail['items'] = Array.isArray(data.items) ? data.items : [];
      if (RATEABLE_STATUSES.includes(data.status) && items.length > 0) {
        const ids = Array.from(new Set(items.map(it => it.productId).filter(Boolean)));
        if (ids.length > 0) {
          try {
            const revRes = await authFetch(`/api/tienda/reviews?mine=true&product_ids=${ids.join(',')}`);
            const revData = await revRes.json();
            if (Array.isArray(revData.reviewed)) setReviewedIds(new Set(revData.reviewed));
          } catch { /* non-blocking */ }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const handleRatingSubmit = async (rating: number, note: string) => {
    if (!ratingTarget) return;
    const res = await authFetch('/api/tienda/reviews', {
      method: 'POST',
      body: JSON.stringify({ product_id: ratingTarget.productId, rating, comment: note.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al guardar');
    setRatingSaved(prev => new Set(prev).add(ratingTarget.productId));
    setRatingTarget(null);
  };

  const fmtGs = (n: number | null | undefined) => `${Number(n || 0).toLocaleString('es-PY')} Gs`;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div style={{
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(245,197,24,0.15)',
        padding: 'max(16px, env(safe-area-inset-top)) 16px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
          aria-label="Volver"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            Pedido {order ? `#${order.id.slice(0, 8).toUpperCase()}` : ''}
          </h1>
        </div>
      </div>

      <div style={{ flex: 1, padding: '14px 14px 8px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-muted)' }}>Cargando…</div>
        ) : errorMsg || !order ? (
          <div className="client-empty">
            <div className="client-empty-icon">⚠️</div>
            <p className="client-empty-text">{errorMsg || 'Pedido no encontrado'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Status + timeline */}
            <div className="tuki-card">
              <div className="tuki-card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{fmtDate(order.created_at)}</span>
                  {(() => {
                    const badge = STATUS_BADGE[order.status] ?? { label: order.status, color: 'var(--text-muted)' };
                    return (
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: badge.color, background: `${badge.color}22`, padding: '2px 8px', borderRadius: 20 }}>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
                <OrderStatusTimeline status={order.status} />
              </div>
            </div>

            {/* Store */}
            <div className="tuki-card">
              <div className="tuki-card-body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--ghost-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {order.store_logo
                    ? <img src={order.store_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (order.store_name || order.vendor_email).charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {order.store_name || order.vendor_email.split('@')[0]}
                </span>
                {order.negotiated && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 700, color: '#F5C518', background: 'rgba(245,197,24,0.15)', padding: '2px 8px', borderRadius: 20 }}>
                    Precio negociado
                  </span>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="tuki-card">
              <div className="tuki-card-body">
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Productos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(Array.isArray(order.items) ? order.items : []).map((it, i) => {
                    const canRate = RATEABLE_STATUSES.includes(order.status);
                    const alreadyRated = reviewedIds.has(it.productId) || ratingSaved.has(it.productId);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 8, background: 'var(--ghost-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {it.image
                            ? <img src={it.image} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: '1.1rem' }}>📦</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{it.qty} × {fmtGs(it.price)}</div>
                        </div>
                        {canRate && (
                          alreadyRated ? (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4ade80' }}>✓ Calificado</span>
                          ) : (
                            <button
                              onClick={() => setRatingTarget({ productId: it.productId, name: it.name, image: it.image })}
                              className="tuki-btn tuki-btn-warning"
                              style={{ fontSize: '0.7rem', padding: '5px 10px', flexShrink: 0 }}
                            >
                              Calificar
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Delivery / address */}
            {(order.address || order.delivery?.ciudad) && (
              <div className="tuki-card">
                <div className="tuki-card-body">
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entrega</div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                    📍 {[order.delivery?.barrio, order.delivery?.ciudad].filter(Boolean).join(', ') || order.address}
                  </div>
                  {order.delivery?.referencia && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>Referencia: {order.delivery.referencia}</div>
                  )}
                </div>
              </div>
            )}

            {/* Payment */}
            <div className="tuki-card">
              <div className="tuki-card-body">
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pago</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                  {order.payment_method === 'contra_entrega' ? '💵 Contra entrega' : '🏦 Transferencia bancaria'}
                </div>
                {order.payment_proof_url && (
                  <a href={order.payment_proof_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                    <img src={order.payment_proof_url} alt="Comprobante" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-subtle)' }} />
                  </a>
                )}
              </div>
            </div>

            {/* Totals */}
            <div className="tuki-card">
              <div className="tuki-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Subtotal</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                      {fmtGs((Array.isArray(order.items) ? order.items : []).reduce((sum, it) => sum + it.price * it.qty, 0))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Envío</span>
                    <span style={{ fontSize: '0.78rem', color: !order.shipping_price ? '#4ade80' : 'var(--text-primary)' }}>
                      {!order.shipping_price ? 'Gratis' : fmtGs(order.shipping_price)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(245,197,24,0.12)', paddingTop: 6, marginTop: 2 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>Total</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#F5C518' }}>{fmtGs(order.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {order.notes && (
              <div className="tuki-card">
                <div className="tuki-card-body">
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notas</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{order.notes}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {ratingTarget && (
        <RatingModal
          title={`Califica: ${ratingTarget.name}`}
          subtitle="¿Qué te pareció este producto?"
          avatarUrl={ratingTarget.image || undefined}
          avatarName={ratingTarget.name}
          onSubmit={handleRatingSubmit}
          onClose={() => setRatingTarget(null)}
        />
      )}
    </div>
  );
}
