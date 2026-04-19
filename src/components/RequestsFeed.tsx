'use client';
import { useState, useEffect, useRef } from 'react';
import { haversineKm } from '@/lib/geo';

const CARD_TIMER = 100;
function getRemaining(createdAt: string): number {
  return Math.max(0, CARD_TIMER - Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
}

function CountdownRing({ seconds }: { seconds: number }) {
  const r = 14, circ = 2 * Math.PI * r;
  const dash = circ * (seconds / CARD_TIMER);
  const c = seconds > 20 ? '#22c55e' : seconds > 10 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3"/>
      <circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
      <text x="18" y="23" textAnchor="middle" fontSize="10" fontWeight="800" fill={c}>{seconds}</text>
    </svg>
  );
}

const VEHICLE_LABELS: Record<string, string> = {
  moto: ' Moto Envíos',
  auto: ' Auto Envíos',
  motocarro: ' Moto Carro Fletes',
  camion2t: ' Camión Fletes',
};

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza',
  niera: '👶 Niñera',
  cocina: '🍳 Cocina',
  eventos: '🎉 Eventos',
  cuidado_mascotas: '🐾 Mascotas',
  cuidado_adultos: '👴 Adultos',
  gestor: '📋 Gestor',
  aire_split: '❄️ Tec Aire Split',
  electrico: '⚡ Serv. Eléctrico',
  plomeria: '🔧 Serv. Plomería',
  cerrajeria: '🔑 Cerrajería',
  otros: '✨ Otros',
};

export type FeedItem = {
  id: string;
  /** Vehicle type key (driver) or service type key (tecnico) */
  title: string;
  /** Order type: envio | mandadito | flete */
  orderType?: 'envio' | 'mandadito' | 'flete' | null;
  /** Pickup address (driver) */
  from?: string;
  /** Delivery address (driver) */
  to?: string;
  /** Single address (tecnico) */
  location?: string;
  /** Suggested price in Gs */
  price?: number | null;
  /** ISO timestamp for countdown */
  createdAt: string;
  /** Driver distance calc */
  pickupLat?: number | null;
  pickupLng?: number | null;
  /** Client display info */
  clientPhoto?: string | null;
  clientName?: string | null;
  clientRating?: number | null;
  clientVerified?: boolean;
  instructions?: string | null;
  /** ISO timestamp for scheduled delivery (null = ASAP) */
  dateScheduled?: string | null;
  /** Service photos uploaded by the client */
  photos?: string[] | null;
  /** Shopping list for mandadito orders */
  shoppingList?: string | null;
  /** Max budget in Gs for mandadito orders */
  maxBudget?: number | null;
  /** Multi-stop intermediate stops */
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
};

