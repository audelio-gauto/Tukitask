'use client';
import { useState } from 'react';
import Link from 'next/link';

export type FeedItem = {
  id: string;
  /** Vehicle type (driver) or service type (tecnico) */
  title: string;
  /** Pickup address (driver mode) */
  from?: string;
  /** Delivery address (driver mode) */
  to?: string;
  /** Single address (tecnico mode) */
  location?: string;
  /** Suggested price in Gs */
  price?: number | null;
  /** ISO timestamp for urgency sort */
  createdAt: string;
  /** Pickup lat/lng for distance calc */
  pickupLat?: number | null;
  pickupLng?: number | null;
};

export type SortMode = 'urgency' | 'distance' | 'price';

type Props = {
  items: FeedItem[];
  available: boolean;
  offerValues: Record<string, string>;
  onOfferChange: (id: string, val: string) => void;
  onOffer: (id: string) => void;
  onDismiss: (id: string) => void;
  sendingId: string | null;
  dismissed: Set<string>;
  viewAllHref: string;
  newIds: Set<string>;
  driverLat?: number | null;
  driverLng?: number | null;
  mode?: 'driver' | 'tecnico';
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estMinutes(km: number): number {
  // Avg urban speed ~35–40 km/h → ~1.6 min per km
  return Math.max(1, Math.round(km * 1.6));
}

function serviceLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function RequestsFeed({
  items,
  available,
  offerValues,
  onOfferChange,
  onOffer,
  onDismiss,
  sendingId,
  dismissed,
  viewAllHref,
  newIds,
  driverLat,
  driverLng,
  mode = 'driver',
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('urgency');

  const visible = items.filter((i) => !dismissed.has(i.id));

  // Enrich with distance
  const enriched = visible.map((item) => {
    let distKm: number | undefined;
    if (
      driverLat != null && driverLng != null &&
      item.pickupLat != null && item.pickupLng != null
    ) {
      distKm = haversineKm(driverLat, driverLng, item.pickupLat, item.pickupLng);
    }
    return { ...item, distKm };
  });

  // Sort
  const sorted = [...enriched].sort((a, b) => {
    if (sortMode === 'distance') {
      return (a.distKm ?? Infinity) - (b.distKm ?? Infinity);
    }
    if (sortMode === 'price') {
      return (b.price ?? 0) - (a.price ?? 0);
    }
    // urgency = newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // ── Offline state ──────────────────────────────────────────────────────────
  if (!available) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.75rem 1rem',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.2rem', opacity: 0.45 }}>💤</div>
        <p style={{ margin: 0, color: '#9ca3af', fontWeight: 700, fontSize: '0.88rem' }}>
          Actívate para recibir solicitudes
        </p>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.76rem', lineHeight: 1.5 }}>
          Poné el toggle en{' '}
          <strong style={{ color: '#10b981' }}>Online</strong> para empezar a
          recibir pedidos en tiempo real.
        </p>
      </div>
    );
  }

  // ── Empty (online but no requests) ────────────────────────────────────────
  if (visible.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.75rem 1rem',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '1.8rem', opacity: 0.3 }}>🔍</div>
        <p style={{ margin: 0, color: '#6b7280', fontWeight: 700, fontSize: '0.85rem' }}>
          Buscando solicitudes cerca de ti…
        </p>
        <p style={{ margin: 0, color: '#4b5563', fontSize: '0.74rem' }}>
          Actualizando en tiempo real · Supabase Realtime activo
        </p>
      </div>
    );
  }

  // ── Feed ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
            {mode === 'driver' ? '📦' : '🔧'} Solicitudes
          </span>
          <span
            style={{
              background: '#ef4444',
              color: '#fff',
              borderRadius: 99,
              padding: '1px 7px',
              fontSize: '0.7rem',
              fontWeight: 800,
            }}
          >
            {visible.length}
          </span>
        </div>
        <Link
          href={viewAllHref}
          style={{ color: '#F5C518', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}
        >
          Ver todo →
        </Link>
      </div>

      {/* Sort pills */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {(
          [
            { key: 'urgency' as SortMode, label: '🕐 Urgente' },
            { key: 'distance' as SortMode, label: '📍 Dist.' },
            { key: 'price' as SortMode, label: '💰 Precio' },
          ]
        ).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSortMode(s.key)}
            style={{
              flex: 1,
              padding: '5px 0',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.68rem',
              background:
                sortMode === s.key ? '#F5C518' : 'rgba(255,255,255,0.06)',
              color: sortMode === s.key ? '#111' : '#9ca3af',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {sorted.map((item) => {
        const isNew = newIds.has(item.id);
        const etaMin = item.distKm != null ? estMinutes(item.distKm) : null;

        return (
          <div
            key={item.id}
            className={isNew ? 'rf-card rf-card--new' : 'rf-card'}
            style={{ marginBottom: 8 }}
          >
            {/* "Nueva" badge */}
            {isNew && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: '#F5C518',
                  color: '#111',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  marginBottom: 7,
                }}
              >
                ⚡ Nueva
              </div>
            )}

            {/* Route / service info */}
            {mode === 'driver' ? (
              /* Driver A→B */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {/* Route dots */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 4,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      background: '#facc15',
                      borderRadius: '50%',
                      display: 'block',
                    }}
                  />
                  <span
                    style={{
                      width: 1,
                      height: 16,
                      background: 'rgba(255,255,255,0.18)',
                      display: 'block',
                      margin: '2px 0',
                    }}
                  />
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      background: '#10b981',
                      borderRadius: '50%',
                      display: 'block',
                    }}
                  />
                </div>
                {/* Addresses */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#fff',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.from || 'Recogida'}
                  </p>
                  <p
                    style={{
                      margin: '5px 0 0',
                      fontSize: '0.74rem',
                      color: '#9ca3af',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.to || 'Destino'}
                  </p>
                </div>
                {/* Price */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 900,
                      color: '#F5C518',
                      display: 'block',
                      lineHeight: 1,
                    }}
                  >
                    ₲{(item.price ?? 0).toLocaleString('es-PY')}
                  </span>
                  {item.title && (
                    <span
                      style={{
                        fontSize: '0.62rem',
                        color: '#6b7280',
                        display: 'block',
                        marginTop: 2,
                      }}
                    >
                      {serviceLabel(item.title)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* Tecnico: service + address */
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.83rem',
                        fontWeight: 800,
                        color: '#fff',
                        lineHeight: 1.3,
                      }}
                    >
                      {serviceLabel(item.title || 'Servicio')}
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '0.73rem',
                        color: '#9ca3af',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      📍 {item.location || '—'}
                    </p>
                  </div>
                  {item.price != null && (
                    <span
                      style={{
                        fontSize: '1rem',
                        fontWeight: 900,
                        color: '#F5C518',
                        flexShrink: 0,
                        paddingLeft: 8,
                        lineHeight: 1,
                      }}
                    >
                      ₲{item.price.toLocaleString('es-PY')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Distance + ETA pills */}
            {(item.distKm != null || etaMin != null) && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {item.distKm != null && (
                  <span
                    style={{
                      fontSize: '0.71rem',
                      color: '#60a5fa',
                      fontWeight: 600,
                      background: 'rgba(96,165,250,0.12)',
                      borderRadius: 6,
                      padding: '2px 8px',
                    }}
                  >
                    📍 {item.distKm.toFixed(1)} km
                  </span>
                )}
                {etaMin != null && (
                  <span
                    style={{
                      fontSize: '0.71rem',
                      color: '#a78bfa',
                      fontWeight: 600,
                      background: 'rgba(167,139,250,0.12)',
                      borderRadius: 6,
                      padding: '2px 8px',
                    }}
                  >
                    ⏱ ~{etaMin} min
                  </span>
                )}
              </div>
            )}

            {/* Offer input + buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number"
                placeholder={mode === 'driver' ? 'Tu oferta Gs' : 'Tu precio Gs'}
                value={offerValues[item.id] || ''}
                onChange={(e) => onOfferChange(item.id, e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: '0.83rem',
                  padding: '7px 10px',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={() => onOffer(item.id)}
                disabled={!offerValues[item.id] || !!sendingId}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: offerValues[item.id] && !sendingId ? 'pointer' : 'not-allowed',
                  background: '#F5C518',
                  color: '#1C1C2E',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  flexShrink: 0,
                  opacity: !offerValues[item.id] || !!sendingId ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {sendingId === item.id ? '…' : 'Ofrecer'}
              </button>
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                style={{
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.35)',
                  cursor: 'pointer',
                  background: 'none',
                  color: '#ef4444',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
