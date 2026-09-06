'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import { gs } from '../data';

type MarketOrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
};

type MarketOrderDelivery = {
  ciudad?: string;
  barrio?: string;
  referencia?: string;
  nombre?: string;
};

type MarketOrder = {
  id: string;
  items: MarketOrderItem[];
  total: number;
  shipping_price?: number | null;
  status: string;
  payment_method: string;
  address?: string | null;
  delivery?: MarketOrderDelivery | null;
  created_at: string;
  updated_at: string;
  vendor_email: string;
  vendor_id?: string | null;
};

type VendorStoreInfo = { name: string; logo: string | null };

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:            { label: 'En espera',   color: '#f59e0b' },
  preparing:          { label: 'Preparando',  color: '#3b82f6' },
  ready:              { label: 'Listo',       color: '#F5C518' },
  in_transit:         { label: 'En camino',   color: '#8b5cf6' },
  delivered:          { label: 'Entregado',   color: '#16a34a' },
  commission_charged: { label: 'Completado',  color: '#16a34a' },
  cancelled:          { label: 'Cancelado',   color: '#ef4444' },
};

export default function TiendaMisPedidosPage() {
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendorStores, setVendorStores] = useState<Record<string, VendorStoreInfo>>({});

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

  // Load store branding (name + logo) for each vendor present in the order list —
  // best-effort only, falls back gracefully to the vendor's email if unavailable.
  useEffect(() => {
    const vendorIds = Array.from(new Set(orders.map(o => o.vendor_id).filter((v): v is string => Boolean(v))));
    const missingIds = vendorIds.filter(v => !vendorStores[v]);
    if (missingIds.length === 0) return;

    let isActive = true;
    supabase
      .from('store_configs')
      .select('vendor_id, config')
      .in('vendor_id', missingIds)
      .then(({ data }) => {
        if (!isActive || !data) return;
        setVendorStores(prev => {
          const next = { ...prev };
          for (const row of data as Array<{ vendor_id: string; config: { storeName?: string; logoImage?: string } }>) {
            next[row.vendor_id] = {
              name: row.config?.storeName?.trim() || '',
              logo: row.config?.logoImage || null,
            };
          }
          return next;
        });
      }, () => {});

    return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

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
          const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
          const shippingPrice = Number(order.shipping_price ?? 0) || 0;
          const store = order.vendor_id ? vendorStores[order.vendor_id] : undefined;
          const storeName = store?.name || order.vendor_email.split('@')[0] || 'Tienda';
          const addressLine = [order.delivery?.barrio, order.delivery?.ciudad].filter(Boolean).join(', ')
            || order.address
            || null;

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

              {/* Store row */}
              {order.vendor_id ? (
                <Link
                  href={`/tienda/${order.vendor_id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, textDecoration: 'none' }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--tnd-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--tnd-text-primary)' }}>
                    {store?.logo
                      ? <img src={store.logo} alt={storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : storeName.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tnd-text-primary)' }}>{storeName}</span>
                </Link>
              ) : (
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--tnd-text-primary)' }}>🏬 {storeName}</p>
              )}

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
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tnd-text-secondary)', flexShrink: 0 }}>
                      {gs(item.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Address + payment method */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--tnd-border)', paddingTop: 10, marginBottom: 10 }}>
                {addressLine && (
                  <div style={{ display: 'flex', gap: 6, fontSize: '0.78rem', color: 'var(--tnd-text-secondary)' }}>
                    <span>📍</span>
                    <span>
                      {addressLine}
                      {order.delivery?.referencia ? ` (${order.delivery.referencia})` : ''}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, fontSize: '0.78rem', color: 'var(--tnd-text-secondary)' }}>
                  <span>{order.payment_method === 'contra_entrega' ? '💵' : '🏦'}</span>
                  <span>{order.payment_method === 'contra_entrega' ? 'Contra entrega' : 'Transferencia bancaria'}</span>
                </div>
              </div>

              {/* Totals */}
              <div style={{ borderTop: '1px solid var(--tnd-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted)' }}>Subtotal</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--tnd-text-secondary)', fontWeight: 600 }}>{gs(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--tnd-text-muted)' }}>Envío</span>
                  <span style={{ fontSize: '0.78rem', color: shippingPrice === 0 ? '#16a34a' : 'var(--tnd-text-secondary)', fontWeight: 600 }}>
                    {shippingPrice === 0 ? 'Gratis' : gs(shippingPrice)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--tnd-border)', paddingTop: 8, marginTop: 2 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--tnd-text-primary)' }}>Total</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--tnd-text-primary)' }}>
                    {gs(order.total)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

