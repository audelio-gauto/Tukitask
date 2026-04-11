'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import RatingModal from '@/components/RatingModal';
import ReportModal from '@/components/ReportModal';
import ChatModal from '@/components/ChatModal';

const RatingModalDynamic = dynamic(() => import('@/components/RatingModal'), { ssr: false });

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
  const { email } = useDriverContext();
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

    return (
      <div key={order.id} style={{
        background: 'rgba(255,255,255,0.04)', borderRadius: 16, marginBottom: 12, overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.18))',
          borderBottom: '1px solid rgba(16,185,129,0.2)',
          padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.85rem' }}>✅ Entregado #{track}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>{date}</span>
        </div>

        {/* Body */}
        <div style={{ padding: '0.85rem 1rem' }}>
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: clientPhoto ? `url(${clientPhoto}) center/cover` : 'linear-gradient(135deg, #F5C518, #F58A07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1C1C2E', fontWeight: 700, fontSize: '1.1rem',
              border: '2px solid rgba(255,255,255,0.12)',
            }}>
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{clientName}</div>
              <StarRow rating={existingRating} />
            </div>
            <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '1rem' }}>₲{price}</div>
          </div>

          {/* Addresses A → B */}
          {(order.pickup_address || order.delivery_address) && (
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '9px 12px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, gap: 2 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#F5C518', display: 'block', flexShrink: 0 }} />
                  <span style={{ width: 2, height: 18, background: 'rgba(255,255,255,0.15)', display: 'block' }} />
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', display: 'block', flexShrink: 0 }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1 }}>A</div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>{order.pickup_address || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1 }}>B</div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>{order.delivery_address || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Chat 24h */}
          <button
            onClick={() => setChatModal({ orderId: order.id, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente', clientPhoto: order.client_photo || null })}
            style={{ width: '100%', padding: '9px', borderRadius: 10, border: '1px solid rgba(99,180,255,0.3)', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            💬 Chat 24h con el cliente
          </button>

          {/* Rate button */}
          {existingRating == null && (
            <button
              onClick={() => openRating(order)}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #F5C518, #f59e0b)',
                color: '#1C1C2E', fontWeight: 700, fontSize: '0.88rem', marginBottom: 6,
              }}
            >
              ⭐ Calificar Cliente
            </button>
          )}
          {/* Report button */}
          {order.client_email && (
            <button
              onClick={() => setReportModal({ orderId: order.id, clientEmail: order.client_email, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente' })}
              style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'rgba(239,68,68,0.7)', fontSize: '0.75rem', padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}
            >
              🚨 Reportar cliente
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
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
          Cargando...
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="tuki-order-card">
          <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <span style={{ fontSize: '3rem' }}>✅</span>
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
