'use client';
import { useState, useEffect, useCallback, useRef, type ComponentProps } from 'react';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import DriverScreenLayout from '../components/DriverScreenLayout';
import ChatModal from '@/components/ChatModal';
import { Icon } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';
import { playMessageAlert } from '@/lib/audio';

const ACTIVE_STATUSES = ['accepted', 'picking_up', 'at_pickup', 'in_transit', 'returning', 'driver_returning', 'return_delivered'] as const;
type ActiveStatus = typeof ACTIVE_STATUSES[number];

const STATUS_LABEL: Record<ActiveStatus, { label: string; icon: ComponentProps<typeof Icon>['name'] }> = {
  accepted:          { label: 'Aceptado',                           icon: 'check'    },
  picking_up:        { label: 'En camino al punto de recogida',     icon: 'car'      },
  at_pickup:         { label: 'En punto de recogida',               icon: 'package'  },
  in_transit:        { label: 'En camino al destino',               icon: 'car'      },
  returning:         { label: 'Devolución solicitada (esperando cliente)', icon: 'clock' },
  driver_returning:  { label: 'Cliente aceptó — Ir a devolver',    icon: 'package'  },
  return_delivered:  { label: 'Esperando confirmación del cliente', icon: 'clock'    },
};

const PROGRESS_ACTION: Record<'accepted' | 'picking_up' | 'at_pickup', { label: string; nextStatus: string }> = {
  accepted:   { label: 'Ir a recoger',    nextStatus: 'picking_up' },
  picking_up: { label: 'Ya llegué',       nextStatus: 'at_pickup'  },
  at_pickup:  { label: 'Iniciar entrega', nextStatus: 'in_transit' },
};

const BRAND = '#F5C518';
const BRAND_SHADOW = 'rgba(245,197,24,0.35)';

const DELIVERY_STEPS = [
  { key: 'accepted',   label: 'Aceptado'  },
  { key: 'picking_up', label: 'En camino' },
  { key: 'at_pickup',  label: 'Recogida'  },
  { key: 'in_transit', label: 'Tránsito'  },
  { key: 'delivered',  label: 'Entregado' },
] as const;

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function openMaps(navApp: string, address: string) {
  const q = encodeURIComponent(address);
  if (navApp === 'waze') {
    window.open(`https://waze.com/ul?q=${q}&navigate=yes`, '_blank');
  } else {
    window.open(`https://maps.google.com/?q=${q}`, '_blank');
  }
}

