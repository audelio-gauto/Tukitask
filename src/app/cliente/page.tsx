'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useClientContext } from './context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { haversineKm } from '@/lib/geo';
import { getGreeting } from '@/lib/greeting';
import ChatModal from '@/components/ChatModal';
import { playMessageAlert } from '@/lib/audio';

const ClientMap = dynamic(() => import('./components/ClientMap'), { ssr: false });

function useDarkMode() {
  const [dark, setDark] = React.useState(() => {
    // Read immediately (client only) so the map initializes with the correct style
    if (typeof document === 'undefined') return true;
    return document.documentElement.getAttribute('data-theme') !== 'light';
  });
  React.useEffect(() => {
    // App uses data-theme="dark"|"light" on <html>, not prefers-color-scheme
    const read = () => document.documentElement.getAttribute('data-theme') !== 'light';
    setDark(read());
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Order {
  id: string;
  status: string;
  order_type: string | null;
  vehicle_type: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  offer: number | null;
  suggested_price: number | null;
  created_at: string;
  driver_name: string | null;
  driver_photo: string | null;
  driver_rating: number | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
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
  distance_km: number | null;
  driver_vehicle_brand: string | null;
  driver_vehicle_model: string | null;
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
  agreed_price: number | null;
  extra_charge: number | null;
  extra_reason: string | null;
  extra_items: Array<{ amount: number; reason: string }> | null;
  total_price: number | null;
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
  suggestedPrice: number | null;
  note: string | null;
  distanceKm: number | null;
  totalJobs: number | null;
  vehicleModel: string | null;
  status: string; // pending, accepted, rejected, cancelled, expired
  createdAt: string;
  /** Matching score (0..100) — server-computed */
  matchScore: number | null;
  matchLabel: string | null;
  matchColor: string | null;
}

/* unified active request (delivery or service) */
interface ActiveRequest {
  id: string;
  type: 'delivery' | 'service';
  icon: string;
  label: string;
  line1: string;
  line2: string;
  orderType: string;
  subtitle: string;
  createdAt: string;
}

/* ─── Order type config for searching card ───────────────────────────────── */
const SERVICE_TYPE_SHORT: Record<string, string> = {
  viaje:     'Remis',
  envio:     'Envío',
  mandadito: 'Mandadito',
  flete:     'Flete',
  service:   'Técnico',
};
const VEHICLE_SHORT: Record<string, string> = {
  moto:      'Moto',
  auto:      'Auto',
  motocarro: 'Moto Carro',
  camion2t:  'Camión',
};

const ORDER_CFG: Record<string, { color: string; badge: string; gradient: string; icon: string }> = {
  envio:     { color: '#3b82f6', badge: 'Envío',     gradient: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', icon: '📦' },
  mandadito: { color: '#f59e0b', badge: 'Mandadito', gradient: 'linear-gradient(135deg, #b45309, #f59e0b)', icon: '🛵' },
  flete:     { color: '#8b5cf6', badge: 'Flete',     gradient: 'linear-gradient(135deg, #6d28d9, #8b5cf6)', icon: '🚛' },
  viaje:     { color: '#22c55e', badge: 'Viaje',     gradient: 'linear-gradient(135deg, #15803d, #22c55e)', icon: '🚗' },
  service:   { color: '#06b6d4', badge: 'Servicio',  gradient: 'linear-gradient(135deg, #0891b2, #06b6d4)', icon: '🔧' },
};
const DEFAULT_ORDER_CFG = { color: '#3b82f6', badge: 'Solicitud', gradient: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', icon: '📦' };

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza', niera: '👶 Niñera', cocina: '🍳 Cocina',
  eventos: '🎉 Eventos', cuidado_mascotas: '🐾 Mascotas', cuidado_adultos: '👴 Adultos',
  aire_split: '❄️ Aire Split', electrico: '⚡ Eléctrico', plomeria: '🔧 Plomería',
  cerrajeria: '🔑 Cerrajería', gestor: '🗂️ Gestor', otros: '✨ Otros',
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
  // Terminal statuses — displayed in active tracking when order just finished
  cancelled:           { emoji: '🚫', text: 'Pedido cancelado por el cliente', color: '#9ca3af' },
  failed:              { emoji: '⚠️', text: 'Entrega fallida — el conductor no pudo entregar', color: '#f87171' },
  return_rejected:     { emoji: '📦', text: 'Devolución rechazada — pedido cerrado', color: '#f97316' },
  returned:            { emoji: '↩️', text: 'Paquete devuelto al remitente', color: '#a78bfa' },
  delivered:           { emoji: '✅', text: '¡Entregado! Tu paquete llegó', color: '#22c55e' },
  commission_charged:  { emoji: '✅', text: '¡Entregado y completado!', color: '#22c55e' },
  client_confirmed:    { emoji: '✅', text: 'Entrega confirmada', color: '#22c55e' },
};

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

/* ─── Offer card (inDrive style) ─────────────────────────────────────────── */
function OfferCard({
  offer, onAccept, onReject, busy, isTop, isDark,
}: {
  offer: UnifiedOffer;
  onAccept: () => void;
  onReject: () => void;
  busy: boolean;
  isTop?: boolean;
  isDark?: boolean;
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

  const eta = offer.distanceKm != null ? Math.max(1, Math.round(offer.distanceKm * 2.5)) : null;
  const isDriver = offer.requestType === 'delivery';
  const isPending  = offer.status === 'pending';
  const isAccepted = offer.status === 'accepted';

  // Badge "Tu tarifa" when price matches client suggested price (within 5%)
  const isSuggestedPrice = offer.suggestedPrice != null && Math.abs(offer.price - offer.suggestedPrice) / Math.max(offer.suggestedPrice, 1) < 0.05;

  return (
    <div className="offer-card-enter" style={{
      background: 'var(--sheet-bg)',
      borderRadius: 16,
      border: '1.5px solid rgba(245,197,24,0.20)',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
    }}>
      {/* BRAND accent top strip / Recommended banner */}
      {isTop && isPending && offer.matchScore != null ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '5px 16px', background: 'linear-gradient(90deg, rgba(245,197,24,0.16), rgba(245,130,7,0.10))', borderBottom: '1px solid rgba(245,197,24,0.28)' }}>
          <span style={{ fontSize: '0.71rem', fontWeight: 900, color: '#F5C518', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🏅 Mejor opción para ti</span>
        </div>
      ) : (
        <div style={{ height: 3, background: 'linear-gradient(90deg, #F5C518, #F58A07)' }} />
      )}
      <div style={{ padding: '14px 16px 12px' }}>

        {/* ── TOP ROW: price + ETA (big, like inDrive) ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            {/* Price */}
            <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#F5C518', letterSpacing: '-1px', lineHeight: 1 }}>
              ₲{Number(offer.price).toLocaleString()}
            </span>
            {/* ETA */}
            {eta != null && (
              <span style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1 }}>
                {eta} min
              </span>
            )}
          </div>
          {/* Timer ring (top right) */}
          {isPending && (() => {
            const r2 = 12, circ2 = 2 * Math.PI * r2;
            const timerColor = remaining > 20 ? '#22c55e' : remaining > 10 ? '#f59e0b' : '#ef4444';
            const timerDash = circ2 * (remaining / OFFER_TIMER);
            return (
              <svg width="28" height="28" viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
                <circle cx="14" cy="14" r={r2} fill="none" stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeWidth="2.5"/>
                <circle cx="14" cy="14" r={r2} fill="none" stroke={timerColor} strokeWidth="2.5"
                  strokeDasharray={`${timerDash} ${circ2}`} strokeLinecap="round"
                  transform="rotate(-90 14 14)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
                <text x="14" y="18.5" textAnchor="middle" fontSize="8" fontWeight="800" fill={timerColor}>{remaining}</text>
              </svg>
            );
          })()}
          {!isPending && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isAccepted ? '#22c55e' : '#f87171' }}>
              {isAccepted ? '✓ Aceptada' : '✕ Rechazada'}
            </span>
          )}
        </div>

        {/* ── DRIVER ROW: photo + name + rating + trips ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {offer.photo ? (
            <img src={offer.photo} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518', boxShadow: '0 0 0 3px rgba(245,197,24,0.25)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid #F5C518', boxShadow: '0 0 0 3px rgba(245,197,24,0.25)', flexShrink: 0 }}>
              {isDriver ? '🚗' : '🛠'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name */}
            <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {offer.name || (isDriver ? 'Conductor' : 'Técnico')}
            </div>
            {/* Rating + trips on same line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              {offer.rating != null && (
                <>
                  {'★★★★★'.split('').map((_, i) => (
                    <span key={i} style={{ color: i < Math.round(Number(offer.rating)) ? '#F5C518' : 'rgba(156,163,175,0.4)', fontSize: '0.75rem', lineHeight: 1 }}>★</span>
                  ))}
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: 1 }}>{Number(offer.rating).toFixed(1)}</span>
                </>
              )}
              {offer.totalJobs != null && offer.totalJobs > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.8 }}>
                  · {offer.totalJobs.toLocaleString()} {isDriver ? 'viajes' : 'servicios'}
                </span>
              )}
            </div>
            {/* Vehicle model */}
            {offer.vehicleModel && (
              <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {offer.vehicleModel}
              </div>
            )}
            {/* Match score with mini progress bar */}
            {offer.matchScore != null && isPending && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: offer.matchColor ?? '#9ca3af' }}>
                    ⚡ {offer.matchLabel}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {offer.matchScore}/100
                  </span>
                </div>
                <div style={{ height: 4, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${offer.matchScore}%`, background: `linear-gradient(90deg, ${offer.matchColor ?? '#6b7280'}, ${offer.matchColor ?? '#6b7280'}aa)`, borderRadius: 4 }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Fortaleza chips ── */}
        {isPending && (() => {
          const chips: React.ReactNode[] = [];
          if (offer.distanceKm != null && offer.distanceKm < 3)
            chips.push(<span key="dist" style={{ fontSize: '0.71rem', fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: isDark ? '#4ade80' : '#16a34a', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, padding: '2px 8px' }}>📍 {offer.distanceKm.toFixed(1)} km · Muy cercano</span>);
          else if (offer.distanceKm != null && offer.distanceKm < 8)
            chips.push(<span key="dist" style={{ fontSize: '0.71rem', fontWeight: 700, background: 'rgba(59,130,246,0.10)', color: isDark ? '#60a5fa' : '#2563eb', border: '1px solid rgba(59,130,246,0.22)', borderRadius: 6, padding: '2px 8px' }}>📍 {offer.distanceKm.toFixed(1)} km</span>);
          if (offer.rating != null && Number(offer.rating) >= 4.7)
            chips.push(<span key="rating" style={{ fontSize: '0.71rem', fontWeight: 700, background: 'rgba(245,197,24,0.12)', color: '#F5C518', border: '1px solid rgba(245,197,24,0.25)', borderRadius: 6, padding: '2px 8px' }}>⭐ Top rated</span>);
          if (offer.totalJobs != null && offer.totalJobs >= 50)
            chips.push(<span key="jobs" style={{ fontSize: '0.71rem', fontWeight: 700, background: 'rgba(139,92,246,0.12)', color: isDark ? '#a78bfa' : '#7c3aed', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 6, padding: '2px 8px' }}>🏆 {offer.totalJobs >= 200 ? 'Muy experimentado' : 'Experimentado'}</span>);
          if (isSuggestedPrice)
            chips.push(<span key="price" style={{ fontSize: '0.71rem', fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: isDark ? '#34d399' : '#059669', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 6, padding: '2px 8px' }}>👍 Tu tarifa exacta</span>);
          if (chips.length === 0) return null;
          return <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '8px 0 2px' }}>{chips}</div>;
        })()}

        {/* Note */}
        {offer.note && (
          <div style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '6px 10px', background: 'var(--glass-card)', borderRadius: 8, borderLeft: '2px solid rgba(245,197,24,0.4)' }}>
            &ldquo;{offer.note}&rdquo;
          </div>
        )}

        {/* ── BUTTONS ── */}
        {isPending ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={onReject}
              disabled={busy}
              style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.10)'}`, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer' }}
            >
              Rechazar
            </button>
            <button
              onClick={onAccept}
              disabled={busy}
              style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: busy ? '#15803d' : 'linear-gradient(90deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : '0 4px 14px rgba(34,197,94,0.35)' }}
            >
              Aceptar
            </button>
          </div>
        ) : (
          <button
            onClick={onReject}
            disabled={busy}
            style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#f87171', fontWeight: 700, fontSize: '0.85rem', cursor: busy ? 'default' : 'pointer', marginTop: 4 }}
          >
            ✕ Cancelar oferta
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function ClienteHomePage() {
  const { email, displayName, profilePhoto, avgRating, totalRatings, openDrawer } = useClientContext();
  const isDark = useDarkMode();

  const [orders,    setOrders]    = useState<Order[]>([]);
  const [jobs,      setJobs]      = useState<ActiveJob[]>([]);
  const [driverOffers, setDriverOffers] = useState<Record<string, DriverOffer[]>>({});
  const [jobOffers,    setJobOffers]    = useState<Record<string, TecnicoJobOffer[]>>({});
  const [acceptedDriverInfo, setAcceptedDriverInfo] = useState<Record<string, { name: string|null; photo: string|null; vehicle_label: string|null; vehicle_brand: string|null; vehicle_plate: string|null; driver_email: string|null }>>({});
  // Driver ETA: { orderId → { distKm, etaMin } }
  const [driverEta, setDriverEta] = useState<Record<string, { distKm: number; etaMin: number } | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; type: 'delivery' | 'service' } | null>(null);
  const [acceptConfirm, setAcceptConfirm] = useState<{ offerId: string; jobId?: string; workerName: string | null; amount: number; requestType: 'delivery' | 'service' } | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [elapsed2, setElapsed]    = useState(0); // seconds counter for searching
  const [noTaskerMsg, setNoTaskerMsg] = useState<string | null>(null);
  const locateRef = useRef<(() => void) | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoExpiredRef = useRef(new Set<string>());

  // Chat state
  const [chatOpen,       setChatOpen]       = useState(false);
  const [chatOrderId,    setChatOrderId]    = useState<string | undefined>(undefined);
  const [chatJobId,      setChatJobId]      = useState<string | undefined>(undefined);
  const [chatOtherName,  setChatOtherName]  = useState<string | null>(null);
  const [chatOtherPhoto, setChatOtherPhoto] = useState<string | null>(null);
  const [unreadChats,    setUnreadChats]    = useState<Record<string, number>>({});
  const [chatToast, setChatToast] = useState<{ id: string; isJob: boolean; from: string | null; text: string } | null>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generic action toast
  const [actionToast, setActionToast] = useState<string | null>(null);
  const actionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showActionToast = useCallback((msg: string, duration = 3500) => {
    if (actionToastTimerRef.current) clearTimeout(actionToastTimerRef.current);
    setActionToast(msg);
    actionToastTimerRef.current = setTimeout(() => setActionToast(null), duration);
  }, []);

  const openChat = useCallback((params: { orderId?: string; jobId?: string; otherName: string | null; otherPhoto: string | null }) => {
    const id = params.orderId || params.jobId || null;
    currentChatIdRef.current = id;
    if (id) setUnreadChats(prev => ({ ...prev, [id]: 0 }));
    setChatToast(prev => prev && prev.id === id ? null : prev);
    setChatOrderId(params.orderId);
    setChatJobId(params.jobId);
    setChatOtherName(params.otherName);
    setChatOtherPhoto(params.otherPhoto);
    setChatOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    currentChatIdRef.current = null;
    setChatOpen(false);
  }, []);

  // Auto-open chat when navigated via ?openChat=1 (e.g. from ChatBadge)
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!searchParams?.get('openChat') || chatOpen) return;
    const allItems = [
      ...orders.map(o => ({ id: o.id, isJob: false, otherName: (acceptedDriverInfo[o.id]?.name || acceptedDriverInfo[o.id]?.driver_email?.split('@')[0] || null), otherPhoto: (acceptedDriverInfo[o.id]?.photo ?? null), unread: unreadChats[o.id] ?? 0 })),
      ...jobs.map(j => ({ id: j.id, isJob: true, otherName: (j.tecnico_name ?? null), otherPhoto: (j.tecnico_photo ?? null), unread: unreadChats[j.id] ?? 0 })),
    ];
    if (allItems.length === 0) return;
    const target = allItems.sort((a, b) => b.unread - a.unread)[0];
    openChat(target.isJob
      ? { jobId: target.id, otherName: target.otherName, otherPhoto: target.otherPhoto }
      : { orderId: target.id, otherName: target.otherName, otherPhoto: target.otherPhoto }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, orders, jobs]);

  /* ─── Data loading ──────────────────────────────────────────────────────── */
  const loadAll = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, jobsRes] = await Promise.all([
        authFetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const jobsData   = await jobsRes.json();

      const ALL_ACTIVE_STS = ['pending', 'negotiating', 'accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'in_progress', 'returning', 'driver_returning', 'return_delivered'];
      const TRACKING_STS_LOAD = ['accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'in_progress', 'returning', 'driver_returning', 'return_delivered'];
      const activeOrders: Order[] = Array.isArray(ordersData)
        ? ordersData.filter((o: Order) => ALL_ACTIVE_STS.includes(o.status))
        : [];
      const activeJobs: ActiveJob[] = Array.isArray(jobsData) ? jobsData : [];

      setOrders(activeOrders);
      setJobs(activeJobs);
      // Show content immediately — offers + driver extras load in background
      setLoading(false);

      // Fetch ALL offers for ALL active orders (pending offers → offer cards; accepted offers → tracking driver info)
      if (activeOrders.length > 0) {
        const ids = activeOrders.map(o => o.id).join(',');
        const offersRes  = await authFetch(`/api/orders/offers?order_ids=${encodeURIComponent(ids)}`);
        const offersData = await offersRes.json();
        if (offersData && typeof offersData === 'object') {
          const pendingMap: Record<string, DriverOffer[]> = {};
          const driverInfoMap: Record<string, { name: string|null; photo: string|null; vehicle_label: string|null; vehicle_brand: string|null; vehicle_plate: string|null; driver_email: string|null }> = {};
          const profileFetches: Promise<void>[] = [];
          for (const order of activeOrders) {
            const allOffs: DriverOffer[] = offersData[order.id] ?? [];
            pendingMap[order.id] = allOffs.filter((o: DriverOffer) => o.status === 'pending');
            // For tracking orders, grab driver info from the accepted offer + profile
            if (TRACKING_STS_LOAD.includes(order.status)) {
              const accepted = allOffs.find((o: DriverOffer) => o.status === 'accepted');
              if (accepted) {
                driverInfoMap[order.id] = { name: accepted.driver_name, photo: accepted.driver_photo, vehicle_label: null, vehicle_brand: null, vehicle_plate: null, driver_email: accepted.driver_email };
                // Fetch driver profile for vehicle details
                profileFetches.push(
                  fetch(`/api/driver-profile?email=${encodeURIComponent(accepted.driver_email)}`)
                    .then(r => r.json())
                    .then(json => {
                      const p = json?.profile;
                      if (!p) return;
                      const VEHICLE_LABELS_MAP: Record<string,string> = { moto: '🏍️ Moto', auto: '🚗 Auto', moto_carro: '🛵 Moto Carro', camion: '🚛 Camión' };
                      const vmode = p.transport_mode || '';
                      let vbrand = '';
                      try { const vd = JSON.parse(p.vehicle_type || '{}'); vbrand = vd[vmode]?.marca || ''; } catch { vbrand = p.vehicle_type || ''; }
                      driverInfoMap[order.id] = { ...driverInfoMap[order.id], vehicle_label: VEHICLE_LABELS_MAP[vmode] || vmode, vehicle_brand: vbrand || null, vehicle_plate: p.license_plate || null };
                    })
                    .catch(() => {})
                );
              }
            }
          }
          await Promise.all(profileFetches);
          setDriverOffers(pendingMap);
          setAcceptedDriverInfo({ ...driverInfoMap });
        }
      } else {
        setDriverOffers({});
        setAcceptedDriverInfo({});
      }

      // Fetch tecnico job offers
      if (activeJobs.length > 0) {
        const allJobOffers: Record<string, TecnicoJobOffer[]> = {};
        await Promise.all(activeJobs.map(async job => {
          const r    = await authFetch(`/api/tecnico/jobs?job_offers=${job.id}`);
          const data = await r.json();
          allJobOffers[job.id] = Array.isArray(data) ? data : [];
        }));
        setJobOffers(allJobOffers);
      } else {
        setJobOffers({});
      }

    } catch { setLoading(false); }
  }, [email]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 120_000);

    // Re-load immediately when user returns to app (e.g. taps a push notification)
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', loadAll);

    const ch = email
      ? supabase.channel(`client-home-${email}`)
          .on('postgres_changes', { event: '*',      schema: 'public', table: 'orders',              filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: '*',      schema: 'public', table: 'tecnico_jobs',        filter: `client_email=eq.${email}` } as never, () => loadAll())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_offers',       filter: `client_email=eq.${email}` } as never, () => { loadAll(); window.dispatchEvent(new Event('tuki-offer-insert')); })
          // tecnico_job_offers now has client_email column (migration 027) — filter server-side
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tecnico_job_offers',  filter: `client_email=eq.${email}` } as never, () => { loadAll(); window.dispatchEvent(new Event('tuki-offer-insert')); })
          .subscribe()
      : null;
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadAll);
      if (ch) supabase.removeChannel(ch);
    };
  }, [loadAll]);

  // ── ETA polling: fetch driver location for active tracking orders every 45s ──
  useEffect(() => {
    const TRACKING_FOR_ETA = ['accepted', 'picking_up', 'at_pickup', 'in_transit'];

    const trackingOrders = orders.filter(o => TRACKING_FOR_ETA.includes(o.status));
    if (!trackingOrders.length) { setDriverEta({}); return; }

    let cancelled = false;
    const fetchEtas = async () => {
      const newEta: Record<string, { distKm: number; etaMin: number } | null> = {};
      await Promise.all(trackingOrders.map(async (o) => {
        try {
          const res = await authFetch(`/api/driver-location?order_id=${encodeURIComponent(o.id)}`);
          if (!res.ok) { newEta[o.id] = null; return; }
          const loc = await res.json();
          if (!loc?.lat || !loc?.lng) { newEta[o.id] = null; return; }
          const destLat = o.status === 'picking_up' || o.status === 'accepted'
            ? (o.pickup_lat ?? o.delivery_lat)
            : (o.delivery_lat ?? o.pickup_lat);
          const destLng = o.status === 'picking_up' || o.status === 'accepted'
            ? (o.pickup_lng ?? o.delivery_lng)
            : (o.delivery_lng ?? o.pickup_lng);
          if (destLat == null || destLng == null) { newEta[o.id] = null; return; }

          // Try real road route first
          try {
            const dirRes = await authFetch('/api/maps/directions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: { lat: Number(loc.lat), lng: Number(loc.lng) }, to: { lat: Number(destLat), lng: Number(destLng) } }),
            });
            if (dirRes.ok) {
              const dir = await dirRes.json();
              if (dir.distance_meters && dir.duration_seconds) {
                newEta[o.id] = {
                  distKm: Number(dir.distance_meters) / 1000,
                  etaMin: Math.max(1, Math.round(Number(dir.duration_seconds) / 60)),
                };
                return;
              }
            }
          } catch { /* fall through to haversine */ }

          // Haversine fallback
          const distKm = haversineKm(Number(loc.lat), Number(loc.lng), Number(destLat), Number(destLng));
          const etaMin = Math.max(1, Math.round(distKm * 2));
          newEta[o.id] = { distKm, etaMin };
        } catch { newEta[o.id] = null; }
      }));
      if (!cancelled) setDriverEta(newEta);
    };

    fetchEtas();
    const iv = setInterval(fetchEtas, 45_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [orders]);

  /* ─── Chat: carga contadores iniciales + suscripción Realtime ───────────── */
  useEffect(() => {
    if (!email) return;
    const TRACKING_ST = ['accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'in_progress',
      'en_camino', 'llegue', 'en_proceso', 'completion_pending', 'returning', 'driver_returning', 'return_delivered'];
    const tOrders = orders.filter(o => TRACKING_ST.includes(o.status));
    const tJobs   = jobs.filter(j => TRACKING_ST.includes(j.status));
    if (tOrders.length === 0 && tJobs.length === 0) return;

    // Carga inicial de mensajes no leídos para mostrar el badge
    const loadCounts = async () => {
      await Promise.all([
        ...tOrders.map(async o => {
          try {
            const r = await authFetch(`/api/chat?order_id=${o.id}&count=1`);
            if (r.ok) { const { unread } = await r.json(); if (unread > 0) setUnreadChats(prev => ({ ...prev, [o.id]: unread })); }
          } catch { /* ignorar */ }
        }),
        ...tJobs.map(async j => {
          try {
            const r = await authFetch(`/api/chat?job_id=${j.id}&count=1`);
            if (r.ok) { const { unread } = await r.json(); if (unread > 0) setUnreadChats(prev => ({ ...prev, [j.id]: unread })); }
          } catch { /* ignorar */ }
        }),
      ]);
    };
    loadCounts();

    // Suscripción Realtime: una por order/job activo
    const channels: ReturnType<typeof supabase.channel>[] = [];
    const allItems = [
      ...tOrders.map(o => ({ id: o.id, isJob: false })),
      ...tJobs.map(j => ({ id: j.id, isJob: true })),
    ];
    allItems.forEach(({ id, isJob }) => {
      const filter = isJob ? `job_id=eq.${id}` : `order_id=eq.${id}`;
      const ch = supabase
        .channel(`chat-badge-${id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'chat_messages', filter,
        } as never, (payload: { new: { sender_email: string; sender_name: string | null; content: string } }) => {
          const msg = payload.new;
          if (msg.sender_email === email) return;
          if (currentChatIdRef.current === id) return; // ya está abierto
          setUnreadChats(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
          playMessageAlert();
          // Toast de notificación
          if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
          setChatToast({ id, isJob, from: msg.sender_name, text: msg.content.slice(0, 70) });
          chatToastTimerRef.current = setTimeout(() => setChatToast(null), 6000);
        })
        .subscribe();
      channels.push(ch);
    });

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, jobs, email]);

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
    (driverOffers[o.id] ?? []).map((off: DriverOffer & { created_at?: string; match_score?: number | null; match_label?: string | null; match_color?: string | null }) => ({
      id: off.id, requestId: o.id, requestType: 'delivery' as const,
      name: off.driver_name, photo: off.driver_photo,
      rating: off.driver_avg_rating ?? null,
      price: Number(off.amount),
      suggestedPrice: o.suggested_price ?? null,
      note: off.note ?? null,
      distanceKm: off.distance_km ?? null,
      totalJobs: off.driver_total_ratings ?? null,
      vehicleModel: off.driver_vehicle_model ?? null,
      status: off.status, createdAt: off.created_at ?? new Date().toISOString(),
      matchScore: off.match_score ?? null,
      matchLabel: off.match_label ?? null,
      matchColor: off.match_color ?? null,
    }))
  );
  const allJobOffers: UnifiedOffer[] = jobs.flatMap(j =>
    (jobOffers[j.id] ?? []).map((off: TecnicoJobOffer & { created_at?: string }) => ({
      id: off.id, requestId: j.id, requestType: 'service' as const,
      name: off.tecnico_name, photo: off.tecnico_photo, rating: off.tecnico_rating,
      price: Number(off.proposed_price),
      suggestedPrice: null,
      note: off.note, distanceKm: off.distance_km, totalJobs: off.total_services,
      vehicleModel: null,
      status: off.status, createdAt: off.created_at ?? new Date().toISOString(),
      matchScore: null, matchLabel: null, matchColor: null,
    }))
  );

  // Pagination for offers
  const [offersPage, setOffersPage] = useState(1);
  const OFFERS_PER_PAGE = 10;
  // Sort pending offers by match_score desc (best driver first); accepted/rejected last
  const allOffers = [...allDriverOffers, ...allJobOffers].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    if (a.status === 'pending' && b.status === 'pending') {
      const sa = a.matchScore ?? 50;
      const sb = b.matchScore ?? 50;
      return sb - sa; // highest score first
    }
    return a.price - b.price;
  });
  const paginatedOffers = allOffers.slice(0, offersPage * OFFERS_PER_PAGE);

  const TRACKING_STS = ['accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'in_progress', 'en_camino', 'llegue', 'en_proceso', 'completion_pending', 'returning', 'driver_returning', 'return_delivered'];
  const SEARCHING_STS = ['pending', 'negotiating'];
  const trackingOrders = orders.filter(o => TRACKING_STS.includes(o.status));
  const trackingJobs   = jobs.filter(j => TRACKING_STS.includes(j.status));

  const activeRequests: ActiveRequest[] = [
    ...orders.filter(o => SEARCHING_STS.includes(o.status)).map(o => {
      const ot = o.order_type ?? 'envio';
      const vt = o.vehicle_type ?? 'moto';
      const line1 = SERVICE_TYPE_SHORT[ot] ?? 'Envío';
      const line2 = VEHICLE_SHORT[vt] ?? vt;
      const label = `${line1} ${line2}`;
      return {
        id: o.id, type: 'delivery' as const,
        icon: (ORDER_CFG[ot] ?? DEFAULT_ORDER_CFG).icon,
        label, line1, line2,
        orderType: ot,
        subtitle: [o.pickup_address, o.delivery_address].filter(Boolean).join(' → ') || 'Sin dirección',
        createdAt: o.created_at,
      };
    }),
    ...jobs.filter(j => SEARCHING_STS.includes(j.status)).map(j => {
      const svcLabel = SERVICE_LABELS[j.service_type] ?? j.service_type;
      const line2 = svcLabel.replace(/^.{1,2}\s/, '');
      return {
        id: j.id, type: 'service' as const, icon: '🔧',
        label: svcLabel, line1: 'Técnico', line2,
        orderType: 'service',
        subtitle: j.address ?? 'Sin dirección',
        createdAt: j.created_at ?? new Date().toISOString(),
      };
    }),
  ];

  const mode: 'idle' | 'searching' | 'offers' | 'tracking' =
    trackingOrders.length > 0 || trackingJobs.length > 0 ? 'tracking'
    : allOffers.length > 0                               ? 'offers'
    : activeRequests.length > 0                          ? 'searching'
    : 'idle';

  /* homeMode: el panel principal ignora el estado tracking completamente —
     muestra searching/offers si los hay, sino idle (mapa + tarjetas de servicios) */
  const homeMode: 'idle' | 'searching' | 'offers' =
    allOffers.length > 0      ? 'offers'
    : activeRequests.length > 0 ? 'searching'
    : 'idle';

  const busy = !!actionId;

  /* ─── Open sheet for searching and offers (homeMode ignores tracking) ──── */
  useEffect(() => {
    if (homeMode === 'searching' || homeMode === 'offers') setSheetOpen(true);
    if (homeMode === 'idle') setSheetOpen(false);
  }, [homeMode]);

  /* ─── Actions ───────────────────────────────────────────────────────────── */
  const acceptDriverOffer = async (offerId: string) => {
    if (busy) return;
    setActionId(offerId);
    try { navigator.vibrate?.(50); } catch {}
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'accept' }),
      });
      if (res.ok) {
        showActionToast('✅ ¡Conductor aceptado! En camino...');
        // Optimistic: instantly clear pending offers + mark order as accepted
        setDriverOffers(prev => {
          const next: typeof prev = {};
          for (const ordId of Object.keys(prev)) {
            next[ordId] = prev[ordId].filter((o: DriverOffer) => o.id !== offerId);
          }
          return next;
        });
        setOrders(prev => prev.map(o => {
          const had = (driverOffers[o.id] ?? []).some((of: DriverOffer) => of.id === offerId);
          return had ? { ...o, status: 'accepted' } : o;
        }));
        loadAll(); // background sync
      }
    } finally { setActionId(null); }
  };

  const rejectDriverOffer = async (offerId: string) => {
    if (busy) return;
    setActionId(offerId);
    try { navigator.vibrate?.(30); } catch {}
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId, action: 'reject' }),
      });
      if (res.ok) {
        // Optimistic: instantly remove the rejected offer card
        setDriverOffers(prev => {
          const next: typeof prev = {};
          for (const ordId of Object.keys(prev)) {
            next[ordId] = prev[ordId].filter((o: DriverOffer) => o.id !== offerId);
          }
          return next;
        });
        loadAll();
      }
    } finally { setActionId(null); }
  };

  const acceptJobOffer = async (jobId: string, offerId: string) => {
    if (busy || !email) return;
    setActionId(offerId);
    try { navigator.vibrate?.(50); } catch {}
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_offer', jobId, offerId, clientEmail: email }),
      });
      if (res.ok) {
        showActionToast('✅ ¡Técnico aceptado! En camino...');
        // Optimistic: clear offers for this job + mark it assigned
        setJobOffers(prev => ({ ...prev, [jobId]: (prev[jobId] ?? []).filter((o: TecnicoJobOffer) => o.id !== offerId) }));
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'assigned' } : j));
        loadAll();
      }
    } finally { setActionId(null); }
  };

  const rejectJobOffer = async (offerId: string) => {
    if (busy) return;
    setActionId(offerId);
    try { navigator.vibrate?.(30); } catch {}
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_offer', offerId }),
      });
      if (res.ok) {
        // Optimistic: remove the rejected offer card
        setJobOffers(prev => {
          const next: typeof prev = {};
          for (const jId of Object.keys(prev)) {
            next[jId] = prev[jId].filter((o: TecnicoJobOffer) => o.id !== offerId);
          }
          return next;
        });
        loadAll();
      }
    } finally { setActionId(null); }
  };

  const cancelOrder = async (orderId: string) => {
    if (busy || !email) return;
    setActionId('cancel_' + orderId);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'cancelled' }),
      });
      if (res.ok) {
        // Optimistic: instantly remove from list
        setOrders(prev => prev.filter(o => o.id !== orderId));
        loadAll();
      }
    } finally { setActionId(null); }
  };

  const cancelJob = async (jobId: string) => {
    if (busy || !email) return;
    setActionId('cancel_' + jobId);
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId, clientEmail: email }),
      });
      if (res.ok) {
        // Optimistic: instantly remove from list
        setJobs(prev => prev.filter(j => j.id !== jobId));
        loadAll();
      }
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
  const acceptedBadge =
    orders.filter(o => ['accepted', 'picking_up', 'at_pickup', 'in_transit', 'returning', 'driver_returning', 'return_delivered'].includes(o.status)).length +
    jobs.filter(j => ['accepted', 'in_progress'].includes(j.status)).length;

  return (
    <div className="client-map-shell">
      {/* Map base */}
      <div className="client-map-base">
        <ClientMap showMyLocationButton={false} locateRef={locateRef} dark={isDark} />
      </div>

      {/* Top gradient */}
      <div className="client-map-top-gradient" />

      {/* ── No tasker toast ────────────────────────────────────────────── */}
      {noTaskerMsg && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: 'var(--surface-2)', border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: 16, padding: '14px 20px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          maxWidth: 320, width: 'calc(100% - 32px)', textAlign: 'center',
          animation: 'fadeInDown 0.3s ease',
        }}>
          <style>{`@keyframes fadeInDown { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
          <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>😔</div>
          <div style={{ fontWeight: 800, color: '#f87171', fontSize: '0.95rem', marginBottom: 4 }}>No hay tasker disponible</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Ningún tasker respondió. Podés intentarlo de nuevo.</div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, padding: '16px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Photo + rating below */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            {profilePhoto ? (
              <img src={profilePhoto} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518' }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid rgba(245,197,24,0.5)' }}>
                {displayName?.[0]?.toUpperCase() || '👤'}
              </div>
            )}
            {avgRating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(245,197,24,0.18)', borderRadius: 6, padding: '1px 6px' }}>
                <span style={{ color: '#F5C518', fontSize: '0.65rem' }}>★</span>
                <span style={{ color: '#F5C518', fontSize: '0.65rem', fontWeight: 800 }}>{avgRating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{getGreeting()}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName || 'Cliente'}</div>
          </div>
          <button onClick={openDrawer} style={{ background: 'var(--ghost-btn)', border: '1px solid var(--border-subtle)', borderRadius: 12, width: 42, height: 42, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {[0,1,2].map(i => <span key={i} style={{ display: 'block', width: 16, height: 2, background: 'var(--text-primary)', borderRadius: 2 }} />)}
          </button>
        </div>
      </div>

      {/* ── Locate button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => { locateRef.current?.(); }}
        style={{ position: 'absolute', right: 16, bottom: homeMode === 'idle' ? 130 : 16, zIndex: 4, width: 46, height: 46, borderRadius: '50%', background: 'var(--nav-bg)', border: '2px solid rgba(245,197,24,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', transition: 'bottom 0.4s ease' }}
      >📍</button>

      {/* ── BOTTOM SHEET ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 65, left: 0, right: 0, zIndex: 10,
        transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* ── IDLE — hidden, only floating button shows ─────────────────── */}

        {/* ── SEARCHING ────────────────────────────────────────────────────── */}
        {homeMode === 'searching' && (
          <div style={{ background: 'var(--sheet-bg)', borderRadius: '24px 24px 0 0', border: '1px solid rgba(245,197,24,0.2)', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)' }}>
            {/* Handle */}
            <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, background: 'var(--handle-bar)', borderRadius: 2 }} />
            </div>

            {/* Searching content */}
            <div style={{ padding: '16px 20px 28px' }}>
              {/* Header radar row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <RadarPulse />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '1.08rem', marginBottom: 3, letterSpacing: '-0.01em' }}>
                    Buscando conductores…
                  </div>
                  <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Te avisamos cuando lleguen ofertas
                  </div>
                </div>
              </div>

              {/* ── Solicitudes activas ── */}
              {activeRequests.map(req => {
                const secEl = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 1000);
                void elapsed2;
                const cd  = Math.max(0, REQUEST_TIMEOUT_SEC - secEl);
                const pct = cd / REQUEST_TIMEOUT_SEC;
                const cfg = ORDER_CFG[req.orderType] ?? DEFAULT_ORDER_CFG;
                const urgent = cd < 30;
                const mins = Math.floor(cd / 60).toString().padStart(2, '0');
                const secs = (cd % 60).toString().padStart(2, '0');
                const BRAND = '#F5C518';
                const barCol = BRAND;
                /* service label: use line1 (e.g. "Remis") with cfg.badge as fallback */
                const svcLabel  = req.line1 || cfg.badge;
                /* vehicle label: use line2 (e.g. "Moto") */
                const vehLabel  = req.line2 || '';
                return (
                  <div key={req.id} style={{
                    position: 'relative',
                    borderRadius: 22,
                    marginBottom: 14,
                    overflow: 'hidden',
                    background: isDark
                      ? 'linear-gradient(145deg, rgba(22,24,38,0.98) 0%, rgba(15,17,28,0.98) 100%)'
                      : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                    boxShadow: isDark
                      ? '0 12px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(245,197,24,0.22), inset 0 1px 0 rgba(255,255,255,0.06)'
                      : '0 6px 28px rgba(0,0,0,0.10), 0 0 0 1.5px rgba(245,197,24,0.45)',
                  }}>
                    {/* ── Barra superior degradada ── */}
                    <div style={{ height: 4, background: cfg.gradient, width: '100%' }} />

                    {/* ── Barra izquierda de acento ── */}
                    <div style={{
                      position: 'absolute', left: 0, top: 4, bottom: 0,
                      width: 4, background: cfg.gradient,
                    }} />

                    <div style={{ padding: '16px 16px 16px 20px' }}>

                      {/* ── Fila superior: badge + info + countdown ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>

                        {/* Badge cuadrado con texto 2 líneas */}
                        <div style={{
                          width: 72, height: 72, borderRadius: 18,
                          background: cfg.gradient,
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, gap: 4,
                          boxShadow: `0 6px 20px ${cfg.color}55`,
                        }}>
                          {/* Línea 1 — tipo de servicio */}
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 900,
                            color: 'rgba(255,255,255,0.88)',
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            lineHeight: 1,
                          }}>
                            {svcLabel}
                          </span>
                          {/* Separador */}
                          <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.30)', borderRadius: 1 }} />
                          {/* Línea 2 — vehículo */}
                          <span style={{
                            fontSize: vehLabel.length > 4 ? '0.72rem' : '0.92rem',
                            fontWeight: 900, color: '#ffffff',
                            lineHeight: 1, letterSpacing: '0.02em',
                          }}>
                            {vehLabel}
                          </span>
                        </div>

                        {/* Info central */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Chips: servicio + vehículo */}
                          <div style={{ display: 'flex', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 800,
                              color: cfg.color,
                              background: isDark ? `${cfg.color}18` : `${cfg.color}14`,
                              border: `1px solid ${cfg.color}40`,
                              borderRadius: 8, padding: '3px 9px',
                              letterSpacing: '0.01em',
                            }}>{svcLabel}</span>
                            {vehLabel ? (
                              <span style={{
                                fontSize: '0.7rem', fontWeight: 700,
                                color: isDark ? '#cbd5e1' : '#475569',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                                borderRadius: 8, padding: '3px 9px',
                              }}>{vehLabel}</span>
                            ) : null}
                          </div>
                          {/* Ruta */}
                          <div style={{
                            fontSize: '0.73rem',
                            color: isDark ? '#94a3b8' : '#64748b',
                            fontWeight: 500, lineHeight: 1.35,
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>
                            {'→ '}{req.subtitle}
                          </div>
                        </div>

                        {/* Countdown */}
                        <div style={{
                          flexShrink: 0, textAlign: 'center',
                          background: urgent
                            ? (isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.09)')
                            : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                          border: urgent
                            ? '1.5px solid rgba(239,68,68,0.45)'
                            : `1.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`,
                          borderRadius: 14, padding: '8px 10px', minWidth: 62,
                        }}>
                          <div style={{
                            fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.04em',
                            textTransform: 'uppercase', marginBottom: 4,
                            color: urgent ? '#ef4444' : (isDark ? '#64748b' : '#94a3b8'),
                          }}>Expira en</div>
                          <div style={{
                            fontSize: '1.1rem', fontWeight: 900, lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                            color: urgent ? '#ef4444' : (isDark ? '#f1f5f9' : '#0f172a'),
                          }}>{mins}:{secs}</div>
                        </div>
                      </div>

                      {/* ── Barra de progreso ── */}
                      <div style={{
                        height: 5, borderRadius: 5, marginBottom: 14,
                        background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${pct * 100}%`,
                          background: urgent ? '#ef4444' : '#F5C518',
                          borderRadius: 5,
                          transition: 'width 1s linear, background 0.5s',
                          boxShadow: urgent ? '0 0 10px #ef444460' : '0 0 10px #F5C51870',
                        }} />
                      </div>

                      {/* ── Botón cancelar ── */}
                      <button
                        onClick={() => setCancelConfirm({ id: req.id, type: req.type })}
                        disabled={busy}
                        style={{
                          width: '100%', padding: '13px', borderRadius: 14,
                          border: `1.5px solid ${isDark ? 'rgba(239,68,68,0.22)' : 'rgba(239,68,68,0.28)'}`,
                          background: isDark ? 'rgba(239,68,68,0.07)' : 'rgba(239,68,68,0.05)',
                          color: '#f87171', fontWeight: 700, fontSize: '0.88rem',
                          cursor: busy ? 'default' : 'pointer',
                          letterSpacing: '0.02em', opacity: busy ? 0.6 : 1,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        ✕  Cancelar solicitud
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── OFFERS ─────────────────────────────────────────────────────── */}
        {homeMode === 'offers' && (
          <div style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Count header */}
            <div style={{ padding: '6px 14px 2px', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                {allOffers.length} oferta{allOffers.length !== 1 ? 's' : ''} recibida{allOffers.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Scrollable offer cards */}
            <div style={{ overflowY: 'auto', padding: '4px 10px 24px', display: 'flex', flexDirection: 'column', gap: 8, WebkitOverflowScrolling: 'touch' as never, overscrollBehavior: 'contain' }}>

              {paginatedOffers.map((offer, idx) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  busy={busy}
                  isTop={idx === 0 && offer.status === 'pending' && offer.matchScore != null && paginatedOffers.filter(o => o.status === 'pending').length > 1}
                  onAccept={() => setAcceptConfirm({
                    offerId: offer.id,
                    jobId: offer.requestType === 'service' ? offer.requestId : undefined,
                    workerName: offer.name,
                    amount: offer.price,
                    requestType: offer.requestType,
                  })}
                  onReject={() => offer.requestType === 'delivery'
                    ? rejectDriverOffer(offer.id)
                    : rejectJobOffer(offer.id)
                  }
                  isDark={isDark}
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
                    onClick={() => setCancelConfirm({ id: req.id, type: req.type })}
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

      {/* ── IDLE — service selector ───────────────────────────────────────── */}
      {homeMode === 'idle' && loading && (
        <div style={{ padding: '20px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="tuki-skeleton" style={{ height: 110, borderRadius: 16 }} />
          ))}
        </div>
      )}

      {homeMode === 'idle' && !loading && (
        <div className="client-idle-overlay">
          {/* Hero illustration */}
          <div className="client-idle-hero">
            <div className="client-idle-hero-core">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div className="client-idle-hero-glow" />
          </div>

          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <div className="client-idle-title">¿Qué necesitás hoy?</div>
            <div className="client-idle-subtitle">Elegí un servicio para empezar</div>
          </div>

          {/* Direct service cards — no modal needed */}
          <div className="client-idle-cards">
            {/* Envíos card */}
            <Link href="/cliente/enviar" className="client-idle-card envios">
              <div className="client-idle-card-icon envios">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1C1C2E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="2"/>
                  <path d="M16 8h4l3 5v3h-7V8z"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div className="client-idle-card-title">Remis / Envíos / Fletes</div>
                <div className="client-idle-card-sub">Todo en un solo lugar</div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="client-idle-card-arrow">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>

            {/* Tasker card */}
            <Link href="/cliente/servicio" className="client-idle-card tasker">
              <div className="client-idle-card-icon tasker">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div className="client-idle-card-title">Contratar un Tasker</div>
                <div className="client-idle-card-sub">Servicios en tu hogar</div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="client-idle-card-arrow">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>
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
              width: '100%', background: 'var(--modal-bg)',
              borderRadius: '24px 24px 0 0',
              border: '1px solid rgba(245,197,24,0.2)',
              padding: '20px 20px max(20px, env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 2, margin: '0 auto 16px' }} />
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>¿Qué necesitás?</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Link
                href="/cliente/enviar"
                onClick={() => setShowPublishModal(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px', borderRadius: 18, background: 'rgba(245,197,24,0.1)', border: '1.5px solid rgba(245,197,24,0.3)', textDecoration: 'none' }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0 }}>📦</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>Remis/Envíos/Fletes</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>Todo en un solo lugar</div>
                </div>
              </Link>
              <Link
                href="/cliente/servicio"
                onClick={() => setShowPublishModal(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px', borderRadius: 18, background: 'rgba(99,102,241,0.1)', border: '1.5px solid rgba(99,102,241,0.3)', textDecoration: 'none' }}
              >
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0 }}>🛠️</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>Contratar un Tasker</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>Servicios en tu hogar</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAVBAR ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(245,197,24,0.15)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 4, justifyContent: 'space-around',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
        }}>
        {([
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>),
            label: 'Home', path: '/cliente', active: true, onClick: undefined as (() => void) | undefined, badge: undefined as number | undefined,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h6m-6 4h6m-6 4h6M7 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1m-2-2h-4a2 2 0 0 0-2 2v0" /></svg>),
            label: 'Mis ofertas', path: '/cliente/mis-ofertas', active: false, onClick: undefined as (() => void) | undefined, badge: acceptedBadge > 0 ? acceptedBadge : undefined,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>),
            label: 'Solicitar', path: '', active: false, onClick: () => setShowPublishModal(true), badge: undefined as number | undefined,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>),
            label: 'Historial', path: '/cliente/historial', active: false, onClick: undefined as (() => void) | undefined, badge: undefined as number | undefined,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
            label: 'Cuenta', path: '/cliente/settings', active: false, onClick: undefined as (() => void) | undefined, badge: undefined as number | undefined,
          },
        ] as { icon: React.ReactNode; label: string; path: string; active: boolean; onClick: (() => void) | undefined; badge: number | undefined }[])
        .map(item => (
            item.onClick ? (
              <button key={item.label} onClick={item.onClick}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', background: 'transparent', border: 'none', borderRadius: 12, cursor: 'pointer', color: 'var(--nav-icon-inactive)', position: 'relative' }}>
                {item.icon}
                <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>{item.label}</span>
              </button>
            ) : (
              <Link key={item.label} href={item.path}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, background: item.active ? 'rgba(245,197,24,0.12)' : 'transparent', color: item.active ? '#F5C518' : 'var(--nav-icon-inactive)', position: 'relative' }}>
                {item.icon}
                <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>{item.label}</span>
                {item.active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#F5C518', marginTop: 1 }} />}
                {item.badge && (
                  <span style={{ position: 'absolute', top: 4, right: 'calc(50% - 20px)', minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                    {item.badge}
                  </span>
                )}
              </Link>
            )
        ))}
      </div>

      {/* ── Loading overlay ──────────────────────────────────────────────── */}
      {loading && (
        <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'var(--nav-bg)', borderRadius: 40, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(245,197,24,0.3)', borderTopColor: '#F5C518', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600 }}>Cargando…</span>
        </div>
      )}

      {/* ── Cancel confirm modal ───────────────────────────────────────── */}
      {cancelConfirm && (
        <>
          <div onClick={() => setCancelConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10001 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--modal-bg)', borderRadius: '20px 20px 0 0', padding: '24px 18px 40px', zIndex: 10002, boxShadow: '0 -4px 24px rgba(0,0,0,0.6)', border: '1px solid var(--modal-border)' }}>
            <p style={{ margin: '0 0 20px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.4 }}>
              ¿Cancelar esta solicitud? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { cancelConfirm.type === 'delivery' ? cancelOrder(cancelConfirm.id) : cancelJob(cancelConfirm.id); setCancelConfirm(null); }}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Sí, cancelar
              </button>
              <button
                onClick={() => setCancelConfirm(null)}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1.5px solid var(--border-strong)', background: 'var(--ghost-btn)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
              >
                Volver
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Accept confirm modal ───────────────────────────────────────── */}
      {acceptConfirm && (
        <>
          <div onClick={() => setAcceptConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 10003 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--modal-bg)', borderRadius: '20px 20px 0 0', padding: '24px 18px max(40px, env(safe-area-inset-bottom))', zIndex: 10004, boxShadow: '0 -4px 24px rgba(0,0,0,0.6)', border: '1px solid rgba(245,197,24,0.25)' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: 6 }}>
                ¿Confirmar aceptación?
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {acceptConfirm.workerName && <><strong style={{ color: 'var(--text-primary)' }}>{acceptConfirm.workerName}</strong> · </>}
                <strong style={{ color: '#F5C518' }}>₲{Number(acceptConfirm.amount).toLocaleString()}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Esta acción asignará al {acceptConfirm.requestType === 'delivery' ? 'conductor' : 'técnico'} a tu solicitud.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={busy}
                onClick={() => {
                  const { offerId, jobId, requestType } = acceptConfirm;
                  setAcceptConfirm(null);
                  if (requestType === 'delivery') {
                    acceptDriverOffer(offerId);
                  } else if (jobId) {
                    acceptJobOffer(jobId, offerId);
                  }
                }}
                style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#F5C518', color: '#000', fontWeight: 800, fontSize: '1rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                ✓ Confirmar
              </button>
              <button
                onClick={() => setAcceptConfirm(null)}
                style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1.5px solid var(--border-strong)', background: 'var(--ghost-btn)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Chat Modal ───────────────────────────────────────────────────── */}
      <ChatModal
        open={chatOpen}
        onClose={closeChat}
        orderId={chatOrderId}
        jobId={chatJobId}
        myEmail={email ?? ''}
        myName={displayName}
        otherName={chatOtherName}
        otherPhoto={chatOtherPhoto}
      />

      {/* ── Toast: nuevo mensaje recibido ────────────────────────────────── */}
      {chatToast && (
        <div
          onClick={() => {
            setChatToast(null);
            openChat({
              orderId:    chatToast.isJob ? undefined : chatToast.id,
              jobId:      chatToast.isJob ? chatToast.id : undefined,
              otherName:  chatToast.from,
              otherPhoto: null,
            });
          }}
          style={{
            position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, width: 'calc(100% - 28px)', maxWidth: 400,
            background: '#0f2920', border: '1.5px solid rgba(34,197,94,0.55)',
            borderRadius: 18, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.75)',
            cursor: 'pointer',
            animation: 'fadeInDown 0.3s ease',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '0.72rem', marginBottom: 2 }}>
              NUEVO MENSAJE · {chatToast.isJob ? 'TÉCNICO' : 'CONDUCTOR'}
            </div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chatToast.from ? `${chatToast.from}: ` : ''}{chatToast.text}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current); setChatToast(null); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 28, height: 28, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
        </div>
      )}

      {/* ── Toast: acción exitosa (aceptar/rechazar oferta) ──────────────── */}
      {actionToast && (
        <div
          style={{
            position: 'fixed', bottom: 'calc(var(--tuki-nav-h, 64px) + 16px)', left: '50%',
            transform: 'translateX(-50%)', zIndex: 10010,
            background: 'rgba(22,163,74,0.95)', backdropFilter: 'blur(12px)',
            borderRadius: 40, padding: '11px 22px',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>{actionToast}</span>
        </div>
      )}
    </div>
  );
}
