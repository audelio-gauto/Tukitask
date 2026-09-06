'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ClientScreenLayout from '../components/ClientScreenLayout';
import { useClientContext } from '../context';
import { authFetch } from '@/lib/authFetch';

interface MarketOrder {
  id: string;
  status: string;
  vendor_email: string;
  vendor_id?: string | null;
  client_name: string | null;
  items: Array<{ productId: string; name: string; price: number; qty: number; image?: string | null }>;
  total: number;
  shipping_price?: number | null;
  address?: string | null;
  payment_method?: string | null;
  created_at: string;
  delivery: { ciudad?: string; barrio?: string; referencia?: string; nombre?: string } | null;
  store_name?: string | null;
  store_logo?: string | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending:            { label: 'En espera',  color: '#F5C518' },
  preparing:          { label: 'Preparando', color: '#60a5fa' },
  ready:              { label: 'Listo',      color: '#F5C518' },
  in_transit:         { label: 'En camino',  color: '#a78bfa' },
  delivered:          { label: 'Entregado',  color: '#4ade80' },
  commission_charged: { label: 'Completado', color: '#4ade80' },
  cancelled:          { label: 'Cancelado',  color: '#f87171' },
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
            const items = Array.isArray(mo.items) ? mo.items : [];
            const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
            const shippingPrice = Number(mo.shipping_price ?? 0) || 0;
            const storeName = mo.store_name || mo.vendor_email.split('@')[0] || 'Tienda';
            const addressLine = [mo.delivery?.barrio, mo.delivery?.ciudad].filter(Boolean).join(', ') || mo.address || null;
            return (
              <Link key={mo.id} href={`/cliente/pedidos/${mo.id}`} className="tuki-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                <div className="tuki-card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{mo.id.slice(0, 8).toUpperCase()}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: badge.color, background: `${badge.color}22`, padding: '2px 8px', borderRadius: 20 }}>{badge.label}</span>
                  </div>

                  {/* Tienda */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ghost-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {mo.store_logo
                        ? <img src={mo.store_logo} alt={storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : storeName.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>{storeName}</span>
                  </div>

                  {items.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                      {items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--ghost-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {it.image
                              ? <img src={it.image} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: '1rem' }}>📦</span>}
                          </div>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {it.name} ×{it.qty}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {addressLine && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                      📍 {addressLine}{mo.delivery?.referencia ? ` (${mo.delivery.referencia})` : ''}
                    </div>
                  )}

                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    {mo.payment_method === 'contra_entrega' ? '💵 Contra entrega' : '🏦 Transferencia bancaria'}
                  </div>

                  <div style={{ borderTop: '1px solid rgba(245,197,24,0.12)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Subtotal</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)' }}>{fmtGs(subtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Envío</span>
                      <span style={{ fontSize: '0.72rem', color: shippingPrice === 0 ? '#4ade80' : 'var(--text-primary)' }}>
                        {shippingPrice === 0 ? 'Gratis' : fmtGs(shippingPrice)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{fmtDate(mo.created_at)}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#F5C518' }}>{fmtGs(mo.total)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ClientScreenLayout>
  );
}

