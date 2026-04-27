'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useWorkerContext } from '../context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { Icon } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';

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
  moto: 'Moto Envios',
  auto: 'Auto Envios',
  motocarro: 'Moto Carro Fletes',
  camion2t: 'Camion Fletes',
};

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function FailedPage() {
  const { email } = useWorkerContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  // Per-order return reason text + which order has the return form open
  const [returnReasonMap, setReturnReasonMap] = useState<Record<string, string>>({});
  const [returnFormId, setReturnFormId] = useState<string | null>(null);
  const prevRejectedIds = useRef<Set<string>>(new Set());

  const fetchFailed = useCallback(() => {
    if (!email) return;
    authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}&only_failed=true`)
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
    // Fallback polling at 60s; realtime is primary
    const iv = setInterval(fetchFailed, 60_000);

    // Realtime: order status changes (return_rejected, failed, etc.)
    const ch = email
      ? supabase.channel(`driver-failed-${email}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `accepted_by=eq.${email}`,
          } as never, () => fetchFailed())
          .subscribe()
      : null;

    return () => {
      clearInterval(iv);
      if (ch) supabase.removeChannel(ch);
    };
  }, [fetchFailed, email]);

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
        <div className="tuki-card">
          <div className="tuki-card-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <Icon name="check" size={36} style={{ opacity: 0.4 }} />
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
        const statusTone = getStatusTone(order.status);
        const statusLabel = isRejected ? 'Devolucion rechazada' : 'Entrega fallida';

        return (
          <div
            key={order.id}
            className="tuki-card"
            style={{
              marginBottom: 16,
              ['--status-color' as never]: statusTone.color,
              ['--status-bg' as never]: statusTone.bg,
              ['--status-border' as never]: statusTone.border,
              ['--status-outline' as never]: statusTone.border,
            }}
          >
            <div className="tuki-card-header">
              <span className="tuki-card-title">
                <Icon name={isRejected ? 'refresh' : 'exclamation'} size={14} color={statusTone.color} />
                {statusLabel}
              </span>
              <span className="tuki-card-subtitle">#{genTrackingCode(order.id)}</span>
            </div>

            <div className="tuki-card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                  {VEHICLE_LABELS[order.vehicle_type] || order.vehicle_type}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <div className="tuki-price">₲{price.toLocaleString()}</div>
                  <div className="tuki-price-label">total</div>
                </div>
              </div>

              {/* Route */}
              <div className="tuki-address-box" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                    <div style={{ width: 2, flex: 1, background: 'var(--border-subtle)', margin: '3px 0', minHeight: 14 }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="tuki-address-text" style={{ marginBottom: 8 }}>{order.pickup_address}</div>
                    <div className="tuki-address-text">{order.delivery_address}</div>
                  </div>
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
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 8, fontWeight: 600 }}>
                    ¿Por qué solicitás la devolución?
                  </p>
                  <textarea
                    value={returnReason}
                    onChange={e => setReturnReasonMap(prev => ({ ...prev, [order.id]: e.target.value }))}
                    placeholder="Ej: Cliente no estaba, dirección incorrecta..."
                    style={{
                      width: '100%', padding: '0.7rem', borderRadius: 12,
                      border: '1.5px solid var(--border-strong)', background: 'var(--input-bg)',
                      color: 'var(--input-text)', fontSize: '0.85rem', resize: 'none',
                      minHeight: 76, boxSizing: 'border-box', marginBottom: 8,
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setReturnFormId(null)}
                      className="tuki-btn tuki-btn-neutral"
                      style={{ flex: 1 }}
                    >
                      Atras
                    </button>
                    <button
                      onClick={() => handleAction(order.id, 'returning', returnReason)}
                      disabled={!returnReason.trim() || isbusy}
                      className="tuki-btn tuki-btn-warning"
                      style={{ flex: 2, opacity: (!returnReason.trim() || isbusy) ? 0.6 : 1 }}
                    >
                      {acting === returnKey ? '...' : (<><Icon name="package" size={14} /> Confirmar devolucion</>)}
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
                    <Icon name="exclamation" size={12} style={{ marginRight: 6 }} />
                    El cliente rechazo la devolucion <strong>3 veces</strong>. Confirma la incidencia para liberar el pedido y poder recibir nuevas solicitudes.
                  </div>
                  <button
                    onClick={() => handleAction(order.id, 'incident_closed')}
                    disabled={isbusy}
                    className="tuki-btn tuki-btn-danger tuki-btn-block"
                    style={{ opacity: isbusy ? 0.6 : 1 }}
                  >
                    {acting === incidentKey ? '...' : (<><Icon name="exclamation" size={14} /> Confirmar incidencia</>)}
                  </button>
                </div>
              ) : (
                /* ── Main action buttons ── */
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleAction(order.id, 'in_transit')}
                    disabled={isbusy}
                    className="tuki-btn tuki-btn-success"
                    style={{ flex: 1, opacity: acting === retryKey ? 0.6 : 1 }}
                  >
                    {acting === retryKey ? '...' : (<><Icon name="refresh" size={14} /> Volver a entregar</>)}
                  </button>
                  <button
                    onClick={() => setReturnFormId(order.id)}
                    disabled={isbusy}
                    className="tuki-btn tuki-btn-warning"
                    style={{ flex: 1 }}
                  >
                    <Icon name="package" size={14} /> Devolver envio
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

