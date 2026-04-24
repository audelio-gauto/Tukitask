'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import ReportModal from '@/components/ReportModal';
import ChatModal from '@/components/ChatModal';
import { Icon } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';

const RatingModalDynamic = dynamic(() => import('@/components/RatingModal'), { ssr: false });

const STATUS_LABELS: Record<string, string> = {
  delivered: 'Entregado',
  commission_charged: 'Completado',
  client_confirmed: 'Confirmado',
};

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function StarRow({ rating }: { rating: number | null }) {
  if (!rating) return <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>Sin calificación</span>;
  return (
    <span style={{ color: '#f59e0b', fontSize: '0.9rem' }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))} {Number(rating).toFixed(1)}
    </span>
  );
}

export default function DeliveredPage() {
  const { email } = useWorkerContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [ratingOrder, setRatingOrder] = useState<any>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [reportModal, setReportModal] = useState<{ orderId: string; clientEmail: string; clientName: string } | null>(null);
  const [chatModal, setChatModal] = useState<{ orderId: string; clientName: string | null; clientPhoto: string | null } | null>(null);

  const fetchDelivered = useCallback(() => {
    if (!email) return;
    authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}&history=true`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setOrders(data.filter((o: any) => ['delivered', 'commission_charged', 'client_confirmed'].includes(o.status)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => { fetchDelivered(); }, [fetchDelivered]);

  const openRating = (order: any) => {
    setRatingOrder(order);
    setRatingOrderId(order.id);
  };

  const handleSubmitRating = async (rating: number, note: string) => {
    if (!ratingOrderId) return;
    const res = await authFetch('/api/orders/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: ratingOrderId, rated_by: 'driver', rating, note }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setLocalRatings(prev => ({ ...prev, [ratingOrderId]: rating }));
    setRatingOrderId(null);
    setRatingOrder(null);
  };

  const deliveredToday = orders.filter(o => {
    const dateStr = o.completed_at || o.created_at;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const deliveredHistory = orders.filter(o => {
    const dateStr = o.completed_at || o.created_at;
    if (!dateStr) return true;
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() !== now.toDateString();
  });

  const renderCard = (order: any) => {
    const clientName = order.client_name || order.client_email?.split('@')[0] || 'Cliente';
    const clientPhoto = order.client_photo || null;
    const existingRating = order.client_rating ?? localRatings[order.id] ?? null;
    const track = genTrackingCode(order.id);
    const price = Number(order.offer || order.suggested_price || 0).toLocaleString();
    const date = order.completed_at
      ? new Date(order.completed_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : new Date(order.created_at).toLocaleDateString('es-PY');
    const refDate = order.completed_at || order.created_at;
    const chatAvailable = refDate
      ? Date.now() - new Date(refDate).getTime() < 24 * 60 * 60 * 1000
      : false;
    const statusTone = getStatusTone(order.status);
    const statusLabel = STATUS_LABELS[order.status] ?? 'Entregado';

    return (
      <div
        key={order.id}
        className="tuki-card"
        style={{
          marginBottom: 12,
          ['--status-color' as never]: statusTone.color,
          ['--status-bg' as never]: statusTone.bg,
          ['--status-border' as never]: statusTone.border,
          ['--status-outline' as never]: statusTone.border,
        }}
      >
        <div className="tuki-card-header">
          <span className="tuki-card-title">
            <Icon name="check" size={14} color={statusTone.color} />
            {statusLabel} #{track}
          </span>
          <span className="tuki-card-subtitle">{date}</span>
        </div>

        <div className="tuki-card-body">
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              className="tuki-avatar"
              style={{
                background: clientPhoto ? `url(${clientPhoto}) center/cover` : 'linear-gradient(135deg, #F5C518, #F58A07)',
                color: '#1C1C2E',
              }}
            >
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{clientName}</div>
              <StarRow rating={existingRating} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tuki-price">₲{price}</div>
              <div className="tuki-price-label">total</div>
            </div>
          </div>

          {/* Addresses A → stops → B */}
          {(order.pickup_address || order.delivery_address) && (() => {
            const stops: Array<{ sequence: number; address: string; status: string; fail_reason?: string | null }> =
              Array.isArray(order.order_stops) && order.order_stops.length > 0
                ? [...order.order_stops].sort((a: any, b: any) => a.sequence - b.sequence)
                : [];
            const hasStops = stops.length > 0;
            return (
              <div className="tuki-address-box" style={{ marginBottom: 10 }}>
                {/* Pickup A */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: hasStops ? 8 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, gap: 2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#F5C518', display: 'block', flexShrink: 0 }} />
                    <span style={{ width: 2, height: hasStops ? 14 : 18, background: 'var(--border-subtle)', display: 'block' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="tuki-address-label" style={{ color: '#F5C518' }}>A</div>
                    <div className="tuki-address-text">{order.pickup_address || '—'}</div>
                  </div>
                </div>
                {/* Intermediate stops */}
                {stops.map((s, idx) => {
                  const isDelivered = s.status === 'delivered';
                  const isFailed = s.status === 'failed';
                  const dotColor = isDelivered ? '#10b981' : isFailed ? '#ef4444' : '#8b5cf6';
                  const labelColor = isDelivered ? '#6ee7b7' : isFailed ? '#fca5a5' : '#c4b5fd';
                  const icon = isDelivered ? '✓' : isFailed ? '✗' : String(s.sequence);
                  const isLast = idx === stops.length - 1;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: isLast ? 8 : 4 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, gap: 2 }}>
                        <span style={{ width: 16, height: 16, borderRadius: '50%', background: `${dotColor}22`, border: `1.5px solid ${dotColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.5rem', fontWeight: 900, color: dotColor }}>
                          {icon}
                        </span>
                        <span style={{ width: 2, height: 14, background: 'var(--border-subtle)', display: 'block' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: dotColor, textTransform: 'uppercase', letterSpacing: 1 }}>P{s.sequence}</div>
                        <div style={{ fontSize: '0.78rem', color: labelColor, lineHeight: 1.3 }}>{s.address}</div>
                        {isFailed && s.fail_reason && (
                          <div style={{ fontSize: '0.68rem', color: '#f87171', marginTop: 2 }}>
                            <Icon name="x" size={12} /> {s.fail_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Destination B */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', display: 'block', flexShrink: 0 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="tuki-address-label" style={{ color: '#10b981' }}>B</div>
                    <div className="tuki-address-text">{order.delivery_address || '—'}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Chat — solo disponible las primeras 24h */}
          {chatAvailable && (
            <button
              onClick={() => setChatModal({ orderId: order.id, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente', clientPhoto: order.client_photo || null })}
              className="tuki-btn tuki-btn-info tuki-btn-block"
            >
              <Icon name="chat" size={14} /> Chat con el cliente
            </button>
          )}

          {/* Rate button */}
          {existingRating == null && (
            <button
              onClick={() => openRating(order)}
              className="tuki-btn tuki-btn-warning tuki-btn-block"
              style={{ marginTop: chatAvailable ? 8 : 0 }}
            >
              <Icon name="star" size={14} /> Calificar cliente
            </button>
          )}
          {/* Report button */}
          {order.client_email && (
            <button
              onClick={() => setReportModal({ orderId: order.id, clientEmail: order.client_email, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente' })}
              className="tuki-btn tuki-btn-danger tuki-btn-sm"
              style={{ marginTop: 8 }}
            >
              <Icon name="exclamation" size={12} /> Reportar cliente
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Entregados">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Historial de Entregas</h2>

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          <svg style={{ width: 36, height: 36, marginBottom: 8, display: 'inline-block', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
          Cargando...
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="tuki-card">
          <div className="tuki-card-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <Icon name="check" size={36} style={{ opacity: 0.4 }} />
            <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>
              Aún no has completado entregas
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Las entregas completadas aparecerán aquí
            </p>
          </div>
        </div>
      )}

      {deliveredToday.length > 0 && (
        <>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', marginBottom: '0.75rem', fontWeight: 600 }}>
            Hoy ({deliveredToday.length})
          </p>
          {deliveredToday.map(renderCard)}
        </>
      )}

      {deliveredHistory.length > 0 && (
        <>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '1rem 0 0.75rem', fontWeight: 600 }}>
            Anteriores ({deliveredHistory.length})
          </p>
          {deliveredHistory.map(renderCard)}
        </>
      )}

      {ratingOrderId && ratingOrder && (
        <RatingModalDynamic
          title={`Calificar a ${ratingOrder.client_name || ratingOrder.client_email?.split('@')[0] || 'Cliente'}`}
          subtitle="¿Cómo fue tu experiencia con este cliente?"
          avatarUrl={ratingOrder.client_photo || undefined}
          avatarName={ratingOrder.client_name || ratingOrder.client_email?.split('@')[0]}
          onSubmit={handleSubmitRating}
          onClose={() => { setRatingOrderId(null); setRatingOrder(null); }}
        />
      )}

      {reportModal && email && (
        <ReportModal
          reporterEmail={email}
          reporterRole="driver"
          reportedEmail={reportModal.clientEmail}
          reportedRole="cliente"
          reportedName={reportModal.clientName}
          referenceType="order"
          referenceId={reportModal.orderId}
          onClose={() => setReportModal(null)}
        />
      )}

      {chatModal && email && (
        <ChatModal
          open={true}
          onClose={() => setChatModal(null)}
          orderId={chatModal.orderId}
          myEmail={email}
          myName={null}
          otherName={chatModal.clientName}
          otherPhoto={chatModal.clientPhoto}
        />
      )}
    </DriverScreenLayout>
  );
}
