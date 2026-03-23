'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import ClientScreenLayout from '../components/ClientScreenLayout';
import { useClientContext } from '../context';

const RatingModal = dynamic(() => import('@/components/RatingModal'), { ssr: false });

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Buscando drivers...', color: '#f59e0b', bg: '#fffbeb' },
  negotiating: { label: 'Ofertas recibidas', color: '#6366f1', bg: '#eef2ff' },
  accepted: { label: 'Conductor asignado', color: '#10b981', bg: '#f0fdf4' },
  picking_up: { label: 'En recogida', color: '#f59e0b', bg: '#fffbeb' },
  in_transit: { label: 'En camino', color: '#3b82f6', bg: '#eff6ff' },
  delivered: { label: 'Entregado', color: '#059669', bg: '#ecfdf5' },
  cancelled: { label: 'Cancelado', color: '#ef4444', bg: '#fef2f2' },
  failed: { label: 'Entrega fallida', color: '#ef4444', bg: '#fef2f2' },
  returning: { label: 'Conductor devolviendo', color: '#d97706', bg: '#fffbeb' },
  driver_returning: { label: 'En camino de vuelta', color: '#7c3aed', bg: '#f5f3ff' },
  return_delivered: { label: 'Conductor llegó', color: '#5b21b6', bg: '#f5f3ff' },
  returned: { label: 'Devuelto ✓', color: '#059669', bg: '#ecfdf5' },
  return_rejected: { label: 'Devolución rechazada', color: '#dc2626', bg: '#fef2f2' },
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

/* ── Web Audio notification ── */
let _ac: AudioContext | null = null;
function getAC() {
  if (typeof window === 'undefined') return null;
  if (!_ac || _ac.state === 'closed') _ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}
function tone(f: number, t: number, d: number, v = 0.22) {
  const c = getAC(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v, t + 0.02);
  g.gain.setValueAtTime(v, t + d * 0.7);
  g.gain.linearRampToValueAtTime(0.001, t + d);
  o.start(t); o.stop(t + d);
}
function playOfferAlert() {
  try { const c = getAC(); if (!c) return; const n = c.currentTime;
    for (let g = 0; g < 3; g++) { const t = n + g * 2.3; tone(660, t, 0.15); tone(880, t + 0.25, 0.15); tone(1100, t + 0.55, 0.35); }
  } catch { /* */ }
}
if (typeof window !== 'undefined') {
  const _unlock = () => { const c = getAC(); if (c && c.state === 'suspended') c.resume(); window.removeEventListener('touchstart', _unlock); window.removeEventListener('click', _unlock); };
  window.addEventListener('touchstart', _unlock, { once: true });
  window.addEventListener('click', _unlock, { once: true });
}

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/* ── Timeline steps ── */
const TIMELINE_STEPS = [
  { key: 'created', label: 'Solicitud creada', icon: '📝' },
  { key: 'searching', label: 'Buscando conductor', icon: '🔍' },
  { key: 'accepted', label: 'Conductor asignado', icon: '✅' },
  { key: 'picking_up', label: 'En recogida', icon: '📍' },
  { key: 'in_transit', label: 'En camino', icon: '🚛' },
  { key: 'delivered', label: 'Entregado', icon: '🏁' },
];

function getStepIndex(status: string) {
  const map: Record<string, number> = {
    pending: 1, negotiating: 1, accepted: 2, picking_up: 3, in_transit: 4, delivered: 5,
  };
  return map[status] ?? 0;
}

function statusMessage(status: string) {
  const msgs: Record<string, string> = {
    accepted: 'Se dirige al punto de recogida',
    picking_up: 'Recogiendo tu paquete',
    in_transit: 'En camino a destino',
    delivered: '¡Entregado con éxito!',
  };
  return msgs[status] || '';
}

