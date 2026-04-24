'use client';
import { useEffect, useState } from 'react';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import DriverScreenLayout from '../components/DriverScreenLayout';
import type { DriverOffer } from '@/types';
import { Icon } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function HistorialOfertasDriver() {
  const { email } = useWorkerContext();
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    authFetch(`/api/orders/offers?driver_email=${encodeURIComponent(email)}&all=true`)
      .then(r => r.json())
      .then(data => {
        setOffers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  const filtered = offers.filter(o => filter === 'all' || o.status === filter);

  return (
    <DriverScreenLayout title="Historial de Ofertas">
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'accepted', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`tuki-btn tuki-btn-sm ${filter === f ? 'tuki-btn-success' : 'tuki-btn-neutral'}`}
          >
            {f === 'all' ? 'Todas' : f === 'accepted' ? 'Aceptadas' : 'Rechazadas'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#9ca3af', alignSelf: 'center' }}>
          {filtered.length} {filtered.length === 1 ? 'oferta' : 'ofertas'}
        </span>
      </div>

      {/* Skeleton */}
      {loading && [0,1,2].map(i => (
        <div key={i} className="tuki-skeleton" style={{ height: 76, borderRadius: 14, marginBottom: 10 }} />
      ))}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
          <div style={{ marginBottom: 12, opacity: 0.3 }}>
            <Icon name="clipboard" size={40} />
          </div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Sin ofertas</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>No encontramos ofertas con este filtro</div>
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.map(of => {
        const statusLabel = STATUS_LABEL[of.status] ?? of.status;
        const statusTone = getStatusTone(of.status);
        return (
          <div
            key={of.id}
            className="tuki-card"
            style={{
              marginBottom: 10,
              ['--status-color' as never]: statusTone.color,
              ['--status-bg' as never]: statusTone.bg,
              ['--status-border' as never]: statusTone.border,
              ['--status-outline' as never]: statusTone.border,
            }}
          >
            <div className="tuki-card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                  Pedido #{String(of.order_id).slice(-6).toUpperCase()}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {of.created_at ? fmt(of.created_at) : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tuki-price" style={{ fontSize: '1rem' }}>
                  ₲{Number(of.amount).toLocaleString('es-PY')}
                </div>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: statusTone.bg,
                  border: `1px solid ${statusTone.border}`,
                  color: statusTone.color,
                  borderRadius: 9999,
                  padding: '2px 10px',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  marginTop: 4,
                }}>
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </DriverScreenLayout>
  );
}
