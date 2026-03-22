'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext, VEHICLE_TO_FILTER } from '../context';

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

export default function DeliveriesPage() {
  const { serviceFilters, email, displayName, profilePhoto } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerAmounts, setOfferAmounts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sentOffers, setSentOffers] = useState<Record<string, number>>({});

  // Fetch orders — polling every 8 seconds
  const fetchOrders = useCallback(() => {
    fetch('/api/orders')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 8000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Also fetch my existing offers to show "Ya ofertaste"
  useEffect(() => {
    if (!email) return;
    fetch(`/api/orders/offers?driver_email=${encodeURIComponent(email)}`)
      .then(res => res.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, number> = {};
        for (const o of data) {
          if (o.status === 'pending' && o.order_id) {
            map[o.order_id] = Number(o.amount);
          }
        }
        setSentOffers(map);
      })
      .catch(() => {});
  }, [email]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const filterKey = VEHICLE_TO_FILTER[o.vehicle_type];
      if (!filterKey) return true;
      return serviceFilters[filterKey] === true;
    });
  }, [orders, serviceFilters]);

  const handleSendOffer = async (orderId: string) => {
    const amount = offerAmounts[orderId];
    if (!amount || Number(amount) <= 0) return;
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          driver_email: email,
          driver_name: displayName,
          driver_photo: profilePhoto,
          amount: Number(amount),
        }),
      });
      if (res.ok) {
        setSentOffers(s => ({ ...s, [orderId]: Number(amount) }));
        setOfferAmounts(o => ({ ...o, [orderId]: '' }));
      }
    } catch { /* noop */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleAcceptPrice = async (orderId: string, clientOffer: number) => {
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          driver_email: email,
          driver_name: displayName,
          driver_photo: profilePhoto,
          amount: clientOffer,
        }),
      });
      if (res.ok) {
        setSentOffers(s => ({ ...s, [orderId]: clientOffer }));
      }
    } catch { /* noop */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  return (
    <DriverScreenLayout title="Envíos">
      <h2 className="tuki-heading" style={{ marginTop: '1rem' }}>Solicitudes de Envío</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Enviá tu oferta al cliente. El cliente elegirá entre las ofertas recibidas.
      </p>

      {loading && <div style={{ padding: 32, textAlign: 'center' }}>Cargando...</div>}
      {!loading && filteredOrders.length === 0 && (
        <div className="tuki-order-card">
          <div className="tuki-order-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <span style={{ fontSize: '3rem' }}>📦</span>
            <p style={{ color: '#6b7280', marginTop: '1rem', fontWeight: 500 }}>No hay envíos pendientes</p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Las nuevas solicitudes aparecerán aquí según tus filtros
            </p>
          </div>
        </div>
      )}

      {filteredOrders.map(req => {
        const alreadyOffered = sentOffers[req.id];
        const isSending = sending[req.id];
        return (
          <div key={req.id} className="tuki-order-card" style={{ marginBottom: 16 }}>
            {/* Header with vehicle badge */}
            <div className="tuki-order-header" style={{ padding: '0.75rem 1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                {new Date(req.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="tuki-order-body" style={{ padding: '1rem' }}>
              {/* Route */}
              <div className="tuki-route-line" style={{ marginBottom: 12 }}>
                <div className="tuki-route-point pickup">
                  <div className="tuki-route-meta">Recoger</div>
                  <div className="tuki-route-address">{req.pickup_address}</div>
                </div>
                <div className="tuki-route-point delivery">
                  <div className="tuki-route-meta">Entregar</div>
                  <div className="tuki-route-address">{req.delivery_address}</div>
                </div>
              </div>

              {req.instructions && (
                <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: 8, marginBottom: 12, fontSize: '0.85rem', color: '#6366f1' }}>
                  📝 {req.instructions}
                </div>
              )}

              {/* Prices */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 10, padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Precio sugerido</div>
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: '1.05rem' }}>
                    {Number(req.suggested_price || 0).toLocaleString()} Gs
                  </div>
                </div>
                <div style={{ flex: 1, background: '#fffbeb', borderRadius: 10, padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 2 }}>Oferta cliente</div>
                  <div style={{ fontWeight: 700, color: '#d97706', fontSize: '1.05rem' }}>
                    {Number(req.offer || 0).toLocaleString()} Gs
                  </div>
                </div>
              </div>

              {/* Already offered indicator */}
              {alreadyOffered ? (
                <div style={{ background: '#eef2ff', borderRadius: 12, padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6366f1', marginBottom: 2 }}>Tu oferta enviada</div>
                  <div style={{ fontWeight: 800, color: '#4f46e5', fontSize: '1.2rem' }}>
                    {alreadyOffered.toLocaleString()} Gs
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>
                    Esperando respuesta del cliente...
                  </div>
                </div>
              ) : (
                <div>
                  {/* Accept at client's price */}
                  <button
                    className="tuki-btn tuki-btn-success"
                    style={{ marginBottom: 8 }}
                    onClick={() => handleAcceptPrice(req.id, Number(req.offer || req.suggested_price))}
                    disabled={isSending}
                  >
                    {isSending ? 'Enviando...' : `Aceptar por ${Number(req.offer || req.suggested_price || 0).toLocaleString()} Gs`}
                  </button>

                  {/* Counter-offer */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="number"
                        className="tuki-form-input"
                        placeholder="Tu contraoferta"
                        value={offerAmounts[req.id] || ''}
                        onChange={e => setOfferAmounts(o => ({ ...o, [req.id]: e.target.value }))}
                        min="0"
                        style={{ paddingRight: '2rem' }}
                      />
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.82rem' }}>Gs</span>
                    </div>
                    <button
                      className="tuki-btn tuki-btn-primary"
                      style={{ width: 'auto', padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}
                      onClick={() => handleSendOffer(req.id)}
                      disabled={isSending || !offerAmounts[req.id]}
                    >
                      Ofertar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </DriverScreenLayout>
  );
}
