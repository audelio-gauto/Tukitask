'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useDriverContext, VEHICLE_TO_FILTER } from '../context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { playNewOrderAlert, playAccepted } from '@/lib/audio';
import ChatModal from '@/components/ChatModal';

const DriverMap = dynamic(() => import('../components/DriverMap'), { ssr: false });

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

const CARD_TIMER = 50;
function getRemaining(createdAt: string) {
  return Math.max(0, CARD_TIMER - Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
}
function CountdownRing({ seconds }: { seconds: number }) {
  const r = 14, circ = 2 * Math.PI * r;
  const dash = circ * (seconds / CARD_TIMER);
  const c = seconds > 20 ? '#22c55e' : seconds > 10 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#1e293b" strokeWidth="3"/>
      <circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
      <text x="18" y="23" textAnchor="middle" fontSize="10" fontWeight="800" fill={c}>{seconds}</text>
    </svg>
  );
}

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function getNavUrl(lat: number, lng: number, app: string) {
  if (app === 'waze') return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export default function DeliveriesPage() {
  const { serviceFilters, email, displayName, profilePhoto, navApp } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offerAmounts, setOfferAmounts] = useState<Record<string, string>>({});
  const [offerNotes, setOfferNotes] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  // sentOffers: { [orderId]: { amount: number, status: string } }
  const [sentOffers, setSentOffers] = useState<Record<string, { amount: number, status: string }>>({});
  const [activeJob, setActiveJob] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [dismissedOrders, setDismissedOrders] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  // Fail delivery modal state
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [showFailReason, setShowFailReason] = useState(false);
  const [failReason, setFailReason] = useState('');

  // Multi-stop state
  const [stopBeingDelivered, setStopBeingDelivered] = useState<string | null>(null); // stop id
  const [stopFailReason, setStopFailReason] = useState('');
  const [showStopFail, setShowStopFail] = useState<string | null>(null); // stop id

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatToast, setChatToast] = useState<{ from: string | null; text: string } | null>(null);
  const chatOpenRef = useRef(false);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevOrderIds = useRef<Set<string>>(new Set());
  const prevAccepted = useRef(false);
  const soundTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobRef = useRef<any>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => { activeJobRef.current = activeJob; }, [activeJob]);

  // 1-second tick for countdown rings
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Auto-dismiss cards when timer expires and no offer was sent
  useEffect(() => {
    filteredOrders.forEach(o => {
      if (!dismissedOrders.has(o.id) && !sentOffers[o.id] && getRemaining(o.created_at) === 0) {
        handleDismiss(o.id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /* ── Fetch pending/negotiating orders ── */
  const fetchOrders = useCallback(() => {
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setOrders(data);
        const ids = new Set(data.map((o: any) => o.id as string));
        if (prevOrderIds.current.size > 0) {
          for (const id of ids) { if (!prevOrderIds.current.has(id)) { playNewOrderAlert(); break; } }
        }
        prevOrderIds.current = ids;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  /* ── Fetch my active job (accepted/picking_up/in_transit) ── */
  const fetchActiveJob = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return; // network/parse error — don't clear
        if (data.length === 0) {
          // Only protect against clearing during brief post-accept transition
          if (!activeJobRef.current || !['accepted','picking_up','in_transit'].includes(activeJobRef.current?.status)) {
            setActiveJob(null);
            activeJobRef.current = null;
          }
          return;
        }
        const job = data[0];
        // If the order was cancelled (e.g. client cancelled while driver was returning), clear active job
        if (job.status === 'cancelled') {
          setActiveJob(null);
          activeJobRef.current = null;
          prevAccepted.current = false;
          return;
        }
        if (!prevAccepted.current && job.status === 'accepted') playAccepted();
        prevAccepted.current = true;
        setActiveJob(job);
        activeJobRef.current = job;
      })
      .catch(() => {}); // network error — keep current state, don't clear
  }, [email]);

  /* ── Fetch my offers ── */
  const fetchMyOffers = useCallback(() => {
    if (!email) return;
    fetch(`/api/orders/offers?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const offers: Record<string, { amount: number, status: string }> = {};
        for (const o of data) {
          if (o.order_id) offers[o.order_id] = { amount: Number(o.amount), status: o.status };
          if (o.status === 'accepted' && !prevAccepted.current) {
            playAccepted();
            prevAccepted.current = true;
          }
        }
        setSentOffers(offers);
      })
      .catch(() => {});
  }, [email]);

  // Initial load + lazy fallback polling (realtime is primary)
  useEffect(() => {
    fetchOrders(); fetchMyOffers(); fetchActiveJob();
    const iv = setInterval(() => { fetchOrders(); fetchMyOffers(); fetchActiveJob(); }, 8_000);
    return () => clearInterval(iv);
  }, [fetchOrders, fetchMyOffers, fetchActiveJob]);

  /* ── Supabase Realtime: instant notification like Bolt/Uber ── */
  useEffect(() => {
    const ch = supabase.channel(`driver-deliveries-${email || 'anon'}`);

    // New pending/negotiating orders → alert driver instantly
    ch.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
    } as never, () => {
      fetchOrders();
      playNewOrderAlert();
    });

    // Order status changes (accepted, cancelled, etc.)
    ch.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
    } as never, () => {
      fetchOrders();
      fetchActiveJob();
    });

    // New driver offers (when other drivers send offers / client accepts)
    ch.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'driver_offers',
    } as never, () => {
      fetchMyOffers();
      fetchActiveJob();
    });

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [email, fetchOrders, fetchActiveJob, fetchMyOffers]);

  /* ── Chat: conteo de no leídos + Realtime para el badge ── */
  useEffect(() => {
    if (!email || !activeJob?.id) { setChatUnread(0); return; }
    const orderId = activeJob.id;

    // Carga inicial
    authFetch(`/api/chat?order_id=${orderId}&count=1`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.unread > 0) setChatUnread(d.unread); })
      .catch(() => {});

    // Realtime
    const ch = supabase
      .channel(`chat-badge-driver-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `order_id=eq.${orderId}`,
      } as never, (payload: { new: { sender_email: string; sender_name: string | null; content: string } }) => {
        const msg = payload.new;
        if (msg.sender_email === email) return;
        if (chatOpenRef.current) return;
        setChatUnread(u => u + 1);
        if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
        setChatToast({ from: msg.sender_name, text: msg.content.slice(0, 70) });
        chatToastTimerRef.current = setTimeout(() => setChatToast(null), 6000);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [email, activeJob?.id]);

  const filteredOrders = useMemo(() =>
    orders.filter(o => { const fk = VEHICLE_TO_FILTER[o.vehicle_type]; return !fk || serviceFilters[fk]; }),
  [orders, serviceFilters]);

  const unrespondedCount = useMemo(() =>
    filteredOrders.filter(o => !sentOffers[o.id]).length,
  [filteredOrders, sentOffers]);

  useEffect(() => {
    if (soundTimer.current) { clearInterval(soundTimer.current); soundTimer.current = null; }
    if (!loading && unrespondedCount > 0 && !activeJob) {
      soundTimer.current = setInterval(playNewOrderAlert, 6000);
    }
    return () => { if (soundTimer.current) clearInterval(soundTimer.current); };
  }, [loading, unrespondedCount, activeJob]);

  /* ── Status transitions ── */
  // Reset fail modal when job leaves in_transit
  useEffect(() => {
    if (activeJob?.status !== 'in_transit') {
      setShowDeliveryConfirm(false);
      setShowFailReason(false);
      setFailReason('');
    }
  }, [activeJob?.status]);

  // Auto-open navigation when client accepts the return (driver_returning)
  useEffect(() => {
    if (
      activeJob?.status === 'driver_returning' &&
      prevStatusRef.current === 'returning' &&
      activeJob.pickup_lat
    ) {
      window.open(getNavUrl(activeJob.pickup_lat, activeJob.pickup_lng, navApp), '_blank');
    }
    prevStatusRef.current = activeJob?.status ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.status]);

  /* ── Mark a single stop as delivered or failed ── */
  const handleStopTransition = async (stopId: string, stopStatus: 'delivered' | 'failed', reason?: string) => {
    if (!activeJob) return;
    setTransitioning(true);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: activeJob.id,
          stop_id: stopId,
          stop_status: stopStatus,
          driver_email: email,
          ...(reason ? { fail_reason: reason } : {}),
        }),
      });
      if (res.ok) {
        // Refresh active job to get updated stops
        await new Promise<void>(resolve => {
          fetch(`/api/orders?driver_email=${encodeURIComponent(email ?? '')}`)
            .then(r => r.json())
            .then((data: any[]) => {
              if (Array.isArray(data) && data.length > 0) {
                setActiveJob(data[0]);
                activeJobRef.current = data[0];
                // If all stops done, the order will be delivered — clear it
                if (data[0].status === 'delivered') {
                  playAccepted();
                  setActiveJob(null);
                  activeJobRef.current = null;
                  prevAccepted.current = false;
                }
              } else if (data.length === 0) {
                // All stops done, order auto-delivered
                playAccepted();
                setActiveJob(null);
                activeJobRef.current = null;
                prevAccepted.current = false;
              }
              resolve();
            })
            .catch(() => resolve());
        });
        setStopBeingDelivered(null);
        setShowStopFail(null);
        setStopFailReason('');
      } else {
        alert('Error al actualizar parada. Intentá de nuevo.');
      }
    } catch { alert('Error al actualizar parada. Intentá de nuevo.'); }
    setTransitioning(false);
  };

  const handleFailed = async (reason: string) => {
    if (!activeJob) return;
    setTransitioning(true);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: activeJob.id, status: 'failed', driver_email: email, fail_reason: reason }),
      });
      if (res.ok) {
        setActiveJob(null);
        activeJobRef.current = null;
        prevAccepted.current = false;
        prevStatusRef.current = null;
      } else {
        alert('Error al reportar falla. Intentá de nuevo.');
      }
    } catch { alert('Error al reportar falla. Intentá de nuevo.'); }
    setTransitioning(false);
  };

  const handleTransition = async (orderId: string, newStatus: string) => {
    setTransitioning(true);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus, driver_email: email }),
      });
      if (res.ok) {
        if (newStatus === 'delivered') {
          playAccepted();
          setActiveJob(null);
          activeJobRef.current = null;
          prevAccepted.current = false;
        } else {
          setActiveJob((j: any) => j ? { ...j, status: newStatus } : j);
        }
      } else {
        alert('Error al actualizar estado. Intentá de nuevo.');
      }
    } catch { alert('Error al actualizar estado. Intentá de nuevo.'); }
    setTransitioning(false);
  };

  // Helper: POST oferta y manejar todos los casos de error con mensajes claros
  const postOffer = async (orderId: string, amount: number, note: string | null): Promise<boolean> => {
    const res = await authFetch('/api/orders/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, driver_email: email, driver_name: displayName, driver_photo: profilePhoto, amount, note }),
    });
    if (res.ok) return true;

    // Leer el error del servidor
    let serverMsg = '';
    try { const j = await res.json(); serverMsg = j?.error || ''; } catch { /* ignore */ }

    if (res.status === 401) {
      alert('Tu sesión expiró. Cerrá sesión y volvé a entrar para enviar ofertas.');
    } else if (res.status === 409) {
      // Pedido ya tomado — sacarlo de la lista automáticamente
      setOrders(prev => prev.filter(o => o.id !== orderId));
      alert('Este pedido ya fue tomado por otro conductor.');
    } else if (res.status === 429) {
      alert('Enviaste demasiadas ofertas seguidas. Esperá unos segundos.');
    } else if (res.status === 402) {
      alert('Saldo insuficiente en tu billetera para enviar ofertas. Recargá para continuar.');
    } else {
      alert(serverMsg || 'No se pudo enviar la oferta. Verificá tu conexión e intentá de nuevo.');
    }
    return false;
  };

  const handleSendOffer = async (orderId: string, directAmount?: number) => {
    const amount = directAmount ? String(directAmount) : offerAmounts[orderId];
    if (!amount || Number(amount) <= 0) return;
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const ok = await postOffer(orderId, Number(amount), offerNotes[orderId] || null);
      if (ok) {
        setSentOffers(s => ({ ...s, [orderId]: { amount: Number(amount), status: 'pending' } }));
        setOfferAmounts(o => ({ ...o, [orderId]: '' }));
        setOfferNotes(n => ({ ...n, [orderId]: '' }));
      }
    } catch { alert('Error de red al enviar oferta. Verificá tu conexión.'); }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleAcceptPrice = async (orderId: string, clientOffer: number) => {
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const ok = await postOffer(orderId, clientOffer, offerNotes[orderId] || null);
      if (ok) {
        setSentOffers(s => ({ ...s, [orderId]: { amount: clientOffer, status: 'pending' } }));
        setOfferNotes(n => ({ ...n, [orderId]: '' }));
      }
    } catch { alert('Error de red al aceptar precio. Verificá tu conexión.'); }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleDismiss = useCallback((orderId: string) => {
    setDismissedOrders(prev => new Set([...prev, orderId]));
    setTimeout(() => {
      setDismissedOrders(prev => { const next = new Set(prev); next.delete(orderId); return next; });
    }, 60_000);
  }, []);


  // Pagination for sheetOrders
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PER_PAGE = 10;
  const sheetOrders = useMemo(() =>
    filteredOrders.filter(o => !dismissedOrders.has(o.id)).slice(0, ordersPage * ORDERS_PER_PAGE),
  [filteredOrders, dismissedOrders, ordersPage]);

  const activeJobPickup = activeJob?.pickup_lat != null ? { lat: activeJob.pickup_lat, lng: activeJob.pickup_lng } : null;
  const activeJobDelivery = activeJob?.delivery_lat != null ? { lat: activeJob.delivery_lat, lng: activeJob.delivery_lng } : null;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#1a1a2e', zIndex: 0 }}>

      {/* ── MAP BACKGROUND ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <DriverMap pickup={activeJobPickup} delivery={activeJobDelivery} />
      </div>

      {/* ── FLOATING HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: 'env(safe-area-inset-top, 0.5rem) 1rem 0.75rem',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'max(env(safe-area-inset-top, 8px), 12px)',
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: 0.5 }}>{displayName || 'Tuki Driver'}</span>
        {activeJob && (
          <span style={{ background: '#10b981', color: '#fff', paddingInline: 12, paddingBlock: 4, borderRadius: 99, fontSize: '0.78rem', fontWeight: 700 }}>● En servicio</span>
        )}
        {!activeJob && unrespondedCount > 0 && (
          <span style={{ background: '#facc15', color: '#111', paddingInline: 12, paddingBlock: 4, borderRadius: 99, fontSize: '0.78rem', fontWeight: 700 }}>
            {unrespondedCount} solicitud{unrespondedCount !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* ════════════ ACTIVE JOB CARD ════════════ */}
      {activeJob && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: '#1a1a2e', borderRadius: '24px 24px 0 0',
          padding: '0.5rem 1rem 1.5rem',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
          maxHeight: '62vh', overflowY: 'auto',
          animation: 'slideUp 0.25s ease-out',
        }}>
          {/* Pull tab */}
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#444', margin: '8px auto 14px' }} />

          {/* Tracking code + nav badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ color: '#C8960A', fontWeight: 700, fontSize: '0.82rem' }}>#{genTrackingCode(activeJob.id)}</span>
            {activeJob.status === 'accepted' && activeJob.pickup_lat && (
              <a href={getNavUrl(activeJob.pickup_lat, activeJob.pickup_lng, navApp)} target="_blank" rel="noopener noreferrer"
                style={{ background: '#10b981', color: '#fff', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}>
                📍 Ir a recoger
              </a>
            )}
            {(activeJob.status === 'picking_up' || activeJob.status === 'in_transit') && (() => {
              // For multi-stop: navigate to first pending stop
              if (activeJob.is_multi_stop && activeJob.stops?.length > 0) {
                const pendingStop = [...(activeJob.stops as any[])]
                  .sort((a: any, b: any) => a.sequence - b.sequence)
                  .find((s: any) => s.status === 'pending');
                if (pendingStop?.lat && pendingStop?.lng) {
                  return (
                    <a href={getNavUrl(pendingStop.lat, pendingStop.lng, navApp)} target="_blank" rel="noopener noreferrer"
                      style={{ background: '#10b981', color: '#fff', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}>
                      🚛 Parada {pendingStop.sequence}
                    </a>
                  );
                }
              }
              // Single-stop
              if (activeJob.delivery_lat) {
                return (
                  <a href={getNavUrl(activeJob.delivery_lat, activeJob.delivery_lng, navApp)} target="_blank" rel="noopener noreferrer"
                    style={{ background: '#10b981', color: '#fff', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}>
                    🚛 Ir a entregar
                  </a>
                );
              }
              return null;
            })()}
            {activeJob.status === 'driver_returning' && activeJob.pickup_lat && (
              <a href={getNavUrl(activeJob.pickup_lat, activeJob.pickup_lng, navApp)} target="_blank" rel="noopener noreferrer"
                style={{ background: '#f59e0b', color: '#111', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}>
                🔄 Ir a devolver
              </a>
            )}
            {activeJob.status === 'return_delivered' && (
              <span style={{ background: '#F5C518', color: '#1C1C2E', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700 }}>
                ⏳ Esperando cliente
              </span>
            )}
            {activeJob.status === 'returning' && (
              <span style={{ background: '#d97706', color: '#fff', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700 }}>
                ⚠️ Fallido
              </span>
            )}
          </div>

          {/* Route A → B (or multi-stop) */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>A</div>
              <div style={{ width: 2, flex: 1, minHeight: 20, background: '#444', margin: '3px 0' }} />
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                {activeJob.is_multi_stop ? activeJob.stop_count : 'B'}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.88rem', color: '#d1d5db', lineHeight: 1.35, marginBottom: 4 }}>{activeJob.pickup_address}</div>
              {activeJob.sender_contact && (
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8 }}>
                  {activeJob.sender_contact}
                  {activeJob.sender_phone && <> · <a href={`tel:${activeJob.sender_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{activeJob.sender_phone}</a></>}
                </div>
              )}
              {activeJob.is_multi_stop && activeJob.stops ? (
                /* Multi-stop: show each stop */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {[...(activeJob.stops as any[])]
                    .sort((a: any, b: any) => a.sequence - b.sequence)
                    .map((stop: any) => (
                      <div key={stop.id} style={{
                        padding: '7px 10px', borderRadius: 10,
                        background: stop.status === 'delivered' ? 'rgba(16,185,129,0.1)'
                          : stop.status === 'failed' ? 'rgba(239,68,68,0.1)'
                          : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${stop.status === 'delivered' ? 'rgba(16,185,129,0.35)' : stop.status === 'failed' ? 'rgba(239,68,68,0.35)' : '#1e293b'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{
                            minWidth: 18, height: 18, borderRadius: '50%', fontSize: '0.65rem', fontWeight: 800,
                            background: stop.status === 'delivered' ? '#10b981' : stop.status === 'failed' ? '#ef4444' : '#ef4444',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{stop.sequence}</span>
                          <span style={{ fontSize: '0.8rem', color: '#d1d5db', flex: 1 }}>{stop.address}</span>
                          {stop.status === 'delivered' && <span style={{ color: '#10b981', fontSize: '0.7rem', fontWeight: 700 }}>✓ Entregado</span>}
                          {stop.status === 'failed' && <span style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 700 }}>✗ Fallido</span>}
                        </div>
                        {stop.receiver_contact && (
                          <div style={{ fontSize: '0.72rem', color: '#6b7280', paddingLeft: 24 }}>
                            {stop.receiver_contact}
                            {stop.receiver_phone && <> · <a href={`tel:${stop.receiver_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{stop.receiver_phone}</a></>}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                /* Single-stop */
                <>
                  <div style={{ height: 6 }} />
                  <div style={{ fontSize: '0.88rem', color: '#d1d5db', lineHeight: 1.35, marginBottom: 4 }}>{activeJob.delivery_address}</div>
                  {activeJob.receiver_contact && (
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                      {activeJob.receiver_contact}
                      {activeJob.receiver_phone && <> · <a href={`tel:${activeJob.receiver_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{activeJob.receiver_phone}</a></>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Price + vehicle + payment */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>{VEHICLE_LABELS[activeJob.vehicle_type] || activeJob.vehicle_type}</span>
            <span style={{ color: '#c8ff00', fontWeight: 800, fontSize: '1.4rem' }}>
              ₲{Number(activeJob.offer || activeJob.suggested_price || 0).toLocaleString()}
            </span>
          </div>
          {activeJob.payment_method && (
            <div style={{ background: 'rgba(16,185,129,0.12)', borderRadius: 10, padding: '0.4rem 0.75rem', marginBottom: 12, fontSize: '0.83rem', color: '#6ee7b7', display: 'flex', gap: 6 }}>
              <span>💵</span><span>Cobro: <strong>{activeJob.payment_method}</strong></span>
            </div>
          )}
          {activeJob.instructions && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '0.4rem 0.75rem', marginBottom: 12, fontSize: '0.82rem', color: '#C8960A' }}>
              📝 {activeJob.instructions}
            </div>
          )}

          {/* ── Chat button ── */}
          <button
            onClick={() => { chatOpenRef.current = true; setChatUnread(0); setChatOpen(true); }}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 14, marginBottom: 10,
              border: `1px solid ${chatUnread > 0 ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.4)'}`,
              background: chatUnread > 0
                ? 'linear-gradient(135deg,rgba(34,197,94,0.25),rgba(22,163,74,0.15))'
                : 'linear-gradient(135deg,rgba(34,197,94,0.15),rgba(22,163,74,0.08))',
              color: '#4ade80', fontWeight: 800, fontSize: '0.9rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>💬</span>
            Chatear con el cliente
            {chatUnread > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 800, lineHeight: 1.5 }}>
                {chatUnread}
              </span>
            )}
          </button>

          {/* Action button */}
          {activeJob.status === 'accepted' && (
            <button onClick={() => handleTransition(activeJob.id, 'picking_up')} disabled={transitioning}
              style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '1rem', opacity: transitioning ? 0.6 : 1 }}>
              🚗 Confirmar Recogida
            </button>
          )}
          {activeJob.status === 'picking_up' && (
            <button onClick={() => handleTransition(activeJob.id, 'in_transit')} disabled={transitioning}
              style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#3b82f6', color: '#fff', fontWeight: 800, fontSize: '1rem', opacity: transitioning ? 0.6 : 1 }}>
              📦 Confirmar Retiro — Ir a Entregar
            </button>
          )}
          {/* ── Confirm delivery: multi-stop per-stop OR single ── */}
          {activeJob.status === 'in_transit' && activeJob.is_multi_stop && activeJob.stops && (() => {
            const pendingStops = [...(activeJob.stops as any[])]
              .sort((a: any, b: any) => a.sequence - b.sequence)
              .filter((s: any) => s.status === 'pending');
            if (pendingStops.length === 0) return null;
            const currentStop = pendingStops[0];
            return (
              <div style={{ marginTop: 4 }}>
                {showStopFail === currentStop.id ? (
                  <div>
                    <p style={{ color: '#fca5a5', fontSize: '0.85rem', textAlign: 'center', marginBottom: 8, fontWeight: 600 }}>¿Por qué no se pudo entregar en parada {currentStop.sequence}?</p>
                    <textarea
                      value={stopFailReason}
                      onChange={e => setStopFailReason(e.target.value)}
                      placeholder="Ej: Nadie en casa, dirección incorrecta..."
                      style={{ width: '100%', padding: '0.7rem', borderRadius: 12, border: '1.5px solid #374151', background: '#0f172a', color: '#fff', fontSize: '0.85rem', resize: 'none', minHeight: 70, boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setShowStopFail(null); setStopFailReason(''); }}
                        style={{ flex: 1, padding: '0.75rem', border: '1px solid #374151', borderRadius: 12, background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>← Atrás</button>
                      <button onClick={() => handleStopTransition(currentStop.id, 'failed', stopFailReason)}
                        disabled={!stopFailReason.trim() || transitioning}
                        style={{ flex: 2, padding: '0.75rem', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.9rem', opacity: (!stopFailReason.trim() || transitioning) ? 0.5 : 1 }}>
                        Confirmar Fallido
                      </button>
                    </div>
                  </div>
                ) : stopBeingDelivered === currentStop.id ? (
                  <div>
                    <p style={{ color: '#d1d5db', fontSize: '0.85rem', textAlign: 'center', marginBottom: 10, fontWeight: 600 }}>¿Entregaste en parada {currentStop.sequence}?</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setStopBeingDelivered(null); }}
                        style={{ flex: 1, padding: '0.8rem', border: '1px solid #374151', borderRadius: 12, background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>← Atrás</button>
                      <button onClick={() => handleStopTransition(currentStop.id, 'delivered')} disabled={transitioning}
                        style={{ flex: 1, padding: '0.8rem', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '0.9rem', opacity: transitioning ? 0.6 : 1 }}>✅ Sí, entregado</button>
                      <button onClick={() => { setStopBeingDelivered(null); setShowStopFail(currentStop.id); }} disabled={transitioning}
                        style={{ flex: 1, padding: '0.8rem', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.9rem' }}>❌ Fallido</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setStopBeingDelivered(currentStop.id)} disabled={transitioning}
                    style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '1rem', opacity: transitioning ? 0.6 : 1 }}>
                    📦 Confirmar parada {currentStop.sequence} de {activeJob.stop_count}
                  </button>
                )}
              </div>
            );
          })()}
          {/* ── Single-stop confirm delivery ── */}
          {activeJob.status === 'in_transit' && !activeJob.is_multi_stop && !showDeliveryConfirm && !showFailReason && (
            <button onClick={() => setShowDeliveryConfirm(true)} disabled={transitioning}
              style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '1rem', opacity: transitioning ? 0.6 : 1 }}>
              ✅ Confirmar Entrega
            </button>
          )}
          {activeJob.status === 'in_transit' && !activeJob.is_multi_stop && showDeliveryConfirm && !showFailReason && (
            <div>
              <p style={{ color: '#d1d5db', fontSize: '0.88rem', textAlign: 'center', marginBottom: 10, fontWeight: 600 }}>¿Cómo resultó la entrega?</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setShowDeliveryConfirm(false); handleTransition(activeJob.id, 'delivered'); }}
                  disabled={transitioning}
                  style={{ flex: 1, padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '0.95rem', opacity: transitioning ? 0.6 : 1 }}>
                  ✅ Entregado
                </button>
                <button
                  onClick={() => { setShowDeliveryConfirm(false); setShowFailReason(true); }}
                  disabled={transitioning}
                  style={{ flex: 1, padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>
                  ❌ Fallido
                </button>
              </div>
            </div>
          )}
          {activeJob.status === 'in_transit' && !activeJob.is_multi_stop && showFailReason && (
            <div>
              <p style={{ color: '#fca5a5', fontSize: '0.88rem', textAlign: 'center', marginBottom: 8, fontWeight: 600 }}>¿Por qué no se pudo entregar?</p>
              <textarea
                value={failReason}
                onChange={e => setFailReason(e.target.value)}
                placeholder="Ej: Nadie en casa, dirección incorrecta..."
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: 12, border: '1.5px solid #374151',
                  background: '#0f172a', color: '#fff', fontSize: '0.88rem', resize: 'none',
                  minHeight: 76, boxSizing: 'border-box', marginBottom: 8,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setShowFailReason(false); setShowDeliveryConfirm(true); setFailReason(''); }}
                  style={{ flex: 1, padding: '0.8rem', border: '1px solid #374151', borderRadius: 12, background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>
                  ← Atrás
                </button>
                <button
                  onClick={() => handleFailed(failReason)}
                  disabled={!failReason.trim() || transitioning}
                  style={{ flex: 2, padding: '0.8rem', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.9rem', opacity: (!failReason.trim() || transitioning) ? 0.5 : 1 }}>
                  Confirmar Fallido
                </button>
              </div>
            </div>
          )}
          {/* ── Return flow statuses ── */}
          {activeJob.status === 'returning' && (
            <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: '0.85rem', textAlign: 'center', border: '1px solid rgba(245,158,11,0.3)' }}>
              <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>⏳ Esperando respuesta del cliente</div>
              <div style={{ color: '#9ca3af', fontSize: '0.83rem' }}>El cliente debe aceptar la devolución para continuar</div>
            </div>
          )}
          {activeJob.status === 'driver_returning' && (
            <button onClick={() => handleTransition(activeJob.id, 'return_delivered')} disabled={transitioning}
              style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#F5C518', color: '#1C1C2E', fontWeight: 800, fontSize: '1rem', opacity: transitioning ? 0.6 : 1 }}>
              📦 Confirmar llegada — esperando al remitente
            </button>
          )}
          {activeJob.status === 'return_delivered' && (
            <div style={{ background: 'rgba(245,197,24,0.10)', borderRadius: 12, padding: '0.85rem', textAlign: 'center', border: '1px solid rgba(245,197,24,0.30)' }}>
              <div style={{ color: '#C8960A', fontWeight: 700, marginBottom: 4 }}>⏳ Esperando confirmación final del cliente</div>
              <div style={{ color: '#9ca3af', fontSize: '0.83rem' }}>El cliente debe aceptar o rechazar la recepción</div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ LISTA SOLICITUDES (flotante) ════════════ */}
      {!activeJob && sheetOrders.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}>
          {/* Scrollable list */}
          <div style={{ overflowY: 'auto', padding: '0 10px 16px', display: 'flex', flexDirection: 'column', gap: 8, WebkitOverflowScrolling: 'touch' as never, overscrollBehavior: 'contain' }}>
            {sheetOrders.map(req => {
              const offerObj = sentOffers[req.id];
              const alreadyOffered = !!offerObj;
              const isSending = sending[req.id];
              const clientPrice = Number(req.offer || req.suggested_price || 0);
              const qo_15 = Math.round(clientPrice * 1.15 / 1000) * 1000;
              const qo_30 = Math.round(clientPrice * 1.30 / 1000) * 1000;
              const qo_50 = Math.round(clientPrice * 1.50 / 1000) * 1000;
              const remaining = getRemaining(req.created_at);
              return (
                <div key={req.id} style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', padding: '12px 14px' }}>
                  {/* Row 1: photo + vehicle + client + price + timer + dismiss */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {req.client_photo
                      ? <img src={req.client_photo} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c8ff00', flexShrink: 0 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, border: '1.5px solid #334155' }}>👤</div>
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{req.client_name || req.client_email?.split('@')[0] || 'Cliente'}</span>
                        {req.client_avg_rating != null && req.client_avg_rating > 0 && <span style={{ color: '#f59e0b', fontWeight: 700 }}>⭐{Number(req.client_avg_rating).toFixed(1)}</span>}
                        <span>· {new Date(req.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, color: '#c8ff00', fontSize: '1rem' }}>{clientPrice.toLocaleString()}</div>
                      <div style={{ fontSize: '0.62rem', color: '#6b7280' }}>Gs</div>
                    </div>
                    {!alreadyOffered && <CountdownRing seconds={remaining} />}
                    <button onClick={() => handleDismiss(req.id)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6b7280', borderRadius: 99, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  </div>
                  {/* Row 2: route */}
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><span style={{ color: '#10b981', flexShrink: 0 }}>🟢</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{req.pickup_address}</span></div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><span style={{ color: '#ef4444', flexShrink: 0 }}>🟥</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{req.delivery_address}</span></div>
                    {req.is_multi_stop && req.stop_count > 1 && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ background: '#8b5cf6', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 800 }}>+{req.stop_count} paradas</span>
                      </div>
                    )}
                  </div>
                  {req.instructions && (
                    <div style={{ fontSize: '0.72rem', color: '#C8960A', marginBottom: 8, padding: '5px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>📝 {req.instructions}</div>
                  )}
                  {/* Offer status or action buttons */}
                  {alreadyOffered ? (() => {
                    const status = offerObj.status;
                    let color = '#F7D060', bg = 'rgba(245,197,24,0.15)', icon = '📤', text = 'Enviada · esperando...';
                    if (status === 'accepted') { color = '#6ee7b7'; bg = 'rgba(16,185,129,0.15)'; icon = '✅'; text = 'Aceptada'; }
                    else if (status === 'rejected') { color = '#f87171'; bg = 'rgba(239,68,68,0.13)'; icon = '❌'; text = 'Rechazada'; }
                    else if (status === 'expired') { color = '#a3a3a3'; bg = 'rgba(156,163,175,0.13)'; icon = '⌛'; text = 'Expirada'; }
                    else if (status === 'cancelled') { color = '#f59e42'; bg = 'rgba(245,158,66,0.13)'; icon = '🚫'; text = 'Cancelada'; }
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: bg, borderRadius: 10, border: `1.5px solid ${color}` }}>
                        <span style={{ color, fontWeight: 700 }}>{icon}</span>
                        <span style={{ fontSize: '0.8rem', color, fontWeight: 700, flex: 1 }}>{text}</span>
                        <span style={{ fontWeight: 800, color: '#c8ff00', fontSize: '0.95rem' }}>₲{Number(offerObj.amount).toLocaleString()}</span>
                      </div>
                    );
                  })() : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea value={offerNotes[req.id] || ''} onChange={e => setOfferNotes(n => ({ ...n, [req.id]: e.target.value }))} placeholder="Mensaje opcional para el cliente..." maxLength={300} rows={2} style={{ width: '100%', padding: '7px 10px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '0.8rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={() => handleAcceptPrice(req.id, clientPrice)} disabled={isSending} style={{ width: '100%', padding: '11px 0', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1rem', opacity: isSending ? 0.6 : 1 }}>Aceptar · ₲{clientPrice.toLocaleString()}</button>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => handleSendOffer(req.id, qo_15)} disabled={isSending} style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>₲{qo_15.toLocaleString()}</span><span style={{ fontSize: '0.58rem', color: '#64748b' }}>+15%</span></button>
                        <button onClick={() => handleSendOffer(req.id, qo_30)} disabled={isSending} style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>₲{qo_30.toLocaleString()}</span><span style={{ fontSize: '0.58rem', color: '#64748b' }}>+30%</span></button>
                        <button onClick={() => handleSendOffer(req.id, qo_50)} disabled={isSending} style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>₲{qo_50.toLocaleString()}</span><span style={{ fontSize: '0.58rem', color: '#64748b' }}>+50%</span></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredOrders.filter(o => !dismissedOrders.has(o.id)).length > sheetOrders.length && (
              <button onClick={() => setOrdersPage(p => p + 1)} style={{ width: '100%', padding: '11px', borderRadius: 14, border: '1px solid #F5C518', background: 'rgba(245,197,24,0.08)', color: '#F5C518', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>Cargar más</button>
            )}
          </div>
        </div>
      )}

      {/* ════════════ EMPTY STATE ════════════ */}
      {!activeJob && sheetOrders.length === 0 && !loading && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: '#1a1a2e', borderRadius: '24px 24px 0 0',
          padding: '2rem 1.5rem 2.5rem', textAlign: 'center',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.25s ease-out',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📦</div>
          <div style={{ color: '#d1d5db', fontWeight: 700, fontSize: '1rem' }}>Sin solicitudes pendientes</div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 6 }}>Las nuevas solicitudes aparecerán aquí automáticamente</div>
        </div>
      )}

      {/* ── Chat Modal ─────────────────────────────────────────────────── */}
      <ChatModal
        open={chatOpen}
        onClose={() => { chatOpenRef.current = false; setChatOpen(false); }}
        orderId={activeJob?.id}
        myEmail={email ?? ''}
        myName={displayName}
        otherName={activeJob?.client_name ?? null}
        otherPhoto={activeJob?.client_photo ?? null}
      />

      {/* ── Toast: nuevo mensaje del cliente ─────────────────────────── */}
      {chatToast && activeJob && (
        <div
          onClick={() => { setChatToast(null); chatOpenRef.current = true; setChatUnread(0); setChatOpen(true); /* photo already in activeJob */ }}
          style={{
            position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, width: 'calc(100% - 28px)', maxWidth: 400,
            background: '#0f2920', border: '1.5px solid rgba(34,197,94,0.55)',
            borderRadius: 18, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.75)',
            cursor: 'pointer',
            animation: 'slideUp 0.3s ease',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '0.72rem', marginBottom: 2 }}>NUEVO MENSAJE · CLIENTE</div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chatToast.from ? `${chatToast.from}: ` : ''}{chatToast.text}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current); setChatToast(null); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 28, height: 28, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
        </div>
      )}
    </div>
  );
}
