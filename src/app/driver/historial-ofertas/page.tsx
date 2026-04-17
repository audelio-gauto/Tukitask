'use client';
import { useEffect, useState } from 'react';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import DriverScreenLayout from '../components/DriverScreenLayout';
import type { DriverOffer } from '@/types';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',  color: '#f59e0b' },
  accepted:  { label: 'Aceptada',   color: '#10b981' },
  rejected:  { label: 'Rechazada',  color: '#ef4444' },
  cancelled: { label: 'Cancelada',  color: '#6b7280' },
  expired:   { label: 'Expirada',   color: '#9ca3af' },
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
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: 9999,
              border: 'none',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              background: filter === f ? '#10b981' : '#f1f5f9',
              color: filter === f ? '#fff' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            {f === 'all' ? 'Todas' : f === 'accepted' ? '✅ Aceptadas' : '❌ Rechazadas'}
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
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>Sin ofertas</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>No encontramos ofertas con este filtro</div>
        </div>
      )}

      {/* Cards */}
      {!loading && filtered.map(of => {
        const st = STATUS_LABEL[of.status] ?? { label: of.status, color: '#9ca3af' };
        return (
          <div
            key={of.id}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '0.85rem 1rem',
              marginBottom: 10,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827', marginBottom: 2 }}>
                Pedido #{String(of.order_id).slice(-6).toUpperCase()}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                {of.created_at ? fmt(of.created_at) : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', marginBottom: 4 }}>
                ₲{Number(of.amount).toLocaleString('es-PY')}
              </div>
              <span style={{
                background: st.color + '1a',
                color: st.color,
                borderRadius: 9999,
                padding: '2px 10px',
                fontSize: '0.73rem',
                fontWeight: 700,
              }}>
                {st.label}
              </span>
            </div>
          </div>
        );
      })}
    </DriverScreenLayout>
  );
}
