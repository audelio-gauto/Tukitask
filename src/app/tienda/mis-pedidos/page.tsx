'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';
import { gs } from '../data';

type MarketOrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
};

type MarketOrder = {
  id: string;
  items: MarketOrderItem[];
  total: number;
  status: string;
  payment_method: string;
  created_at: string;
  updated_at: string;
  vendor_email: string;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pendiente',   color: '#f59e0b' },
  processing: { label: 'En proceso',  color: '#3b82f6' },
  shipped:    { label: 'Enviado',     color: '#8b5cf6' },
  delivered:  { label: 'Entregado',   color: '#16a34a' },
  cancelled:  { label: 'Cancelado',   color: '#ef4444' },
};

export default function TiendaMisPedidosPage() {
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch('/api/tienda/market-orders?role=buyer&limit=50')
      .then(r => r.json())
      .then(({ orders: data, error: err }: { orders?: MarketOrder[]; error?: string }) => {
        if (err) setError(err);
        else setOrders(data ?? []);
      })
      .catch(() => setError('No se pudieron cargar tus pedidos'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--tnd-text-muted)' }}>
        Cargando pedidos...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/tienda" style={{ color: 'var(--tnd-accent)', fontSize: '0.85rem', textDecoration: 'none' }}>
          ← TukiMarket
        </Link>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--tnd-text-primary)', margin: 0 }}>
          Mis Pedidos
        </h1>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!error && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>📦</div>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--tnd-text-primary)', marginBottom: 6 }}>
            No tenés pedidos aún
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--tnd-text-muted)', marginBottom: 20 }}>
            Tus compras en TukiMarket aparecerán aquí.
          </p>
          <Link href="/tienda" style={{ display: 'inline-block', padding: '10px 22px', background: 'var(--tnd-accent)', color: 'var(--tnd-accent-text)', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: '0.9rem' }}>
            Ir al catálogo
          </Link>
        </div>
      )}

      {/* ── Orders list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {orders.map(order => {
          const s    = STATUS_MAP[order.status] ?? { label: order.status, color: '#64748b' };
          const date = new Date(order.created_at).toLocaleDateString('es-PY', {
            day: '2-digit', month: 'short', year: 'numeric',
          });
          const items = Array.isArray(order.items) ? order.items : [];

          return (
            <div key={order.id} style={{ background: 'var(--tnd-surface)', border: '1px solid var(--tnd-border)', borderRadius: 14, padding: '16px', overflow: 'hidden' }}>
              {/* Order header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--tnd-text-muted)', fontFamily: 'monospace' }}>
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--tnd-text-muted)' }}>{date}</p>
                </div>
                <span style={{
                  background: `${s.color}20`,
                  color: s.color,
                  border: `1px solid ${s.color}55`,
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}>
                  {s.label}
                </span>
              </div>

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--tnd-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {item.image
                        ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '1.3rem' }}>📦</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--tnd-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--tnd-text-muted)' }}>
                        x{item.qty} · {gs(item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid var(--tnd-border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted)' }}>
                  {order.payment_method === 'contra_entrega' ? '💵 Contra entrega' : '🏦 Transferencia'}
                </span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--tnd-text-primary)' }}>
                  {gs(order.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

