'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useDriverContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import DriverScreenLayout from '../components/DriverScreenLayout';

function playReturnAlert() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    function beep(t: number, f: number, d: number) {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'square'; osc.frequency.value = f; g.gain.value = 0.9;
      osc.start(t); osc.stop(t + d);
    }
    for (let r = 0; r < 6; r++) {
      const t = ctx.currentTime + r * 0.6;
      beep(t, 880, 0.12); beep(t + 0.15, 1100, 0.12); beep(t + 0.3, 1320, 0.15);
    }
  } catch { /* */ }
}

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
  // Per-order return reason text + which order has the return form open
  const [returnReasonMap, setReturnReasonMap] = useState<Record<string, string>>({});
  const [returnFormId, setReturnFormId] = useState<string | null>(null);
  const prevRejectedIds = useRef<Set<string>>(new Set());

  const fetchFailed = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders?driver_email=${encodeURIComponent(email)}&only_failed=true`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setOrders(data);
          // Play sound when a new return_rejected order arrives
          const rejectedIds = new Set(data.filter(o => o.status === 'return_rejected').map((o: any) => o.id as string));
          const hasNew = [...rejectedIds].some(id => !prevRejectedIds.current.has(id));
          if (hasNew && prevRejectedIds.current.size > 0) playReturnAlert();
          prevRejectedIds.current = rejectedIds;
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    fetchFailed();
    const iv = setInterval(fetchFailed, 5000);
    return () => clearInterval(iv);
  }, [fetchFailed]);

  const handleAction = async (orderId: string, newStatus: 'in_transit' | 'returning' | 'incident_closed', returnReason?: string) => {
    const key = orderId + newStatus;
    setActing(key);
    try {
      const body: Record<string, unknown> = { order_id: orderId, status: newStatus, driver_email: email };
      if (newStatus === 'returning' && returnReason) body.return_reason = returnReason;
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
        setReturnFormId(null);
        setReturnReasonMap(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      }
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
        const incidentKey = order.id + 'incident_closed';
        const isbusy = acting === retryKey || acting === returnKey || acting === incidentKey;
        const isRejected = order.status === 'return_rejected';
        const attempts = Number(order.return_attempts) || 0;
        const maxAttemptsReached = isRejected && attempts >= 3;
        const returnReason = returnReasonMap[order.id] ?? '';
        const showReturnForm = returnFormId === order.id;

        return (
          <div key={order.id} style={{
            background: 'var(--tuki-surface)', borderRadius: 16,
            border: `1.5px solid ${isRejected ? '#f59e0b' : '#ef4444'}`, marginBottom: 16,
            overflow: 'hidden', boxShadow: 'var(--tuki-shadow-md)',
          }}>
            {/* Header */}
            <div style={{
              background: isRejected ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
              borderBottom: `1px solid ${isRejected ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`,
              padding: '0.65rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: isRejected ? '#fde68a' : '#fca5a5', fontWeight: 700, fontSize: '0.82rem' }}>
                {isRejected ? '⚠️ DEVOLUCIÓN RECHAZADA' : '❌ ENTREGA FALLIDA'}
              </span>
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
                  <div style={{ fontSize: '0.82rem', color: '#d1d5db', marginBottom: 8, lineHeight: 1.3 }}>{order.pickup_address}</div>
                  <div style={{ fontSize: '0.82rem', color: '#d1d5db', lineHeight: 1.3 }}>{order.delivery_address}</div>
                </div>
              </div>

              {/* Fail reason */}
              {order.fail_reason && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', borderRadius: 10,
                  padding: '0.5rem 0.7rem', marginBottom: 8,
                  fontSize: '0.82rem', color: '#fca5a5', borderLeft: '3px solid #ef4444',
                }}>
                  <strong>Motivo del fallo:</strong> {order.fail_reason}
                </div>
              )}

              {/* Return reason the driver previously sent */}
              {isRejected && order.return_reason && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)', borderRadius: 10,
                  padding: '0.5rem 0.7rem', marginBottom: 8,
                  fontSize: '0.82rem', color: '#fde68a', borderLeft: '3px solid #f59e0b',
                }}>
                  <strong>Tu solicitud de devolución:</strong> {order.return_reason}
                </div>
              )}

              {/* Client rejection reason */}
              {isRejected && order.return_rejected_reason && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', borderRadius: 10,
                  padding: '0.5rem 0.7rem', marginBottom: 12,
                  fontSize: '0.82rem', color: '#fca5a5', borderLeft: '3px solid #ef4444',
                }}>
                  <strong>Motivo de rechazo del cliente:</strong> {order.return_rejected_reason}
                </div>
              )}

              {/* ── Return reason form ── */}
              {showReturnForm ? (
                <div>
                  <p style={{ color: '#d1d5db', fontSize: '0.85rem', marginBottom: 8, fontWeight: 600 }}>
                    ¿Por qué solicitás la devolución?
                  </p>
                  <textarea
                    value={returnReason}
                    onChange={e => setReturnReasonMap(prev => ({ ...prev, [order.id]: e.target.value }))}
                    placeholder="Ej: Cliente no estaba, dirección incorrecta..."
                    style={{
                      width: '100%', padding: '0.7rem', borderRadius: 12,
                      border: '1.5px solid #374151', background: '#0f172a',
                      color: '#fff', fontSize: '0.85rem', resize: 'none',
                      minHeight: 76, boxSizing: 'border-box', marginBottom: 8,
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setReturnFormId(null)}
                      style={{ flex: 1, padding: '0.75rem', border: '1px solid #374151', borderRadius: 12, background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>
                      ← Atrás
                    </button>
                    <button
                      onClick={() => handleAction(order.id, 'returning', returnReason)}
                      disabled={!returnReason.trim() || isbusy}
                      style={{
                        flex: 2, padding: '0.75rem', border: 'none', borderRadius: 12,
                        cursor: 'pointer', background: '#f59e0b', color: '#111',
                        fontWeight: 800, fontSize: '0.9rem',
                        opacity: (!returnReason.trim() || isbusy) ? 0.5 : 1,
                      }}>
                      {acting === returnKey ? '...' : '📦 Confirmar devolución'}
                    </button>
                  </div>
                </div>
              ) : maxAttemptsReached ? (
                /* ── Incident closure after 3 rejections ── */
                <div>
                  <div style={{
                    background: 'rgba(239,68,68,0.12)', border: '1.5px solid #ef4444', borderRadius: 12,
                    padding: '0.7rem 0.85rem', marginBottom: 12, fontSize: '0.82rem', color: '#fca5a5', lineHeight: 1.45,
                  }}>
                    ⚠️ El cliente rechazó la devolución <strong>3 veces</strong>. Confirmá la incidencia para liberar el pedido y poder recibir nuevas solicitudes.
                  </div>
                  <button
                    onClick={() => handleAction(order.id, 'incident_closed')}
                    disabled={isbusy}
                    style={{
                      width: '100%', padding: '0.8rem', border: 'none', borderRadius: 12,
                      cursor: 'pointer', background: '#ef4444', color: '#fff',
                      fontWeight: 800, fontSize: '0.95rem',
                      opacity: isbusy ? 0.6 : 1,
                    }}>
                    {acting === incidentKey ? '...' : '⚠️ Confirmar incidencia'}
                  </button>
                </div>
              ) : (
                /* ── Main action buttons ── */
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
                    onClick={() => setReturnFormId(order.id)}
                    disabled={isbusy}
                    style={{
                      flex: 1, padding: '0.75rem 0', border: 'none', borderRadius: 12,
                      cursor: 'pointer', background: '#f59e0b', color: '#111',
                      fontWeight: 700, fontSize: '0.88rem',
                    }}>
                    📦 Devolver envío
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </DriverScreenLayout>
  );
}

