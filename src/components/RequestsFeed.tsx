'use client';
import { useState, useEffect, useRef, memo } from 'react';
import { haversineKm } from '@/lib/geo';
import { playKaChing } from '@/lib/audio';
import { Icon } from '@/components/Icon';

const CARD_TIMER = 100;
// ── Brand token — single source of truth for this component
const BRAND        = '#F5C518';
const BRAND_SHADOW = 'rgba(245,197,24,0.35)';

function getRemaining(createdAt: string): number {
  return Math.max(0, CARD_TIMER - Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
}

// Self-contained countdown ring — only this re-renders every second
function CountdownRing({ createdAt }: { createdAt: string }) {
  const [seconds, setSeconds] = useState(() => getRemaining(createdAt));
  useEffect(() => {
    const iv = setInterval(() => setSeconds(getRemaining(createdAt)), 1000);
    return () => clearInterval(iv);
  }, [createdAt]);
  const r = 16, circ = 2 * Math.PI * r;
  const dash = circ * (seconds / CARD_TIMER);
  const urgent = seconds <= 15;
  const c = seconds > 20 ? '#22c55e' : seconds > 10 ? '#f59e0b' : '#ef4444';
  return (
    <svg
      width="40" height="40" viewBox="0 0 40 40"
      style={{ flexShrink: 0, filter: urgent ? `drop-shadow(0 0 5px ${c}88)` : 'none', transition: 'filter 0.5s' }}
    >
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3.5"/>
      <circle cx="20" cy="20" r={r} fill="none" stroke={c} strokeWidth="3.5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 20 20)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
      <text x="20" y="25" textAnchor="middle" fontSize="11" fontWeight="900" fill={c}>{seconds}</text>
    </svg>
  );
}

const VEHICLE_LABELS: Record<string, string> = {
  moto: 'Moto Envíos',
  auto: 'Auto Envíos',
  motocarro: 'Moto Carro Fletes',
  camion2t: 'Camión Fletes',
};

const SERVICE_LABELS: Record<string, string> = {
  limpieza: 'Limpieza',
  niera: 'Niñera',
  cocina: 'Cocina',
  eventos: 'Eventos',
  cuidado_mascotas: 'Mascotas',
  cuidado_adultos: 'Adultos',
  gestor: 'Gestor',
  aire_split: 'Tec Aire Split',
  electrico: 'Serv. Eléctrico',
  plomeria: 'Serv. Plomería',
  cerrajeria: 'Cerrajería',
  otros: 'Otros',
};

export type FeedItem = {
  id: string;
  title: string;
  orderType?: 'envio' | 'mandadito' | 'flete' | null;
  from?: string;
  to?: string;
  location?: string;
  price?: number | null;
  createdAt: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  clientPhoto?: string | null;
  clientName?: string | null;
  clientRating?: number | null;
  clientVerified?: boolean;
  instructions?: string | null;
  dateScheduled?: string | null;
  photos?: string[] | null;
  shoppingList?: string | null;
  maxBudget?: number | null;
  stops?: Array<{ sequence: number; address: string }> | null;
};

type Props = {
  items: FeedItem[];
  available: boolean;
  dismissed: Set<string>;
  onAccept: (id: string, amount: number, note: string, distanceKm: number | null) => void;
  onDismiss: (id: string) => void;
  sendingId: string | null;
  mode?: 'driver' | 'tecnico';
  driverLat?: number | null;
  driverLng?: number | null;
  /** Called whenever the active card changes — parent updates map route */
  onActiveItem?: (item: FeedItem | null) => void;
};

export default memo(function RequestsFeed({
  items,
  available,
  dismissed,
  onAccept,
  onDismiss,
  sendingId,
  mode = 'driver',
  driverLat,
  driverLng,
  onActiveItem,
}: Props) {
  const [offerNote, setOfferNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [customPrice, setCustomPrice] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);

  // Auto-dismiss expired cards — checked every 5s
  const itemsRef     = useRef(items);
  const dismissedRef = useRef(dismissed);
  itemsRef.current     = items;
  dismissedRef.current = dismissed;

  // ── Sound ───────────────────────────────────────────────────────────────────
  const soundIvRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIdsRef   = useRef<Set<string>>(new Set());
  const sendingIdRef = useRef(sendingId);
  sendingIdRef.current = sendingId;

  useEffect(() => {
    const iv = setInterval(() => {
      itemsRef.current.forEach(item => {
        if (!dismissedRef.current.has(item.id) && getRemaining(item.createdAt) === 0) {
          onDismiss(item.id);
        }
      });
    }, 5000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop alert loop immediately when an offer/accept action is in-flight
  useEffect(() => {
    if (sendingId && soundIvRef.current) {
      clearInterval(soundIvRef.current);
      soundIvRef.current = null;
    }
  }, [sendingId]);

  useEffect(() => {
    const visibleLive = items.filter(i => !dismissed.has(i.id));
    const hasNew = visibleLive.some(i => !prevIdsRef.current.has(i.id));
    prevIdsRef.current = new Set(items.map(i => i.id));
    if (hasNew && visibleLive.length > 0 && !sendingIdRef.current) {
      playKaChing();
      if (soundIvRef.current) clearInterval(soundIvRef.current);
      // Repeat every 4500 ms — matches the new ~4.2 s ka-ching sound duration
      soundIvRef.current = setInterval(() => {
        if (sendingIdRef.current) { clearInterval(soundIvRef.current!); soundIvRef.current = null; return; }
        const alive = itemsRef.current.filter(i => !dismissedRef.current.has(i.id) && getRemaining(i.createdAt) > 0);
        if (alive.length > 0) playKaChing();
        else { clearInterval(soundIvRef.current!); soundIvRef.current = null; }
      }, 4500);
    }
    if (visibleLive.length === 0 && soundIvRef.current) {
      clearInterval(soundIvRef.current); soundIvRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dismissed]);

  useEffect(() => () => {
    if (soundIvRef.current) clearInterval(soundIvRef.current);
  }, []);

  const visible = items.filter(i => !dismissed.has(i.id));

  // Clamp idx to valid range when list changes
  const safeIdx = Math.min(cardIdx, Math.max(0, visible.length - 1));

  // Notify parent when current item changes (for map route)
  const activeItem = visible[safeIdx] ?? null;
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeItem?.id !== activeIdRef.current) {
      activeIdRef.current = activeItem?.id ?? null;
      onActiveItem?.(activeItem);
    }
  }, [activeItem, onActiveItem]);

  // Reset per-card form state when card changes
  useEffect(() => {
    setOfferNote('');
    setNoteOpen(false);
    setCustomPrice('');
    setCustomOpen(false);
    setStopsOpen(false);
  }, [safeIdx, activeItem?.id]);

  if (!available || visible.length === 0) {
    if (activeIdRef.current !== null) { activeIdRef.current = null; onActiveItem?.(null); }
    return null;
  }

  const labels = mode === 'driver' ? VEHICLE_LABELS : SERVICE_LABELS;
  const item = visible[safeIdx];
  const total = visible.length;

  const isSending = !!sendingId;
  const offerSentForThis = sendingId === item.id;

  const clientPrice = Number(item.price || 0);
  const qo_15 = Math.round(clientPrice * 1.15 / 1000) * 1000;
  const qo_30 = Math.round(clientPrice * 1.30 / 1000) * 1000;
  const qo_50 = Math.round(clientPrice * 1.50 / 1000) * 1000;
  const distKm = (driverLat != null && driverLng != null && item.pickupLat != null && item.pickupLng != null)
    ? haversineKm(driverLat, driverLng, item.pickupLat, item.pickupLng)
    : null;
  const label = labels[item.title] || item.title;
  const stopCount = item.stops?.length ?? 0;
  const pricePerStop = stopCount > 1 && clientPrice > 0 ? Math.round(clientPrice / (stopCount + 1)) : null;

  const goNext = () => {
    if (safeIdx < total - 1) setCardIdx(safeIdx + 1);
  };
  const goPrev = () => {
    if (safeIdx > 0) setCardIdx(safeIdx - 1);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 9991,
      pointerEvents: 'none',
    }}>
      <div style={{
        margin: '0 8px',
        paddingBottom: 'calc(var(--tuki-nav-h, 64px) + 6px)',
        pointerEvents: 'auto',
      }}>

        {/* ── Top bar: dots + nav arrows ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 2px 6px',
        }}>
          {/* Prev arrow */}
          <button
            onClick={goPrev}
            disabled={safeIdx === 0}
            style={{
              background: safeIdx === 0 ? 'rgba(255,255,255,0.04)' : `rgba(245,197,24,0.12)`,
              border: `1px solid ${safeIdx === 0 ? 'rgba(255,255,255,0.08)' : BRAND_SHADOW}`,
              color: safeIdx === 0 ? 'var(--text-muted)' : BRAND,
              borderRadius: 99, width: 34, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: safeIdx === 0 ? 'default' : 'pointer', flexShrink: 0,
            }}
            aria-label="Anterior"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          {/* Dot indicators + counter */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {total > 1 && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCardIdx(i)}
                    style={{
                      width: i === safeIdx ? 18 : 6,
                      height: 6,
                      borderRadius: 99,
                      background: i === safeIdx ? BRAND : 'rgba(255,255,255,0.2)',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'width 0.25s ease, background 0.25s ease',
                    }}
                    aria-label={`Solicitud ${i + 1}`}
                  />
                ))}
                {total > 7 && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700 }}>+{total - 7}</span>}
              </div>
            )}
            <span style={{
              background: `linear-gradient(135deg,${BRAND},#F58A07)`,
              color: '#1C1C2E',
              borderRadius: 99, padding: '2px 12px',
              fontSize: '0.72rem', fontWeight: 800,
              boxShadow: `0 2px 8px ${BRAND_SHADOW}`,
            }}>
              {safeIdx + 1} / {total} solicitud{total !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Next arrow */}
          <button
            onClick={goNext}
            disabled={safeIdx >= total - 1}
            style={{
              background: safeIdx >= total - 1 ? 'rgba(255,255,255,0.04)' : `rgba(245,197,24,0.12)`,
              border: `1px solid ${safeIdx >= total - 1 ? 'rgba(255,255,255,0.08)' : BRAND_SHADOW}`,
              color: safeIdx >= total - 1 ? 'var(--text-muted)' : BRAND,
              borderRadius: 99, width: 34, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: safeIdx >= total - 1 ? 'default' : 'pointer', flexShrink: 0,
            }}
            aria-label="Siguiente"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* ── Single card ── */}
        <div style={{
          background: 'var(--sheet-bg)',
          borderRadius: 20,
          border: `1.5px solid ${stopCount >= 5 ? 'rgba(245,158,11,0.45)' : `rgba(245,197,24,0.22)`}`,
          boxShadow: `0 -6px 40px rgba(0,0,0,0.40), 0 0 0 1px rgba(245,197,24,0.06)`,
          overflow: 'hidden',
          position: 'relative',
        }}>

          {/* ── Offer-sent overlay ── */}
          {isSending && !offerSentForThis && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(17,24,39,0.88)', borderRadius: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
              backdropFilter: 'blur(6px)',
            }}>
              <div style={{ color: BRAND }}>
                <Icon name="refresh" size={28} />
              </div>
              <div style={{ color: BRAND, fontWeight: 800, fontSize: '1rem', textAlign: 'center' }}>Oferta enviada</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', maxWidth: 200 }}>Esperando respuesta del cliente…</div>
            </div>
          )}

          {/* ── Info zone ── */}
          <div style={{ padding: '12px 14px 10px' }}>

            {/* Row 1: avatar + info + price/timer/close */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>

              {/* Client avatar — 58px with brand ring */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {item.clientPhoto
                  ? <img src={item.clientPhoto} alt="" loading="lazy" decoding="async"
                      style={{
                        width: 58, height: 58, borderRadius: '50%', objectFit: 'cover',
                        border: `2.5px solid ${stopCount >= 5 ? '#f59e0b' : BRAND}`,
                        boxShadow: `0 0 0 3px ${stopCount >= 5 ? 'rgba(245,158,11,0.2)' : BRAND_SHADOW}`,
                      }} />
                  : <div style={{
                      width: 58, height: 58, borderRadius: '50%',
                      background: 'linear-gradient(135deg,rgba(245,197,24,0.15),rgba(245,138,7,0.15))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${BRAND_SHADOW}`,
                      boxShadow: `0 0 0 3px rgba(245,197,24,0.08)`,
                    }}>
                      <Icon name="user" size={24} color={BRAND} />
                    </div>
                }
              </div>

              {/* Name + service + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Service type label */}
                <div style={{
                  fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.2, marginBottom: 3,
                }}>{label}</div>
                {/* Client name + meta */}
                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{item.clientName || 'Cliente'}</span>
                  {item.clientVerified && (
                    <span title="Verificado" style={{ color: '#22c55e', display: 'inline-flex' }}>
                      <Icon name="shield" size={12} />
                    </span>
                  )}
                  {item.clientRating != null && item.clientRating > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#f59e0b' }}>
                      <Icon name="star" size={11} color="#f59e0b" />
                      <span style={{ fontWeight: 700 }}>{Number(item.clientRating).toFixed(1)}</span>
                    </span>
                  )}
                  {distKm != null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)' }}>
                      <Icon name="map" size={11} color="#94a3b8" />
                      {distKm.toFixed(1)} km
                    </span>
                  )}
                </div>
                {/* Badges */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                  {item.orderType === 'mandadito' && (
                    <span style={{ background: '#f59e0b', color: '#111', borderRadius: 99, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icon name="package" size={11} /> Mandadito
                    </span>
                  )}
                  {item.orderType === 'flete' && (
                    <span style={{ background: '#6366f1', color: '#fff', borderRadius: 99, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icon name="truck" size={11} /> Flete
                    </span>
                  )}
                  {stopCount >= 2 && (
                    <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', borderRadius: 99, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 800, border: '1px solid rgba(245,158,11,0.35)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icon name="package" size={11} color="#fbbf24" /> {stopCount} paradas
                    </span>
                  )}
                  {item.dateScheduled && (
                    <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 99, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 800, border: '1px solid rgba(99,102,241,0.3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icon name="calendar" size={11} color="#818cf8" />
                      {new Date(item.dateScheduled).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Price block + timer + dismiss */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                {/* Price pill */}
                <div style={{
                  background: 'rgba(245,197,24,0.10)',
                  border: `1px solid rgba(245,197,24,0.28)`,
                  borderRadius: 12, padding: '5px 10px', textAlign: 'right',
                }}>
                  <div style={{ fontWeight: 900, color: BRAND, fontSize: '1.3rem', lineHeight: 1 }}>
                    {clientPrice.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>Guaraníes</div>
                  {pricePerStop && <div style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 700, marginTop: 1 }}>≈{pricePerStop.toLocaleString()}/stop</div>}
                </div>
                {/* Timer + dismiss */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <CountdownRing createdAt={item.createdAt} />
                  <button
                    onClick={() => { onDismiss(item.id); if (safeIdx > 0) setCardIdx(safeIdx - 1); }}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                      color: 'var(--text-muted)', borderRadius: 99,
                      width: 32, height: 32, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem',
                    }}
                    aria-label="Omitir solicitud"
                  >✕</button>
                </div>
              </div>
            </div>

            {/* ── Addresses ── */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.07)',
              padding: '8px 10px', marginBottom: 8,
              fontSize: '0.76rem', color: 'var(--text-secondary)',
              display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              {item.from && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#10b981', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ lineHeight: 1.4 }}>{item.from}</span>
                </div>
              )}
              {/* Multi-stop toggle */}
              {item.stops && item.stops.length > 0 && (
                <div style={{ borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setStopsOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                      background: 'rgba(245,158,11,0.08)', padding: '5px 10px', cursor: 'pointer', border: 'none' }}
                  >
                    <span style={{ display: 'inline-flex', color: '#fbbf24' }}><Icon name="package" size={12} /></span>
                    <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', textAlign: 'left' }}>
                      {item.stops.length} parada{item.stops.length !== 1 ? 's' : ''} de entrega
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>{stopsOpen ? '▲' : '▼'}</span>
                  </button>
                  {stopsOpen && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', padding: '6px 10px 8px',
                      display: 'flex', flexDirection: 'column', gap: 5, WebkitOverflowScrolling: 'touch' as never }}>
                      {[...item.stops].sort((a, b) => a.sequence - b.sequence).map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                            background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.58rem', fontWeight: 900, color: '#fbbf24', marginTop: 1 }}>
                            {s.sequence}
                          </div>
                          <span style={{ flex: 1, fontSize: '0.72rem', color: '#fde68a', lineHeight: 1.4, wordBreak: 'break-word' }}>{s.address}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {item.to && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#ef4444', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ lineHeight: 1.4 }}>{item.to}</span>
                </div>
              )}
              {item.location && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, marginTop: 2, color: '#94a3b8' }}><Icon name="map-pin" size={12} /></span>
                  <span style={{ lineHeight: 1.4 }}>{item.location}</span>
                </div>
              )}
            </div>

            {/* Photos */}
            {item.photos && item.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
                {item.photos.slice(0, 4).map((url, i) => (
                  <img key={i} src={url} alt={`foto ${i+1}`} onClick={() => window.open(url, '_blank')}
                    style={{ width: 50, height: 50, borderRadius: 8, objectFit: 'cover',
                      flexShrink: 0, border: '1px solid var(--border-strong)', cursor: 'pointer' }} />
                ))}
                {item.photos.length > 4 && (
                  <div style={{ width: 50, height: 50, borderRadius: 8, background: 'var(--glass-card)',
                    border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                    +{item.photos.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Mandadito extras */}
            {item.orderType === 'mandadito' && item.shoppingList && (
              <div style={{ fontSize: '0.82rem', marginBottom: 6, padding: '7px 10px',
                background: 'rgba(245,158,11,0.08)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.25)' }}>
                <div style={{ fontWeight: 700, marginBottom: 3, color: '#fbbf24', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="clipboard" size={12} color="#fbbf24" /> Lista de compras
                </div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#fde68a', fontSize: '0.78rem' }}>{item.shoppingList}</div>
              </div>
            )}
            {item.orderType === 'mandadito' && item.maxBudget != null && (
              <div style={{ fontSize: '0.82rem', color: '#34d399', marginBottom: 6, padding: '6px 10px',
                background: 'rgba(52,211,153,0.07)', borderRadius: 10, border: '1px solid rgba(52,211,153,0.2)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="money" size={12} color="#34d399" />
                  Presupuesto máx.: <strong>{Number(item.maxBudget).toLocaleString('es-PY')} Gs</strong>
                </span>
              </div>
            )}
            {item.instructions && (
              <div style={{ fontSize: '0.78rem', color: '#C8960A', marginBottom: 6, padding: '7px 10px',
                background: `rgba(245,197,24,0.07)`, borderRadius: 10, border: `1px solid rgba(245,197,24,0.18)`,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="pencil" size={12} color="#C8960A" />
                  {item.instructions}
                </span>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div style={{ height: 1, background: 'rgba(245,197,24,0.10)', margin: '0 14px' }} />

          {/* ── Action zone ── */}
          <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Accept at client price — primary CTA */}
            <button
              onClick={() => onAccept(item.id, clientPrice, offerNote, distKm)}
              disabled={isSending}
              style={{
                width: '100%', padding: '14px 0', border: 'none', borderRadius: 14,
                cursor: isSending ? 'not-allowed' : 'pointer',
                background: isSending
                  ? 'rgba(245,197,24,0.25)'
                  : `linear-gradient(135deg,${BRAND},#F58A07)`,
                color: '#1C1C2E', fontWeight: 900, fontSize: '1.08rem',
                opacity: isSending ? 0.6 : 1,
                boxShadow: isSending ? 'none' : `0 4px 16px ${BRAND_SHADOW}`,
                letterSpacing: '0.01em',
              }}
            >
              {isSending && offerSentForThis ? 'Enviando…' : `Aceptar · ₲${clientPrice.toLocaleString()}`}
            </button>

            {/* Counter-offers section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                o propone tu tarifa
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {([{ amount: qo_15, pct: '+15%' }, { amount: qo_30, pct: '+30%' }, { amount: qo_50, pct: '+50%' }] as const).map(({ amount, pct }) => (
                <button
                  key={pct}
                  onClick={() => onAccept(item.id, amount, offerNote, distKm)}
                  disabled={isSending}
                  style={{
                    flex: 1, padding: '8px 0',
                    border: 'none',
                    borderRadius: 12,
                    background: `linear-gradient(135deg,${BRAND},#F58A07)`,
                    color: '#1C1C2E', fontWeight: 800,
                    fontSize: '0.74rem', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    boxShadow: `0 2px 8px ${BRAND_SHADOW}`,
                  }}
                >
                  <span style={{ fontSize: '0.76rem', fontWeight: 900 }}>₲{amount.toLocaleString()}</span>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(28,28,46,0.65)', fontWeight: 700 }}>{pct}</span>
                </button>
              ))}
              {/* Custom price */}
              <button
                onClick={() => setCustomOpen(o => !o)}
                disabled={isSending}
                style={{
                  width: 46, flexShrink: 0, padding: '8px 0', borderRadius: 12,
                  border: `1px solid ${customOpen ? '#818cf8' : 'rgba(255,255,255,0.10)'}`,
                  background: customOpen ? 'rgba(129,140,248,0.14)' : 'rgba(255,255,255,0.04)',
                  color: customOpen ? '#818cf8' : 'var(--text-muted)', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2,
                }}
                title="Precio personalizado"
              >
                <Icon name="pencil" size={14} color={customOpen ? '#818cf8' : undefined} />
                <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)' }}>Libre</span>
              </button>
            </div>

            {customOpen && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>₲</span>
                <input
                  type="text" inputMode="numeric" placeholder="Ej: 50000"
                  value={customPrice ? Number(customPrice).toLocaleString('es-PY') : ''}
                  onChange={e => setCustomPrice(e.target.value.replace(/\D/g, ''))}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 12,
                    border: '1px solid #818cf8', background: 'var(--input-bg)',
                    color: 'var(--input-text)', fontSize: '0.9rem', fontWeight: 700,
                    outline: 'none', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => { const a = parseInt(customPrice || '0'); if (a > 0) onAccept(item.id, a, offerNote, distKm); }}
                  disabled={isSending || !customPrice || parseInt(customPrice || '0') <= 0}
                  style={{ padding: '9px 14px', borderRadius: 12, border: 'none',
                    background: '#818cf8', color: '#fff', fontWeight: 800,
                    fontSize: '0.82rem', cursor: 'pointer', flexShrink: 0,
                    opacity: (!customPrice || parseInt(customPrice || '0') <= 0) ? 0.4 : 1 }}
                >
                  Enviar
                </button>
              </div>
            )}

            {/* Note toggle — collapsible */}
            <button
              onClick={() => setNoteOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: noteOpen ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontSize: '0.76rem', fontWeight: 600, padding: '2px 0',
                alignSelf: 'flex-start',
              }}
            >
              <Icon name="pencil" size={13} />
              {noteOpen ? 'Ocultar mensaje' : '+ Agregar mensaje al cliente'}
            </button>
            {noteOpen && (
              <textarea
                value={offerNote}
                onChange={e => setOfferNote(e.target.value)}
                placeholder="Mensaje para el cliente (opcional)…"
                maxLength={300}
                rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 12,
                  border: `1px solid rgba(245,197,24,0.22)`, background: 'var(--input-bg)',
                  color: 'var(--input-text)', fontSize: '0.8rem', resize: 'none',
                  outline: 'none', boxSizing: 'border-box' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
})