/* ── Sliding Card Component ── */
function SlidingCard({ order, driverOffer }: { order: any; driverOffer?: DriverOffer | null }) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const dragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    currentY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const diff = startY.current - currentY.current;
    if (diff > 40) setExpanded(true);
    else if (diff < -40) setExpanded(false);
  };

  const stepIdx = getStepIndex(order.status);
  const trackCode = genTrackingCode(order.id);
  const driverName = driverOffer?.driver_name || order.accepted_by?.split('@')[0] || 'Conductor';
  const driverPhoto = driverOffer?.driver_photo || null;

  return (
    <div
      ref={cardRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative', background: '#fff', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)', transition: 'max-height 0.35s ease',
        maxHeight: expanded ? '85vh' : '260px', overflow: 'hidden',
        marginTop: 12, border: '2px solid #10b981',
      }}
    >
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', cursor: 'grab' }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: '#d1d5db' }} />
      </div>

      {/* Driver profile */}
      <div style={{ padding: '0 1rem 0.75rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: driverPhoto ? `url(${driverPhoto}) center/cover` : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: '1.3rem', border: '3px solid #10b981',
        }}>
          {!driverPhoto && driverName[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{driverName}</div>
          <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 1 }}>
            ⭐ 4.8 • {statusMessage(order.status)}
          </div>
        </div>
        {(driverOffer?.driver_email || order.accepted_by) && (
          <a href={`tel:${driverOffer?.driver_email || order.accepted_by}`}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '1.2rem', textDecoration: 'none', flexShrink: 0,
            }}>
            📞
          </a>
        )}
      </div>

      {/* Tracking badge */}
      <div style={{ padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{
          background: '#eef2ff', color: '#6366f1', padding: '4px 12px',
          borderRadius: 99, fontSize: '0.78rem', fontWeight: 700,
        }}>
          #{trackCode}
        </span>
        <span style={{ fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>
          ₲{Number(order.offer || order.suggested_price || 0).toLocaleString()}
        </span>
      </div>

      {/* Addresses */}
      <div style={{ padding: '0 1rem', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
            <div style={{ width: 2, flex: 1, background: '#d1d5db', margin: '3px 0' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>Recogida</div>
            <div style={{ fontSize: '0.85rem', color: '#111827', marginBottom: 10, lineHeight: 1.3 }}>
              {order.pickup_address}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 600 }}>Entrega</div>
            <div style={{ fontSize: '0.85rem', color: '#111827', lineHeight: 1.3 }}>
              {order.delivery_address}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline (visible when expanded) */}
      {expanded && (
        <div style={{ padding: '0.5rem 1rem 1.5rem' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', marginBottom: 12 }}>
            Seguimiento en tiempo real
          </div>
          {TIMELINE_STEPS.map((step, i) => {
            const completed = i <= stepIdx;
            const current = i === stepIdx;
            return (
              <div key={step.key} style={{ display: 'flex', gap: 12, minHeight: i < TIMELINE_STEPS.length - 1 ? 44 : 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.82rem', flexShrink: 0,
                    background: completed ? (current ? '#10b981' : '#d1fae5') : '#f3f4f6',
                    color: completed ? (current ? '#fff' : '#059669') : '#9ca3af',
                    border: current ? '2px solid #059669' : completed ? '2px solid #a7f3d0' : '2px solid #e5e7eb',
                    fontWeight: 700,
                  }}>
                    {completed && !current ? '✓' : step.icon}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: completed ? '#a7f3d0' : '#e5e7eb', margin: '2px 0' }} />
                  )}
                </div>
                <div style={{ paddingTop: 3, flex: 1 }}>
                  <div style={{
                    fontWeight: current ? 700 : 500,
                    fontSize: '0.85rem',
                    color: completed ? '#111827' : '#9ca3af',
                  }}>
                    {step.label}
                  </div>
                  {current && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                      {statusMessage(order.status)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Payment info */}
          {order.payment_method && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 10, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
              <span>💵</span>
              <span style={{ fontWeight: 600, color: '#065f46' }}>Cobro: {order.payment_method}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MisEnviosPage() {
  const { email } = useClientContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Record<string, DriverOffer[]>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptedOffers, setAcceptedOffers] = useState<Record<string, DriverOffer>>({});
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const [ratingOrder, setRatingOrder] = useState<any>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});

  // Return flow state
  const [returningAction, setReturningAction] = useState<string | null>(null);
  const [returnRejectionOrderId, setReturnRejectionOrderId] = useState<string | null>(null);
  const [returnRejectionReason, setReturnRejectionReason] = useState('');

  const prevOfferCount = useRef(0);
  const soundTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Fetch pending offers for negotiating orders
  useEffect(() => {
    const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'negotiating');
    // Clear offers for orders no longer in negotiation (e.g. accepted)
    setOffers(prev => {
      const activeIds = new Set(activeOrders.map(o => o.id));
      const cleaned: Record<string, DriverOffer[]> = {};
      for (const key of Object.keys(prev)) {
        if (activeIds.has(key)) cleaned[key] = prev[key];
      }
      return cleaned;
    });
    if (activeOrders.length === 0) return;
    const fetchAllOffers = () => {
      for (const order of activeOrders) {
        fetch(`/api/orders/offers?order_id=${order.id}`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data))
              setOffers(prev => ({ ...prev, [order.id]: data.filter((o: DriverOffer) => o.status === 'pending') }));
          })
          .catch(() => {});
      }
    };
    fetchAllOffers();
    const interval = setInterval(fetchAllOffers, 6000);
    return () => clearInterval(interval);
  }, [orders]);

  // Fetch accepted offer details for tracking orders (includes return-flow statuses)
  useEffect(() => {
    const trackingOrders = orders.filter(o => ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered'].includes(o.status));
    for (const order of trackingOrders) {
      if (acceptedOffers[order.id]) continue;
      fetch(`/api/orders/offers?order_id=${order.id}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const accepted = data.find((o: DriverOffer) => o.status === 'accepted');
            if (accepted) setAcceptedOffers(prev => ({ ...prev, [order.id]: accepted }));
          }
        })
        .catch(() => {});
    }
  }, [orders, acceptedOffers]);

  const totalPendingOffers = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(offers)) count += offers[key].length;
    return count;
  }, [offers]);

  useEffect(() => {
    if (prevOfferCount.current > 0 || totalPendingOffers > 0) {
      if (totalPendingOffers > prevOfferCount.current) playOfferAlert();
    }
    prevOfferCount.current = totalPendingOffers;
  }, [totalPendingOffers]);

  useEffect(() => {
    if (soundTimer.current) { clearInterval(soundTimer.current); soundTimer.current = null; }
    if (!loading && totalPendingOffers > 0) soundTimer.current = setInterval(playOfferAlert, 6000);
    return () => { if (soundTimer.current) clearInterval(soundTimer.current); };
  }, [loading, totalPendingOffers]);

  const handleAcceptOffer = async (offerId: string) => {
    setAccepting(offerId);
    try {
      const res = await fetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'accept' }),
      });
      if (res.ok) fetchOrders();
    } catch { /* */ }
    setAccepting(null);
  };

  const handleRejectOffer = async (offerId: string) => {
    try {
      await fetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'reject' }),
      });
      setOffers(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) updated[key] = updated[key].filter(o => o.id !== offerId);
        return updated;
      });
    } catch { /* */ }
  };

  const handleSubmitDriverRating = async (rating: number, note: string) => {
    if (!ratingOrderId) return;
    const res = await fetch('/api/orders/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: ratingOrderId, rated_by: 'client', rating, note }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setLocalRatings(prev => ({ ...prev, [ratingOrderId]: rating }));
    setRatingOrderId(null);
    setRatingOrder(null);
  };

  const handleClientReturn = async (orderId: string, newStatus: string, rejectionReason?: string) => {
    const key = orderId + newStatus;
    setReturningAction(key);
    try {
      const body: Record<string, unknown> = { order_id: orderId, status: newStatus, client_email: email };
      if (rejectionReason) body.return_rejected_reason = rejectionReason;
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        fetchOrders();
        setReturnRejectionOrderId(null);
        setReturnRejectionReason('');
      }
    } catch { /* */ }
    setReturningAction(key === returningAction ? null : returningAction);
  };

  const negotiatingOrders = orders.filter(o => o.status === 'pending' || o.status === 'negotiating');
  const trackingOrders = orders.filter(o =>
    ['accepted', 'picking_up', 'in_transit', 'failed', 'returning', 'driver_returning', 'return_delivered', 'return_rejected'].includes(o.status)
  );
  const completedOrders = orders.filter(o =>
    ['delivered', 'cancelled', 'returned'].includes(o.status)
  );

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

      {/* ════════════ TRACKING ORDERS ════════════ */}
      {trackingOrders.map(order => {
        const price = Number(order.offer || order.suggested_price || 0);
        const isReturnFlow = ['failed', 'returning', 'driver_returning', 'return_delivered', 'return_rejected'].includes(order.status);

        if (!isReturnFlow) {
          return (
            <div key={order.id} style={{ marginBottom: 20 }}>
              <div style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', padding: '0.7rem 1rem', fontWeight: 700,
                borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem',
              }}>
                <span>🚚</span> ¡Conductor Asignado!
              </div>
              <SlidingCard order={order} driverOffer={acceptedOffers[order.id] || null} />
            </div>
          );
        }

        // ── Return / failed flow card ──
        const borderColor = order.status === 'failed' ? '#ef4444'
          : order.status === 'returning' ? '#f59e0b'
          : order.status === 'driver_returning' ? '#7c3aed'
          : order.status === 'return_rejected' ? '#dc2626'
          : '#5b21b6';
        const bgColor = order.status === 'failed' ? 'rgba(239,68,68,0.06)'
          : order.status === 'returning' ? 'rgba(245,158,11,0.06)'
          : order.status === 'return_rejected' ? 'rgba(220,38,38,0.06)'
          : 'rgba(99,102,241,0.06)';
        const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
        const isDoingAction = (s: string) => returningAction === order.id + s;

        return (
          <div key={order.id} style={{
            background: '#fff', borderRadius: 16, border: `2px solid ${borderColor}`,
            marginBottom: 20, padding: '1rem', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}>
            {/* Status badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{
                fontSize: '0.78rem', fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                color: statusInfo.color, background: statusInfo.bg,
              }}>
                {statusInfo.label}
              </span>
              <span style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>₲{price.toLocaleString()}</span>
            </div>

            {/* Route */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                <div style={{ width: 1.5, flex: 1, background: '#d1d5db', margin: '2px 0' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              </div>
              <div style={{ flex: 1, fontSize: '0.82rem', color: '#374151', lineHeight: 1.35 }}>
                <div style={{ marginBottom: 6 }}>{order.pickup_address}</div>
                <div>{order.delivery_address}</div>
              </div>
            </div>

            {/* Fail reason */}
            {order.fail_reason && (
              <div style={{ background: bgColor, borderRadius: 8, padding: '0.45rem 0.7rem', marginBottom: 10, fontSize: '0.8rem', color: '#374151', borderLeft: `3px solid ${borderColor}` }}>
                <strong>Motivo:</strong> {order.fail_reason}
              </div>
            )}

            {/* ─ Status: failed ─ just waiting for driver to act */}
            {order.status === 'failed' && (
              <div style={{ background: '#fef2f2', borderRadius: 10, padding: '0.65rem 0.75rem', fontSize: '0.83rem', color: '#dc2626', fontWeight: 600 }}>
                El conductor está revisando la situación...
              </div>
            )}

            {/* ─ Status: returning — client must accept ─ */}
            {order.status === 'returning' && (
              <div>
                {order.return_reason && (
                  <div style={{
                    background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 10,
                    padding: '0.55rem 0.75rem', marginBottom: 10, fontSize: '0.83rem', color: '#92400e',
                  }}>
                    <strong>El conductor dice:</strong> {order.return_reason}
                  </div>
                )}
                <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 10, lineHeight: 1.4 }}>
                  El conductor no pudo completar la entrega y está devolviendo tu envío al remitente.
                  <br /><strong>La tarifa de devolución es: ₲{price.toLocaleString()}</strong>
                </p>
                <button
                  onClick={() => handleClientReturn(order.id, 'driver_returning')}
                  disabled={!!returningAction}
                  style={{
                    width: '100%', padding: '0.75rem', border: 'none', borderRadius: 12,
                    cursor: 'pointer', background: '#f59e0b', color: '#111',
                    fontWeight: 700, fontSize: '0.9rem', opacity: isDoingAction('driver_returning') ? 0.6 : 1,
                  }}>
                  {isDoingAction('driver_returning') ? '...' : '✓ Aceptar devolución'}
                </button>
              </div>
            )}

            {/* ─ Status: return_rejected — waiting for driver to re-request or retry ─ */}
            {order.status === 'return_rejected' && (
              <div>
                {order.return_rejected_reason && (
                  <div style={{
                    background: '#fef2f2', border: '1.5px solid #ef4444', borderRadius: 10,
                    padding: '0.55rem 0.75rem', marginBottom: 10, fontSize: '0.83rem', color: '#991b1b',
                  }}>
                    <strong>Tu motivo de rechazo:</strong> {order.return_rejected_reason}
                  </div>
                )}
                <div style={{ background: '#fef2f2', borderRadius: 10, padding: '0.65rem 0.75rem', fontSize: '0.83rem', color: '#dc2626', fontWeight: 600 }}>
                  El conductor está evaluando tu respuesta y decidirá el próximo paso...
                </div>
              </div>
            )}

            {/* ─ Status: driver_returning — info only ─ */}
            {order.status === 'driver_returning' && (
              <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '0.65rem 0.75rem', fontSize: '0.83rem', color: '#7c3aed', fontWeight: 600 }}>
                🔄 El conductor está en camino de vuelta con tu envío
              </div>
            )}

            {/* ─ Status: return_delivered — client must accept or reject ─ */}
            {order.status === 'return_delivered' && (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 10, fontWeight: 600 }}>
                  📦 El conductor llegó con tu envío. ¿Confirmás la recepción?
                </p>
                {returnRejectionOrderId !== order.id ? (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleClientReturn(order.id, 'returned')}
                      disabled={!!returningAction}
                      style={{
                        flex: 1, padding: '0.75rem', border: 'none', borderRadius: 12,
                        cursor: 'pointer', background: '#10b981', color: '#fff',
                        fontWeight: 700, opacity: isDoingAction('returned') ? 0.6 : 1,
                      }}>
                      {isDoingAction('returned') ? '...' : '✓ Aceptar'}
                    </button>
                    <button
                      onClick={() => setReturnRejectionOrderId(order.id)}
                      disabled={!!returningAction}
                      style={{
                        flex: 1, padding: '0.75rem', border: '1.5px solid #ef4444', borderRadius: 12,
                        cursor: 'pointer', background: '#fff', color: '#ef4444',
                        fontWeight: 700,
                      }}>
                      ✕ Rechazar
                    </button>
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={returnRejectionReason}
                      onChange={e => setReturnRejectionReason(e.target.value)}
                      placeholder="¿Por qué rechazás la devolución?"
                      style={{
                        width: '100%', padding: '0.65rem', borderRadius: 10,
                        border: '1.5px solid #e5e7eb', fontSize: '0.85rem',
                        resize: 'none', minHeight: 72, boxSizing: 'border-box',
                        marginBottom: 8, fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setReturnRejectionOrderId(null)}
                        style={{ flex: 1, padding: '0.65rem', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#6b7280', cursor: 'pointer', fontWeight: 600 }}>
                        Atrás
                      </button>
                      <button
                        onClick={() => handleClientReturn(order.id, 'return_rejected', returnRejectionReason)}
                        disabled={!returnRejectionReason.trim() || !!returningAction}
                        style={{
                          flex: 2, padding: '0.65rem', border: 'none', borderRadius: 10,
                          background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer',
                          opacity: (!returnRejectionReason.trim() || !!returningAction) ? 0.5 : 1,
                        }}>
                        Confirmar rechazo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ════════════ NEGOTIATING ORDERS ════════════ */}
      {negotiatingOrders.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', color: '#111827' }}>
            En proceso
          </h3>
          {negotiatingOrders.map(order => {
            const orderOffers = offers[order.id] || [];
            const isExpanded = expandedOrder === order.id;
            const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;

            return (
              <div key={order.id} style={{
                background: '#fff', borderRadius: 16, marginBottom: 12,
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb',
                overflow: 'hidden'
              }}>
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
                            <div style={{
                              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                              background: driverOffer.driver_photo ? `url(${driverOffer.driver_photo}) center/cover` : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontWeight: 700, fontSize: '1.1rem'
                            }}>
                              {!driverOffer.driver_photo && (driverOffer.driver_name?.[0] || '🚗').toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
                                {driverOffer.driver_name || driverOffer.driver_email.split('@')[0]}
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#6366f1' }}>
                                {Number(driverOffer.amount).toLocaleString()} Gs
                              </div>
                            </div>
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

      {/* ════════════ HISTORY ════════════ */}
      {completedOrders.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', color: '#111827' }}>
            Historial
          </h3>
          {completedOrders.map(order => {
            const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: '#6b7280', bg: '#f3f4f6' };
            const driverName = acceptedOffers[order.id]?.driver_name || order.accepted_by?.split('@')[0];
            const driverPhoto = acceptedOffers[order.id]?.driver_photo || null;
            const existingRating = order.driver_rating ?? localRatings[order.id] ?? null;
            const canRate = order.status === 'delivered' && existingRating == null;

            return (
              <div key={order.id} style={{
                background: '#fff', borderRadius: 14, marginBottom: 10,
                padding: '0.85rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                border: '1px solid #f1f5f9',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
                {(order.pickup_address || order.delivery_address) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
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
                )}

                {/* Driver rating section */}
                {order.status === 'delivered' && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                    {canRate ? (
                      <button
                        onClick={() => { setRatingOrder({ ...order, driver_name: driverName, driver_photo: driverPhoto }); setRatingOrderId(order.id); }}
                        style={{
                          width: '100%', padding: '0.55rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                        }}
                      >
                        ⭐ Calificar Conductor
                      </button>
                    ) : existingRating != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>
                        <span>{'★'.repeat(Math.round(existingRating))}</span>
                        <span>Conductor calificado ({Number(existingRating).toFixed(1)})</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ratingOrderId && ratingOrder && (
        <RatingModal
          title={`Calificar a ${ratingOrder.driver_name || 'Conductor'}`}
          subtitle="¿Cómo fue tu experiencia con el conductor?"
          avatarUrl={ratingOrder.driver_photo || undefined}
          avatarName={ratingOrder.driver_name}
          onSubmit={handleSubmitDriverRating}
          onClose={() => { setRatingOrderId(null); setRatingOrder(null); }}
        />
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </ClientScreenLayout>
  );
}
