'use client';
import { useState, useEffect, useRef, memo } from 'react';
import { haversineKm } from '@/lib/geo';
import { playKaChing } from '@/lib/audio';
import { Icon } from '@/components/Icon';

const CARD_TIMER = 100;

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
  const r = 14, circ = 2 * Math.PI * r;
  const dash = circ * (seconds / CARD_TIMER);
  const c = seconds > 20 ? '#22c55e' : seconds > 10 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="3"/>
      <circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
      <text x="18" y="23" textAnchor="middle" fontSize="10" fontWeight="800" fill={c}>{seconds}</text>
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
        paddingBottom: 'calc(var(--tuki-nav-h, 64px) + 8px)',
        pointerEvents: 'auto',
      }}>

        {/* ── Top bar: counter + navigation ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 4px 6px',
        }}>
          {/* Prev */}
          <button
            onClick={goPrev}
            disabled={safeIdx === 0}
            style={{
              background: safeIdx === 0 ? 'var(--glass-card)' : 'rgba(200,255,0,0.12)',
              border: '1px solid rgba(200,255,0,0.25)',
              color: safeIdx === 0 ? 'var(--text-muted)' : '#c8ff00',
              borderRadius: 99, padding: '4px 14px', fontSize: '0.8rem',
              fontWeight: 800, cursor: safeIdx === 0 ? 'default' : 'pointer',
            }}
          >← Ant</button>

          {/* Counter pill */}
          <span style={{
            background: '#c8ff00', color: '#111',
            borderRadius: 99, padding: '3px 14px',
            fontSize: '0.78rem', fontWeight: 800,
          }}>
            {safeIdx + 1} de {total} solicitud{total !== 1 ? 'es' : ''}
          </span>

          {/* Next */}
          <button
            onClick={goNext}
            disabled={safeIdx >= total - 1}
            style={{
              background: safeIdx >= total - 1 ? 'var(--glass-card)' : 'rgba(200,255,0,0.12)',
              border: '1px solid rgba(200,255,0,0.25)',
              color: safeIdx >= total - 1 ? 'var(--text-muted)' : '#c8ff00',
              borderRadius: 99, padding: '4px 14px', fontSize: '0.8rem',
              fontWeight: 800, cursor: safeIdx >= total - 1 ? 'default' : 'pointer',
            }}
          >Sig →</button>
        </div>

        {/* ── Single card ── */}
        <div style={{
          background: 'var(--sheet-bg)',
          borderRadius: 20,
          border: `1.5px solid ${stopCount >= 5 ? 'rgba(245,158,11,0.4)' : 'var(--border-strong)'}`,
          boxShadow: '0 -4px 32px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>

          {/* ── Offer-sent overlay: while waiting for client response ── */}
          {isSending && !offerSentForThis && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(17,24,39,0.85)', borderRadius: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
              backdropFilter: 'blur(4px)',
            }}>
              <div style={{ color: '#c8ff00' }}>
                <Icon name="refresh" size={26} />
              </div>
              <div style={{ color: '#c8ff00', fontWeight: 800, fontSize: '1rem', textAlign: 'center' }}>Oferta enviada</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', maxWidth: 200 }}>Esperando respuesta del cliente…</div>
            </div>
          )}

          <div style={{ padding: '14px 14px 6px' }}>

            {/* Row 1: photo + label + client info + price + timer + close */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              {/* Client avatar */}
              {item.clientPhoto
                ? <img src={item.clientPhoto} alt="" loading="lazy" decoding="async"
                    style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover',
                      border: `2.5px solid ${stopCount >= 5 ? '#f59e0b' : '#c8ff00'}`, flexShrink: 0 }} />
                : <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--surface-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                    flexShrink: 0, border: '2px solid var(--border-strong)' }}>
                    <Icon name="user" size={20} />
                  </div>
              }

              {/* Name + service + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                  <span>{item.clientName || 'Cliente'}</span>
                  {item.clientVerified && (
                    <span title="Verificado" style={{ color: '#22c55e', display: 'inline-flex' }}>
                      <Icon name="shield" size={12} />
                    </span>
                  )}
                  {item.clientRating != null && item.clientRating > 0 && (
                    <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="star" size={12} color="#f59e0b" />
                      {Number(item.clientRating).toFixed(1)}
                    </span>
                  )}
                  {distKm != null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="map" size={12} color="#94a3b8" />
                      {distKm.toFixed(1)} km
                    </span>
                  )}
                </div>
                {/* Badges */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {item.orderType === 'mandadito' && (
                    <span style={{ background: '#f59e0b', color: '#111', borderRadius: 99, padding: '1px 8px', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="package" size={12} />
                      Mandadito
                    </span>
                  )}
                  {item.orderType === 'flete' && (
                    <span style={{ background: '#6366f1', color: '#fff', borderRadius: 99, padding: '1px 8px', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="truck" size={12} />
                      Flete
                    </span>
                  )}
                  {stopCount >= 2 && (
                    <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', borderRadius: 99, padding: '1px 8px', fontSize: '0.62rem', fontWeight: 800, border: '1px solid rgba(245,158,11,0.35)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="package" size={12} color="#fbbf24" />
                      {stopCount} paradas
                    </span>
                  )}
                  {item.dateScheduled && (
                    <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 99, padding: '1px 8px', fontSize: '0.62rem', fontWeight: 800, border: '1px solid rgba(99,102,241,0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="calendar" size={12} color="#818cf8" />
                      {new Date(item.dateScheduled).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Price + timer + close */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, color: '#c8ff00', fontSize: '1.25rem', lineHeight: 1 }}>{clientPrice.toLocaleString()}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Gs</div>
                  {pricePerStop && <div style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 700 }}>≈{pricePerStop.toLocaleString()}/stop</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <CountdownRing createdAt={item.createdAt} />
                  <button
                    onClick={() => { onDismiss(item.id); if (safeIdx > 0) setCardIdx(safeIdx - 1); }}
                    style={{ background: 'var(--glass-card)', border: 'none', color: 'var(--text-muted)',
                      borderRadius: 99, width: 28, height: 28, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', fontSize: '0.85rem' }}
                    aria-label="Cerrar"
                  >✕</button>
                </div>
              </div>
            </div>

            {/* ── Addresses ── */}
            <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.from && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#10b981', flexShrink: 0, marginTop: 6 }} />
                  <span style={{ lineHeight: 1.4 }}>{item.from}</span>
                </div>
              )}
              {/* Multi-stop toggle */}
              {item.stops && item.stops.length > 0 && (
                <div style={{ borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setStopsOpen(o => !o)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                      background: 'rgba(245,158,11,0.1)', padding: '5px 10px', cursor: 'pointer', border: 'none' }}
                  >
                    <span style={{ display: 'inline-flex', color: '#fbbf24' }}>
                      <Icon name="package" size={12} />
                    </span>
                    <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', textAlign: 'left' }}>
                      {item.stops.length} parada{item.stops.length !== 1 ? 's' : ''} de entrega
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>
                      {stopsOpen ? '▲' : '▼'}
                    </span>
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
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#ef4444', flexShrink: 0, marginTop: 6 }} />
                  <span style={{ lineHeight: 1.4 }}>{item.to}</span>
                </div>
              )}
              {item.location && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, marginTop: 2, color: '#94a3b8' }}>
                    <Icon name="map-pin" size={12} />
                  </span>
                  <span style={{ lineHeight: 1.4 }}>{item.location}</span>
                </div>
              )}
            </div>

            {/* Photos */}
            {item.photos && item.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
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
              <div style={{ fontSize: '0.82rem', marginBottom: 8, padding: '7px 10px',
                background: 'rgba(245,158,11,0.1)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)' }}>
                <div style={{ fontWeight: 700, marginBottom: 3, color: '#fbbf24', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="clipboard" size={12} color="#fbbf24" />
                  Lista de compras
                </div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#fde68a', fontSize: '0.78rem' }}>{item.shoppingList}</div>
              </div>
            )}
            {item.orderType === 'mandadito' && item.maxBudget != null && (
              <div style={{ fontSize: '0.82rem', color: '#34d399', marginBottom: 8, padding: '6px 10px',
                background: 'rgba(52,211,153,0.08)', borderRadius: 10, border: '1px solid rgba(52,211,153,0.2)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="money" size={12} color="#34d399" />
                  Presupuesto max.: <strong>{Number(item.maxBudget).toLocaleString('es-PY')} Gs</strong>
                </span>
              </div>
            )}
            {item.instructions && (
              <div style={{ fontSize: '0.78rem', color: '#C8960A', marginBottom: 8, padding: '7px 10px',
                background: 'rgba(245,197,24,0.08)', borderRadius: 10, border: '1px solid rgba(245,197,24,0.2)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="pencil" size={12} color="#C8960A" />
                  {item.instructions}
                </span>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={offerNote}
              onChange={e => setOfferNote(e.target.value)}
              placeholder="Mensaje opcional para el cliente…"
              maxLength={300}
              rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 12,
                border: '1px solid var(--border-strong)', background: 'var(--input-bg)',
                color: 'var(--input-text)', fontSize: '0.8rem', resize: 'none',
                outline: 'none', boxSizing: 'border-box' }}
            />

            {/* Accept at client price */}
            <button
              onClick={() => onAccept(item.id, clientPrice, offerNote, distKm)}
              disabled={isSending}
              style={{ width: '100%', padding: '13px 0', border: 'none', borderRadius: 14,
                cursor: isSending ? 'not-allowed' : 'pointer',
                background: isSending ? 'rgba(200,255,0,0.3)' : '#c8ff00',
                color: '#111', fontWeight: 900, fontSize: '1.05rem',
                opacity: isSending ? 0.6 : 1 }}
            >
              Aceptar · ₲{clientPrice.toLocaleString()}
            </button>

            {/* Counter-offers */}
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ofrece tu tarifa
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([{ amount: qo_15, pct: '+15%' }, { amount: qo_30, pct: '+30%' }, { amount: qo_50, pct: '+50%' }] as const).map(({ amount, pct }) => (
                <button
                  key={pct}
                  onClick={() => onAccept(item.id, amount, offerNote, distKm)}
                  disabled={isSending}
                  style={{ flex: 1, padding: '8px 0', border: '1px solid #334155', borderRadius: 12,
                    background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700,
                    fontSize: '0.75rem', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                >
                  <span>₲{amount.toLocaleString()}</span>
                  <span style={{ fontSize: '0.6rem', color: '#475569' }}>{pct}</span>
                </button>
              ))}
              {/* Custom price */}
              <button
                onClick={() => setCustomOpen(o => !o)}
                disabled={isSending}
                style={{ width: 46, flexShrink: 0, padding: '8px 0', borderRadius: 12,
                  border: `1px solid ${customOpen ? '#818cf8' : 'var(--border-strong)'}`,
                  background: customOpen ? 'rgba(129,140,248,0.15)' : 'var(--glass-card)',
                  color: customOpen ? '#818cf8' : 'var(--text-muted)', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 2 }}
                title="Precio personalizado"
              >
                <span style={{ display: 'flex', color: customOpen ? '#818cf8' : 'var(--text-muted)' }}>
                  <Icon name="pencil" size={14} />
                </span>
                <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)' }}>Libre</span>
              </button>
            </div>

            {customOpen && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>₲</span>
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
                    opacity: (!customPrice || parseInt(customPrice || '0') <= 0) ? 0.45 : 1 }}
                >
                  Enviar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
})
