'use client';
import { useEffect, useState } from 'react';
import ClientScreenLayout from '../components/ClientScreenLayout';
import { useClientContext } from '../context';
import { authFetch } from '@/lib/authFetch';

interface MarketOrder {
  id: string;
  status: string;
  vendor_email: string;
  client_name: string | null;
  items: Array<{ productId: string; name: string; price: number; qty: number }>;
  total: number;
  created_at: string;
  delivery: { ciudad?: string; barrio?: string; nombre?: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente',  color: '#F5C518' },
  confirmed: { label: 'Confirmado', color: '#60a5fa' },
  shipped:   { label: 'Enviado',    color: '#a78bfa' },
  delivered: { label: 'Entregado',  color: '#4ade80' },
  cancelled: { label: 'Cancelado',  color: '#f87171' },
};

export default function PedidosPage() {
  const { email } = useClientContext();
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    authFetch(`/api/tienda/mis-pedidos?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: MarketOrder[]) => { setOrders(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  const fmtGs = (n: number) => `${Number(n).toLocaleString('es-PY')} Gs`;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <ClientScreenLayout title="Mis Pedidos">
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-muted)' }}>Cargando…</div>
      ) : orders.length === 0 ? (
        <div className="client-empty">
          <div className="client-empty-icon">🛒</div>
          <p className="client-empty-text">No tienes pedidos</p>
          <p className="client-empty-sub">Tus pedidos del marketplace aparecerán aquí</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
          {orders.map(mo => {
            const badge = STATUS_BADGE[mo.status] ?? { label: mo.status, color: 'var(--text-muted)' };
            return (
              <div key={mo.id} className="tuki-card">
                <div className="tuki-card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{mo.id.slice(0, 8).toUpperCase()}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: badge.color, background: `${badge.color}22`, padding: '2px 8px', borderRadius: 20 }}>{badge.label}</span>
                  </div>
                  {Array.isArray(mo.items) && mo.items.length > 0 && (
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.5 }}>
                      {mo.items.map((it, i) => (
                        <span key={i}>{it.name} ×{it.qty}{i < mo.items.length - 1 ? ', ' : ''}</span>
                      ))}
                    </div>
                  )}
                  {mo.delivery?.ciudad && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                      {mo.delivery.ciudad}{mo.delivery.barrio ? `, ${mo.delivery.barrio}` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{fmtDate(mo.created_at)}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#F5C518' }}>{fmtGs(mo.total)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ClientScreenLayout>
  );
}

