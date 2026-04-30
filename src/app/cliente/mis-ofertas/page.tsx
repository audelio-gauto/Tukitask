'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { useClientContext } from '../context';
import { Icon } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';
import { playMessageAlert } from '@/lib/audio';

const ChatModal = dynamic(() => import('@/components/ChatModal'), { ssr: false });

interface ChatTarget {
  orderId?: string;
  jobId?: string;
  otherName: string | null;
  otherPhoto: string | null;
}

/* ── Types ──────────────────────────────────────────────────────────────── */
interface ActiveOrder {
  id: string;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  offer: number | null;
  suggested_price: number | null;
  created_at: string;
  driver_name: string | null;
  driver_photo: string | null;
  driver_rating: number | null;
  driver_avg_rating: number | null;
  driver_total_ratings: number | null;
  vehicle_type: string | null;
  order_type: string | null;
  accepted_by: string | null;
}

interface ActiveJob {
  id: string;
  status: string;
  service_type: string | null;
  address: string | null;
  agreed_price: number | null;
  created_at: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  tecnico_avg_rating: number | null;
  total_services: number | null;
  tecnico_email: string | null;
  warranty_days: number | null;
}

interface DriverExtras {
  vehicle_label: string;
  vehicle_brand: string | null;
  vehicle_plate: string | null;
}

/* ── Config ─────────────────────────────────────────────────────────────── */
// Solo pedidos ACEPTADOS (no pending/negotiating — esos se ven en el panel principal)
// 'failed' y 'return_rejected' se incluyen para que el cliente no pierda de vista el pedido
// mientras el conductor solicita/gestiona la devolución.
const ACTIVE_ORDER_STS = ['accepted', 'picking_up', 'at_pickup', 'in_transit', 'failed', 'returning', 'driver_returning', 'return_delivered', 'return_rejected'];
const ACTIVE_JOB_STS   = ['accepted', 'en_proceso', 'en_camino', 'llegue', 'completion_pending'];

const TRACKING_STATUS: Record<string, { text: string }> = {
  pending: { text: 'Buscando conductor...' },
  negotiating: { text: 'Negociando precio...' },
  accepted: { text: 'Asignado. En camino a recoger' },
  assigned: { text: 'Asignado. En camino a recoger' },
  picking_up: { text: 'En camino al punto de recogida' },
  at_pickup:  { text: 'Driver en punto de recogida' },
  in_transit: { text: 'En camino al destino' },
  failed: { text: 'Entrega fallida — pendiente de resolución' },
  returning: { text: '⚠️ El conductor solicita devolver el paquete' },
  return_rejected: { text: 'Devolución rechazada — el conductor puede solicitar de nuevo' },
  driver_returning: { text: 'El conductor va a devolverte el paquete' },
  return_delivered: { text: 'El conductor llegó a devolver el paquete' },
  // tecnico
  'pending-job': { text: 'Buscando tecnico...' },
  in_progress: { text: 'Servicio en progreso' },
  en_camino: { text: 'Tecnico en camino' },
  llegue: { text: 'Tecnico llego, listo para comenzar' },
  completion_pending: { text: 'Esperando confirmacion' },
};

const JOB_TRACKING_STATUS: Record<string, { text: string }> = {
  ...TRACKING_STATUS,
  accepted: { text: 'Tasker asignado' },
  assigned: { text: 'Tasker asignado' },
};

const SERVICE_LABELS: Record<string, string> = {
  limpieza:         'Limpieza',
  niera:            'Niñera',
  cocina:           'Cocina',
  eventos:          'Eventos',
  cuidado_mascotas: 'Cuidado Mascotas',
  cuidado_adultos:  'Cuidado adultos',
  aire_split:       'Tec. Aire Split',
  electrico:        'Serv. Eléctrico',
  plomeria:         'Serv. Plomería',
  cerrajeria:       'Serv. Cerrajería',
  gestor:           'Gestor',
  otros:            'Otros',
};

const VEHICLE_LABELS: Record<string, string> = {
  moto:       'Moto',
  auto:       'Auto',
  moto_carro: 'Moto Carro',
  camion:     'Camión',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  envio:      'Envío',
  mandadito:  'Mandadito',
  flete:      'Flete',
};

/* ── Pulse animation injected once ─────────────────────────────────────── */
const PULSE_CSS = `@keyframes mis-ofertas-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`;

const BRAND = '#F5C518';
const BRAND_SHADOW = 'rgba(245,197,24,0.35)';

