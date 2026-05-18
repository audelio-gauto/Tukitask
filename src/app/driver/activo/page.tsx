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

const ACTIVE_STATUSES = ['accepted', 'picking_up', 'at_pickup', 'in_transit', 'returning', 'driver_returning', 'return_delivered', 'awaiting_payment', 'payment_confirmed'] as const;
type ActiveStatus = typeof ACTIVE_STATUSES[number];

const STATUS_LABEL: Record<ActiveStatus, { label: string; icon: ComponentProps<typeof Icon>['name'] }> = {
  accepted:          { label: 'Aceptado',                           icon: 'check'          },
  awaiting_payment:  { label: 'Esperando pago del cliente',         icon: 'clock'          },
  payment_confirmed: { label: 'Pago recibido — Ir a comprar',        icon: 'shopping-cart'  },
  picking_up:        { label: 'En camino al punto de recogida',     icon: 'car'            },
  at_pickup:         { label: 'En punto de recogida',               icon: 'package'        },
  in_transit:        { label: 'En camino al destino',               icon: 'car'            },
  returning:         { label: 'Devolución solicitada (esperando cliente)', icon: 'clock' },
  driver_returning:  { label: 'Cliente aceptó — Ir a devolver',    icon: 'package'        },
  return_delivered:  { label: 'Esperando confirmación del cliente', icon: 'clock'          },
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
  // Arrived confirmation (picking_up → at_pickup)
  const [arrivedConfirmOpen, setArrivedConfirmOpen] = useState<Set<string>>(new Set());

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

  // Mandadito: local checklist state per order (no DB — just helps driver track items)
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<number>>>({});

  // ── Mandadito payment request modal ──────────────────────────────────────
  const [payReqModal, setPayReqModal] = useState<{ orderId: string } | null>(null);
  const [payReqAlias, setPayReqAlias] = useState('');
  const [payReqPhase, setPayReqPhase] = useState<'edit' | 'waiting'>('edit');
  const [payReqSending, setPayReqSending] = useState(false);
  const [driverAlias, setDriverAlias] = useState('');
  const [payReqElapsed, setPayReqElapsed] = useState(0);

  const toggleItem = (orderId: string, idx: number) => {
    setCheckedItems(prev => {
      const current = new Set(prev[orderId] ?? []);
      current.has(idx) ? current.delete(idx) : current.add(idx);
      return { ...prev, [orderId]: current };
    });
  };

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

  // Load driver alias for payment modal
  useEffect(() => {
    if (!email) return;
    fetch(`/api/driver-profile?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const alias = d?.profile?.tigo_money_alias || d?.profile?.phone || '';
        setDriverAlias(alias);
      })
      .catch(() => {});
  }, [email]);

  // Timer for payment request waiting phase
  useEffect(() => {
    if (!payReqModal || payReqPhase !== 'waiting') return;
    const lsKey = `payment_req_at_${payReqModal.orderId}`;
    const storedAt = Number(localStorage.getItem(lsKey) || 0);
    const initial = storedAt ? Math.max(0, Math.floor((Date.now() - storedAt) / 1000)) : 0;
    setPayReqElapsed(initial);
    const iv = setInterval(() => setPayReqElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, [payReqModal?.orderId, payReqPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to order proof upload while modal is open (realtime polling)
  useEffect(() => {
    if (!payReqModal || payReqPhase !== 'waiting') return;
    const ord = orders.find(o => o.id === payReqModal.orderId);
    // If order reverted to accepted (client cancelled), close modal
    if (ord && ord.status === 'accepted') { setPayReqModal(null); }
  }, [orders, payReqModal, payReqPhase]);

  // Open payment request modal
  const openPayReqModal = (orderId: string, alreadyWaiting = false) => {
    setPayReqAlias(driverAlias);
    if (alreadyWaiting) {
      const lsKey = `payment_req_at_${orderId}`;
      if (!localStorage.getItem(lsKey)) localStorage.setItem(lsKey, String(Date.now() - 30_000));
      setPayReqPhase('waiting');
    } else {
      setPayReqPhase('edit');
    }
    setPayReqModal({ orderId });
  };

  // Send payment request: save alias (if changed) → set awaiting_payment
  const sendPaymentRequest = async () => {
    if (!payReqModal || payReqSending) return;
    setPayReqSending(true);
    try {
      if (payReqAlias.trim() !== driverAlias) {
        authFetch('/api/driver-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, tigo_money_alias: payReqAlias.trim() || null }),
        }).then(() => setDriverAlias(payReqAlias.trim())).catch(() => {});
      }
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: payReqModal.orderId, status: 'awaiting_payment', driver_email: email }),
      });
      if (res.ok) {
        localStorage.setItem(`payment_req_at_${payReqModal.orderId}`, String(Date.now()));
        setOrders(prev => prev.map(o => o.id === payReqModal.orderId ? { ...o, status: 'awaiting_payment' } : o));
        setPayReqPhase('waiting');
      } else {
        showToast('⚠️ Error al enviar solicitud. Intentá de nuevo.');
      }
    } finally {
      setPayReqSending(false);
    }
  };

  // Cancel payment request → back to accepted
  const cancelPaymentRequest = async (orderId: string) => {
    const res = await authFetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, status: 'accepted', driver_email: email }),
    });
    if (res.ok) {
      localStorage.removeItem(`payment_req_at_${orderId}`);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'accepted' } : o));
      setPayReqModal(null);
      showToast('Solicitud de pago cancelada');
    }
  };

  const fmtElapsed = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

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
          {/* Mandadito: shopping checklist — visible during shopping flow */}
          {order.order_type === 'mandadito' && order.shopping_list &&
            ['awaiting_payment', 'payment_confirmed', 'picking_up', 'at_pickup', 'in_transit'].includes(status) && (() => {
              const lines = (order.shopping_list as string)
                .split('\n')
                .map((l: string) => l.trim())
                .filter(Boolean);
              if (!lines.length) return null;
              const checked = checkedItems[order.id] ?? new Set<number>();
              const doneCount = checked.size;
              return (
                <div style={{ marginBottom: 14, borderRadius: 12, border: '1.5px solid rgba(245,197,24,0.3)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(245,197,24,0.08)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: BRAND }}>
                      🛒 Lista de compras
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: doneCount === lines.length ? '#4ade80' : 'rgba(245,197,24,0.7)' }}>
                      {doneCount}/{lines.length}
                    </span>
                  </div>
                  <div style={{ padding: '4px 0 6px' }}>
                    {lines.map((item: string, idx: number) => {
                      const done = checked.has(idx);
                      return (
                        <button
                          key={idx}
                          onClick={() => toggleItem(order.id, idx)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', border: 'none', background: 'transparent',
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <div style={{
                            flexShrink: 0, width: 20, height: 20, borderRadius: 6,
                            border: `2px solid ${done ? '#4ade80' : 'rgba(245,197,24,0.5)'}`,
                            background: done ? 'rgba(34,197,94,0.2)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}>
                            {done && <span style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{
                            fontSize: '0.82rem', color: done ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: done ? 'line-through' : 'none',
                            transition: 'all 0.15s', flex: 1,
                          }}>
                            {item}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          }

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

              {/* Map buttons — shown only for relevant statuses */}
              {(() => {
                const showPickup = (status === 'accepted' || status === 'picking_up') && order.pickup_address;
                const showDelivery = status === 'at_pickup' || status === 'in_transit';
                if (!showPickup && !showDelivery) return null;

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
                    {showPickup && (
                      <button
                        onClick={() => openMaps(navApp, order.pickup_address)}
                        className="tuki-btn tuki-btn-warning tuki-btn-sm"
                        style={{ flex: 1 }}
                      >
                        <Icon name="map" size={14} /> Ir a Recogida
                      </button>
                    )}
                    {showDelivery && deliveryAddr && (
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
                                style={sPin.length === 4 ? { background: 'rgba(245,197,24,0.15)', borderColor: '#F5C518', color: '#F5C518' } : undefined}
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
          {/* For mandadito: accepted shows "Solicitar pago" instead */}

          {/* ── Mandadito: solicitar pago (accepted) ── */}
          {order.order_type === 'mandadito' && status === 'accepted' && (
            <button
              onClick={() => openPayReqModal(order.id, false)}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: `linear-gradient(135deg, ${BRAND}, #F58A07)`,
                color: '#1C1C2E', fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
                boxShadow: `0 4px 18px ${BRAND_SHADOW}`,
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Icon name="shopping-cart" size={15} color="#1C1C2E" /> Solicitar pago al cliente
            </button>
          )}

          {/* ── Mandadito: esperando comprobante (awaiting_payment) ── */}
          {order.order_type === 'mandadito' && status === 'awaiting_payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {order.payment_proof_url ? (
                <button
                  onClick={() => openPayReqModal(order.id, true)}
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: 14, border: '2px solid rgba(34,197,94,0.5)',
                    background: 'rgba(34,197,94,0.10)', color: '#4ade80',
                    fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  ✅ Comprobante recibido — Ver y confirmar pago
                </button>
              ) : (
                <button
                  onClick={() => openPayReqModal(order.id, true)}
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: 14, border: '1px solid rgba(245,158,11,0.4)',
                    background: 'rgba(245,158,11,0.08)', color: '#fbbf24',
                    fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <Icon name="clock" size={16} color="#f59e0b" />
                  <div style={{ textAlign: 'left' }}>
                    <div>Esperando comprobante del cliente</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 400, opacity: 0.75, marginTop: 2 }}>Tocá para ver detalles y tiempo</div>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* ── Mandadito: pago confirmado → ir a comprar (payment_confirmed) ── */}
          {order.order_type === 'mandadito' && status === 'payment_confirmed' && (
            <button
              disabled={!!acting}
              onClick={() => updateStatus(order.id, 'picking_up')}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                background: acting ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${BRAND}, #F58A07)`,
                color: acting ? '#6b7280' : '#1C1C2E',
                fontWeight: 800, fontSize: '1rem', cursor: acting ? 'not-allowed' : 'pointer',
                boxShadow: acting ? 'none' : `0 4px 18px ${BRAND_SHADOW}`,
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {acting === order.id + 'picking_up'
                ? 'Actualizando...'
                : <><Icon name="shopping-cart" size={15} color="#1C1C2E" /> Ir a comprar al local</>}
            </button>
          )}

          {(status === 'accepted' || status === 'picking_up' || status === 'at_pickup') && order.order_type !== 'mandadito' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                disabled={!!acting}
                onClick={() => {
                  const nextStatus = PROGRESS_ACTION[status as 'accepted' | 'picking_up' | 'at_pickup'].nextStatus;
                  // For envio at_pickup → in_transit: always show pickup code modal
                  if (nextStatus === 'in_transit' && order.order_type === 'envio') {
                    setPickupPinOpen(prev => new Set([...prev, order.id]));
                  } else if (nextStatus === 'at_pickup') {
                    // Show confirmation before marking arrived
                    setArrivedConfirmOpen(prev => new Set([...prev, order.id]));
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
      {/* Arrived Confirmation Modal */}
      {[...arrivedConfirmOpen].map(orderId => {
        const isBusy = acting === orderId + 'at_pickup';
        return (
          <div key={orderId} style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 24px',
          }}>
            <div style={{
              background: 'var(--surface-1)',
              border: `1.5px solid ${BRAND}55`,
              borderRadius: 20, padding: '28px 24px',
              width: '100%', maxWidth: 360,
              boxShadow: '0 20px 60px rgba(0,0,0,0.85)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📍</div>
              <h3 style={{ color: BRAND, fontWeight: 800, fontSize: '1.05rem', margin: '0 0 8px' }}>
                ¿Ya llegaste al punto de recogida?
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.83rem', margin: '0 0 20px', lineHeight: 1.5 }}>
                Confirmá solo cuando estés en el lugar. El cliente recibirá una notificación de que llegaste.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  disabled={isBusy}
                  onClick={() => setArrivedConfirmOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; })}
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
                  disabled={isBusy}
                  onClick={() => {
                    setArrivedConfirmOpen(prev => { const n = new Set(prev); n.delete(orderId); return n; });
                    updateStatus(orderId, 'at_pickup');
                  }}
                  style={{
                    flex: 2, padding: '13px', borderRadius: 12, border: 'none',
                    background: isBusy ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${BRAND}, #F58A07)`,
                    color: isBusy ? '#6b7280' : '#1C1C2E',
                    fontWeight: 800, fontSize: '0.88rem',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isBusy ? 'Confirmando...' : 'Sí, ya llegué'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

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

      {/* ── Payment Request Modal (Mandadito) ─────────────────────────────── */}
      {payReqModal && (() => {
        const ord = orders.find(o => o.id === payReqModal.orderId);
        const shoppingLines = ord?.shopping_list
          ? (ord.shopping_list as string).split('\n').map((l: string) => l.trim()).filter(Boolean)
          : [];
        const canCancel = payReqElapsed >= 600; // 10 minutes
        const minsLeft = Math.max(0, Math.ceil((600 - payReqElapsed) / 60));
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px 20px',
            }}
            onClick={e => { if (e.target === e.currentTarget) setPayReqModal(null); }}
          >
            <div style={{
              background: 'var(--surface-1)',
              border: `1.5px solid ${payReqPhase === 'waiting' ? 'rgba(245,158,11,0.45)' : 'rgba(245,197,24,0.35)'}`,
              borderRadius: 22,
              width: '100%', maxWidth: 400,
              maxHeight: '88dvh', overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            }}>
              {/* Header */}
              <div style={{
                padding: '20px 22px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: BRAND }}>
                    {payReqPhase === 'edit' ? '💳 Solicitar pago' : '⏳ Esperando comprobante'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {payReqPhase === 'edit' ? 'Revisá tu alias antes de enviar' : 'El cliente debe transferir y subir foto'}
                  </div>
                </div>
                <button
                  onClick={() => setPayReqModal(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer', padding: 4 }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Phase: EDIT ALIAS */}
                {payReqPhase === 'edit' && (
                  <>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                        Alias / Número de Tigo Money
                      </label>
                      <input
                        type="text"
                        value={payReqAlias}
                        onChange={e => setPayReqAlias(e.target.value)}
                        placeholder="Ej: 0991-123456 o @tu.alias"
                        autoFocus
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '13px 16px', borderRadius: 12,
                          border: '1.5px solid rgba(245,197,24,0.4)',
                          background: 'var(--surface-2)', color: 'var(--text-primary)',
                          fontSize: '1.05rem', fontWeight: 700, outline: 'none', fontFamily: 'monospace',
                        }}
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                        Este número verá el cliente para hacer la transferencia
                      </div>
                    </div>

                    {shoppingLines.length > 0 && (
                      <div style={{ borderRadius: 12, border: '1px solid rgba(245,197,24,0.2)', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 14px', background: 'rgba(245,197,24,0.07)', fontSize: '0.73rem', fontWeight: 800, color: BRAND }}>
                          🛒 Lista de compras del cliente
                        </div>
                        <div style={{ padding: '6px 0' }}>
                          {shoppingLines.map((item: string, i: number) => (
                            <div key={i} style={{ padding: '6px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)', borderBottom: i < shoppingLines.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                              • {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={() => setPayReqModal(null)}
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
                        disabled={!payReqAlias.trim() || payReqSending}
                        onClick={sendPaymentRequest}
                        style={{
                          flex: 2, padding: '13px', borderRadius: 12, border: 'none',
                          background: !payReqAlias.trim() || payReqSending
                            ? 'rgba(255,255,255,0.08)'
                            : `linear-gradient(135deg, ${BRAND}, #F58A07)`,
                          color: !payReqAlias.trim() || payReqSending ? 'rgba(255,255,255,0.3)' : '#1C1C2E',
                          fontWeight: 800, fontSize: '0.95rem',
                          cursor: !payReqAlias.trim() || payReqSending ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {payReqSending ? 'Enviando...' : '📤 Enviar solicitud de pago'}
                      </button>
                    </div>
                  </>
                )}

                {/* Phase: WAITING */}
                {payReqPhase === 'waiting' && (
                  <>
                    {/* Alias display */}
                    <div style={{
                      background: 'rgba(245,158,11,0.08)',
                      border: '1.5px solid rgba(245,158,11,0.35)',
                      borderRadius: 14, padding: '14px 18px',
                    }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                        Alias enviado al cliente
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: 1 }}>
                        {payReqAlias || driverAlias || '—'}
                      </div>
                    </div>

                    {/* Timer */}
                    <div style={{ textAlign: 'center', padding: '4px 0' }}>
                      <div style={{ fontSize: '2.4rem', fontWeight: 900, color: payReqElapsed >= 600 ? '#ef4444' : BRAND, fontFamily: 'monospace', letterSpacing: 2 }}>
                        {fmtElapsed(payReqElapsed)}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 3 }}>
                        {payReqElapsed >= 600 ? 'Tiempo superado — podés cancelar la solicitud' : `esperando respuesta del cliente`}
                      </div>
                    </div>

                    {/* Proof image if uploaded */}
                    {ord?.payment_proof_url ? (
                      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1.5px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.05)' }}>
                        <div style={{ padding: '8px 14px 6px', fontSize: '0.72rem', fontWeight: 700, color: '#4ade80' }}>
                          ✅ Comprobante recibido
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ord.payment_proof_url} alt="Comprobante de pago" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#0f172a', display: 'block' }} />
                        <button
                          disabled={!!acting}
                          onClick={async () => {
                            await updateStatus(payReqModal.orderId, 'picking_up');
                            localStorage.removeItem(`payment_req_at_${payReqModal.orderId}`);
                            setPayReqModal(null);
                          }}
                          style={{
                            width: '100%', padding: '14px', border: 'none',
                            background: acting ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#22c55e,#16a34a)',
                            color: '#fff', fontWeight: 800, fontSize: '1rem',
                            cursor: acting ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {acting === payReqModal.orderId + 'picking_up' ? 'Confirmando...' : '✓ Confirmé el pago — Ir a comprar'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Aún sin comprobante · La pantalla se actualiza automáticamente
                        </div>
                      </div>
                    )}

                    {/* Cancel button — enabled after 10 min */}
                    <div style={{ marginTop: 4 }}>
                      {canCancel ? (
                        <button
                          onClick={() => cancelPaymentRequest(payReqModal.orderId)}
                          style={{
                            width: '100%', padding: '12px', borderRadius: 12,
                            border: '1.5px solid rgba(239,68,68,0.5)',
                            background: 'rgba(239,68,68,0.08)', color: '#f87171',
                            fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                          }}
                        >
                          Cancelar solicitud de pago
                        </button>
                      ) : (
                        <div style={{
                          textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)',
                          padding: '10px 14px', borderRadius: 10,
                          border: '1px solid var(--border-subtle)',
                          background: 'rgba(255,255,255,0.03)',
                        }}>
                          Cancelar disponible en {minsLeft} min {minsLeft === 1 ? '' : ''}si no hay respuesta
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </DriverScreenLayout>
  );
}
