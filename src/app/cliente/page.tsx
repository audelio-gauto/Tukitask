'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useClientContext } from './context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';

const ClientMap = dynamic(() => import('./components/ClientMap'), { ssr: false });

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Order {
  id: string;
  status: string;
  origin_address: string | null;
  destination_address: string | null;
  price: number | null;
  created_at: string;
  driver_name: string | null;
  driver_photo: string | null;
  driver_rating: number | null;
}

interface DriverOffer {
  id: string;
  order_id: string;
  driver_name: string | null;
  driver_photo: string | null;
  driver_email: string;
  amount: number;
  status: string;
  driver_avg_rating: number | null;
  driver_total_ratings: number | null;
  note: string | null;
}

interface TecnicoJobOffer {
  id: string;
  job_id: string;
  tecnico_email: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  proposed_price: number;
  note: string | null;
  distance_km: number | null;
  total_services: number | null;
  status: string;
}

interface ActiveJob {
  id: string;
  service_type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  created_at?: string;
}

/* unified offer card */
interface UnifiedOffer {
  id: string;
  requestId: string;
  requestType: 'delivery' | 'service';
  name: string | null;
  photo: string | null;
  rating: number | null;
  price: number;
  note: string | null;
  distanceKm: number | null;
  totalJobs: number | null;
  status: string; // pending, accepted, rejected, cancelled, expired
  createdAt: string;
}

/* unified active request (delivery or service) */
interface ActiveRequest {
  id: string;
  type: 'delivery' | 'service';
  icon: string;
  label: string;
  subtitle: string;
  createdAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza', niera: '👶 Niñera', cocina: '🍳 Cocina',
  eventos: '🎉 Eventos', cuidado_mascotas: '🐾 Mascotas', cuidado_adultos: '👴 Adultos',
  aire_split: '❄️ Aire Split', electrico: '⚡ Eléctrico', plomeria: '🔧 Plomería',
  cerrajeria: '🔑 Cerrajería', otros: '✨ Otros',
};

const TRACKING_STATUS_INFO: Record<string, { emoji: string; text: string; color: string }> = {
  accepted:            { emoji: '✅', text: '¡Asignado! En camino a recoger', color: '#22c55e' },
  assigned:            { emoji: '✅', text: '¡Asignado! En camino a recoger', color: '#22c55e' },
  picking_up:          { emoji: '🔔', text: 'Llegó al punto de recogida',     color: '#f59e0b' },
  in_transit:          { emoji: '🚚', text: 'En camino al destino',           color: '#3b82f6' },
  in_progress:         { emoji: '🔧', text: 'Servicio en progreso',           color: '#6366f1' },
  en_camino:           { emoji: '🚗', text: 'Técnico en camino',              color: '#22c55e' },
  llegue:              { emoji: '🔔', text: 'Técnico llegó, listo para comenzar', color: '#f59e0b' },
  en_proceso:          { emoji: '🔧', text: 'Servicio en progreso',           color: '#6366f1' },
  completion_pending:  { emoji: '⏳', text: 'Esperando confirmación',        color: '#a78bfa' },
  returning:           { emoji: '↩️', text: 'El conductor solicita devolver el paquete', color: '#f97316' },
  driver_returning:    { emoji: '🔄', text: 'El conductor va a devolverte el paquete', color: '#f59e0b' },
  return_delivered:    { emoji: '📦', text: 'El conductor llegó a devolver el paquete', color: '#a78bfa' },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function fmtGs(n: number | null) {
  return n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '—';
}

function elapsed(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

/* ─── Radar animation component ─────────────────────────────────────────── */
function RadarPulse() {
  return (
    <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <style>{`
        @keyframes radar-ring {
          0%   { transform: scale(0.3); opacity: 0.7; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40%            { opacity: 1;    transform: scale(1.2); }
        }
      `}</style>
      {[0, 0.55, 1.1].map((delay, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(245,197,24,0.6)',
          animation: `radar-ring 2.2s ease-out ${delay}s infinite`,
        }} />
      ))}
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'linear-gradient(135deg, #F5C518, #F58A07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem', boxShadow: '0 0 20px rgba(245,197,24,0.5)',
        position: 'relative', zIndex: 1,
      }}>📡</div>
    </div>
  );
}

const OFFER_TIMER = 50;

