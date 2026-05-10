'use client';
import { useState, useEffect, useCallback, useRef, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import { nearestNeighborSort, haversineKm } from '@/lib/geo';
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
  const searchParams = useSearchParams();
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
  // Optimize state: orderId → 'loading' | 'done' | undefined
  const [optimizeState, setOptimizeState] = useState<Record<string, 'loading' | 'done'>>({});
  // Driver GPS position for distance estimation on stop badges
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  // Chat modal
  const [chatModal, setChatModal] = useState<{ orderId: string; clientName: string | null; clientPhoto: string | null } | null>(null);
  // Unread message counts per order
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const prevUnreadRef = useRef<Record<string, number>>({});
  // Cancel flow
  const [cancelOpen, setCancelOpen] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});

  // ── Anti-fraud PIN state ──────────────────────────────────────────────────
  // Pickup code modal (at_pickup → in_transit for envio orders)
  const [pickupPinOpen, setPickupPinOpen] = useState<Set<string>>(new Set());
  const [pickupPinVal, setPickupPinVal] = useState<Record<string, string>>({});
  const [pickupPinErr, setPickupPinErr] = useState<Record<string, string>>({});
  const [pickupPinAttempts, setPickupPinAttempts] = useState<Record<string, number>>({});
  // Delivery PIN (in confirmation dialog for single-stop envio)
  const [deliveryPinVal, setDeliveryPinVal] = useState<Record<string, string>>({});
  const [deliveryPinErr, setDeliveryPinErr] = useState<Record<string, string>>({});
  const [deliveryPinAttempts, setDeliveryPinAttempts] = useState<Record<string, number>>({});
  // Per-stop PIN (multi-stop envio)
  const [stopPinVal, setStopPinVal] = useState<Record<string, string>>({});
  const [stopPinErr, setStopPinErr] = useState<Record<string, string>>({});
  const [stopPinAttempts, setStopPinAttempts] = useState<Record<string, number>>({});

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

  // Watch driver GPS position for stop distance badges
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      pos => setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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

  // Auto-open chat when navigated via ?openChat=1 (e.g. from ChatBadge)
  useEffect(() => {
    if (!searchParams?.get('openChat') || orders.length === 0 || chatModal) return;
    // Prefer order with unread messages, fallback to first order
    const target = orders.find(o => (unreadCounts[o.id] ?? 0) > 0) ?? orders[0];
    if (!target) return;
    setChatModal({ orderId: target.id, clientName: target.client_name || target.client_email?.split('@')[0] || 'Cliente', clientPhoto: target.client_photo ?? null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, orders]);

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
          showToast('⚠️ Entrega fallida registrada. Aparece en "Fallidos".');        } else if (newStatus === 'driver_cancelled') {
          setOrders(prev => prev.filter(o => o.id !== orderId));
          setCancelOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
          setCancelReason(prev => { const n = { ...prev }; delete n[orderId]; return n; });
          showToast('\ud83d\udeab Env\u00edo cancelado.');        } else {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
          setFinalizeOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (err?.error === 'pin_invalid') {
          if (newStatus === 'in_transit') {
            const attempts = (pickupPinAttempts[orderId] || 0) + 1;
            setPickupPinAttempts(prev => ({ ...prev, [orderId]: attempts }));
            const remaining = Math.max(0, 5 - attempts);
            setPickupPinErr(prev => ({
              ...prev,
              [orderId]: remaining > 0
                ? `Código incorrecto — ${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}`
                : 'Código incorrecto',
            }));
            setPickupPinVal(prev => ({ ...prev, [orderId]: '' }));
            // Re-open the modal to show the error
            setPickupPinOpen(prev => new Set([...prev, orderId]));
          } else if (newStatus === 'delivered') {
            const attempts = (deliveryPinAttempts[orderId] || 0) + 1;
            setDeliveryPinAttempts(prev => ({ ...prev, [orderId]: attempts }));
            const remaining = Math.max(0, 5 - attempts);
            setDeliveryPinErr(prev => ({
              ...prev,
              [orderId]: remaining > 0
                ? `Código incorrecto — ${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}`
                : 'Código incorrecto',
            }));
            setDeliveryPinVal(prev => ({ ...prev, [orderId]: '' }));
            // Re-open delivery dialog
            setConfirmDelivery(prev => new Set([...prev, orderId]));
          }
        } else {
          showToast('❌ ' + (err?.error || 'Error al actualizar estado'));
        }
      }
    } catch {
      showToast('❌ Error de conexión. Intentá de nuevo.');
    }
    setActing(null);
  };

  // Nearest-neighbor route optimization for pending stops
  const optimizeDriverStops = (order: any) => {
    const pendingStops: any[] = (order.order_stops || []).filter((s: any) => s.status === 'pending');
    if (pendingStops.length < 2) return;

    setOptimizeState(prev => ({ ...prev, [order.id]: 'loading' }));

    const doOptimize = (originLat: number, originLng: number) => {
      const sorted = nearestNeighborSort(
        { lat: originLat, lng: originLng },
        pendingStops,
        (s: any) => s.lat,
        (s: any) => s.lng,
      );

      // Build reorder payload: only pending stops, new sequences continue from last non-pending sequence
      const doneStops: any[] = (order.order_stops || []).filter((s: any) => s.status !== 'pending');
      const doneMax = doneStops.length > 0 ? Math.max(...doneStops.map((s: any) => s.sequence)) : 0;
      const reorderPayload = sorted.map((s: any, i: number) => ({
        stop_id: s.id,
        sequence: doneMax + i + 1,
      }));

      authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, reorder_stops: reorderPayload }),
      })
        .then(r => {
          if (r.ok) {
            setOrders(prev => prev.map(o => {
              if (o.id !== order.id) return o;
              const updatedStops = (o.order_stops || []).map((s: any) => {
                const found = reorderPayload.find((p: any) => p.stop_id === s.id);
                return found ? { ...s, sequence: found.sequence } : s;
              });
              return { ...o, order_stops: updatedStops };
            }));
            setOptimizeState(prev => ({ ...prev, [order.id]: 'done' }));
            showToast('✅ Ruta optimizada');
            setTimeout(() => setOptimizeState(prev => { const n = { ...prev }; delete n[order.id]; return n; }), 2500);
          } else {
            showToast('❌ No se pudo optimizar');
            setOptimizeState(prev => { const n = { ...prev }; delete n[order.id]; return n; });
          }
        })
        .catch(() => {
          showToast('❌ Error de conexión');
          setOptimizeState(prev => { const n = { ...prev }; delete n[order.id]; return n; });
        });
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => doOptimize(pos.coords.latitude, pos.coords.longitude),
        () => doOptimize(Number(order.pickup_lat), Number(order.pickup_lng)),
        { enableHighAccuracy: true, timeout: 5000 },
      );
    } else {
      doOptimize(Number(order.pickup_lat), Number(order.pickup_lng));
    }
  };

  // Per-stop status update (multi-stop orders)
  const updateStopStatus = async (orderId: string, stopId: string, stopStatus: 'delivered' | 'failed', failReasonText?: string, stopPin?: string, stopPinOverride?: boolean) => {
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
          ...(stopPin ? { delivery_pin: stopPin } : {}),
          ...(stopPinOverride ? { pin_override: true } : {}),
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
        // Clear PIN state for this stop on success
        setStopPinVal(prev => { const n = { ...prev }; delete n[stopId]; return n; });
        setStopPinErr(prev => { const n = { ...prev }; delete n[stopId]; return n; });
        setStopPinAttempts(prev => { const n = { ...prev }; delete n[stopId]; return n; });
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
        if (err?.error === 'pin_invalid') {
          const attempts = (stopPinAttempts[stopId] || 0) + 1;
          setStopPinAttempts(prev => ({ ...prev, [stopId]: attempts }));
          const remaining = Math.max(0, 5 - attempts);
          setStopPinErr(prev => ({
            ...prev,
            [stopId]: remaining > 0
              ? `Código incorrecto — ${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}`
              : 'Código incorrecto',
          }));
          setStopPinVal(prev => ({ ...prev, [stopId]: '' }));
        } else {
          showToast('❌ ' + (err?.error || 'Error al actualizar parada'));
        }
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
    const isCancelOpen = cancelOpen.has(order.id);
    const cancelReasonText = cancelReason[order.id] ?? '';
    const isActingCancel = acting === order.id + 'driver_cancelled';

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
              {(() => {
                const addrSortedStops: any[] = Array.isArray(order.order_stops)
                  ? [...order.order_stops].sort((a: any, b: any) => a.sequence - b.sequence)
                  : [];
                const addrCurrentStop = status === 'in_transit'
                  ? addrSortedStops.find((s: any) => s.status === 'pending') ?? null
                  : null;
                const entregaLabel = addrCurrentStop
                  ? `Entrega ${addrCurrentStop.sequence}`
                  : 'Entrega';
                const entregaAddr = addrCurrentStop?.address ?? order.delivery_address;
                return (
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
                      {entregaAddr && (
                        <div>
                          <div className="tuki-address-label" style={{ color: '#4ade80' }}>{entregaLabel}</div>
                          <div className="tuki-address-text">{entregaAddr}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Map buttons */}
              {(() => {
                // For multi-stop in_transit: button targets the current pending stop
                const sortedStops: any[] = Array.isArray(order.order_stops)
                  ? [...order.order_stops].sort((a: any, b: any) => a.sequence - b.sequence)
                  : [];
                const currentStop = status === 'in_transit'
                  ? sortedStops.find((s: any) => s.status === 'pending') ?? null
                  : null;
                const deliveryTarget = currentStop ?? null;
                const deliveryLabel = deliveryTarget
                  ? `Ir a Entrega ${deliveryTarget.sequence}`
                  : 'Ir a Entrega';
                const deliveryAddr = deliveryTarget?.address ?? order.delivery_address;
                return (
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
                    {deliveryAddr && (
                      <button
                        onClick={() => openMaps(navApp, deliveryAddr)}
                        className="tuki-btn tuki-btn-success tuki-btn-sm"
                        style={{ flex: 1 }}
                      >
                        <Icon name="map" size={14} /> {deliveryLabel}
                      </button>
                    )}
                  </div>
                );
              })()}
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
              <div className="tuki-stops-header">
                <div className="tuki-stops-label">
                  <span className="tuki-stops-label-dot" />
                  Paradas ({order.order_stops.length})
                </div>

                {/* Optimize button */}
                {status === 'in_transit' &&
                  (order.order_stops || []).filter((s: any) => s.status === 'pending' && s.lat != null && s.lng != null).length >= 2 && (
                  <button
                    className={`tuki-stop-optimize-btn${optimizeState[order.id] === 'done' ? ' done' : ''}`}
                    onClick={() => optimizeDriverStops(order)}
                    disabled={optimizeState[order.id] === 'loading'}
                  >
                    {optimizeState[order.id] === 'loading' ? (
                      <>
                        <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" style={{ animation: 'tuki-spin 0.9s linear infinite' }} /></svg>
                        Optimizando...
                      </>
                    ) : optimizeState[order.id] === 'done' ? (
                      <>
                        <Icon name="check" size={11} />
                        Optimizado
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M9 18h6"/></svg>
                        Optimizar ruta
                      </>
                    )}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(() => {
                  const sortedAllStops = [...order.order_stops].sort((a: any, b: any) => a.sequence - b.sequence);
                  // The one and only active stop: first pending in sequence
                  const currentActiveStop = status === 'in_transit'
                    ? sortedAllStops.find((s: any) => s.status === 'pending') ?? null
                    : null;
                  return sortedAllStops.map((stop: any) => {
                  const isDone = stop.status === 'delivered';
                  const isFailed = stop.status === 'failed';
                  const isPending = stop.status === 'pending';
                  // A pending stop is "active" only if it is the current one; others are locked
                  const isActive = isPending && currentActiveStop?.id === stop.id;
                  const isLocked = isPending && currentActiveStop?.id !== stop.id;
                  const isBusy = stopActing[stop.id];
                  const failFormOpen = stopFailOpen.has(stop.id);
                  const stopReason = stopFailReason[stop.id] ?? '';

                  const cardClass = `tuki-stop-card${isDone ? ' is-done' : isFailed ? ' is-failed' : isLocked ? ' is-locked' : ''}`;
                  const badgeClass = `tuki-stop-badge${isDone ? ' done' : isFailed ? ' failed' : ' pending'}`;

                  return (
                    <div key={stop.id} className={cardClass}>
                      <div className="tuki-stop-row">
                        {/* Sequence badge */}
                        <span className={badgeClass}>
                          {isDone
                            ? <Icon name="check" size={11} />
                            : isFailed
                            ? <Icon name="x" size={11} />
                            : stop.sequence}
                        </span>

                        {/* Address + meta */}
                        <div className="tuki-stop-body">
                          <div className="tuki-stop-address">{stop.address}</div>

                          {stop.receiver_contact && (
                            <div className="tuki-stop-meta-row">
                              <Icon name="user" size={11} />
                              <span>{stop.receiver_contact}</span>
                              {stop.receiver_phone && (
                                <>
                                  <span style={{ opacity: 0.35 }}>·</span>
                                  <Icon name="device-mobile" size={11} />
                                  <a href={`tel:${stop.receiver_phone}`}>{stop.receiver_phone}</a>
                                </>
                              )}
                            </div>
                          )}

                          {stop.description && (
                            <div className="tuki-stop-meta-row">
                              <Icon name="pencil" size={11} />
                              <span>{stop.description}</span>
                            </div>
                          )}

                          {isFailed && stop.fail_reason && (
                            <div className="tuki-stop-fail-reason">{stop.fail_reason}</div>
                          )}
                        </div>

                        {/* Navigate button — only for active or done/failed stops */}
                        {!isLocked && (
                          <button
                            className="tuki-stop-nav-btn"
                            onClick={() => openMaps(navApp, stop.address)}
                            title="Navegar"
                            aria-label="Abrir en mapa"
                          >
                            <Icon name="map" size={14} />
                          </button>
                        )}

                        {/* Lock icon for future stops */}
                        {isLocked && (
                          <span className="tuki-stop-lock-icon" aria-label="Bloqueada">
                            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          </span>
                        )}
                      </div>

                      {/* Locked label */}
                      {isLocked && (
                        <div className="tuki-stop-locked-label">Esperando parada anterior</div>
                      )}

                      {/* Distance/time badge — only for the active stop with coords */}
                      {isActive && stop.lat != null && stop.lng != null && driverPos && (() => {
                        const distKm = haversineKm(driverPos.lat, driverPos.lng, Number(stop.lat), Number(stop.lng));
                        const mins = Math.max(1, Math.round(distKm / 30 * 60));
                        const distLabel = distKm < 1
                          ? `${Math.round(distKm * 1000)} m`
                          : `${distKm.toFixed(1)} km`;
                        return (
                          <div className="tuki-stop-eta-badge">
                            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                            {distLabel} · {mins} min
                          </div>
                        );
                      })()}

                      {/* Action buttons — only for the ACTIVE stop */}
                      {isActive && !failFormOpen && (() => {
                        // For envio multi-stop: require per-stop delivery PIN
                        const isEnvioStop = order.order_type === 'envio' && stop.delivery_pin;
                        const sPin = stopPinVal[stop.id] || '';
                        const sPinErr = stopPinErr[stop.id] || '';
                        const sPinAttempts = stopPinAttempts[stop.id] || 0;
                        const canStopOverride = sPinAttempts >= 5;

                        return isEnvioStop ? (
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>
                              📦 Código del receptor (4 dígitos)
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              value={sPin}
                              placeholder="0000"
                              onChange={e => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setStopPinVal(prev => ({ ...prev, [stop.id]: v }));
                                if (sPinErr) setStopPinErr(prev => ({ ...prev, [stop.id]: '' }));
                              }}
                              style={{
                                width: '100%', textAlign: 'center', fontSize: '1.3rem',
                                fontWeight: 900, letterSpacing: '0.4em',
                                padding: '10px 8px', borderRadius: 10, boxSizing: 'border-box',
                                border: sPinErr ? '2px solid #ef4444' : '2px solid rgba(245,197,24,0.35)',
                                background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
                              }}
                            />
                            {sPinErr && (
                              <div style={{ color: '#f87171', fontSize: '0.7rem', fontWeight: 600 }}>{sPinErr}</div>
                            )}
                            <div className="tuki-stop-actions">
                              <button
                                className="tuki-stop-btn tuki-stop-btn-deliver"
                                disabled={isBusy || sPin.length < 4}
                                onClick={() => updateStopStatus(order.id, stop.id, 'delivered', undefined, sPin)}
                              >
                                <Icon name="check" size={13} />
                                {isBusy ? 'Guardando...' : 'Confirmar'}
                              </button>
                              <button
                                className="tuki-stop-btn tuki-stop-btn-fail"
                                disabled={isBusy}
                                onClick={() => setStopFailOpen(prev => new Set([...prev, stop.id]))}
                              >
                                <Icon name="x" size={13} />
                                Fallido
                              </button>
                            </div>
                            {canStopOverride && (
                              <button
                                disabled={isBusy}
                                onClick={() => updateStopStatus(order.id, stop.id, 'delivered', undefined, undefined, true)}
                                style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left', padding: 0, textDecoration: 'underline' }}
                              >
                                ⚠️ Problema con el código — Continuar sin código (se reportará al soporte)
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="tuki-stop-actions">
                            <button
                              className="tuki-stop-btn tuki-stop-btn-deliver"
                              disabled={isBusy}
                              onClick={() => updateStopStatus(order.id, stop.id, 'delivered')}
                            >
                              <Icon name="check" size={13} />
                              {isBusy ? 'Guardando...' : 'Entregado'}
                            </button>
                            <button
                              className="tuki-stop-btn tuki-stop-btn-fail"
                              disabled={isBusy}
                              onClick={() => setStopFailOpen(prev => new Set([...prev, stop.id]))}
                            >
                              <Icon name="x" size={13} />
                              Fallido
                            </button>
                          </div>
                        );
                      })()}

                      {/* Fail reason form — only for active stop */}
                      {isActive && failFormOpen && (
                        <div className="tuki-stop-fail-form">
                          <textarea
                            className="tuki-stop-fail-textarea"
                            value={stopReason}
                            onChange={e => setStopFailReason(prev => ({ ...prev, [stop.id]: e.target.value }))}
                            placeholder="Ej: No había nadie en casa, dirección incorrecta..."
                            rows={2}
                          />
                          <div className="tuki-stop-fail-form-btns">
                            <button
                              className="tuki-stop-fail-cancel"
                              onClick={() => {
                                setStopFailOpen(prev => { const n = new Set(prev); n.delete(stop.id); return n; });
                                setStopFailReason(prev => { const n = { ...prev }; delete n[stop.id]; return n; });
                              }}
                            >Cancelar</button>
                            <button
                              className="tuki-stop-fail-confirm"
                              disabled={!stopReason.trim() || isBusy}
                              onClick={() => updateStopStatus(order.id, stop.id, 'failed', stopReason.trim())}
                            >
                              {isBusy ? 'Guardando...' : 'Confirmar fallido'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  }); // end sortedAllStops.map
                })()} {/* end IIFE */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                disabled={!!acting}
                onClick={() => {
                  const nextStatus = PROGRESS_ACTION[status as 'accepted' | 'picking_up' | 'at_pickup'].nextStatus;
                  // For envio at_pickup → in_transit: always show pickup code modal
                  if (nextStatus === 'in_transit' && order.order_type === 'envio') {
                    setPickupPinOpen(prev => new Set([...prev, order.id]));
                  } else {
                    updateStatus(order.id, nextStatus);
                  }
                }}
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

              {/* Cancel button — only for picking_up (En camino) and at_pickup (Recogida) */}
              {(status === 'picking_up' || status === 'at_pickup') && (
                <button
                  disabled={!!acting}
                  onClick={() => setCancelOpen(prev => new Set([...prev, order.id]))}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 12,
                    border: '1.5px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#f87171', fontWeight: 700, fontSize: '0.88rem',
                    cursor: acting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <Icon name="x" size={14} color="#f87171" /> Cancelar
                </button>
              )}
            </div>
          )}

          {status === 'in_transit' && !isFinOpen && (() => {
            // Multi-stop: only show Finalizar when ALL stops are done (delivered or failed)
            const stops: any[] = order.order_stops || [];
            const hasStops = stops.length > 0;
            const allStopsDone = hasStops && stops.every((s: any) => s.status === 'delivered' || s.status === 'failed');
            if (hasStops && !allStopsDone) return null;
            return (
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
            );
          })()}

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

      <div style={{ padding: '12px 8px 100px' }}>
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1].map(i => (
              <div key={i} className="tuki-skeleton" style={{ height: 120, borderRadius: 16 }} />
            ))}
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
        const ord = orders.find(o => o.id === orderId);
        const isEnvioSingle = ord?.order_type === 'envio' && !ord?.is_multi_stop;
        const hasDPinConfigured = !!ord?.delivery_pin;
        const dPinVal = deliveryPinVal[orderId] || '';
        const dPinErr = deliveryPinErr[orderId] || '';
        const dPinAttempts = deliveryPinAttempts[orderId] || 0;
        const canDeliveryOverride = dPinAttempts >= 5;
        const confirmDisabled = !!acting || (isEnvioSingle && hasDPinConfigured && dPinVal.length < 4 && !canDeliveryOverride);
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
              {isEnvioSingle ? 'Código de Entrega' : '¿Confirmar entrega?'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 20px', lineHeight: 1.5 }}>
              {isEnvioSingle
                ? hasDPinConfigured
                  ? 'Ingresa el código de 4 dígitos que le envió el remitente al receptor'
                  : 'Pedile al receptor el código que le compartió el remitente'
                : 'Esta acción no se puede deshacer. Se descontará la comisión y el pedido se marcará como finalizado.'
              }
            </p>

            {/* ── Delivery PIN for single-stop envio ── */}
            {isEnvioSingle && hasDPinConfigured && (
              <div style={{
                background: 'rgba(16,185,129,0.08)',
                border: '1.5px solid rgba(16,185,129,0.25)',
                borderRadius: 14, padding: '14px 16px', marginBottom: 18, textAlign: 'left',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: '1rem' }}>🔐</span>
                  <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.82rem' }}>
                    Código del receptor
                  </span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '0 0 10px', lineHeight: 1.4 }}>
                  Pedile al receptor el código de 4 dígitos que le envió el remitente
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={dPinVal}
                  placeholder="0  0  0  0"
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setDeliveryPinVal(prev => ({ ...prev, [orderId]: v }));
                    if (dPinErr) setDeliveryPinErr(prev => ({ ...prev, [orderId]: '' }));
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    fontSize: '1.8rem', fontWeight: 900, letterSpacing: '0.45em',
                    padding: '12px 8px', borderRadius: 12, boxSizing: 'border-box',
                    border: dPinErr ? '2px solid #ef4444' : '2px solid rgba(16,185,129,0.4)',
                    background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
                  }}
                />
                {dPinErr && (
                  <div style={{ color: '#f87171', fontSize: '0.73rem', fontWeight: 600, marginTop: 6 }}>
                    {dPinErr}
                  </div>
                )}
                {dPinAttempts >= 3 && !canDeliveryOverride && (
                  <div style={{ color: '#f59e0b', fontSize: '0.72rem', marginTop: 6 }}>
                    ⚠️ {5 - dPinAttempts} intento{5 - dPinAttempts !== 1 ? 's' : ''} antes de modo emergencia
                  </div>
                )}
                {canDeliveryOverride && (
                  <button
                    onClick={async () => {
                      setConfirmDelivery(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                      if (photoEntry) {
                        try {
                          const ab = await photoEntry.file.arrayBuffer();
                          const b64 = Buffer.from(ab).toString('base64');
                          await authFetch('/api/upload-delivery-photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, base64: b64, mimeType: photoEntry.file.type }) });
                        } catch {}
                        URL.revokeObjectURL(photoEntry.previewUrl);
                        setDeliveryPhotos(prev => { const n = { ...prev }; delete n[orderId]; return n; });
                      }
                      updateStatus(orderId, 'delivered', { pin_override: true });
                    }}
                    style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline', marginTop: 8, padding: 0, textAlign: 'left' }}
                  >
                    ⚠️ Problema con el código — Continuar sin código (se reportará al soporte)
                  </button>
                )}
              </div>
            )}

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
                disabled={confirmDisabled}
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
                  // Pass delivery PIN for envio single-stop orders
                  const extra: Record<string, unknown> = {};
                  if (isEnvioSingle && hasDPinConfigured && dPinVal.length === 4) extra.delivery_pin = dPinVal;
                  updateStatus(orderId, 'delivered', extra);
                }}
                style={{
                  flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                  background: confirmDisabled ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: confirmDisabled ? 'rgba(255,255,255,0.4)' : '#fff',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                  opacity: confirmDisabled ? 0.7 : 1,
                }}
              >
                {acting === orderId + 'delivered' ? '...' : '✅ Sí, entregado'}
              </button>
            </div>
          </div>
        </div>
        );
      })}

      {/* Cancel reason dialog */}
      {[...cancelOpen].map(orderId => {
        const reason = cancelReason[orderId] ?? '';
        const isBusy = acting === orderId + 'driver_cancelled';
        return (
          <div key={orderId} style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 24px',
          }}>
            <div style={{
              background: 'var(--surface-1)',
              border: '1.5px solid rgba(239,68,68,0.45)',
              borderRadius: 20, padding: '28px 24px',
              width: '100%', maxWidth: 360,
              boxShadow: '0 20px 60px rgba(0,0,0,0.85)',
            }}>
              <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 10 }}>🚫</div>
              <h3 style={{ color: '#f87171', fontWeight: 800, fontSize: '1.05rem', margin: '0 0 6px', textAlign: 'center' }}>
                Cancelar envío
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.83rem', margin: '0 0 16px', textAlign: 'center', lineHeight: 1.5 }}>
                ¿Por qué cancelas este envío? Indicá el motivo para notificar al cliente.
              </p>
              <textarea
                value={reason}
                onChange={e => setCancelReason(prev => ({ ...prev, [orderId]: e.target.value }))}
                placeholder="Ej: Problema con el vehículo, emergencia personal, dirección no encontrada..."
                rows={3}
                style={{
                  width: '100%', borderRadius: 10, border: '1.5px solid rgba(239,68,68,0.35)',
                  background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: '0.85rem',
                  padding: '10px 12px', resize: 'none', boxSizing: 'border-box',
                  outline: 'none', fontFamily: 'inherit', marginBottom: 14,
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  disabled={isBusy}
                  onClick={() => {
                    setCancelOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                    setCancelReason(prev => { const n = { ...prev }; delete n[orderId]; return n; });
                  }}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12,
                    border: '1.5px solid var(--border-strong)',
                    background: 'var(--glass-card)', color: 'var(--text-secondary)',
                    fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                  }}
                >
                  Volver
                </button>
                <button
                  disabled={!reason.trim() || isBusy}
                  onClick={() => updateStatus(orderId, 'driver_cancelled', { cancel_reason: reason.trim() })}
                  style={{
                    flex: 2, padding: '13px', borderRadius: 12, border: 'none',
                    background: !reason.trim() || isBusy
                      ? 'rgba(255,255,255,0.06)'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: !reason.trim() || isBusy ? '#6b7280' : '#fff',
                    fontWeight: 800, fontSize: '0.88rem',
                    cursor: !reason.trim() || isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isBusy ? 'Cancelando...' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Pickup PIN Modal */}
      {[...pickupPinOpen].map(orderId => {
        const pPinVal = pickupPinVal[orderId] || '';
        const pPinErr = pickupPinErr[orderId] || '';
        const pPinAttempts = pickupPinAttempts[orderId] || 0;
        const canPickupOverride = pPinAttempts >= 5;
        const orderForPin = orders.find(o => o.id === orderId);
        const hasPinConfigured = !!orderForPin?.pickup_code;
        return (
          <div key={orderId} style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 24px',
          }}>
            <div style={{
              background: 'var(--surface-1)',
              border: '1.5px solid rgba(245,197,24,0.4)',
              borderRadius: 20, padding: '30px 24px',
              width: '100%', maxWidth: 360, textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: 10 }}>🔑</div>
              <h3 style={{ color: '#F5C518', fontWeight: 800, fontSize: '1.15rem', margin: '0 0 8px' }}>
                Código de Retiro
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 20px', lineHeight: 1.5 }}>
                {hasPinConfigured
                  ? 'Ingresa el código de 4 dígitos que te muestra el remitente'
                  : 'Pedile el código al remitente para confirmar el retiro del paquete'}
              </p>
              {hasPinConfigured && (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={pPinVal}
                    autoFocus
                    placeholder="0  0  0  0"
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPickupPinVal(prev => ({ ...prev, [orderId]: v }));
                      if (pPinErr) setPickupPinErr(prev => ({ ...prev, [orderId]: '' }));
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'center',
                      fontSize: '2.2rem', fontWeight: 900, letterSpacing: '0.5em',
                      padding: '14px 8px', borderRadius: 14, boxSizing: 'border-box',
                      border: pPinErr ? '2px solid #ef4444' : '2px solid rgba(245,197,24,0.5)',
                      background: 'var(--surface-2)', color: '#F5C518', outline: 'none',
                      marginBottom: 10,
                    }}
                  />
                  {pPinErr && (
                    <div style={{ color: '#f87171', fontSize: '0.78rem', fontWeight: 600, marginBottom: 8 }}>
                      {pPinErr}
                    </div>
                  )}
                  {pPinAttempts >= 3 && !canPickupOverride && (
                    <div style={{ color: '#f59e0b', fontSize: '0.76rem', marginBottom: 10 }}>
                      ⚠️ {5 - pPinAttempts} intento{5 - pPinAttempts !== 1 ? 's' : ''} antes de modo emergencia
                    </div>
                  )}
                  {canPickupOverride && (
                    <button
                      onClick={() => {
                        setPickupPinOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                        updateStatus(orderId, 'in_transit', { pin_override: true });
                      }}
                      style={{
                        background: 'none', border: 'none', color: '#f59e0b',
                        fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline',
                        marginBottom: 14, padding: 0, display: 'block', width: '100%',
                      }}
                    >
                      ⚠️ Problema con el código — Continuar sin código (se reportará al soporte)
                    </button>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <button
                  onClick={() => {
                    setPickupPinOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                    setPickupPinVal(prev => { const n = { ...prev }; delete n[orderId]; return n; });
                    setPickupPinErr(prev => { const n = { ...prev }; delete n[orderId]; return n; });
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
                  disabled={(hasPinConfigured && pPinVal.length < 4 && !canPickupOverride) || !!acting}
                  onClick={() => {
                    setPickupPinOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                    updateStatus(orderId, 'in_transit', hasPinConfigured ? { pickup_code: pPinVal } : {});
                  }}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                    background: (hasPinConfigured && pPinVal.length < 4 && !canPickupOverride) || !!acting
                      ? 'rgba(255,255,255,0.08)'
                      : 'linear-gradient(135deg, #F5C518, #d4a017)',
                    color: (hasPinConfigured && pPinVal.length < 4 && !canPickupOverride) || !!acting ? 'rgba(255,255,255,0.4)' : '#000',
                    fontWeight: 800, fontSize: '0.9rem',
                    cursor: (hasPinConfigured && pPinVal.length < 4 && !canPickupOverride) || !!acting ? 'not-allowed' : 'pointer',
                    opacity: (hasPinConfigured && pPinVal.length < 4 && !canPickupOverride) || !!acting ? 0.7 : 1,
                  }}
                >
                  Confirmar
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
