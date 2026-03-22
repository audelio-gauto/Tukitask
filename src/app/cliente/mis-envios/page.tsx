'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import ClientScreenLayout from '../components/ClientScreenLayout';
import { useClientContext } from '../context';

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Buscando drivers...', color: '#f59e0b', bg: '#fffbeb' },
  negotiating: { label: 'Ofertas recibidas', color: '#6366f1', bg: '#eef2ff' },
  accepted: { label: 'Aceptado', color: '#10b981', bg: '#f0fdf4' },
  in_transit: { label: 'En camino', color: '#3b82f6', bg: '#eff6ff' },
  delivered: { label: 'Entregado', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: 'Cancelado', color: '#ef4444', bg: '#fef2f2' },
};

interface DriverOffer {
  id: string;
  driver_email: string;
  driver_name: string | null;
  driver_photo: string | null;
  amount: number;
  status: string;
  created_at: string;
}

export default function MisEnviosPage() {
  const { email } = useClientContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Record<string, DriverOffer[]>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const fetchOrders = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders?client_email=${encodeURIComponent(email)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Fetch offers for orders that are pending/negotiating
  useEffect(() => {
    const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'negotiating');
    if (activeOrders.length === 0) return;

    const fetchAllOffers = () => {
      for (const order of activeOrders) {
        fetch(`/api/orders/offers?order_id=${order.id}`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setOffers(prev => ({ ...prev, [order.id]: data.filter((o: DriverOffer) => o.status === 'pending') }));
            }
          })
          .catch(() => {});
      }
    };

    fetchAllOffers();
    const interval = setInterval(fetchAllOffers, 6000);
    return () => clearInterval(interval);
  }, [orders]);

  const handleAcceptOffer = async (offerId: string) => {
    setAccepting(offerId);
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'accept' }),
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch { /* noop */ }
    setAccepting(null);
  };

  const handleRejectOffer = async (offerId: string) => {
    try {
      await fetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'reject' }),
      });
      // Remove from local state
      setOffers(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].filter(o => o.id !== offerId);
        }
        return updated;
      });
    } catch { /* noop */ }
  };

  const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'negotiating');
  const completedOrders = orders.filter(o => o.status !== 'pending' && o.status !== 'negotiating');

  return (
    <ClientScreenLayout title="Mis Envíos">
      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>}

      {!loading && orders.length === 0 && (
        <div className="client-empty">
          <div className="client-empty-icon">📦</div>
          <p className="client-empty-text">No tienes envíos</p>
          <p className="client-empty-sub">Cuando solicites un envío, aparecerá aquí</p>
          <Link href="/cliente/enviar" className="client-btn client-btn-success" style={{ marginTop: '1.5rem' }}>
            Enviar Paquete
          </Link>
        </div>
      )}

      {/* Active orders with negotiation */}
      {activeOrders.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', color: '#111827' }}>
            En proceso
          </h3>
          {activeOrders.map(order => {
            const orderOffers = offers[order.id] || [];
            const isExpanded = expandedOrder === order.id;
            const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;

            return (
              <div key={order.id} style={{
                background: '#fff', borderRadius: 16, marginBottom: 12,
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb',
                overflow: 'hidden'
              }}>
                {/* Order summary - tap to expand */}
                <button
                  style={{
                    width: '100%', padding: '1rem', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6
                  }}
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {VEHICLE_LABELS[order.vehicle_type] || order.vehicle_type}
                    </span>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px',
                      borderRadius: 99, color: statusInfo.color, background: statusInfo.bg
                    }}>
                      {statusInfo.label}
                      {orderOffers.length > 0 && ` (${orderOffers.length})`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                    📍 {order.pickup_address?.slice(0, 40)}...
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#374151' }}>
                    📍 {order.delivery_address?.slice(0, 40)}...
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 4 }}>
                    <span style={{ fontWeight: 700, color: '#059669' }}>
                      {Number(order.offer || order.suggested_price || 0).toLocaleString()} Gs
                    </span>
                    <svg width="16" height="16" fill="none" stroke="#9ca3af" viewBox="0 0 24 24"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded: show driver offers */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '0.75rem 1rem 1rem' }}>
                    {orderOffers.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
                        <p style={{ color: '#6b7280', fontSize: '0.88rem', fontWeight: 500 }}>
                          Buscando drivers cercanos...
                        </p>
                        <p style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: 4 }}>
                          Las ofertas aparecerán aquí automáticamente
                        </p>
                        <div style={{
                          width: 40, height: 40, border: '3px solid #6366f1', borderTopColor: 'transparent',
                          borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '1rem auto 0'
                        }} />
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: 8, fontWeight: 500 }}>
                          {orderOffers.length} {orderOffers.length === 1 ? 'oferta recibida' : 'ofertas recibidas'}
                        </p>
                        {orderOffers.map(driverOffer => (
                          <div key={driverOffer.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem',
                            background: '#f9fafb', borderRadius: 12, marginBottom: 8, border: '1px solid #e5e7eb'
                          }}>
                            {/* Driver avatar */}
                            <div style={{
                              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                              background: driverOffer.driver_photo ? `url(${driverOffer.driver_photo}) center/cover` : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontWeight: 700, fontSize: '1.1rem'
                            }}>
                              {!driverOffer.driver_photo && (driverOffer.driver_name?.[0] || '🚗').toUpperCase()}
                            </div>

                            {/* Driver info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
                                {driverOffer.driver_name || driverOffer.driver_email.split('@')[0]}
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#6366f1' }}>
                                {Number(driverOffer.amount).toLocaleString()} Gs
                              </div>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => handleRejectOffer(driverOffer.id)}
                                style={{
                                  width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #fca5a5',
                                  background: '#fff', cursor: 'pointer', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center', color: '#ef4444'
                                }}
                                aria-label="Rechazar"
                              >
                                ✕
                              </button>
                              <button
                                onClick={() => handleAcceptOffer(driverOffer.id)}
                                disabled={accepting === driverOffer.id}
                                style={{
                                  padding: '0 16px', height: 36, borderRadius: 18, border: 'none',
                                  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                                  fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                  opacity: accepting === driverOffer.id ? 0.6 : 1
                                }}
                              >
                                {accepting === driverOffer.id ? '...' : 'Aceptar'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed/past orders */}
      {completedOrders.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', color: '#111827' }}>
            Historial
          </h3>
          {completedOrders.map(order => {
            const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: '#6b7280', bg: '#f3f4f6' };
            return (
              <div key={order.id} style={{
                background: '#fff', borderRadius: 14, marginBottom: 10,
                padding: '0.85rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {VEHICLE_LABELS[order.vehicle_type] || order.vehicle_type}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 2 }}>
                    {new Date(order.created_at).toLocaleDateString('es-PY')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#059669' }}>
                    {Number(order.offer || order.suggested_price || 0).toLocaleString()} Gs
                  </div>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px',
                    borderRadius: 99, color: statusInfo.color, background: statusInfo.bg
                  }}>
                    {statusInfo.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </ClientScreenLayout>
  );
}
