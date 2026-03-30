'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useDriverContext, VEHICLE_TO_FILTER } from '../context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { playNewOrderAlert, playAccepted } from '@/lib/audio';

const DriverMap = dynamic(() => import('../components/DriverMap'), { ssr: false });

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto Envíos',
  auto: '🚗 Auto Envíos',
  motocarro: '🛵 Moto Carro Fletes',
  camion2t: '🚛 Camión Fletes',
};

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
  const [sending, setSending] = useState<Record<string, boolean>>({});
  // sentOffers: { [orderId]: { amount: number, status: string } }
  const [sentOffers, setSentOffers] = useState<Record<string, { amount: number, status: string }>>({});
  const [activeJob, setActiveJob] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [dismissedOrders, setDismissedOrders] = useState<Set<string>>(new Set());
  const [sheetIndex, setSheetIndex] = useState(0);

  // Fail delivery modal state
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [showFailReason, setShowFailReason] = useState(false);
  const [failReason, setFailReason] = useState('');

  const prevOrderIds = useRef<Set<string>>(new Set());
  const prevAccepted = useRef(false);
  const soundTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobRef = useRef<any>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => { activeJobRef.current = activeJob; }, [activeJob]);

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
          // Only clear if not currently transitioning
          if (!activeJobRef.current || !['accepted','picking_up','in_transit','returning','driver_returning','return_delivered'].includes(activeJobRef.current?.status)) {
            setActiveJob(null);
            activeJobRef.current = null;
          }
          return;
        }
        const job = data[0];
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
    const iv = setInterval(() => { fetchOrders(); fetchMyOffers(); fetchActiveJob(); }, 60_000);
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
      }
    } catch { /* */ }
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
      }
    } catch { /* */ }
    setTransitioning(false);
  };

  const handleSendOffer = async (orderId: string, directAmount?: number) => {
    const amount = directAmount ? String(directAmount) : offerAmounts[orderId];
    if (!amount || Number(amount) <= 0) return;
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, driver_email: email, driver_name: displayName, driver_photo: profilePhoto, amount: Number(amount) }),
      });
      if (res.ok) { setSentOffers(s => ({ ...s, [orderId]: { amount: Number(amount), status: 'pending' } })); setOfferAmounts(o => ({ ...o, [orderId]: '' })); }
    } catch { /* */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleAcceptPrice = async (orderId: string, clientOffer: number) => {
    setSending(s => ({ ...s, [orderId]: true }));
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, driver_email: email, driver_name: displayName, driver_photo: profilePhoto, amount: clientOffer }),
      });
      if (res.ok) setSentOffers(s => ({ ...s, [orderId]: { amount: clientOffer, status: 'pending' } }));
    } catch { /* */ }
    setSending(s => ({ ...s, [orderId]: false }));
  };

  const handleDismiss = useCallback((orderId: string) => {
    setDismissedOrders(prev => new Set([...prev, orderId]));
    setSheetIndex(0);
  }, []);


  // Pagination for sheetOrders
  const [ordersPage, setOrdersPage] = useState(1);
  const ORDERS_PER_PAGE = 10;
  const sheetOrders = useMemo(() =>
    filteredOrders.filter(o => !dismissedOrders.has(o.id)).slice(0, ordersPage * ORDERS_PER_PAGE),
  [filteredOrders, dismissedOrders, ordersPage]);

  const safeIndex = sheetOrders.length > 0 ? Math.min(sheetIndex, sheetOrders.length - 1) : 0;
  const currentSheetOrder = sheetOrders[safeIndex] ?? null;

  const activeJobPickup = activeJob?.pickup_lat != null ? { lat: activeJob.pickup_lat, lng: activeJob.pickup_lng } : null;
  const activeJobDelivery = activeJob?.delivery_lat != null ? { lat: activeJob.delivery_lat, lng: activeJob.delivery_lng } : null;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#1a1a2e', zIndex: 0 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

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
            {(activeJob.status === 'picking_up' || activeJob.status === 'in_transit') && activeJob.delivery_lat && (
              <a href={getNavUrl(activeJob.delivery_lat, activeJob.delivery_lng, navApp)} target="_blank" rel="noopener noreferrer"
                style={{ background: '#10b981', color: '#fff', padding: '5px 14px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}>
                🚛 Ir a entregar
              </a>
            )}
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

          {/* Route A → B */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>A</div>
              <div style={{ width: 2, flex: 1, minHeight: 20, background: '#444', margin: '3px 0' }} />
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>B</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.88rem', color: '#d1d5db', lineHeight: 1.35, marginBottom: 4 }}>{activeJob.pickup_address}</div>
              {activeJob.sender_contact && (
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8 }}>
                  {activeJob.sender_contact}
                  {activeJob.sender_phone && <> · <a href={`tel:${activeJob.sender_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{activeJob.sender_phone}</a></>}
                </div>
              )}
              <div style={{ height: 6 }} />
              <div style={{ fontSize: '0.88rem', color: '#d1d5db', lineHeight: 1.35, marginBottom: 4 }}>{activeJob.delivery_address}</div>
              {activeJob.receiver_contact && (
                <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  {activeJob.receiver_contact}
                  {activeJob.receiver_phone && <> · <a href={`tel:${activeJob.receiver_phone}`} style={{ color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>{activeJob.receiver_phone}</a></>}
                </div>
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
          {/* ── Confirm delivery: Entregado / Fallido ── */}
          {activeJob.status === 'in_transit' && !showDeliveryConfirm && !showFailReason && (
            <button onClick={() => setShowDeliveryConfirm(true)} disabled={transitioning}
              style={{ width: '100%', padding: '0.9rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '1rem', opacity: transitioning ? 0.6 : 1 }}>
              ✅ Confirmar Entrega
            </button>
          )}
          {activeJob.status === 'in_transit' && showDeliveryConfirm && !showFailReason && (
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
          {activeJob.status === 'in_transit' && showFailReason && (
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

      {/* ════════════ INCOMING REQUEST BOTTOM SHEET ════════════ */}
      {!activeJob && currentSheetOrder && (() => {
        const req = currentSheetOrder;
        const offerObj = sentOffers[req.id];
        const alreadyOffered = !!offerObj;
        const isSending = sending[req.id];
        const clientPrice = Number(req.offer || req.suggested_price || 0);
        const qo1 = Math.round(clientPrice * 1.1 / 1000) * 1000;
        const qo2 = Math.round(clientPrice * 1.2 / 1000) * 1000;
        const qo3 = Math.round(clientPrice * 1.3 / 1000) * 1000;
        return (
          <div key={req.id} style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
            height: '68vh', background: '#1a1a2e', borderRadius: '24px 24px 0 0',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
            animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          }}>
            {/* Pull tab */}
            <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#444' }} />
            </div>

            {/* Header row: title + counter + cerrar */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 16, paddingBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Solicitud de envío</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {sheetOrders.length > 1 && (
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{safeIndex + 1}/{sheetOrders.length}</span>
                )}
                <button onClick={() => handleDismiss(req.id)}
                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9ca3af', borderRadius: 99, padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                  Cerrar
                </button>
              </div>
            </div>

            {/* Estado de la oferta */}
            {offerObj && (
              (() => {
                const status = offerObj.status;
                let color = '#F7D060', bg = 'rgba(245,197,24,0.15)', icon = '📤', text = 'Oferta enviada · esperando...';
                if (status === 'accepted') { color = '#6ee7b7'; bg = 'rgba(16,185,129,0.15)'; icon = '✅'; text = 'Aceptada — el cliente te eligió'; }
                else if (status === 'rejected') { color = '#f87171'; bg = 'rgba(239,68,68,0.13)'; icon = '❌'; text = 'Rechazada por el cliente'; }
                else if (status === 'expired') { color = '#a3a3a3'; bg = 'rgba(156,163,175,0.13)'; icon = '⌛'; text = 'Expirada'; }
                else if (status === 'cancelled') { color = '#f59e42'; bg = 'rgba(245,158,66,0.13)'; icon = '🚫'; text = 'Cancelada'; }
                return (
                  <div style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${color}`, margin: '0 0 14px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: bg }}>
                      <span style={{ fontSize: '1.1rem', color, fontWeight: 700 }}>{icon}</span>
                      <span style={{ fontSize: '0.85rem', color, fontWeight: 700 }}>{text}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#c8ff00', fontSize: '1.1rem' }}>
                        ₲{Number(offerObj.amount).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', paddingInline: 16, paddingBottom: 16 }}>
              {/* Client info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                {req.client_photo ? (
                  <img src={req.client_photo} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #333', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#2d2d2d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>👤</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                    {req.client_name || req.client_email?.split('@')[0] || 'Cliente'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type} · {new Date(req.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#c8ff00', lineHeight: 1 }}>{clientPrice.toLocaleString()}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Gs</div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: '#2d2d2d', marginBottom: 14 }} />

              {/* Route A → B */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>A</div>
                  <div style={{ width: 2, flex: 1, minHeight: 18, background: '#333', margin: '4px 0' }} />
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>B</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.35, marginBottom: 4 }}>{req.pickup_address}</div>
                  <div style={{ height: 10 }} />
                  <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.35 }}>{req.delivery_address}</div>
                </div>
              </div>

              {req.instructions && (
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '0.45rem 0.75rem', marginBottom: 12, fontSize: '0.8rem', color: '#C8960A' }}>
                  📝 {req.instructions}
                </div>
              )}

              {/* Actions */}
              {alreadyOffered ? (
                <div style={{ background: 'rgba(245,197,24,0.15)', borderRadius: 14, padding: '1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: '#C8960A', marginBottom: 4 }}>Tu oferta enviada</div>
                  <div style={{ fontWeight: 800, color: '#C8960A', fontSize: '1.4rem' }}>{alreadyOffered.toLocaleString()} Gs</div>
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>Esperando respuesta del cliente...</div>
                </div>
              ) : (
                <>
                  {/* Accept at client price */}
                  <button onClick={() => handleAcceptPrice(req.id, clientPrice)} disabled={isSending}
                    style={{ width: '100%', padding: '0.95rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1.05rem', marginBottom: 12, opacity: isSending ? 0.6 : 1 }}>
                    {isSending ? 'Enviando...' : `Aceptar por ${clientPrice.toLocaleString()} Gs`}
                  </button>

                  {/* Ofrece tu tarifa */}
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginBottom: 8 }}>Ofrece tu tarifa</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[qo1, qo2, qo3].map(q => (
                      <button key={q} onClick={() => handleSendOffer(req.id, q)} disabled={isSending}
                        style={{ flex: 1, padding: '0.65rem 0', border: '1px solid #333', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                        {q.toLocaleString()}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        const custom = prompt('Tu contraoferta (Gs):');
                        if (custom && Number(custom) > 0) handleSendOffer(req.id, Number(custom));
                      }}
                      style={{ width: 44, flexShrink: 0, border: '1px solid #333', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                      +
                    </button>
                  </div>
                </>
              )}

              {/* Nav dots if multiple orders */}
              {sheetOrders.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                  {sheetOrders.map((_, i) => (
                    <button key={i} onClick={() => setSheetIndex(i)}
                      style={{ width: i === safeIndex ? 20 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', transition: 'width 0.2s',
                        background: i === safeIndex ? '#c8ff00' : '#333' }} />
                  ))}
                </div>
              )}

              {/* Pagination: Load more button */}
              {filteredOrders.filter(o => !dismissedOrders.has(o.id)).length > sheetOrders.length && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                  <button
                    onClick={() => setOrdersPage(p => p + 1)}
                    style={{
                      padding: '13px 28px',
                      borderRadius: 14,
                      border: '1px solid #F5C518',
                      background: 'rgba(245,197,24,0.08)',
                      color: '#F5C518',
                      fontWeight: 800,
                      fontSize: '0.98rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cargar más pedidos
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ════════════ EMPTY STATE ════════════ */}
      {!activeJob && !currentSheetOrder && !loading && (
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
    </div>
  );
}
