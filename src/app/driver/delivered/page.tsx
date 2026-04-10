'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import RatingModal from '@/components/RatingModal';
import ReportModal from '@/components/ReportModal';

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
        background: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.07)', border: '1px solid #f1f5f9',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>✅ Entregado #{track}</span>
          <span style={{ color: '#d1fae5', fontSize: '0.78rem' }}>{date}</span>
        </div>

        {/* Body */}
        <div style={{ padding: '0.85rem 1rem' }}>
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: clientPhoto ? `url(${clientPhoto}) center/cover` : 'linear-gradient(135deg, #F5C518, #F58A07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '1.1rem',
              border: '2px solid #e5e7eb',
            }}>
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>{clientName}</div>
              <StarRow rating={existingRating} />
            </div>
            <div style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>₲{price}</div>
          </div>

          {/* Addresses */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <div style={{ width: 1.5, flex: 1, background: '#d1d5db', margin: '2px 0' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.3, marginBottom: 6 }}>
                {order.pickup_address}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.3 }}>
                {order.delivery_address}
              </div>
            </div>
          </div>

          {/* Rate button */}
          {existingRating == null ? (
            <button
              onClick={() => openRating(order)}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff', fontWeight: 700, fontSize: '0.88rem',
              }}
            >
              ⭐ Calificar Cliente
            </button>
          ) : (
            <div style={{
              textAlign: 'center', padding: '0.5rem', borderRadius: 10,
              background: '#f0fdf4', color: '#059669', fontWeight: 600, fontSize: '0.82rem',
            }}>
              ✓ Cliente calificado
            </div>
          )}
          {/* Report button */}
          {order.client_email && (
            <button
              onClick={() => setReportModal({ orderId: order.id, clientEmail: order.client_email, clientName: order.client_name || order.client_email?.split('@')[0] || 'Cliente' })}
              style={{ marginTop: 8, background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#ef4444', fontSize: '0.75rem', padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}
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
    </DriverScreenLayout>
  );
}
