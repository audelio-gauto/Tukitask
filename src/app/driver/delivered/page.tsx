'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
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
  returned: 'Devuelto al remitente',
  return_rejected: 'Devolución rechazada',
  cancelled: 'Cancelado',
  failed: 'Entrega fallida',
  incident_closed: 'Incidente cerrado',
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
  const { email, displayName } = useWorkerContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [ratingOrder, setRatingOrder] = useState<any>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [reportModal, setReportModal] = useState<{ orderId: string; clientEmail: string; clientName: string } | null>(null);
  const [chatModal, setChatModal] = useState<{ orderId: string; clientName: string | null; clientPhoto: string | null } | null>(null);
  const searchParams = useSearchParams();

  // Auto-open most recent unread chat when badge redirects here
  useEffect(() => {
    if (!searchParams.get('openChat') || orders.length === 0 || chatModal) return;
    authFetch('/api/chat/threads')
      .then(r => r.json())
      .then((threads: Array<{ order_id: string | null; unread_count: number; last_message_at: string }>) => {
        const target = threads
          .filter(t => t.order_id && t.unread_count > 0)
          .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())[0];
        if (!target) return;
        const order = orders.find(o => o.id === target.order_id);
        if (order) {
          setChatModal({
            orderId: order.id,
            clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente',
            clientPhoto: order.client_photo || null,
          });
        }
      })
      .catch(() => {});
  }, [searchParams, orders, chatModal]);

  const fetchDelivered = useCallback(() => {
    if (!email) return;
    authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}&history=true`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setOrders(data.filter((o: any) => ['delivered', 'commission_charged', 'client_confirmed', 'returned', 'return_rejected', 'cancelled', 'failed', 'incident_closed'].includes(o.status)));
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
        className="tuki-trip-card"
        style={{
          ['--status-color' as never]: statusTone.color,
          ['--status-bg' as never]: statusTone.bg,
          ['--status-border' as never]: statusTone.border,
        }}
      >
        <div className="tuki-trip-top">
          <div className="tuki-trip-meta">
            <span className="tuki-trip-code">#{track}</span>
            <span className="tuki-trip-date">{date}</span>
          </div>
          <span className="tuki-trip-status">{statusLabel}</span>
        </div>

        <div className="tuki-trip-body">
          <div className="tuki-trip-client">
            <div
              className="tuki-trip-avatar"
              style={clientPhoto ? { background: `url(${clientPhoto}) center/cover` } : undefined}
            >
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div className="tuki-trip-client-copy">
              <div className="tuki-trip-client-name">{clientName}</div>
              <StarRow rating={existingRating} />
            </div>
            <div className="tuki-trip-price">
              <div className="tuki-trip-price-value">₲{price}</div>
              <div className="tuki-trip-price-label">total</div>
            </div>
          </div>

          {/* Addresses A → stops → B */}
          {(order.pickup_address || order.delivery_address) && (() => {
            const stops: Array<{ sequence: number; address: string; status: string; fail_reason?: string | null }> =
              Array.isArray(order.order_stops) && order.order_stops.length > 0
                ? [...order.order_stops].sort((a: any, b: any) => a.sequence - b.sequence)
                : [];
            return (
              <div className="tuki-route">
                <div className="tuki-route-row">
                  <div className="tuki-route-rail">
                    <span className="tuki-route-dot is-a" />
                    <span className="tuki-route-line" />
                  </div>
                  <div className="tuki-route-text">
                    <div className="tuki-route-label">Origen</div>
                    <div className="tuki-route-address">{order.pickup_address || '—'}</div>
                  </div>
                </div>
                {stops.map((s, idx) => {
                  const isDelivered = s.status === 'delivered';
                  const isFailed = s.status === 'failed';
                  const stopTone = isDelivered ? 'is-ok' : isFailed ? 'is-fail' : 'is-pending';
                  const icon = isDelivered ? '✓' : isFailed ? '✗' : String(s.sequence);
                  return (
                    <div key={idx} className="tuki-route-row">
                      <div className="tuki-route-rail">
                        <span className={`tuki-route-stop ${stopTone}`}>{icon}</span>
                        <span className="tuki-route-line" />
                      </div>
                      <div className="tuki-route-text">
                        <div className="tuki-route-label">Parada {s.sequence}</div>
                        <div className="tuki-route-address">{s.address}</div>
                        {isFailed && s.fail_reason && (
                          <div className="tuki-route-fail">
                            <Icon name="x" size={12} /> {s.fail_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="tuki-route-row">
                  <div className="tuki-route-rail">
                    <span className="tuki-route-dot is-b" />
                  </div>
                  <div className="tuki-route-text">
                    <div className="tuki-route-label">Destino</div>
                    <div className="tuki-route-address">{order.delivery_address || '—'}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="tuki-trip-actions">
            {chatAvailable && (
              <button
                onClick={() => setChatModal({ orderId: order.id, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente', clientPhoto: order.client_photo || null })}
                className="tuki-btn tuki-btn-info tuki-btn-block"
              >
                <Icon name="chat" size={14} /> Chat con el cliente
              </button>
            )}

            {existingRating == null && !['returned', 'return_rejected', 'cancelled', 'failed'].includes(order.status) && (
              <button
                onClick={() => openRating(order)}
                className="tuki-btn tuki-btn-warning tuki-btn-block"
              >
                <Icon name="star" size={14} /> Calificar cliente
              </button>
            )}
            {order.client_email && (
              <button
                onClick={() => setReportModal({ orderId: order.id, clientEmail: order.client_email, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente' })}
                className="tuki-trip-report"
              >
                <Icon name="exclamation" size={12} /> Reportar cliente
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Historial">
      <div className="tuki-history-summary">
        <div className="tuki-history-stat">
          <div className="tuki-history-stat-value">{deliveredToday.length}</div>
          <div className="tuki-history-stat-label">Hoy</div>
        </div>
        <div className="tuki-history-stat">
          <div className="tuki-history-stat-value">{orders.length}</div>
          <div className="tuki-history-stat-label">Total</div>
        </div>
      </div>

      {loading && <div className="tuki-empty-state">Cargando…</div>}

      {!loading && orders.length === 0 && (
        <div className="tuki-empty-state">
          <div className="tuki-empty-title">Aún no has completado entregas</div>
          <div>Las entregas completadas aparecerán aquí.</div>
        </div>
      )}

      {deliveredToday.length > 0 && (
        <>
          <p className="tuki-list-heading">Hoy ({deliveredToday.length})</p>
          {deliveredToday.map(renderCard)}
        </>
      )}

      {deliveredHistory.length > 0 && (
        <>
          <p className="tuki-list-heading">Anteriores ({deliveredHistory.length})</p>
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
          myName={displayName || null}
          otherName={chatModal.clientName}
          otherPhoto={chatModal.clientPhoto}
        />
      )}
    </DriverScreenLayout>
  );
}