export default function ActivoPage() {
  const { email, navApp, displayName } = useWorkerContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  // Toast queue — supports multiple simultaneous toasts
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toastIdRef = useRef(0);

  // "Finalizar servicio" expanded state per order
  const [finalizeOpen, setFinalizeOpen] = useState<Set<string>>(new Set());
  // Confirmation step before marking as delivered
  const [confirmDelivery, setConfirmDelivery] = useState<Set<string>>(new Set());
  // Delivery proof photo per order { orderId → { file, previewUrl } }
  const [deliveryPhotos, setDeliveryPhotos] = useState<Record<string, { file: File; previewUrl: string }>>({});
  // Fail reason text per order
  const [failReason, setFailReason] = useState<Record<string, string>>({});
  // ── Stop-level state ──────────────────────────────────────────────────────
  const [stopActing, setStopActing] = useState<Record<string, boolean>>({}); // stopId → busy
  const [stopFailOpen, setStopFailOpen] = useState<Set<string>>(new Set()); // which stops show fail form
  const [stopFailReason, setStopFailReason] = useState<Record<string, string>>({}); // stopId → reason text
  // Chat modal
  const [chatModal, setChatModal] = useState<{ orderId: string; clientName: string | null; clientPhoto: string | null } | null>(null);
  // Unread message counts per order
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const prevUnreadRef = useRef<Record<string, number>>({});

  const showToast = (msg: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  };

  const fetchActive = useCallback(() => {
    if (!email) return;
    authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const active = data.filter(o => (ACTIVE_STATUSES as readonly string[]).includes(o.status));
          setOrders(active);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  const fetchUnreadCounts = useCallback((orderIds: string[]) => {
    if (!orderIds.length) return;
    orderIds.forEach(id => {
      authFetch(`/api/chat?order_id=${id}&count=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && typeof d.unread === 'number') {
            setUnreadCounts(prev => ({ ...prev, [id]: d.unread }));
          }
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    fetchActive();
    // Realtime subscription for instant updates; fallback poll every 60s
    // (covers edge cases where realtime misses an event)
    const iv = setInterval(fetchActive, 60_000);
    const ch = email
      ? supabase.channel(`driver-activo-${email}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `accepted_by=eq.${email}`,
          } as never, () => fetchActive())
          .subscribe()
      : null;
    return () => {
      clearInterval(iv);
      if (ch) supabase.removeChannel(ch);
    };
  }, [fetchActive, email]);

  // Poll unread counts when orders change
  useEffect(() => {
    const ids = orders.map(o => o.id);
    fetchUnreadCounts(ids);
    const iv = setInterval(() => fetchUnreadCounts(ids), 10_000);
    return () => clearInterval(iv);
  }, [orders, fetchUnreadCounts]);

  // When chat opens: clear unread count for that order
  useEffect(() => {
    if (chatModal?.orderId) {
      setUnreadCounts(prev => ({ ...prev, [chatModal.orderId]: 0 }));
    }
  }, [chatModal?.orderId]);

  // Play sound when new unread messages arrive
  const prevUnreadSnap = prevUnreadRef;
  useEffect(() => {
    const prev = prevUnreadSnap.current;
    let hasNew = false;
    for (const [id, count] of Object.entries(unreadCounts)) {
      if (id === chatModal?.orderId) continue;
      if (count > (prev[id] ?? 0)) { hasNew = true; break; }
    }
    if (hasNew) playMessageAlert();
    prevUnreadSnap.current = { ...unreadCounts };
  }, [unreadCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (orderId: string, newStatus: string, extraBody?: Record<string, unknown>) => {
    const key = orderId + newStatus;
    setActing(key);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus, driver_email: email, ...extraBody }),
      });
      if (res.ok) {
        if (newStatus === 'delivered') {
          setOrders(prev => prev.filter(o => o.id !== orderId));
          setFinalizeOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
          showToast('✅ ¡Entrega marcada como completada!');
        } else if (newStatus === 'failed') {
          setOrders(prev => prev.filter(o => o.id !== orderId));
          setFinalizeOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
          setFailReason(prev => { const n = { ...prev }; delete n[orderId]; return n; });
          showToast('⚠️ Entrega fallida registrada. Aparece en "Fallidos".');
        } else {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
          setFinalizeOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('❌ ' + (err?.error || 'Error al actualizar estado'));
      }
    } catch {
      showToast('❌ Error de conexión. Intentá de nuevo.');
    }
    setActing(null);
  };

  // Per-stop status update (multi-stop orders)
  const updateStopStatus = async (orderId: string, stopId: string, stopStatus: 'delivered' | 'failed', failReasonText?: string) => {
    setStopActing(prev => ({ ...prev, [stopId]: true }));
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          stop_id: stopId,
          stop_status: stopStatus,
          driver_email: email,
          ...(failReasonText ? { fail_reason: failReasonText } : {}),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (stopStatus === 'delivered') {
          showToast('✅ Parada marcada como entregada');
        } else {
          showToast('⚠️ Parada fallida registrada');
        }
        setStopFailOpen(prev => { const n = new Set(prev); n.delete(stopId); return n; });
        setStopFailReason(prev => { const n = { ...prev }; delete n[stopId]; return n; });
        // If all stops done, the API auto-transitions order to delivered
        if (json?.all_stops_done) {
          setOrders(prev => prev.filter(o => o.id !== orderId));
          const finalMsg = json.failed_count > 0
            ? `🏁 ${json.delivered_count} entregados · ${json.failed_count} fallidos`
            : '🏁 ¡Todos los paquetes entregados!';
          showToast(finalMsg);
        } else {
          // Refresh to reflect updated stop status
          setOrders(prev => prev.map(o => {
            if (o.id !== orderId) return o;
            const updatedStops = (o.order_stops || []).map((s: any) =>
              s.id === stopId ? { ...s, status: stopStatus, fail_reason: failReasonText ?? null } : s
            );
            return { ...o, order_stops: updatedStops };
          }));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('❌ ' + (err?.error || 'Error al actualizar parada'));
      }
    } catch {
      showToast('❌ Error de conexión');
    }
    setStopActing(prev => ({ ...prev, [stopId]: false }));
  };

  const renderCard = (order: any) => {
    const status = order.status as ActiveStatus;
    const statusInfo = STATUS_LABEL[status];
    const statusTone = getStatusTone(status);
    const clientName = order.client_name || order.client_email?.split('@')[0] || 'Cliente';
    const clientPhoto = order.client_photo || null;
    const price = Number(order.offer ?? order.suggested_price ?? 0).toLocaleString('es-PY');
    const track = genTrackingCode(order.id);
    const phone = order.client_phone || order.sender_phone || null;

    const isFinOpen = finalizeOpen.has(order.id);
    const reason = failReason[order.id] ?? '';
    const isActingDelivered = acting === order.id + 'delivered';
    const isActingFailed = acting === order.id + 'failed';
    const isActingProgress = status !== 'in_transit' && acting === order.id + (PROGRESS_ACTION[status as 'accepted' | 'picking_up' | 'at_pickup']?.nextStatus ?? '');

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
        {/* Status header */}
        <div className="tuki-card-header">
          <span className="tuki-card-title">
            <Icon name={statusInfo.icon} size={14} color={statusTone.color} />
            {statusInfo.label}
          </span>
          <span
            className="tuki-card-subtitle"
            onClick={() => { navigator.clipboard?.writeText(track).catch(() => {}); }}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Toca para copiar"
          >#{track}</span>
        </div>

        <div className="tuki-card-body">
          {/* Progress stepper */}
          {(() => {
            const returnMode = ['returning', 'driver_returning', 'return_delivered'].includes(status);
            const activeIdx = returnMode ? 3 : DELIVERY_STEPS.findIndex(s => s.key === status);
            return (
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18, padding: '4px 0 0' }}>
                {DELIVERY_STEPS.map((step, i) => {
                  const done = i < activeIdx;
                  const active = i === activeIdx;
                  return (
                    <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                      {i > 0 && (
                        <div style={{
                          position: 'absolute', top: 5, right: '50%', left: '-50%',
                          height: 2,
                          background: done ? BRAND : active ? 'rgba(245,197,24,0.4)' : 'rgba(255,255,255,0.1)',
                          transition: 'background 0.3s',
                        }} />
                      )}
                      <div style={{
                        width: 12, height: 12, borderRadius: '50%', zIndex: 1, position: 'relative',
                        background: done || active ? BRAND : 'rgba(255,255,255,0.15)',
                        boxShadow: active ? `0 0 0 3px ${BRAND_SHADOW}` : 'none',
                        transition: 'all 0.3s',
                      }} />
                      <span style={{
                        fontSize: '0.58rem',
                        color: active ? BRAND : done ? 'rgba(245,197,24,0.6)' : 'rgba(255,255,255,0.25)',
                        fontWeight: active ? 700 : 400,
                        marginTop: 4,
                        textAlign: 'center',
                        lineHeight: 1.2,
                      }}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div
              className="tuki-avatar"
              style={{
                width: 58, height: 58, fontSize: '1.45rem', flexShrink: 0,
                background: clientPhoto
                  ? `url(${clientPhoto}) center/cover no-repeat`
                  : `linear-gradient(135deg, ${BRAND}, #F58A07)`,
                color: '#1C1C2E',
                boxShadow: `0 0 0 3px ${BRAND_SHADOW}, 0 2px 10px rgba(0,0,0,0.4)`,
                border: `2px solid ${BRAND}`,
              }}
            >
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{clientName}</div>
              {phone && (
                <a href={`tel:${phone}`} style={{ color: '#60a5fa', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="device-mobile" size={12} color="#60a5fa" /> {phone}
                </a>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tuki-price" style={{ color: BRAND }}>₲{price}</div>
              <div className="tuki-price-label">acordado</div>
            </div>
          </div>

          {/* Chat + SOS row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {/* Chat button */}
            <button
              onClick={() => setChatModal({ orderId: order.id, clientName, clientPhoto })}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '11px 14px', borderRadius: 13, border: 'none', cursor: 'pointer',
                background: unreadCounts[order.id]
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.30), rgba(37,99,235,0.25))'
                  : 'rgba(59,130,246,0.14)',
                color: '#60a5fa',
                fontWeight: 700, fontSize: '0.88rem',
                position: 'relative',
                boxShadow: unreadCounts[order.id] ? '0 0 0 1.5px rgba(59,130,246,0.5)' : '0 0 0 1px rgba(59,130,246,0.2)',
              }}
            >
              <Icon name="chat" size={15} color="#60a5fa" />
              Chat
              {!!unreadCounts[order.id] && (
                <span style={{
                  background: '#ef4444', color: '#fff',
                  borderRadius: 99, padding: '2px 7px',
                  fontSize: '0.7rem', fontWeight: 800, lineHeight: 1,
                  boxShadow: '0 0 0 2px rgba(239,68,68,0.35)',
                }}>
                  {unreadCounts[order.id]}
                </span>
              )}
            </button>

            {/* SOS — emergency call */}
            <a
              href="tel:911"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '11px 18px', borderRadius: 13,
                background: 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(220,38,38,0.18))',
                boxShadow: '0 0 0 1.5px rgba(239,68,68,0.45)',
                color: '#f87171', fontWeight: 800, fontSize: '0.9rem',
                textDecoration: 'none', flexShrink: 0,
                letterSpacing: '0.5px',
              }}
              title="Llamar emergencias (911)"
            >
              <Icon name="shield" size={15} color="#f87171" />
              SOS
            </a>
          </div>

          {/* Addresses */}
          {(order.pickup_address || order.delivery_address) && (
            <div className="tuki-address-box" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  paddingTop: 4, gap: 3, flexShrink: 0,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5C518', display: 'block' }} />
                  <span style={{ width: 2, height: 22, background: 'var(--border-subtle)', display: 'block' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80', display: 'block' }} />
                </div>
                <div style={{ flex: 1 }}>
                  {order.pickup_address && (
                    <div style={{ marginBottom: 10 }}>
                      <div className="tuki-address-label" style={{ color: '#F5C518' }}>Recogida</div>
                      <div className="tuki-address-text">{order.pickup_address}</div>
                    </div>
                  )}
                  {order.delivery_address && (
                    <div>
                      <div className="tuki-address-label" style={{ color: '#4ade80' }}>Entrega</div>
                      <div className="tuki-address-text">{order.delivery_address}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Map buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {order.pickup_address && (
                  <button
                    onClick={() => openMaps(navApp, order.pickup_address)}
                    className="tuki-btn tuki-btn-warning tuki-btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Icon name="map" size={14} /> Ir a Recogida
                  </button>
                )}
                {order.delivery_address && (
                  <button
                    onClick={() => openMaps(navApp, order.delivery_address)}
                    className="tuki-btn tuki-btn-success tuki-btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Icon name="map" size={14} /> Ir a Entrega
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Package description */}
          {order.package_description && (
            <div style={{
              background: 'var(--surface-3)', borderRadius: 10, padding: '9px 13px',
              marginBottom: 14, fontSize: '0.82rem', color: 'var(--text-secondary)',
            }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Paquete: </span>
              {order.package_description}
            </div>
          )}

          {/* ── Paradas (multi-stop) ── */}
          {Array.isArray(order.order_stops) && order.order_stops.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                📍 Paradas ({order.order_stops.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...order.order_stops].sort((a: any, b: any) => a.sequence - b.sequence).map((stop: any) => {
                  const isDone = stop.status === 'delivered';
                  const isFailed = stop.status === 'failed';
                  const isPending = stop.status === 'pending';
                  const isBusy = stopActing[stop.id];
                  const failFormOpen = stopFailOpen.has(stop.id);
                  const stopReason = stopFailReason[stop.id] ?? '';

                  return (
                    <div key={stop.id} style={{
                      background: isDone ? 'rgba(74,222,128,0.07)' : isFailed ? 'rgba(239,68,68,0.07)' : 'rgba(0,0,0,0.25)',
                      border: `1.5px solid ${isDone ? 'rgba(74,222,128,0.3)' : isFailed ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
                      borderRadius: 12, padding: '10px 12px',
                    }}>
                      {/* Stop header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: isPending && status === 'in_transit' ? 8 : 4 }}>
                        <span style={{
                          minWidth: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          background: isDone ? '#4ade80' : isFailed ? '#ef4444' : '#475569',
                          color: '#fff', fontSize: '0.7rem', fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isDone ? '✓' : isFailed ? '✗' : stop.sequence}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', color: isDone ? '#4ade80' : isFailed ? '#f87171' : 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>
                            {stop.address}
                          </div>
                          {stop.receiver_contact && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              👤 {stop.receiver_contact}
                              {stop.receiver_phone && (
                                <a href={`tel:${stop.receiver_phone}`} style={{ color: '#60a5fa', marginLeft: 6, textDecoration: 'none' }}>
                                  📞 {stop.receiver_phone}
                                </a>
                              )}
                            </div>
                          )}
                          {stop.description && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              📝 {stop.description}
                            </div>
                          )}
                          {isFailed && stop.fail_reason && (
                            <div style={{ fontSize: '0.72rem', color: '#fca5a5', marginTop: 3, borderLeft: '2px solid #ef4444', paddingLeft: 6 }}>
                              {stop.fail_reason}
                            </div>
                          )}
                        </div>
                        {/* Nav button */}
                        <button
                          onClick={() => openMaps(navApp, stop.address)}
                          style={{
                            padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border-strong)',
                            background: 'var(--glass-card)', color: '#94a3b8',
                            fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0,
                          }}
                        >🗺️</button>
                      </div>

                      {/* Action buttons — only when pending + in_transit */}
                      {isPending && status === 'in_transit' && !failFormOpen && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            disabled={isBusy}
                            onClick={() => updateStopStatus(order.id, stop.id, 'delivered')}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 10,
                              border: isBusy ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(74,222,128,0.3)',
                              background: isBusy ? 'rgba(255,255,255,0.06)' : 'rgba(74,222,128,0.18)',
                              color: isBusy ? '#6b7280' : '#4ade80',
                              fontWeight: 700, fontSize: '0.78rem', cursor: isBusy ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isBusy ? '...' : '✅ Entregado'}
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => setStopFailOpen(prev => new Set([...prev, stop.id]))}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 10,
                              border: '1px solid rgba(239,68,68,0.3)',
                              background: 'rgba(239,68,68,0.1)', color: '#f87171',
                              fontWeight: 700, fontSize: '0.78rem', cursor: isBusy ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ❌ Fallido
                          </button>
                        </div>
                      )}

                      {/* Stop fail reason form */}
                      {isPending && failFormOpen && (
                        <div style={{ marginTop: 6 }}>
                          <textarea
                            value={stopReason}
                            onChange={e => setStopFailReason(prev => ({ ...prev, [stop.id]: e.target.value }))}
                            placeholder="Ej: No había nadie en casa, dirección incorrecta..."
                            rows={2}
                            style={{
                              width: '100%', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                              background: 'var(--surface-3)', color: 'var(--text-primary)', fontSize: '0.8rem',
                              padding: '7px 9px', resize: 'none', boxSizing: 'border-box',
                              outline: 'none', fontFamily: 'inherit',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button
                              onClick={() => {
                                setStopFailOpen(prev => { const n = new Set(prev); n.delete(stop.id); return n; });
                                setStopFailReason(prev => { const n = { ...prev }; delete n[stop.id]; return n; });
                              }}
                              style={{
                                flex: 1, padding: '7px', borderRadius: 9, border: '1px solid var(--border-subtle)',
                                background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: '0.78rem',
                              }}
                            >Cancelar</button>
                            <button
                              disabled={!stopReason.trim() || isBusy}
                              onClick={() => updateStopStatus(order.id, stop.id, 'failed', stopReason.trim())}
                              style={{
                                flex: 2, padding: '7px', borderRadius: 9, border: 'none',
                                background: !stopReason.trim() || isBusy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#ef4444,#dc2626)',
                                color: !stopReason.trim() || isBusy ? '#6b7280' : '#fff',
                                fontWeight: 700, fontSize: '0.78rem',
                                cursor: !stopReason.trim() || isBusy ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isBusy ? '...' : 'Confirmar fallido'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Note */}
          {order.note && (
            <div style={{
              background: 'var(--surface-3)', borderRadius: 10, padding: '9px 13px',
              marginBottom: 14, fontSize: '0.82rem', color: 'var(--text-secondary)',
            }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Nota: </span>
              {order.note}
            </div>
          )}

          {/* ── Action buttons ── */}
          {/* Return flow statuses */}
          {status === 'returning' && (
            <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 14px', textAlign: 'center', fontSize: '0.85rem', color: '#fde68a' }}>
              <Icon name="clock" size={14} /> Esperando respuesta del cliente para devolver el paquete...
            </div>
          )}
          {status === 'driver_returning' && (
            <button
              disabled={!!acting}
              onClick={() => updateStatus(order.id, 'return_delivered')}
              className="tuki-btn tuki-btn-warning tuki-btn-block"
            >
              {acting === order.id + 'return_delivered' ? 'Actualizando...' : <><Icon name="package" size={14} /> Llegué a devolver el paquete</>}
            </button>
          )}
          {status === 'return_delivered' && (
            <div style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: '12px 14px', textAlign: 'center', fontSize: '0.85rem', color: '#93c5fd' }}>
              <Icon name="clock" size={14} /> Esperando que el cliente confirme la recepción...
            </div>
          )}
          {/* Delivery progress buttons: accepted → picking_up → at_pickup → in_transit */}
          {(status === 'accepted' || status === 'picking_up' || status === 'at_pickup') && (
            <button
              disabled={!!acting}
              onClick={() => updateStatus(order.id, PROGRESS_ACTION[status as 'accepted' | 'picking_up' | 'at_pickup'].nextStatus)}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: acting ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${BRAND}, #F58A07)`,
                color: acting ? '#6b7280' : '#1C1C2E',
                fontWeight: 800, fontSize: '1rem', cursor: acting ? 'not-allowed' : 'pointer',
                boxShadow: acting ? 'none' : `0 4px 18px ${BRAND_SHADOW}`,
                letterSpacing: '0.3px',
                transition: 'all 0.2s',
              }}
            >
              {isActingProgress ? 'Actualizando...' : PROGRESS_ACTION[status as 'accepted' | 'picking_up' | 'at_pickup'].label}
            </button>
          )}

          {status === 'in_transit' && !isFinOpen && (
            <button
              onClick={() => setFinalizeOpen(prev => new Set([...prev, order.id]))}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: '1.5px solid rgba(16,185,129,0.5)',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.28))',
                color: '#4ade80', fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(16,185,129,0.2)',
              }}
            >
              <Icon name="flag" size={16} color="#4ade80" />
              Finalizar entrega
            </button>
          )}

          {status === 'in_transit' && isFinOpen && (
            // Expanded: Entregado | Entrega Fallida
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Row with two main buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  disabled={!!acting}
                  onClick={() => setConfirmDelivery(prev => new Set([...prev, order.id]))}
                  className="tuki-btn tuki-btn-success"
                  style={{ flex: 1, fontSize: '0.88rem' }}
                >
                  {isActingDelivered ? '...' : <><Icon name="check" size={14} /> Entregado</>}
                </button>
                <button
                  disabled={!!acting}
                  onClick={() => {
                    // Toggle fail form
                    setFailReason(prev => prev[order.id] !== undefined
                      ? (() => { const n = { ...prev }; delete n[order.id]; return n; })()
                      : { ...prev, [order.id]: '' }
                    );
                  }}
                  className="tuki-btn tuki-btn-danger"
                  style={{
                    flex: 1,
                    fontSize: '0.88rem',
                    background: failReason[order.id] !== undefined ? 'rgba(239,68,68,0.2)' : undefined,
                  }}
                >
                  {isActingFailed ? '...' : <><Icon name="x" size={14} /> Entrega fallida</>}
                </button>
              </div>

              {/* Fail reason form */}
              {failReason[order.id] !== undefined && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 12, padding: 12,
                }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#f87171', fontWeight: 700 }}>
                    ¿Por qué no pudiste entregar?
                  </p>
                  <textarea
                    value={reason}
                    onChange={e => setFailReason(prev => ({ ...prev, [order.id]: e.target.value }))}
                    placeholder="Ej: El destinatario no estaba en casa, dirección incorrecta..."
                    rows={3}
                    style={{
                      width: '100%', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                      background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: '0.83rem',
                      padding: '8px 10px', resize: 'none', boxSizing: 'border-box',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    disabled={!reason.trim() || !!acting}
                    onClick={() => updateStatus(order.id, 'failed', { fail_reason: reason.trim() })}
                    className="tuki-btn tuki-btn-danger tuki-btn-block"
                  >
                    {isActingFailed ? 'Registrando...' : 'Confirmar entrega fallida'}
                  </button>
                </div>
              )}

              {/* Cancel expand */}
              <button
                onClick={() => {
                  setFinalizeOpen(prev => { const n = new Set(prev); n.delete(order.id); return n; });
                  setFailReason(prev => { const n = { ...prev }; delete n[order.id]; return n; });
                  setConfirmDelivery(prev => { const n = new Set(prev); n.delete(order.id); return n; });
                }}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  fontSize: '0.78rem', cursor: 'pointer', padding: '4px',
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Envío Activo">
      {/* Toast queue */}
      {toasts.map((t, i) => (
        <div key={t.id} style={{
          position: 'fixed', top: 80 + i * 48, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-1)', border: '1px solid var(--border-strong)',
          borderRadius: 12, padding: '10px 20px', color: 'var(--text-primary)',
          fontSize: '0.88rem', fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap', transition: 'top 0.2s',
        }}>
          {t.msg}
        </div>
      ))}

      <div style={{ padding: '16px 16px 100px' }}>
        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <svg style={{ width: 36, height: 36, marginBottom: 10, display: 'inline-block', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p style={{ margin: 0 }}>Cargando...</p>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div style={{
            textAlign: 'center', paddingTop: 60,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--glass-card)',
              border: '2px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem',
            }}>
              📭
            </div>
            <p style={{ color: '#9ca3af', fontWeight: 600, margin: 0, fontSize: '1rem' }}>
              Sin envíos activos
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: 0, maxWidth: 240 }}>
              Cuando un cliente acepte tu oferta, el envío aparecerá aquí.
            </p>
          </div>
        )}

        {!loading && orders.map(renderCard)}
      </div>

      {/* Delivery Confirmation Dialog */}
      {[...confirmDelivery].map(orderId => {
        const photoEntry = deliveryPhotos[orderId];
        return (
        <div key={orderId} style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{
            background: 'var(--surface-1)',
            border: '1.5px solid rgba(16,185,129,0.4)',
            borderRadius: 20, padding: '28px 24px',
            width: '100%', maxWidth: 360, textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📦</div>
            <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem', margin: '0 0 8px' }}>
              ¿Confirmar entrega?
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 20px', lineHeight: 1.5 }}>
              Esta acción no se puede deshacer. Se descontará la comisión y el pedido se marcará como finalizado.
            </p>
            {/* Optional delivery proof photo */}
            <label style={{
              display: 'block', cursor: 'pointer', marginBottom: 18,
              background: 'var(--glass-card)', borderRadius: 12,
              border: '1.5px dashed var(--border-strong)', padding: '12px',
              color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600,
            }}>
              {photoEntry
                ? <img src={photoEntry.previewUrl} alt="Foto de entrega" loading="lazy" decoding="async" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8 }} />
                : <>📷 Adjuntar foto de entrega <span style={{ color: '#6b7280', fontWeight: 400 }}>(opcional)</span></>
              }
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = URL.createObjectURL(f);
                  setDeliveryPhotos(prev => ({ ...prev, [orderId]: { file: f, previewUrl: url } }));
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setConfirmDelivery(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                  if (photoEntry) URL.revokeObjectURL(photoEntry.previewUrl);
                  setDeliveryPhotos(prev => { const n = { ...prev }; delete n[orderId]; return n; });
                }}
                style={{
                  flex: 1, padding: '13px', borderRadius: 12,
                  border: '1.5px solid var(--border-strong)',
                  background: 'var(--glass-card)', color: 'var(--text-secondary)',
                  fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                disabled={!!acting}
                onClick={async () => {
                  setConfirmDelivery(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                  // Upload photo if provided
                  if (photoEntry) {
                    try {
                      const ab = await photoEntry.file.arrayBuffer();
                      const b64 = Buffer.from(ab).toString('base64');
                      await authFetch('/api/upload-delivery-photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ order_id: orderId, base64: b64, mimeType: photoEntry.file.type }),
                      });
                    } catch {}
                    URL.revokeObjectURL(photoEntry.previewUrl);
                    setDeliveryPhotos(prev => { const n = { ...prev }; delete n[orderId]; return n; });
                  }
                  updateStatus(orderId, 'delivered');
                }}
                style={{
                  flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                  background: acting ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: acting ? 'rgba(255,255,255,0.4)' : '#fff',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: acting ? 'not-allowed' : 'pointer',
                  opacity: acting ? 0.7 : 1,
                }}
              >
                {acting === orderId + 'delivered' ? '...' : '✅ Sí, entregado'}
              </button>
            </div>
          </div>
        </div>
        );
      })}

      {/* Chat Modal */}
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