/* ─── Offer card ────────────────────────────────────────────────────────────────────────────────── */
function OfferCard({
  offer, onAccept, onReject, busy,
}: {
  offer: UnifiedOffer;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, OFFER_TIMER - Math.floor((Date.now() - new Date(offer.createdAt).getTime()) / 1000))
  );
  useEffect(() => {
    if (remaining <= 0) { if (offer.status === 'pending') onReject(); return; }
    const t = setTimeout(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const r2 = 14, circ2 = 2 * Math.PI * r2;
  const timerColor = remaining > 20 ? '#22c55e' : remaining > 10 ? '#f59e0b' : '#ef4444';
  const timerDash = circ2 * (remaining / OFFER_TIMER);

  const eta = offer.distanceKm != null ? Math.max(1, Math.round(offer.distanceKm * 2.5)) : null;
  const isDriver = offer.requestType === 'delivery';
  const accentColor = isDriver ? '#F5C518' : '#6366f1';
  const accentBg    = isDriver ? 'rgba(245,197,24,0.12)' : 'rgba(99,102,241,0.12)';
  const accentBorder = isDriver ? 'rgba(245,197,24,0.3)' : 'rgba(99,102,241,0.3)';


  // Estado de la oferta: pending, accepted, rejected, expired, cancelled
  let status = offer.status || 'pending';
  let color = '#F7D060', bg = 'rgba(245,197,24,0.15)', icon = '📤', text = 'Oferta enviada · esperando...';
  if (status === 'accepted') { color = '#6ee7b7'; bg = 'rgba(16,185,129,0.15)'; icon = '✅'; text = 'Aceptada — te eligieron'; }
  else if (status === 'rejected') { color = '#f87171'; bg = 'rgba(239,68,68,0.13)'; icon = '❌'; text = 'Rechazada'; }
  else if (status === 'expired') { color = '#a3a3a3'; bg = 'rgba(156,163,175,0.13)'; icon = '⌛'; text = 'Expirada'; }
  else if (status === 'cancelled') { color = '#f59e42'; bg = 'rgba(245,158,66,0.13)'; icon = '🚫'; text = 'Cancelada'; }

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 14, padding: '10px 12px',
      border: `1px solid ${accentBorder}`,
    }}>
      {/* Row 1: status + timer ring + price */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: bg, borderRadius: 10, border: `1px solid ${color}` }}>
        <span style={{ fontSize: '0.95rem', color, fontWeight: 700 }}>{icon}</span>
        <span style={{ fontSize: '0.78rem', color, fontWeight: 700, flex: 1 }}>{text}</span>
        {offer.status === 'pending' && (
          <svg width="34" height="34" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
            <circle cx="18" cy="18" r={r2} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
            <circle cx="18" cy="18" r={r2} fill="none" stroke={timerColor} strokeWidth="3"
              strokeDasharray={`${timerDash} ${circ2}`} strokeLinecap="round"
              transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
            <text x="18" y="23" textAnchor="middle" fontSize="10" fontWeight="800" fill={timerColor}>{remaining}</text>
          </svg>
        )}
        <span style={{ fontWeight: 800, color: '#c8ff00', fontSize: '1rem' }}>₲{Number(offer.price).toLocaleString()}</span>
      </div>
      {/* Row 2: photo + name + badges */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        {offer.photo ? (
          <img src={offer.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accentColor}`, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${accentColor}, #1e293b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: `2px solid ${accentBorder}`, flexShrink: 0 }}>
            {isDriver ? '🚗' : '👷'}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {offer.name || (isDriver ? 'Conductor' : 'Técnico')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, borderRadius: 20, padding: '2px 7px', background: accentBg, border: `1px solid ${accentBorder}`, color: accentColor }}>
              {isDriver ? '🚗 Envío' : '🛠 Servicio'}
            </span>
            {offer.rating != null && (
              <span style={{ fontSize: '0.65rem', fontWeight: 800, borderRadius: 20, padding: '2px 7px', background: 'rgba(245,197,24,0.15)', border: '1px solid rgba(245,197,24,0.3)', color: '#F5C518' }}>★ {Number(offer.rating).toFixed(1)}</span>
            )}
            {offer.totalJobs != null && offer.totalJobs > 0 && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, borderRadius: 20, padding: '2px 7px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>{isDriver ? `${offer.totalJobs} envíos` : `${offer.totalJobs} servicios`}</span>
            )}
            {eta != null && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, borderRadius: 20, padding: '2px 7px', background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)', color: '#60a5fa' }}>⏱ {eta}m</span>
            )}
            {offer.distanceKm != null && (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, borderRadius: 20, padding: '2px 7px', background: 'rgba(100,116,139,0.25)', border: '1px solid rgba(100,116,139,0.35)', color: '#94a3b8' }}>📍 {offer.distanceKm.toFixed(1)}km</span>
            )}
          </div>
        </div>
      </div>
      {offer.note && (
        <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', padding: '5px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, borderLeft: `2px solid ${accentColor}`, lineHeight: 1.4 }}>"{offer.note}"</p>
      )}
      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {status === 'pending' ? (
          <>
            <button onClick={onReject} disabled={busy} style={{ flex: 1, padding: '9px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.82rem', cursor: busy ? 'default' : 'pointer' }}>Rechazar</button>
            <button onClick={onAccept} disabled={busy} style={{ flex: 2, padding: '9px 0', borderRadius: 12, border: 'none', background: busy ? 'rgba(34,197,94,0.5)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: busy ? 'default' : 'pointer' }}>✓ Aceptar</button>
          </>
        ) : (
          <button onClick={onReject} disabled={busy} style={{ flex: 1, padding: '8px', borderRadius: 12, border: '1px solid #f59e42', background: 'rgba(245,158,66,0.08)', color: '#f59e42', fontWeight: 700, fontSize: '0.78rem', cursor: busy ? 'default' : 'pointer' }}>✕ Cancelar oferta</button>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function ClienteHomePage() {
  const { email, displayName, profilePhoto, avgRating, totalRatings, openDrawer } = useClientContext();

  const [orders,    setOrders]    = useState<Order[]>([]);
  const [jobs,      setJobs]      = useState<ActiveJob[]>([]);
  const [driverOffers, setDriverOffers] = useState<Record<string, DriverOffer[]>>({});
  const [jobOffers,    setJobOffers]    = useState<Record<string, TecnicoJobOffer[]>>({});
  const [acceptedDriverInfo, setAcceptedDriverInfo] = useState<Record<string, { name: string|null; photo: string|null }>>({});
  const [loading,   setLoading]   = useState(true);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [elapsed2, setElapsed]    = useState(0); // seconds counter for searching
  const [noTaskerMsg, setNoTaskerMsg] = useState<string | null>(null);
  const locateRef = useRef<(() => void) | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoExpiredRef = useRef(new Set<string>());

  /* ─── Data loading ──────────────────────────────────────────────────────── */
  const loadAll = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, jobsRes] = await Promise.all([
        fetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const jobsData   = await jobsRes.json();

      const ALL_ACTIVE_STS = ['pending', 'negotiating', 'accepted', 'assigned', 'picking_up', 'in_transit', 'in_progress', 'returning', 'driver_returning', 'return_delivered'];
      const TRACKING_STS_LOAD = ['accepted', 'assigned', 'picking_up', 'in_transit', 'in_progress', 'returning', 'driver_returning', 'return_delivered'];
      const activeOrders: Order[] = Array.isArray(ordersData)
        ? ordersData.filter((o: Order) => ALL_ACTIVE_STS.includes(o.status))
        : [];
      const activeJobs: ActiveJob[] = Array.isArray(jobsData) ? jobsData : [];

      setOrders(activeOrders);
      setJobs(activeJobs);

      // Fetch ALL offers for ALL active orders (pending offers → offer cards; accepted offers → tracking driver info)
      if (activeOrders.length > 0) {
        const ids = activeOrders.map(o => o.id).join(',');
        const offersRes  = await fetch(`/api/orders/offers?order_ids=${encodeURIComponent(ids)}`);
        const offersData = await offersRes.json();
        if (offersData && typeof offersData === 'object') {
          const pendingMap: Record<string, DriverOffer[]> = {};
          const driverInfoMap: Record<string, { name: string|null; photo: string|null }> = {};
          for (const order of activeOrders) {
            const allOffs: DriverOffer[] = offersData[order.id] ?? [];
            pendingMap[order.id] = allOffs.filter((o: DriverOffer) => o.status === 'pending');
            // For tracking orders, grab driver info from the accepted offer
            if (TRACKING_STS_LOAD.includes(order.status)) {
              const accepted = allOffs.find((o: DriverOffer) => o.status === 'accepted');
              if (accepted) driverInfoMap[order.id] = { name: accepted.driver_name, photo: accepted.driver_photo };
            }
          }
          setDriverOffers(pendingMap);
          setAcceptedDriverInfo(driverInfoMap);
        }
      } else {
        setDriverOffers({});
        setAcceptedDriverInfo({});
      }

      // Fetch tecnico job offers
      if (activeJobs.length > 0) {
        const allJobOffers: Record<string, TecnicoJobOffer[]> = {};
        await Promise.all(activeJobs.map(async job => {
          const r    = await fetch(`/api/tecnico/jobs?job_offers=${job.id}`);
          const data = await r.json();
          allJobOffers[job.id] = Array.isArray(data) ? data : [];
        }));
        setJobOffers(allJobOffers);
      } else {
        setJobOffers({});
      }

      setLoading(false);
    } catch { setLoading(false); }
  }, [email]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30_000);

    // Re-load immediately when user returns to app (e.g. taps a push notification)
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', loadAll);

    const ch = email
      ? supabase.channel(`client-home-${email}`)
          .on('postgres_changes', { event: '*',    schema: 'public', table: 'orders',           filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: '*',    schema: 'public', table: 'tecnico_jobs',     filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_offers', filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tecnico_job_offers', filter: `client_email=eq.${email}` } as never, () => loadAll())
          .subscribe()
      : null;
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadAll);
      if (ch) supabase.removeChannel(ch);
    };
  }, [loadAll]);

  /* ─── Elapsed timer for searching state ────────────────────────────────── */
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const isSearching = orders.some(o => ['pending', 'negotiating'].includes(o.status))
                     || jobs.some(j => ['pending', 'negotiating'].includes(j.status));
    if (isSearching) {
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [orders, jobs]);

  /* ─── Derived state ─────────────────────────────────────────────────────── */
  const allDriverOffers: UnifiedOffer[] = orders.flatMap(o =>
    (driverOffers[o.id] ?? []).map((off: DriverOffer & { created_at?: string }) => ({
      id: off.id, requestId: o.id, requestType: 'delivery' as const,
      name: off.driver_name, photo: off.driver_photo,
      rating: off.driver_avg_rating ?? null,
      price: Number(off.amount), note: off.note ?? null, distanceKm: null,
      totalJobs: off.driver_total_ratings ?? null,
      status: off.status, createdAt: off.created_at ?? new Date().toISOString(),
    }))
  );
  const allJobOffers: UnifiedOffer[] = jobs.flatMap(j =>
    (jobOffers[j.id] ?? []).map((off: TecnicoJobOffer & { created_at?: string }) => ({
      id: off.id, requestId: j.id, requestType: 'service' as const,
      name: off.tecnico_name, photo: off.tecnico_photo, rating: off.tecnico_rating,
      price: Number(off.proposed_price), note: off.note, distanceKm: off.distance_km, totalJobs: off.total_services,
      status: off.status, createdAt: off.created_at ?? new Date().toISOString(),
    }))
  );

  // Pagination for offers
  const [offersPage, setOffersPage] = useState(1);
  const OFFERS_PER_PAGE = 10;
  const allOffers = [...allDriverOffers, ...allJobOffers];
  const paginatedOffers = allOffers.slice(0, offersPage * OFFERS_PER_PAGE);

  const TRACKING_STS = ['accepted', 'assigned', 'picking_up', 'in_transit', 'in_progress', 'en_camino', 'llegue', 'en_proceso', 'completion_pending', 'returning', 'driver_returning', 'return_delivered'];
  const SEARCHING_STS = ['pending', 'negotiating'];
  const trackingOrders = orders.filter(o => TRACKING_STS.includes(o.status));
  const trackingJobs   = jobs.filter(j => TRACKING_STS.includes(j.status));

  const activeRequests: ActiveRequest[] = [
    ...orders.filter(o => SEARCHING_STS.includes(o.status)).map(o => ({
      id: o.id, type: 'delivery' as const, icon: '📦',
      label: 'Envío de paquete',
      subtitle: [o.origin_address, o.destination_address].filter(Boolean).join(' → ') || 'Sin dirección',
      createdAt: o.created_at,
    })),
    ...jobs.filter(j => SEARCHING_STS.includes(j.status)).map(j => ({
      id: j.id, type: 'service' as const, icon: '🛠',
      label: SERVICE_LABELS[j.service_type] ?? j.service_type,
      subtitle: j.address ?? 'Sin dirección',
      createdAt: j.created_at ?? new Date().toISOString(),
    })),
  ];

  const mode: 'idle' | 'searching' | 'offers' | 'tracking' =
    trackingOrders.length > 0 || trackingJobs.length > 0 ? 'tracking'
    : allOffers.length > 0                               ? 'offers'
    : activeRequests.length > 0                          ? 'searching'
    : 'idle';

  const busy = !!actionId;

  /* ─── Open sheet when offers arrive ────────────────────────────────────── */
  useEffect(() => {
    if (mode !== 'idle') setSheetOpen(true);
    if (mode === 'idle') setSheetOpen(false);
  }, [mode]);

  /* ─── Actions ───────────────────────────────────────────────────────────── */
  const acceptDriverOffer = async (offerId: string) => {
    if (busy) return;
    setActionId(offerId);
    try {
      await authFetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'accept' }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  const rejectDriverOffer = async (offerId: string) => {
    if (busy) return;
    setActionId(offerId);
    try {
      await authFetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'reject' }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  const acceptJobOffer = async (jobId: string, offerId: string) => {
    if (busy || !email) return;
    setActionId(offerId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_offer', jobId, offerId, clientEmail: email }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  const rejectJobOffer = async (offerId: string) => {
    if (busy) return;
    setActionId(offerId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_offer', offerId }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  const cancelOrder = async (orderId: string) => {
    if (busy || !email) return;
    setActionId('cancel_' + orderId);
    try {
      await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'cancelled' }),
      });
      loadAll();
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
      loadAll();
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
      loadAll();
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
      loadAll();
    } finally { setActionId(null); }
  };

  const acceptReturn = async (orderId: string) => {
    if (busy || !email) return;
    setActionId('accept_return_' + orderId);
    try {
      await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'driver_returning' }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  const rejectReturn = async (orderId: string) => {
    if (busy || !email) return;
    setActionId('reject_return_' + orderId);
    try {
      await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'return_rejected' }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  const confirmReturnReceipt = async (orderId: string) => {
    if (busy || !email) return;
    setActionId('confirm_return_' + orderId);
    try {
      await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'returned' }),
      });
      loadAll();
    } finally { setActionId(null); }
  };

  /* ─── Auto-cancel after 3 minutes without offers ──────────────────────── */
  const REQUEST_TIMEOUT_SEC = 180;
  useEffect(() => {
    activeRequests.forEach(req => {
      if (autoExpiredRef.current.has(req.id)) return;
      const secs = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 1000);
      if (secs < REQUEST_TIMEOUT_SEC) return;
      autoExpiredRef.current.add(req.id);
      if (req.type === 'delivery') cancelOrder(req.id);
      else cancelJob(req.id);
      setNoTaskerMsg(`😔 No hay tasker disponible para "${req.label}"`);
      setTimeout(() => setNoTaskerMsg(null), 6000);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed2]);

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Map base */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ClientMap dark showMyLocationButton={false} locateRef={locateRef} />
      </div>

      {/* Top gradient */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />

      {/* ── No tasker toast ────────────────────────────────────────────── */}
      {noTaskerMsg && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#1e293b', border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: 16, padding: '14px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          maxWidth: 320, width: 'calc(100% - 32px)', textAlign: 'center',
          animation: 'fadeInDown 0.3s ease',
        }}>
          <style>{`@keyframes fadeInDown { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
          <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>😔</div>
          <div style={{ fontWeight: 800, color: '#f87171', fontSize: '0.95rem', marginBottom: 4 }}>No hay tasker disponible</div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Ningún tasker respondió. Podés intentarlo de nuevo.</div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, padding: '16px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {profilePhoto ? (
            <img src={profilePhoto} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518' }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid rgba(245,197,24,0.5)', flexShrink: 0 }}>
              {displayName?.[0]?.toUpperCase() || '👤'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{getGreeting()}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName || 'Cliente'}</div>
          </div>
          {avgRating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(245,197,24,0.15)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 20, padding: '5px 11px', flexShrink: 0 }}>
              <span style={{ color: '#F5C518', fontSize: '0.85rem' }}>★</span>
              <span style={{ color: '#F5C518', fontSize: '0.82rem', fontWeight: 800 }}>{avgRating.toFixed(1)}</span>
            </div>
          )}
          <button onClick={openDrawer} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, width: 42, height: 42, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {[0,1,2].map(i => <span key={i} style={{ display: 'block', width: 16, height: 2, background: '#fff', borderRadius: 2 }} />)}
          </button>
        </div>
      </div>

      {/* ── Locate button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => { locateRef.current?.(); }}
        style={{ position: 'absolute', right: 16, bottom: mode === 'idle' ? 130 : 16, zIndex: 4, width: 46, height: 46, borderRadius: '50%', background: 'rgba(15,23,42,0.92)', border: '2px solid rgba(245,197,24,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', transition: 'bottom 0.4s ease' }}
      >📍</button>

      {/* ── BOTTOM SHEET ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 65, left: 0, right: 0, zIndex: 10,
        transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* ── IDLE — hidden, only floating button shows ─────────────────── */}

        {/* ── SEARCHING ────────────────────────────────────────────────────── */}
        {mode === 'searching' && (
          <div style={{ background: '#0f172a', borderRadius: '24px 24px 0 0', border: '1px solid rgba(245,197,24,0.2)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)' }}>
            {/* Handle */}
            <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, background: '#334155', borderRadius: 2 }} />
            </div>

            {/* Searching content */}
            <div style={{ padding: '16px 20px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <RadarPulse />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1.05rem', marginBottom: 4 }}>
                    Buscando cerca de ti…
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Te notificamos cuando lleguen ofertas
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 600 }}>Cancela en</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>
                    {(() => {
                      const earliest = activeRequests.reduce((min, r) => {
                        const s = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 1000);
                        return s < min ? s : min;
                      }, Infinity);
                      void elapsed2;
                      const cd = Math.max(0, REQUEST_TIMEOUT_SEC - (earliest === Infinity ? 0 : earliest));
                      return `${Math.floor(cd/60).toString().padStart(2,'0')}:${(cd%60).toString().padStart(2,'0')}`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Active requests */}
              {activeRequests.map(req => {
                const secElapsed = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 1000);
                void elapsed2; // re-render trigger
                const countdown = Math.max(0, REQUEST_TIMEOUT_SEC - secElapsed);
                const pct = countdown / REQUEST_TIMEOUT_SEC;
                const barColor = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={req.id} style={{ background: '#1e293b', borderRadius: 16, padding: '10px 14px 8px', marginBottom: 10, border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.4rem' }}>{req.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem' }}>{req.label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.subtitle}</div>
                      </div>
                      <button
                        onClick={() => req.type === 'delivery' ? cancelOrder(req.id) : cancelJob(req.id)}
                        disabled={busy}
                        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#f87171', cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}
                      >
                        Cancelar
                      </button>
                    </div>
                    {/* Countdown bar */}
                    <div style={{ marginTop: 8, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, borderRadius: 4, transition: 'width 1s linear, background 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── OFFERS ─────────────────────────────────────────────────────── */}
        {mode === 'offers' && (
          <div style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Count header */}
            <div style={{ padding: '6px 14px 2px', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '0.9rem', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                {allOffers.length} oferta{allOffers.length !== 1 ? 's' : ''} recibida{allOffers.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Scrollable offer cards */}
            <div style={{ overflowY: 'auto', padding: '4px 10px 24px', display: 'flex', flexDirection: 'column', gap: 8, WebkitOverflowScrolling: 'touch' as never, overscrollBehavior: 'contain' }}>

              {paginatedOffers.map(offer => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  busy={busy}
                  onAccept={() => offer.requestType === 'delivery'
                    ? acceptDriverOffer(offer.id)
                    : acceptJobOffer(offer.requestId, offer.id)
                  }
                  onReject={() => offer.requestType === 'delivery'
                    ? rejectDriverOffer(offer.id)
                    : rejectJobOffer(offer.id)
                  }
                />
              ))}

              {/* Pagination: Load more button */}
              {allOffers.length > paginatedOffers.length && (
                <button
                  onClick={() => setOffersPage(p => p + 1)}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: 14,
                    border: '1px solid #F5C518',
                    background: 'rgba(245,197,24,0.08)',
                    color: '#F5C518',
                    fontWeight: 800,
                    fontSize: '0.98rem',
                    marginTop: 10,
                    cursor: 'pointer',
                  }}
                >
                  Cargar más ofertas
                </button>
              )}

              {/* Cancel links below offers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {activeRequests.map(req => (
                  <button
                    key={req.id}
                    onClick={() => req.type === 'delivery' ? cancelOrder(req.id) : cancelJob(req.id)}
                    disabled={busy}
                    style={{ width: '100%', padding: '11px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 700, fontSize: '0.86rem', cursor: busy ? 'default' : 'pointer' }}
                  >
                    ✕ Cancelar solicitud {req.type === 'delivery' ? 'de envío' : `de ${req.label}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRACKING ─────────────────────────────────────────────────── */}
        {mode === 'tracking' && (
          <div style={{ background: '#0f172a', borderRadius: '24px 24px 0 0', border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, background: '#334155', borderRadius: 2 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px' }}>
              {[
                ...trackingOrders.map(o => ({ type: 'delivery' as const, id: o.id, status: o.status,
                  name: acceptedDriverInfo[o.id]?.name ?? o.driver_name,
                  photo: acceptedDriverInfo[o.id]?.photo ?? o.driver_photo,
                  rating: o.driver_rating, price: o.price, origin: o.origin_address, dest: o.destination_address, svcType: '' })),
                ...trackingJobs.map(j => ({ type: 'service' as const, id: j.id, status: j.status, name: j.tecnico_name, photo: j.tecnico_photo, rating: j.tecnico_rating, price: null, origin: null, dest: null, svcType: j.service_type })),
              ].map(item => {
                const info = TRACKING_STATUS_INFO[item.status] ?? { emoji: '✅', text: 'En progreso', color: '#22c55e' };
                const canCancel = ['accepted', 'assigned'].includes(item.status);
                return (
                  <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: 16, marginBottom: 12, border: `1px solid ${info.color}40` }}>
                    {/* Status banner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <span style={{ fontSize: '1.4rem' }}>{info.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: info.color }}>{info.text}</div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                          {item.type === 'delivery' ? '📦 Envío' : `🛠 ${SERVICE_LABELS[item.svcType] ?? item.svcType}`}
                        </div>
                      </div>
                    </div>
                    {/* Provider card */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: 14, marginBottom: 12 }}>
                      {item.photo ? (
                        <img src={item.photo} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${info.color}` }} />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg,${info.color},#1e293b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                          {item.type === 'delivery' ? '🚗' : '👷'}
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{item.name || (item.type === 'delivery' ? 'Conductor' : 'Técnico')}</div>
                        {item.rating != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <span style={{ color: '#F5C518' }}>★</span>
                            <span style={{ color: '#F5C518', fontWeight: 700, fontSize: '0.85rem' }}>{Number(item.rating).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      {item.price != null && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, color: '#F5C518', fontSize: '1.25rem' }}>{Number(item.price).toLocaleString('es-PY')}</div>
                          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>Gs</div>
                        </div>
                      )}
                    </div>
                    {/* Addresses */}
                    {(item.origin || item.dest) && (
                      <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, marginBottom: 12 }}>
                        {item.origin && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>📍 {item.origin}</div>}
                        {item.dest   && <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>🏁 {item.dest}</div>}
                      </div>
                    )}
                    {/* Cancel */}
                    {canCancel && (
                      <button
                        onClick={() => item.type === 'delivery' ? cancelOrder(item.id) : cancelJob(item.id)}
                        disabled={busy}
                        style={{ width: '100%', padding: '11px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 700, fontSize: '0.85rem', cursor: busy ? 'default' : 'pointer' }}
                      >✕ Cancelar solicitud</button>
                    )}
                    {/* Return: client accepts or rejects driver return request */}
                    {item.type === 'delivery' && item.status === 'returning' && (
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: '0.83rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>¿Autorizas la devolución del paquete?</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => rejectReturn(item.id)} disabled={busy} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 800, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer' }}>❌ Rechazar</button>
                          <button onClick={() => acceptReturn(item.id)} disabled={busy} style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', background: busy ? 'rgba(245,158,11,0.5)' : 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer' }}>↩️ Aceptar devolución</button>
                        </div>
                      </div>
                    )}
                    {/* Return delivered: client confirms or rejects receipt */}
                    {item.type === 'delivery' && item.status === 'return_delivered' && (
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: '0.83rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>¿Recibiste el paquete devuelto?</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => rejectReturn(item.id)} disabled={busy} style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 800, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer' }}>❌ No recibí</button>
                          <button onClick={() => confirmReturnReceipt(item.id)} disabled={busy} style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', background: busy ? 'rgba(34,197,94,0.5)' : 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer' }}>✔ Sí, lo recibí</button>
                        </div>
                      </div>
                    )}
                    {/* Confirm completion */}
                    {item.type === 'service' && item.status === 'completion_pending' && (
                      <div>
                        <p style={{ margin: '0 0 10px', fontSize: '0.83rem', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                          ¿El servicio fue realizado correctamente?
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={() => rejectCompletion(item.id)}
                            disabled={busy}
                            style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 800, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer' }}
                          >❌ Rechazar</button>
                          <button
                            onClick={() => acceptCompletion(item.id)}
                            disabled={busy}
                            style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', background: busy ? 'rgba(34,197,94,0.5)' : 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : '0 4px 16px rgba(34,197,94,0.35)' }}
                          >✔ Confirmar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── IDLE — centered content ──────────────────────────────────────── */}
      {mode === 'idle' && !loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 10, textAlign: 'center', padding: '0 24px',
        }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 4 }}>📭</div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>No tenés ofertas pendientes</div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', textShadow: '0 1px 6px rgba(0,0,0,0.8)', marginBottom: 8 }}>¿Qué ayuda necesitás hoy?</div>
          <button
            onClick={() => setShowPublishModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 32px', borderRadius: 50, border: 'none',
              background: 'linear-gradient(135deg, #F5C518, #F58A07)',
              color: '#1C1C2E', fontWeight: 900, fontSize: '1.05rem',
              cursor: 'pointer', boxShadow: '0 6px 24px rgba(245,197,24,0.5)',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>➕</span> Pedir ahora
          </button>
        </div>
      )}

      {/* ── PUBLISH MODAL ─────────────────────────────────────────────── */}
      {showPublishModal && (
        <div
          onClick={() => setShowPublishModal(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 30,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: '#0f172a',
              borderRadius: '24px 24px 0 0',
              border: '1px solid rgba(245,197,24,0.2)',
              padding: '20px 20px max(20px, env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 40, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 16px' }} />
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>¿Qué necesitás?</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Link
                href="/cliente/enviar"
                onClick={() => setShowPublishModal(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px', borderRadius: 18, background: 'rgba(245,197,24,0.1)', border: '1.5px solid rgba(245,197,24,0.3)', textDecoration: 'none' }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0 }}>📦</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Enviar un paquete</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>Delivery rápido a domicilio</div>
                </div>
              </Link>
              <Link
                href="/cliente/servicio"
                onClick={() => setShowPublishModal(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px', borderRadius: 18, background: 'rgba(99,102,241,0.1)', border: '1.5px solid rgba(99,102,241,0.3)', textDecoration: 'none' }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0 }}>🛠️</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>Contratar un técnico</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>Servicios en tu hogar</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAVBAR ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'rgba(15,23,42,0.97)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(245,197,24,0.15)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 4, justifyContent: 'space-around',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
        }}>
        {[
          { icon: '🏠', label: 'Home', path: '/cliente', active: true, onClick: undefined as (() => void) | undefined },
          { icon: '➕', label: 'Publicar', path: '', active: false, onClick: () => setShowPublishModal(true) },
          { icon: '📋', label: 'Historial', path: '/cliente/historial', active: false, onClick: undefined as (() => void) | undefined },
          { icon: '👤', label: 'Cuenta', path: '/cliente/settings', active: false, onClick: undefined as (() => void) | undefined },
        ].map(item => (
            item.onClick ? (
              <button key={item.label} onClick={item.onClick}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', background: 'transparent', border: 'none', borderRadius: 12, cursor: 'pointer' }}>
                <div style={{ fontSize: '1.4rem' }}>{item.icon}</div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{item.label}</span>
              </button>
            ) : (
              <Link key={item.label} href={item.path}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, background: item.active ? 'rgba(245,197,24,0.15)' : 'transparent' }}>
                <div style={{ fontSize: '1.4rem' }}>{item.icon}</div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: item.active ? '#F5C518' : 'rgba(255,255,255,0.5)' }}>{item.label}</span>
              </Link>
            )
        ))}
      </div>

      {/* ── Loading overlay ──────────────────────────────────────────────── */}
      {loading && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(15,23,42,0.9)', borderRadius: 40, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(245,197,24,0.3)', borderTopColor: '#F5C518', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontWeight: 600 }}>Cargando…</span>
        </div>
      )}
    </div>
  );
}