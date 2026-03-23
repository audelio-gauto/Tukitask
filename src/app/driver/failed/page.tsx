'use client';
import { useEffect, useState, useCallback } from 'react';
import { useDriverContext } from '../context';
import DriverScreenLayout from '../components/DriverScreenLayout';

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function FailedPage() {
  const { email } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchFailed = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders?driver_email=${encodeURIComponent(email)}&only_failed=true`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    fetchFailed();
    const iv = setInterval(fetchFailed, 5000);
    return () => clearInterval(iv);
  }, [fetchFailed]);

  const handleAction = async (orderId: string, newStatus: 'in_transit' | 'returning') => {
    const key = orderId + newStatus;
    setActing(key);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus, driver_email: email }),
      });
      if (res.ok) setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch { /* */ }
    setActing(null);
  };

  return (
    <DriverScreenLayout title="Fallidos">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Entregas Fallidas</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Podés reintentar la entrega o devolver el envío al remitente.
      </p>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Cargando...</div>
      )}

      {!loading && orders.length === 0 && (
        <div className="tuki-order-card">
          <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <span style={{ fontSize: '3rem' }}>✅</span>
            <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>Sin entregas fallidas</p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Las entregas fallidas aparecerán aquí
            </p>
          </div>
        </div>
      )}

      {orders.map(order => {
        const price = Number(order.offer || order.suggested_price || 0);
        const retryKey = order.id + 'in_transit';
        const returnKey = order.id + 'returning';
        const isbusy = acting === retryKey || acting === returnKey;

        return (
          <div key={order.id} style={{
            background: 'var(--tuki-surface)', borderRadius: 16,
            border: '1.5px solid #ef4444', marginBottom: 16,
            overflow: 'hidden', boxShadow: 'var(--tuki-shadow-md)',
          }}>
            {/* Header */}
            <div style={{
              background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.2)',
              padding: '0.65rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: '0.82rem' }}>❌ ENTREGA FALLIDA</span>
              <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>#{genTrackingCode(order.id)}</span>
            </div>

            {/* Body */}
            <div style={{ padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                  {VEHICLE_LABELS[order.vehicle_type] || order.vehicle_type}
                </span>
                <span style={{ color: '#c8ff00', fontWeight: 800, fontSize: '1.1rem' }}>
                  ₲{price.toLocaleString()}
                </span>
              </div>

              {/* Route */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                  <div style={{ width: 2, flex: 1, background: '#444', margin: '3px 0', minHeight: 14 }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', color: '#d1d5db', marginBottom: 8, lineHeight: 1.3 }}>
                    {order.pickup_address}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#d1d5db', lineHeight: 1.3 }}>
                    {order.delivery_address}
                  </div>
                </div>
              </div>

              {order.fail_reason && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', borderRadius: 10,
                  padding: '0.5rem 0.7rem', marginBottom: 12,
                  fontSize: '0.82rem', color: '#fca5a5', borderLeft: '3px solid #ef4444',
                }}>
                  <strong>Motivo:</strong> {order.fail_reason}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleAction(order.id, 'in_transit')}
                  disabled={isbusy}
                  style={{
                    flex: 1, padding: '0.75rem 0', border: 'none', borderRadius: 12,
                    cursor: 'pointer', background: '#10b981', color: '#fff',
                    fontWeight: 700, fontSize: '0.88rem', opacity: acting === retryKey ? 0.6 : 1,
                  }}>
                  {acting === retryKey ? '...' : '🔄 Volver a entregar'}
                </button>
                <button
                  onClick={() => handleAction(order.id, 'returning')}
                  disabled={isbusy}
                  style={{
                    flex: 1, padding: '0.75rem 0', border: 'none', borderRadius: 12,
                    cursor: 'pointer', background: '#f59e0b', color: '#111',
                    fontWeight: 700, fontSize: '0.88rem', opacity: acting === returnKey ? 0.6 : 1,
                  }}>
                  {acting === returnKey ? '...' : '📦 Devolver envío'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </DriverScreenLayout>
  );
}