export default function RequestsFeed({
  items,
  available,
  dismissed,
  onAccept,
  onDismiss,
  sendingId,
  mode = 'driver',
  driverLat,
  driverLng,
}: Props) {
  const [, setTick] = useState(0);
  const [offerNotes, setOfferNotes] = useState<Record<string, string>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  const [customOpen, setCustomOpen] = useState<Record<string, boolean>>({});
  const [stopsOpen, setStopsOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      // Auto-dismiss any card whose countdown just hit 0
      itemsRef.current.forEach(item => {
        if (!dismissedRef.current.has(item.id) && getRemaining(item.createdAt) === 0) {
          onDismiss(item.id);
        }
      });
    }, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sound: motivating chime (C5→E5→G5 xylophone arpeggio) ─────────────────
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const soundIvRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIdsRef   = useRef<Set<string>>(new Set());
  const itemsRef     = useRef(items);
  const dismissedRef = useRef(dismissed);
  itemsRef.current     = items;
  dismissedRef.current = dismissed;

  const playChime = () => {
    try {
      if (!audioCtxRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      // C5=523Hz, E5=659Hz, G5=784Hz — ascending major arpeggio = positive, motivating
      ([[523.25, 0], [659.25, 0.18], [783.99, 0.36]] as const).forEach(([freq, delay]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.16, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        osc.start(t);
        osc.stop(t + 1.1);
      });
    } catch { /* browser blocked audio — silently skip */ }
  };

  useEffect(() => {
    const visibleLive = items.filter(i => !dismissed.has(i.id));
    const hasNew = visibleLive.some(i => !prevIdsRef.current.has(i.id));
    prevIdsRef.current = new Set(items.map(i => i.id));

    if (hasNew && visibleLive.length > 0) {
      // Play immediately on new request
      playChime();
      // Clear any existing interval and start fresh
      if (soundIvRef.current) clearInterval(soundIvRef.current);
      soundIvRef.current = setInterval(() => {
        // Re-check freshness inside interval using refs (avoid stale closure)
        const stillAlive = itemsRef.current.filter(
          i => !dismissedRef.current.has(i.id) && getRemaining(i.createdAt) > 0
        );
        if (stillAlive.length > 0) {
          playChime();
        } else {
          clearInterval(soundIvRef.current!);
          soundIvRef.current = null;
        }
      }, 7000);
    }

    // Stop immediately when all items gone
    if (visibleLive.length === 0 && soundIvRef.current) {
      clearInterval(soundIvRef.current);
      soundIvRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dismissed]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (soundIvRef.current) clearInterval(soundIvRef.current);
    audioCtxRef.current?.close();
  }, []);

  const visible = items.filter(i => !dismissed.has(i.id));

  if (!available || visible.length === 0) return null;

  const labels = mode === 'driver' ? VEHICLE_LABELS : SERVICE_LABELS;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 9991, maxHeight: '92dvh',
      display: 'flex', flexDirection: 'column',
      pointerEvents: 'none',
    }}>
      <div style={{
        overflowY: 'auto',
        padding: `0 10px calc(var(--tuki-nav-h, 64px) + 8px)`,
        display: 'flex', flexDirection: 'column', gap: 8,
        WebkitOverflowScrolling: 'touch' as never,
        overscrollBehavior: 'contain',
        pointerEvents: 'auto',
      }}>
        {/* Count badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 0' }}>
          <span style={{ background: '#c8ff00', color: '#111', borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 800 }}>
            {visible.length} solicitud{visible.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {visible.map(item => {
          const isSending = !!sendingId; // block ALL submissions while any offer is in-flight
          const clientPrice = Number(item.price || 0);
          const qo_15 = Math.round(clientPrice * 1.15 / 1000) * 1000;
          const qo_30 = Math.round(clientPrice * 1.30 / 1000) * 1000;
          const qo_50 = Math.round(clientPrice * 1.50 / 1000) * 1000;
          const remaining = getRemaining(item.createdAt);
          const distKm = (driverLat != null && driverLng != null && item.pickupLat != null && item.pickupLng != null)
            ? haversineKm(driverLat, driverLng, item.pickupLat, item.pickupLng)
            : null;
          const label = labels[item.title] || item.title;
          const stopCount = item.stops?.length ?? 0;
          const pricePerStop = stopCount > 1 && clientPrice > 0 ? Math.round(clientPrice / (stopCount + 1)) : null;

          return (
            <div key={item.id} style={{ background: 'var(--sheet-bg)', borderRadius: 16, border: `1px solid ${stopCount >= 5 ? 'rgba(245,158,11,0.35)' : 'var(--border-strong)'}`, display: 'flex', flexDirection: 'column', maxHeight: 'calc(82dvh - var(--tuki-nav-h, 64px))', overflow: 'hidden' }}>
              {/* Scrollable content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 8px', WebkitOverflowScrolling: 'touch' as never }}>
              {/* Row 1: photo + label + client + price + timer + dismiss */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {item.clientPhoto
                  ? <img src={item.clientPhoto} alt="" loading="lazy" decoding="async" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${stopCount >= 5 ? '#f59e0b' : '#c8ff00'}`, flexShrink: 0 }} />
                  : <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, border: '1.5px solid #334155' }}>👤</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                    {item.orderType === 'mandadito' && (
                      <span style={{ background: '#f59e0b', color: '#111', borderRadius: 99, padding: '1px 7px', fontSize: '0.62rem', fontWeight: 800, flexShrink: 0 }}>🛒 Mandadito</span>
                    )}
                    {item.orderType === 'flete' && (
                      <span style={{ background: '#6366f1', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.62rem', fontWeight: 800, flexShrink: 0 }}>🚛 Flete</span>
                    )}
                    {stopCount >= 2 && (
                      <span style={{ background: stopCount >= 5 ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.1)', color: '#fbbf24', borderRadius: 99, padding: '1px 7px', fontSize: '0.62rem', fontWeight: 800, flexShrink: 0, border: '1px solid rgba(245,158,11,0.35)' }}>
                        📦 {stopCount} paradas
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{item.clientName || 'Cliente'}</span>
                    {item.clientVerified && <span title="Identidad verificada">🛡️</span>}
                    {item.clientRating != null && item.clientRating > 0 && <span style={{ color: '#f59e0b' }}>⭐{Number(item.clientRating).toFixed(1)}</span>}
                    {distKm != null && <span>📐{distKm.toFixed(1)}km</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, color: '#c8ff00', fontSize: '1rem' }}>{clientPrice.toLocaleString()}</div>
                  <div style={{ fontSize: '0.62rem', color: '#6b7280' }}>Gs</div>
                  {pricePerStop && (
                    <div style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 700, lineHeight: 1.1 }}>≈{pricePerStop.toLocaleString()}/stop</div>
                  )}
                </div>
                <CountdownRing seconds={remaining} />
                <button
                  onClick={() => onDismiss(item.id)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6b7280', borderRadius: 99, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}
                >✕</button>
              </div>

              {/* Row 2: address */}
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {item.from && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: '#10b981', flexShrink: 0 }}>🟢</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.from}</span>
                  </div>
                )}
                {item.stops && item.stops.length > 0 && (
                  <div style={{ borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden', marginTop: 2 }}>
                    {/* Collapsed header — always visible */}
                    <button
                      onClick={() => setStopsOpen(o => ({ ...o, [item.id]: !o[item.id] }))}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', padding: '5px 10px', cursor: 'pointer', border: 'none' }}
                    >
                      <span style={{ fontSize: '0.85rem' }}>📦</span>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24' }}>
                          {item.stops.length} parada{item.stops.length !== 1 ? 's' : ''} de entrega
                        </span>
                        {!stopsOpen[item.id] && (
                          <span style={{ fontSize: '0.65rem', color: '#92400e', marginLeft: 6 }}>
                            · {[...item.stops].sort((a,b)=>a.sequence-b.sequence)[0].address.substring(0, 28)}{item.stops[0].address.length > 28 ? '…' : ''}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>
                        {stopsOpen[item.id] ? '▲ cerrar' : '▼ ver todas'}
                      </span>
                    </button>
                    {/* Expanded scrollable list */}
                    {stopsOpen[item.id] && (
                      <div style={{ maxHeight: 210, overflowY: 'auto', padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 5, background: 'rgba(245,158,11,0.04)', WebkitOverflowScrolling: 'touch' as never }}>
                        {[...item.stops].sort((a, b) => a.sequence - b.sequence).map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, color: '#fbbf24', marginTop: 1 }}>
                              {s.sequence}
                            </div>
                            <span style={{ flex: 1, fontSize: '0.73rem', color: '#fde68a', lineHeight: 1.4, wordBreak: 'break-word' }}>{s.address}</span>
                          </div>
                        ))}
                        <div style={{ fontSize: '0.62rem', color: '#78350f', marginTop: 2, fontStyle: 'italic' }}>
                          {item.stops.length} entregas · recorrido de distribución
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {item.to && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: '#ef4444', flexShrink: 0 }}>🟥</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.to}</span>
                  </div>
                )}
                {item.location && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ flexShrink: 0 }}>📍</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.location}</span>
                  </div>
                )}
              </div>

              {/* Client photos */}
              {item.photos && item.photos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
                  {item.photos.slice(0, 4).map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`foto ${i + 1}`}
                      onClick={() => window.open(url, '_blank')}
                      style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid #334155', cursor: 'pointer' }}
                    />
                  ))}
                  {item.photos.length > 4 && (
                    <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>
                      +{item.photos.length - 4}
                    </div>
                  )}
                </div>
              )}

              {/* Mandadito: shopping list + budget */}
              {item.orderType === 'mandadito' && item.shoppingList && (
                <div style={{ fontSize: '0.9rem', color: '#000000', marginBottom: 6, padding: '7px 10px', background: 'rgba(245,158,11,0.12)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 3, color: '#000000', fontSize: '0.95rem' }}>🛒 Lista de compras</div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#000000', fontSize: '0.9rem' }}>{item.shoppingList}</div>
                </div>
              )}
              {item.orderType === 'mandadito' && item.maxBudget != null && (
                <div style={{ fontSize: '0.85rem', color: '#34d399', marginBottom: 6, padding: '7px 12px', background: 'rgba(52,211,153,0.08)', borderRadius: 8, border: '1px solid rgba(52,211,153,0.2)' }}>
                  💰 Presupuesto máx.: <strong style={{ fontSize: '0.95rem' }}>{Number(item.maxBudget).toLocaleString('es-PY')} Gs</strong>
                </div>
              )}
              {item.instructions && (
                <div style={{ fontSize: '0.78rem', color: '#C8960A', marginBottom: 8, padding: '7px 10px', background: 'rgba(245,197,24,0.08)', borderRadius: 8, border: '1px solid rgba(245,197,24,0.2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}>📝 {item.instructions}</div>
              )}
              {item.dateScheduled && (
                <div style={{ fontSize: '0.72rem', color: '#818cf8', marginBottom: 8, padding: '5px 8px', background: 'rgba(99,102,241,0.1)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
                  📅 Programado: {new Date(item.dateScheduled).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}

              {/* Row 3: note + Accept + counter-offers + custom price */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  value={offerNotes[item.id] || ''}
                  onChange={e => setOfferNotes(n => ({ ...n, [item.id]: e.target.value }))}
                  placeholder="Mensaje opcional para el cliente..."
                  maxLength={300}
                  rows={2}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.8rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => onAccept(item.id, clientPrice, offerNotes[item.id] || '', distKm)}
                  disabled={isSending}
                  style={{ width: '100%', padding: '11px 0', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1rem', opacity: isSending ? 0.6 : 1 }}
                >
                  Aceptar · ₲{clientPrice.toLocaleString()}
                </button>

                {/* OFRECE TU OFERTA — below accept */}
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Ofrece tu oferta</div>

                <div style={{ display: 'flex', gap: 5 }}>
                  {([{ amount: qo_15, pct: '+15%' }, { amount: qo_30, pct: '+30%' }, { amount: qo_50, pct: '+50%' }] as const).map(({ amount, pct }) => (
                    <button
                      key={pct}
                      onClick={() => onAccept(item.id, amount, offerNotes[item.id] || '', distKm)}
                      disabled={isSending}
                      style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                    >
                      <span>₲{amount.toLocaleString()}</span>
                      <span style={{ fontSize: '0.58rem', color: '#64748b' }}>{pct}</span>
                    </button>
                  ))}
                  {/* Custom price button */}
                  <button
                    onClick={() => setCustomOpen(o => ({ ...o, [item.id]: !o[item.id] }))}
                    disabled={isSending}
                    style={{ width: 44, flexShrink: 0, padding: '7px 0', border: `1px solid ${customOpen[item.id] ? '#818cf8' : '#334155'}`, borderRadius: 10, background: customOpen[item.id] ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)', color: customOpen[item.id] ? '#818cf8' : '#94a3b8', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}
                    title="Precio personalizado"
                  >
                    <span>✏️</span>
                    <span style={{ fontSize: '0.52rem', color: '#64748b' }}>Libre</span>
                  </button>
                </div>

                {/* Custom price input (InDrive style) */}
                {customOpen[item.id] && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', animation: 'fadeIn 0.2s' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>₲</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej: 120000"
                      value={customPrices[item.id] ? Number(customPrices[item.id]).toLocaleString('es-PY') : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setCustomPrices(p => ({ ...p, [item.id]: raw }));
                      }}
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #818cf8', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.9rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <button
                      onClick={() => {
                        const amt = parseInt(customPrices[item.id] || '0');
                        if (amt > 0) onAccept(item.id, amt, offerNotes[item.id] || '', distKm);
                      }}
                      disabled={isSending || !customPrices[item.id] || parseInt(customPrices[item.id] || '0') <= 0}
                      style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#818cf8', color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', flexShrink: 0, opacity: (!customPrices[item.id] || parseInt(customPrices[item.id] || '0') <= 0) ? 0.5 : 1 }}
                    >
                      Enviar
                    </button>
                  </div>
                )}
              </div>
              </div>
              {/* Ignorar — fijo al pie, siempre visible (estilo InDrive) */}
              <div style={{ flexShrink: 0, padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <button
                  onClick={() => onDismiss(item.id)}
                  style={{ width: '100%', padding: '11px 0', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, background: 'transparent', color: '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.01em' }}
                >
                  🚫 Ignorar esta solicitud
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