const DELIVERY_STEPS = [
  { key: 'accepted',   label: 'Aceptado'  },
  { key: 'picking_up', label: 'En camino' },
  { key: 'at_pickup',  label: 'Recogida'  },
  { key: 'in_transit', label: 'Tránsito'  },
  { key: 'delivered',  label: 'Entregado' },
] as const;

const JOB_STEPS = [
  { key: 'accepted',           label: 'Aceptado'  },
  { key: 'en_camino',          label: 'En camino' },
  { key: 'llegue',             label: 'Llegué'    },
  { key: 'en_proceso',         label: 'En servicio'},
  { key: 'completion_pending', label: 'Completado'},
] as const;

function ProgressStepper({ steps, currentKey }: { steps: readonly { key: string; label: string }[]; currentKey: string }) {
  const activeIdx = steps.findIndex(s => s.key === currentKey);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '4px 16px 14px' }}>
      {steps.map((step, i) => {
        const done   = i < activeIdx;
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
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function MisOfertasPage() {
  const { email, displayName } = useClientContext();
  const router = useRouter();

  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [jobs,   setJobs]   = useState<ActiveJob[]>([]);
  const [driverExtras, setDriverExtras] = useState<Record<string, DriverExtras>>({});
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; type: 'delivery' | 'service' } | null>(null);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const prevUnreadRef = useRef<Record<string, number>>({});

  const loadData = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, jobsRes] = await Promise.all([
        authFetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const jobsData   = await jobsRes.json();

      const activeOrders: ActiveOrder[] = Array.isArray(ordersData)
        ? ordersData.filter((o: ActiveOrder) => ACTIVE_ORDER_STS.includes(o.status))
        : [];
      setOrders(activeOrders);
      setJobs(
        Array.isArray(jobsData)
          ? jobsData.filter((j: ActiveJob) => ACTIVE_JOB_STS.includes(j.status))
          : [],
      );

      // Fetch driver profile (vehicle details) for accepted+ orders
      const VEHICLE_LABELS_MAP: Record<string, string> = { moto: 'Moto', auto: 'Auto', moto_carro: 'Moto Carro', camion: 'Camión' };
      const TRACKING_STS = ['accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'returning', 'driver_returning', 'return_delivered'];
      const extrasMap: Record<string, DriverExtras> = {};
      await Promise.all(
        activeOrders
          .filter(o => TRACKING_STS.includes(o.status) && o.accepted_by)
          .map(async o => {
            try {
              const r = await fetch(`/api/driver-profile?email=${encodeURIComponent(o.accepted_by!)}`);
              const json = await r.json();
              const p = json?.profile;
              if (!p) return;
              const vmode = p.transport_mode || '';
              let vbrand = '';
              try { const vd = JSON.parse(p.vehicle_type || '{}'); vbrand = vd[vmode]?.marca || ''; } catch { vbrand = ''; }
              extrasMap[o.id] = {
                vehicle_label: VEHICLE_LABELS_MAP[vmode] || vmode,
                vehicle_brand: vbrand || null,
                vehicle_plate: p.license_plate || null,
              };
            } catch { /* skip */ }
          }),
      );
      setDriverExtras(prev => ({ ...prev, ...extrasMap }));
    } catch { /* keep previous data */ }
    setLoading(false);
  }, [email]);

  useEffect(() => {
    loadData();
    // Poll every 8s — fast enough to catch status changes even if realtime filter misses
    // UPDATE events (requires REPLICA IDENTITY FULL on the orders table in Supabase)
    const iv = setInterval(loadData, 8_000);

    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);

    const ch = email
      ? supabase.channel(`mis-ofertas-${email}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',       filter: `client_email=eq.${email}` } as never, loadData)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_jobs', filter: `client_email=eq.${email}` } as never, loadData)
          .subscribe()
      : null;

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      if (ch) supabase.removeChannel(ch);
    };
  }, [loadData, email]);

  const fetchUnreadCounts = useCallback((orderIds: string[], jobIds: string[]) => {
    orderIds.forEach(id => {
      authFetch(`/api/chat?order_id=${id}&count=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && typeof d.unread === 'number') setUnreadCounts(prev => ({ ...prev, [id]: d.unread })); })
        .catch(() => {});
    });
    jobIds.forEach(id => {
      authFetch(`/api/chat?job_id=${id}&count=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && typeof d.unread === 'number') setUnreadCounts(prev => ({ ...prev, [id]: d.unread })); })
        .catch(() => {});
    });
  }, []);

  // Poll unread counts every 10s
  useEffect(() => {
    const orderIds = orders.map(o => o.id);
    const jobIds = jobs.map(j => j.id);
    fetchUnreadCounts(orderIds, jobIds);
    const iv = setInterval(() => fetchUnreadCounts(orderIds, jobIds), 10_000);
    return () => clearInterval(iv);
  }, [orders, jobs, fetchUnreadCounts]);

  // Play sound when new unread messages arrive (not from open chat)
  useEffect(() => {
    const prev = prevUnreadRef.current;
    const openId = chatTarget?.orderId ?? chatTarget?.jobId;
    let hasNew = false;
    for (const [id, count] of Object.entries(unreadCounts)) {
      if (id === openId) continue;
      if (count > (prev[id] ?? 0)) { hasNew = true; break; }
    }
    if (hasNew) playMessageAlert();
    prevUnreadRef.current = { ...unreadCounts };
  }, [unreadCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear unread count when chat opens
  useEffect(() => {
    const id = chatTarget?.orderId ?? chatTarget?.jobId;
    if (id) setUnreadCounts(prev => ({ ...prev, [id]: 0 }));
  }, [chatTarget?.orderId, chatTarget?.jobId]);

  const total = orders.length + jobs.length;
  const busy = !!actionId;

  const cancelOrder = async (orderId: string) => {
    if (busy || !email) return;
    setActionId('cancel_' + orderId);
    try {
      await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'cancelled' }),
      });
      loadData();
    } finally { setActionId(null); }
  };

  const cancelJob = async (jobId: string) => {
    if (busy || !email) return;
    setActionId('cancel_' + jobId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId, clientEmail: email }),
      });
      loadData();
    } finally { setActionId(null); }
  };

  const transitionOrder = async (orderId: string, status: string, extra?: Record<string, string>) => {
    if (busy) return;
    setActionId(status + '_' + orderId);
    try {
      await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status, ...extra }),
      });
      loadData();
    } finally { setActionId(null); }
  };

  const acceptCompletion = async (jobId: string) => {
    if (busy || !email) return;
    setActionId('accept_completion_' + jobId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_completion', jobId, clientEmail: email }),
      });
      loadData();
    } finally { setActionId(null); }
  };

  const rejectCompletion = async (jobId: string) => {
    if (busy || !email) return;
    setActionId('reject_completion_' + jobId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_completion', jobId, clientEmail: email }),
      });
      loadData();
    } finally { setActionId(null); }
  };

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function StarRating({ rating, count, label }: { rating: number | null; count?: number | null; label?: string }) {
    if (rating == null) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
        {'★★★★★'.split('').map((_, i) => (
          <span key={i} style={{ color: i < Math.round(rating) ? '#F5C518' : 'rgba(156,163,175,0.4)', fontSize: '0.78rem' }}>★</span>
        ))}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: 2 }}>{Number(rating).toFixed(1)}</span>
        {count != null && count > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginLeft: 3, opacity: 0.8 }}>· {count} {label ?? 'envíos'}</span>
        )}
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
      <style>{PULSE_CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(245,197,24,0.15)',
        padding: 'max(16px, env(safe-area-inset-top)) 16px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
          aria-label="Volver"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>Mis ofertas</h1>
          {!loading && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {total === 0 ? 'Sin solicitudes activas' : `${total} ${total === 1 ? 'solicitud activa' : 'solicitudes activas'}`}
            </p>
          )}
        </div>
        <button
          onClick={loadData}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
          aria-label="Actualizar"
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '14px 14px 8px', overflowY: 'auto' }}>

        {/* Skeletons */}
        {loading && [0, 1, 2].map(i => (
          <div
            key={i}
            style={{ height: 110, borderRadius: 16, background: 'var(--glass-card)', marginBottom: 12, animation: 'mis-ofertas-pulse 1.5s ease-in-out infinite' }}
          />
        ))}

        {/* Empty state */}
        {!loading && total === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ marginBottom: 14, opacity: 0.25 }}>
              <Icon name="clipboard" size={52} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)' }}>Sin solicitudes activas</div>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Cuando un conductor o técnico acepte<br />tu solicitud aparecerá aquí
            </div>
            <Link
              href="/cliente"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 20, padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#F5C518,#F58A07)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none' }}
            >
              <Icon name="plus" size={16} />
              Nueva solicitud
            </Link>
          </div>
        )}

        {/* ── Driver orders ──────────────────────────────────────────── */}
        {orders.map(order => {
          const statusInfo = TRACKING_STATUS[order.status] ?? { text: order.status };
          const statusTone = getStatusTone(order.status);
          const price = order.offer ?? order.suggested_price;
          const hasWorker = ['accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'failed', 'returning', 'return_rejected', 'driver_returning', 'return_delivered'].includes(order.status);
          const typeLabel = ORDER_TYPE_LABELS[order.order_type || ''] ?? 'Envío';
          const extras = driverExtras[order.id];

          return (
            <div key={order.id} style={{ marginBottom: 16 }}>
              {/* Card */}
              <div
                className="tuki-card"
                style={{
                  ['--status-color' as never]: statusTone.color,
                  ['--status-bg' as never]: statusTone.bg,
                  ['--status-border' as never]: statusTone.border,
                  ['--status-outline' as never]: statusTone.border,
                }}
              >
                {/* ── Status banner */}
                <div className="tuki-card-header" style={{ padding: '12px 16px 10px' }}>
                  <div className="tuki-card-title" style={{ fontWeight: 800 }}>
                    <Icon name={hasWorker ? 'check' : 'clock'} size={16} color={statusTone.color} />
                    {statusInfo.text}
                  </div>
                  <span className="tuki-card-subtitle">{typeLabel}</span>
                </div>

                {/* ── Progress stepper (only for active delivery statuses) */}
                {['accepted', 'picking_up', 'at_pickup', 'in_transit'].includes(order.status) && (
                  <ProgressStepper steps={DELIVERY_STEPS} currentKey={order.status} />
                )}

                {/* ── Worker row (only if assigned) */}
                {hasWorker && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 12px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                    {/* Photo */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {order.driver_photo ? (
                        <img src={order.driver_photo} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${statusTone.color}` }} />
                      ) : (
                        <div style={{ width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg,${statusTone.color},var(--surface-3))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', border: `3px solid ${statusTone.border}` }}>
                          <Icon name="user" size={28} />
                        </div>
                      )}
                      {extras?.vehicle_label && (
                        <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--surface-2)', borderRadius: 99, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 700, border: `1px solid ${statusTone.border}`, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {extras.vehicle_label.split(' ')[0]}
                        </div>
                      )}
                    </div>
                    {/* Name + rating */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {order.driver_name || 'Conductor'}
                      </div>
                      <StarRating rating={order.driver_avg_rating ?? order.driver_rating} count={order.driver_total_ratings} label="envíos" />
                    </div>
                    {/* Price */}
                    {price != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 900, color: '#F5C518', fontSize: '1.25rem', lineHeight: 1 }}>
                          {Number(price).toLocaleString('es-PY')}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Guaraníes</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Vehicle tags (if available) */}
                {hasWorker && extras && (extras.vehicle_label || extras.vehicle_brand || extras.vehicle_plate) && (
                  <div style={{ display: 'flex', gap: 8, padding: '8px 16px 10px', flexWrap: 'wrap', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                    {extras.vehicle_label && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(120,120,120,0.12)', borderRadius: 99, padding: '4px 11px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        <Icon name="truck" size={12} /> {extras.vehicle_label}
                      </span>
                    )}
                    {extras.vehicle_brand && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(120,120,120,0.12)', borderRadius: 99, padding: '4px 11px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {extras.vehicle_brand}
                      </span>
                    )}
                    {extras.vehicle_plate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(59,130,246,0.12)', borderRadius: 99, padding: '4px 12px', fontSize: '0.76rem', color: '#60a5fa', fontWeight: 800, border: '1px solid rgba(59,130,246,0.3)', letterSpacing: '0.06em' }}>
                        {extras.vehicle_plate}
                      </span>
                    )}
                  </div>
                )}

                {/* ── Pending state worker row */}
                {!hasWorker && (
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                    {price != null && (
                      <span style={{ fontWeight: 900, color: '#F5C518', fontSize: '1.1rem' }}>{Number(price).toLocaleString('es-PY')} <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>Gs</span></span>
                    )}
                  </div>
                )}

                {/* ── Addresses */}
                {(order.pickup_address || order.delivery_address) && (
                  <div className="tuki-address-box" style={{ padding: '10px 16px 12px', borderRadius: 0, border: 'none', background: 'var(--surface-3)', borderBottom: '1px solid var(--divider)' }}>
                    {order.pickup_address && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 5, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <Icon name="map-pin" size={14} color="#4ade80" style={{ marginTop: 1, flexShrink: 0 }} />
                        <span className="tuki-address-text" style={{ color: 'var(--text-secondary)' }}>{order.pickup_address}</span>
                      </div>
                    )}
                    {order.delivery_address && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <Icon name="flag" size={14} color="#f87171" style={{ marginTop: 1, flexShrink: 0 }} />
                        <span className="tuki-address-text" style={{ color: 'var(--text-secondary)' }}>{order.delivery_address}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Action buttons */}
                <div style={{ display: 'flex', gap: 10, padding: '12px 16px 8px' }}>
                  <button
                    onClick={() => setChatTarget({ orderId: order.id, otherName: order.driver_name, otherPhoto: order.driver_photo })}
                    className="tuki-btn tuki-btn-success"
                    style={{ flex: 1, fontSize: '0.85rem', position: 'relative', background: unreadCounts[order.id] ? 'rgba(34,197,94,0.22)' : undefined }}
                  >
                    <Icon name="chat" size={16} /> Chat
                    {!!unreadCounts[order.id] && (
                      <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 800, marginLeft: 4 }}>
                        {unreadCounts[order.id]}
                      </span>
                    )}
                  </button>
                  {['picking_up', 'at_pickup', 'in_transit'].includes(order.status) && (
                    <Link
                      href={`/cliente/seguimiento/${order.id}`}
                      className="tuki-btn tuki-btn-info"
                      style={{ flex: 1, textDecoration: 'none', fontSize: '0.85rem' }}
                    >
                      <Icon name="map" size={16} /> Ver mapa
                    </Link>
                  )}
                </div>
                {/* ── Return / confirm / cancel buttons */}
                <div style={{ padding: '0 16px 14px' }}>
                  {order.status === 'failed' ? (
                    // Delivery failed — waiting for driver to request return or retry
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '10px 14px', fontSize: '0.82rem', color: '#fca5a5', textAlign: 'center' }}>
                      <Icon name="exclamation" size={14} /> Entrega fallida — el conductor resolverá la situación pronto
                    </div>
                  ) : order.status === 'return_rejected' ? (
                    // Client rejected return — driver may ask again
                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '10px 14px', fontSize: '0.82rem', color: '#fde68a', textAlign: 'center' }}>
                      <Icon name="clock" size={14} /> Rechazaste la devolución — el conductor puede solicitar nuevamente
                    </div>
                  ) : order.status === 'returning' ? (
                    // Driver requested return — client accepts or rejects
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 2 }}>
                        El conductor solicita devolver el paquete
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => transitionOrder(order.id, 'return_rejected')}
                          disabled={busy}
                          className="tuki-btn tuki-btn-warning"
                          style={{ flex: 1, fontSize: '0.85rem', opacity: busy ? 0.6 : 1 }}
                        >
                          {actionId === 'return_rejected_' + order.id ? 'Procesando…' : <><Icon name="x" size={14} /> Rechazar</>}
                        </button>
                        <button
                          onClick={() => transitionOrder(order.id, 'driver_returning')}
                          disabled={busy}
                          className="tuki-btn tuki-btn-success"
                          style={{ flex: 2, fontSize: '0.85rem', fontWeight: 800, opacity: busy ? 0.6 : 1 }}
                        >
                          {actionId === 'driver_returning_' + order.id ? 'Procesando…' : <><Icon name="check" size={14} /> Aceptar devolución</>}
                        </button>
                      </div>
                    </div>
                  ) : order.status === 'return_delivered' ? (
                    // Driver arrived to return — client confirms receipt
                    <button
                      onClick={() => transitionOrder(order.id, 'returned')}
                      disabled={busy}
                      className="tuki-btn tuki-btn-success tuki-btn-block"
                      style={{ fontSize: '0.85rem', fontWeight: 800, opacity: busy ? 0.6 : 1 }}
                    >
                      {actionId === 'returned_' + order.id ? 'Confirmando…' : <><Icon name="check" size={14} /> Confirmar recepción del paquete</>}
                    </button>
                  ) : ['driver_returning'].includes(order.status) ? (
                    // Waiting for driver to arrive — no action needed, just info
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                      El conductor va en camino a devolverte el paquete
                    </div>
                  ) : (
                    // Default: show cancel button (only for cancellable statuses)
                    ['accepted', 'picking_up', 'in_transit'].includes(order.status) && (
                      <button
                        onClick={() => setCancelConfirm({ id: order.id, type: 'delivery' })}
                        disabled={busy}
                        className="tuki-btn tuki-btn-danger tuki-btn-block"
                        style={{ fontSize: '0.85rem', opacity: busy ? 0.6 : 1 }}
                      >
                        <Icon name="x" size={14} /> Cancelar solicitud
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* ── Tecnico jobs ───────────────────────────────────────────── */}
        {jobs.map(job => {
          const statusInfo = JOB_TRACKING_STATUS[job.status] ?? { text: job.status };
          const statusTone = getStatusTone(job.status);
          const serviceLabel = SERVICE_LABELS[job.service_type || ''] ?? job.service_type ?? 'Servicio';
          const hasWorker = ['accepted', 'in_progress', 'en_camino', 'llegue', 'completion_pending'].includes(job.status);

          return (
            <div key={job.id} style={{ marginBottom: 16 }}>
              <div
                className="tuki-card"
                style={{
                  ['--status-color' as never]: statusTone.color,
                  ['--status-bg' as never]: statusTone.bg,
                  ['--status-border' as never]: statusTone.border,
                  ['--status-outline' as never]: statusTone.border,
                }}
              >
                {/* ── Status banner */}
                <div className="tuki-card-header" style={{ padding: '12px 16px 10px' }}>
                  <div className="tuki-card-title" style={{ fontWeight: 800 }}>
                    <Icon name={hasWorker ? 'check' : 'clock'} size={16} color={statusTone.color} />
                    {statusInfo.text}
                  </div>
                  <span className="tuki-card-subtitle">{serviceLabel}</span>
                </div>

                {/* ── Progress stepper (only for active job statuses) */}
                {['accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'].includes(job.status) && (
                  <ProgressStepper steps={JOB_STEPS} currentKey={job.status} />
                )}

                {/* ── Worker row */}
                {hasWorker && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 12px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {job.tecnico_photo ? (
                        <img src={job.tecnico_photo} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${statusTone.color}` }} />
                      ) : (
                        <div style={{ width: 60, height: 60, borderRadius: '50%', background: `linear-gradient(135deg,${statusTone.color},var(--surface-3))`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${statusTone.border}` }}>
                          <Icon name="tool" size={28} />
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.tecnico_name || 'Técnico'}
                      </div>
                      <StarRating rating={job.tecnico_avg_rating ?? job.tecnico_rating} count={job.total_services} label="servicios" />
                    </div>
                    {job.agreed_price != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 900, color: '#F5C518', fontSize: '1.25rem', lineHeight: 1 }}>
                          {Number(job.agreed_price).toLocaleString('es-PY')}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Guaraníes</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Pending state */}
                {!hasWorker && (
                  <div style={{ padding: '10px 16px', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Esperando técnico…</div>
                  </div>
                )}

                {/* ── Address */}
                {job.address && (
                  <div className="tuki-address-box" style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '10px 16px 12px', borderRadius: 0, border: 'none', background: 'var(--surface-3)', borderBottom: '1px solid var(--divider)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <Icon name="map-pin" size={14} color="#4ade80" style={{ marginTop: 1, flexShrink: 0 }} />
                    <span className="tuki-address-text" style={{ color: 'var(--text-secondary)' }}>{job.address}</span>
                  </div>
                )}

                {/* ── Warranty badge */}
                {job.warranty_days != null && job.warranty_days > 0 && (
                  <div style={{ padding: '8px 16px 0' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '5px 10px', fontSize: '0.8rem', fontWeight: 700, color: '#818cf8' }}>
                      🛡️ Garantía: {job.warranty_days} {job.warranty_days === 1 ? 'día' : 'días'}
                    </span>
                  </div>
                )}

                {/* ── Action buttons */}
                <div style={{ display: 'flex', gap: 10, padding: '12px 16px 8px' }}>
                  <button
                    onClick={() => setChatTarget({ jobId: job.id, otherName: job.tecnico_name, otherPhoto: job.tecnico_photo })}
                    className="tuki-btn tuki-btn-success"
                    style={{ flex: 1, fontSize: '0.85rem', position: 'relative', background: unreadCounts[job.id] ? 'rgba(34,197,94,0.22)' : undefined }}
                  >
                    <Icon name="chat" size={16} /> Chat
                    {!!unreadCounts[job.id] && (
                      <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 800, marginLeft: 4 }}>
                        {unreadCounts[job.id]}
                      </span>
                    )}
                  </button>
                  {job.status === 'en_camino' && (
                    <Link
                      href={`/cliente/seguimiento/${job.id}?type=service`}
                      className="tuki-btn tuki-btn-info"
                      style={{ flex: 1, textDecoration: 'none', fontSize: '0.85rem' }}
                    >
                      <Icon name="map" size={16} /> Ver mapa
                    </Link>
                  )}
                </div>
                {/* ── Cancel button */}
                <div style={{ padding: '0 16px 14px' }}>
                  {job.status === 'completion_pending' ? (
                    // Confirm or reject completion
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => rejectCompletion(job.id)}
                        disabled={busy}
                        className="tuki-btn tuki-btn-danger"
                        style={{ flex: 1, fontSize: '0.85rem', opacity: busy ? 0.6 : 1 }}
                      >
                        {actionId === 'reject_completion_' + job.id ? 'Rechazando…' : <><Icon name="x" size={14} /> Rechazar</>}
                      </button>
                      <button
                        onClick={() => acceptCompletion(job.id)}
                        disabled={busy}
                        className="tuki-btn tuki-btn-success"
                        style={{ flex: 2, fontSize: '0.85rem', fontWeight: 800, opacity: busy ? 0.6 : 1 }}
                      >
                        {actionId === 'accept_completion_' + job.id ? 'Confirmando…' : <><Icon name="check" size={14} /> Confirmar servicio</>}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelConfirm({ id: job.id, type: 'service' })}
                      disabled={busy}
                      className="tuki-btn tuki-btn-danger tuki-btn-block"
                      style={{ fontSize: '0.85rem', opacity: busy ? 0.6 : 1 }}
                    >
                      <Icon name="x" size={14} /> Cancelar solicitud
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Cancel confirm modal ─────────────────────────────────────────── */}
      {cancelConfirm && (
        <>
          <div onClick={() => setCancelConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10001 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--modal-bg,#1e1e2e)', borderRadius: '20px 20px 0 0', padding: '24px 18px 40px', zIndex: 10002, boxShadow: '0 -4px 24px rgba(0,0,0,0.6)', border: '1px solid var(--modal-border,rgba(255,255,255,0.1))' }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: '2rem', marginBottom: 10 }}>⚠️</div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: 8 }}>¿Cancelar solicitud?</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>Esta acción no se puede deshacer. El conductor será notificado.</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCancelConfirm(null)}
                style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
              >
                Volver
              </button>
              <button
                onClick={() => {
                  if (cancelConfirm.type === 'delivery') cancelOrder(cancelConfirm.id);
                  else cancelJob(cancelConfirm.id);
                  setCancelConfirm(null);
                }}
                disabled={busy}
                style={{ flex: 2, padding: '14px 0', borderRadius: 14, border: 'none', background: busy ? 'rgba(239,68,68,0.5)' : 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Bottom Nav ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(245,197,24,0.15)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 4, justifyContent: 'space-around',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
      }}>
        {/* Home */}
        <Link href="/cliente" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, color: 'var(--nav-icon-inactive)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Home</span>
        </Link>

        {/* Mis ofertas — ACTIVE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 12, background: 'rgba(245,197,24,0.12)', color: '#F5C518', position: 'relative' }}>
          <Icon name="clipboard" size={24} />
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Mis ofertas</span>
          {total > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 'calc(50% - 20px)', minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
              {total}
            </span>
          )}
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#F5C518' }} />
        </div>

        {/* Historial */}
        <Link href="/cliente/historial" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, color: 'var(--nav-icon-inactive)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Historial</span>
        </Link>

        {/* Cuenta */}
        <Link href="/cliente/settings" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, color: 'var(--nav-icon-inactive)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Cuenta</span>
        </Link>
      </div>

      {/* ── Chat Modal ─────────────────────────────────────────────────── */}
      {chatTarget && email && (
        <ChatModal
          open={true}
          onClose={() => setChatTarget(null)}
          orderId={chatTarget.orderId}
          jobId={chatTarget.jobId}
          myEmail={email}
          myName={displayName || null}
          otherName={chatTarget.otherName}
          otherPhoto={chatTarget.otherPhoto}
        />
      )}
    </div>
  );
}
