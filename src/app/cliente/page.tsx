'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
}

interface DriverOffer {
  id: string;
  order_id: string;
  driver_name: string | null;
  driver_photo: string | null;
  driver_email: string;
  amount: number;
  status: string;
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
}

interface ActiveJob {
  id: string;
  service_type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
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

/* ─── Offer card ─────────────────────────────────────────────────────────── */
function OfferCard({
  offer, onAccept, onReject, busy,
}: {
  offer: UnifiedOffer;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const eta = offer.distanceKm != null ? Math.max(1, Math.round(offer.distanceKm * 2.5)) : null;
  const isDriver = offer.requestType === 'delivery';
  const accentColor = isDriver ? '#F5C518' : '#6366f1';
  const accentBg    = isDriver ? 'rgba(245,197,24,0.12)' : 'rgba(99,102,241,0.12)';
  const accentBorder = isDriver ? 'rgba(245,197,24,0.3)' : 'rgba(99,102,241,0.3)';

  return (
    <div style={{
      background: 'rgba(15,23,42,0.97)', backdropFilter: 'blur(16px)',
      borderRadius: 20, padding: '16px 14px 14px',
      border: `1.5px solid ${accentBorder}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* Type badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{
          fontSize: '0.72rem', fontWeight: 800, borderRadius: 20, padding: '3px 10px',
          background: accentBg, border: `1px solid ${accentBorder}`, color: accentColor,
        }}>
          {isDriver ? '🚗 Envío' : '🛠 Servicio'}
        </span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 900, color: '#F5C518', fontSize: '1.5rem', lineHeight: 1 }}>
            {Number(offer.price).toLocaleString('es-PY')}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>Gs</div>
        </div>
      </div>

      {/* Driver / Tecnico info */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: 14, marginBottom: 12 }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          {offer.photo ? (
            <img src={offer.photo} alt="" style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accentColor}` }} />
          ) : (
            <div style={{ width: 58, height: 58, borderRadius: '50%', background: `linear-gradient(135deg, ${accentColor}, #1e293b)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', border: `2px solid ${accentBorder}` }}>
              {isDriver ? '🚗' : '👷'}
            </div>
          )}
          {offer.rating != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(245,197,24,0.15)', borderRadius: 8, padding: '2px 7px' }}>
              <span style={{ color: '#F5C518', fontSize: '0.65rem' }}>★</span>
              <span style={{ color: '#F5C518', fontSize: '0.72rem', fontWeight: 800 }}>{Number(offer.rating).toFixed(1)}</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.02rem', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {offer.name || (isDriver ? 'Conductor' : 'Técnico')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {eta != null && (
              <span style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 20, padding: '3px 9px', fontSize: '0.75rem', color: '#60a5fa', fontWeight: 700 }}>
                ⏱ {eta} min
              </span>
            )}
            {offer.distanceKm != null && (
              <span style={{ background: 'rgba(100,116,139,0.25)', border: '1px solid rgba(100,116,139,0.35)', borderRadius: 20, padding: '3px 9px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                📍 {offer.distanceKm.toFixed(1)} km
              </span>
            )}
            {offer.totalJobs != null && offer.totalJobs > 0 && (
              <span style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '3px 9px', fontSize: '0.75rem', color: '#4ade80', fontWeight: 700 }}>
                ✅ {offer.totalJobs}
              </span>
            )}
          </div>
        </div>
      </div>

      {offer.note && (
        <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: 10, borderLeft: `3px solid ${accentColor}`, lineHeight: 1.5 }}>
          "{offer.note}"
        </p>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onReject} disabled={busy}
          style={{ flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer' }}
        >Rechazar</button>
        <button
          onClick={onAccept} disabled={busy}
          style={{ flex: 2, padding: '13px 0', borderRadius: 14, border: 'none', background: busy ? 'rgba(34,197,94,0.5)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : '0 4px 16px rgba(34,197,94,0.4)' }}
        >✓ Aceptar</button>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function ClienteHomePage() {
  const router = useRouter();
  const { email, displayName, profilePhoto, avgRating, totalRatings, openDrawer } = useClientContext();

  const [orders,    setOrders]    = useState<Order[]>([]);
  const [jobs,      setJobs]      = useState<ActiveJob[]>([]);
  const [driverOffers, setDriverOffers] = useState<Record<string, DriverOffer[]>>({});
  const [jobOffers,    setJobOffers]    = useState<Record<string, TecnicoJobOffer[]>>({});
  const [loading,   setLoading]   = useState(true);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [locating, setLocating]   = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [elapsed2, setElapsed]    = useState(0); // seconds counter for searching
  const locateRef = useRef<(() => void) | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

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

      const activeOrders: Order[] = Array.isArray(ordersData)
        ? ordersData.filter((o: Order) => o.status === 'pending' || o.status === 'negotiating')
        : [];
      const activeJobs: ActiveJob[] = Array.isArray(jobsData) ? jobsData : [];

      setOrders(activeOrders);
      setJobs(activeJobs);

      // Fetch driver offers for pending/negotiating orders
      if (activeOrders.length > 0) {
        const ids = activeOrders.map(o => o.id).join(',');
        const offersRes  = await fetch(`/api/orders/offers?order_ids=${encodeURIComponent(ids)}`);
        const offersData = await offersRes.json();
        if (offersData && typeof offersData === 'object') {
          // keep only pending offers
          const cleaned: Record<string, DriverOffer[]> = {};
          for (const id of activeOrders.map(o => o.id)) {
            cleaned[id] = (offersData[id] ?? []).filter((o: DriverOffer) => o.status === 'pending');
          }
          setDriverOffers(cleaned);
        }
      } else {
        setDriverOffers({});
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
    const ch = email
      ? supabase.channel(`client-home-${email}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_jobs', filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_offers' } as never, () => loadAll())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tecnico_job_offers' } as never, () => loadAll())
          .subscribe()
      : null;
    return () => { clearInterval(iv); if (ch) supabase.removeChannel(ch); };
  }, [loadAll]);

  /* ─── Elapsed timer for searching state ────────────────────────────────── */
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const isSearching = (orders.length > 0 || jobs.length > 0);
    if (isSearching) {
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [orders.length, jobs.length]);

  /* ─── Derived state ─────────────────────────────────────────────────────── */
  const allDriverOffers: UnifiedOffer[] = orders.flatMap(o =>
    (driverOffers[o.id] ?? []).map(off => ({
      id: off.id, requestId: o.id, requestType: 'delivery' as const,
      name: off.driver_name, photo: off.driver_photo, rating: null,
      price: Number(off.amount), note: null, distanceKm: null, totalJobs: null,
    }))
  );
  const allJobOffers: UnifiedOffer[] = jobs.flatMap(j =>
    (jobOffers[j.id] ?? []).map(off => ({
      id: off.id, requestId: j.id, requestType: 'service' as const,
      name: off.tecnico_name, photo: off.tecnico_photo, rating: off.tecnico_rating,
      price: Number(off.proposed_price), note: off.note, distanceKm: off.distance_km, totalJobs: off.total_services,
    }))
  );
  const allOffers = [...allDriverOffers, ...allJobOffers];

  const activeRequests: ActiveRequest[] = [
    ...orders.map(o => ({
      id: o.id, type: 'delivery' as const, icon: '📦',
      label: 'Envío de paquete',
      subtitle: [o.origin_address, o.destination_address].filter(Boolean).join(' → ') || 'Sin dirección',
      createdAt: o.created_at,
    })),
    ...jobs.map(j => ({
      id: j.id, type: 'service' as const, icon: '🛠',
      label: SERVICE_LABELS[j.service_type] ?? j.service_type,
      subtitle: j.address ?? 'Sin dirección',
      createdAt: new Date().toISOString(),
    })),
  ];

  const mode: 'idle' | 'searching' | 'offers' =
    activeRequests.length === 0 ? 'idle'
    : allOffers.length > 0    ? 'offers'
    : 'searching';

  const busy = !!actionId;

  /* ─── Open sheet when offers arrive ────────────────────────────────────── */
  useEffect(() => {
    if (mode === 'offers') setSheetOpen(true);
    if (mode === 'searching') setSheetOpen(true);
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
        body: JSON.stringify({ action: 'cancel', orderId, email }),
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

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Map base */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ClientMap dark showMyLocationButton={false} locateRef={locateRef} />
      </div>

      {/* Top gradient */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />

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
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
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
                  <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600 }}>Transcurrido</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#F5C518' }}>
                    {Math.floor(elapsed2 / 60).toString().padStart(2, '0')}:{(elapsed2 % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              </div>

              {/* Active requests */}
              {activeRequests.map(req => (
                <div key={req.id} style={{ background: '#1e293b', borderRadius: 16, padding: '12px 14px', marginBottom: 10, border: '1px solid #334155' }}>
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── OFFERS ─────────────────────────────────────────────────────── */}
        {mode === 'offers' && (
          <div style={{ background: '#0f172a', borderRadius: '24px 24px 0 0', border: '1px solid rgba(245,197,24,0.25)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)', maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
            {/* Handle + count */}
            <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, background: '#334155', borderRadius: 2 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1rem' }}>
                    {allOffers.length} oferta{allOffers.length !== 1 ? 's' : ''} recibida{allOffers.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Revisá y elegí la mejor opción</div>
                </div>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#1e293b', fontSize: '1.05rem', boxShadow: '0 2px 12px rgba(245,197,24,0.4)', flexShrink: 0 }}>
                  {allOffers.length}
                </div>
              </div>

              {/* Active request tabs (if multiple) */}
              {activeRequests.length > 1 && (
                <div style={{ display: 'flex', gap: 6, width: '100%', overflowX: 'auto', paddingBottom: 4 }}>
                  {activeRequests.map(req => (
                    <div key={req.id} style={{ flexShrink: 0, background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: '4px 12px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                      {req.icon} {req.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scrollable offer cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {allOffers.map(offer => (
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