'use client';
import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/authFetch';

/* ── Types ───────────────────────────────────────────────── */
type OrderStatus = 'pending' | 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'commission_charged' | 'cancelled';

interface MarketOrder {
  id: string;
  number: string;
  createdAt: string;
  clientName: string;
  clientPhone?: string;
  items: { name: string; qty: number; price: number; image?: string | null }[];
  total: number;
  status: OrderStatus;
  driver?: { name: string; phone?: string };
  address: string;
  negotiated: boolean;
}

/* ── Helpers ─────────────────────────────────────────────── */
function fmtGs(n: number) {
  return '₲\u00a0' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ── Status config ───────────────────────────────────────── */
const S: Record<OrderStatus, { cls: string; label: string; dot: string; bg: string }> = {
  pending:            { cls: 'vnd-badge-amber',  label: 'En espera',    dot: '#fbbf24', bg: 'var(--vnd-warning-bg)' },
  preparing:          { cls: 'vnd-badge-blue',   label: 'Preparando',   dot: '#38bdf8', bg: 'var(--vnd-info-bg)'    },
  ready:              { cls: 'vnd-badge-gold',   label: 'Listo',        dot: '#F5C518', bg: 'rgba(245,197,24,0.10)' },
  in_transit:         { cls: 'vnd-badge-purple', label: 'En camino',    dot: '#a78bfa', bg: 'rgba(139,92,246,0.10)' },
  delivered:          { cls: 'vnd-badge-green',  label: 'Entregado',    dot: '#4ade80', bg: 'var(--vnd-success-bg)' },
  commission_charged: { cls: 'vnd-badge-green',  label: 'Completado',   dot: '#4ade80', bg: 'var(--vnd-success-bg)' },
  cancelled:          { cls: 'vnd-badge-red',    label: 'Cancelado',    dot: '#f87171', bg: 'var(--vnd-danger-bg)'  },
};

/* ── Status actions (what the vendor can change to) ──────── */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:    ['preparing', 'cancelled'],
  preparing:  ['ready', 'cancelled'],
  ready:      ['in_transit'],
  in_transit: ['delivered'],
};

/* ── Helpers ────────────────────────────────────────────── */
 
function toMarketOrder(raw: Record<string, unknown>): MarketOrder {
  const rawItems = (raw.items as Array<Record<string, unknown>>) ?? [];
  return {
    id: String(raw.id),
    number: '#' + String(raw.id).slice(0, 8).toUpperCase(),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
    clientName: String(raw.client_name ?? raw.clientName ?? ''),
    clientPhone: undefined,
    items: rawItems.map(i => ({
      name:  String(i.name ?? ''),
      qty:   Number(i.qty ?? 1),
      price: Number(i.price ?? 0),
      image: (i.image as string | null) ?? null,
    })),
    total: Number(raw.total ?? 0),
    status: (raw.status as OrderStatus) ?? 'pending',
    address: String(raw.address ?? ''),
    negotiated: Boolean(raw.negotiated),
  };
}

/* ── Legacy mock data (kept for reference — not used) ──── */
const MOCK_ORDERS: MarketOrder[] = [
  {
    id: '1', number: '#5959',
    createdAt: new Date(Date.now() - 5 * 60e3).toISOString(),
    clientName: 'María González', clientPhone: '0981-234567',
    items: [{ name: 'Auricular JBL Tune 510', qty: 2, price: 180000 }],
    total: 360000, status: 'pending', negotiated: true,
    address: 'Av. Mcal. López 1234, Asunción',
  },
  {
    id: '2', number: '#5958',
    createdAt: new Date(Date.now() - 32 * 60e3).toISOString(),
    clientName: 'Carlos Pérez',
    items: [{ name: 'Cable USB-C 2m', qty: 1, price: 35000 }],
    total: 35000, status: 'preparing', negotiated: false,
    address: 'Calle Eligio Ayala 567, Asunción',
    driver: { name: 'Diego R.', phone: '0991-456789' },
  },
  {
    id: '3', number: '#5957',
    createdAt: new Date(Date.now() - 2 * 3600e3).toISOString(),
    clientName: 'Ana Rodríguez',
    items: [
      { name: 'Cargador 65W GaN', qty: 1, price: 120000 },
      { name: 'Cable USB-C 2m', qty: 2, price: 35000 },
    ],
    total: 190000, status: 'delivered', negotiated: true,
    address: 'Barrio San Antonio, Fernando de la Mora',
    driver: { name: 'Luis M.' },
  },
  {
    id: '4', number: '#5956',
    createdAt: new Date(Date.now() - 5 * 3600e3).toISOString(),
    clientName: 'Juan Martínez',
    items: [{ name: 'Soporte Magnético Auto', qty: 1, price: 45000 }],
    total: 45000, status: 'delivered', negotiated: false,
    address: 'Av. España 890, Asunción',
    driver: { name: 'Roberto C.' },
  },
  {
    id: '5', number: '#5955',
    createdAt: new Date(Date.now() - 8 * 3600e3).toISOString(),
    clientName: 'Laura Benítez',
    items: [{ name: 'Funda Samsung A55', qty: 1, price: 28000 }],
    total: 28000, status: 'cancelled', negotiated: false,
    address: 'Calle Palma 123, Asunción',
  },
];

type TabKey = 'all' | OrderStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',        label: 'Todos'      },
  { key: 'pending',    label: 'En espera'  },
  { key: 'preparing',  label: 'Preparando' },
  { key: 'ready',      label: 'Listos'     },
  { key: 'in_transit', label: 'En camino'  },
  { key: 'delivered',  label: 'Entregados' },
  { key: 'cancelled',  label: 'Cancelados' },
];

/* ══════════════════════════════════════════════════════════ */
export default function PedidosPage() {
  const [activeTab, setActiveTab]   = useState<TabKey>('all');
  const [orders, setOrders]         = useState<MarketOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [busyId, setBusyId]         = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [search, setSearch]         = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/tienda/market-orders?limit=100');
      const data = await res.json();
      if (res.ok) setOrders((data.orders ?? []).map(toMarketOrder));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const filtered = orders
    .filter(o => activeTab === 'all' || o.status === activeTab)
    .filter(o =>
      o.clientName.toLowerCase().includes(search.toLowerCase()) ||
      o.number.toLowerCase().includes(search.toLowerCase())
    );

  const countOf = (k: TabKey) =>
    k === 'all' ? orders.length : orders.filter(o => o.status === k).length;

  async function changeStatus(id: string, newStatus: OrderStatus) {
    setBusyId(id);
    try {
      const res = await authFetch(`/api/tienda/market-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Error al actualizar pedido'); return; }
      const finalStatus: OrderStatus = data.status ?? newStatus;
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: finalStatus } : o));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Heading */}
      <h1 className="vnd-page-heading">Gestión de Pedidos</h1>
      <p className="vnd-page-sub">
        {loading ? 'Cargando pedidos...' : `${orders.filter(o => o.status === 'pending').length} pedido${orders.filter(o => o.status === 'pending').length !== 1 ? 's' : ''} esperando confirmación`}
      </p>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div className="vnd-tabs" style={{ flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              className={`vnd-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {/* Dot for non-zero tabs */}
              {t.key !== 'all' && countOf(t.key) > 0 && (
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: S[t.key as OrderStatus]?.dot ?? '#9aa8ba',
                  display: 'inline-block', flexShrink: 0,
                }} />
              )}
              {t.label}
              <span className="vnd-tab-count">{countOf(t.key)}</span>
            </button>
          ))}
        </div>

        <div className="vnd-search-wrap">
          <svg className="vnd-search-icon" width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="vnd-search"
            placeholder="Buscar pedido o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="vnd-card">
        {loading ? (
          <div className="vnd-empty">
            <div className="vnd-empty-icon">⏳</div>
            <p className="vnd-empty-title">Cargando pedidos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="vnd-empty">
            <div className="vnd-empty-icon">📭</div>
            <p className="vnd-empty-title">Sin pedidos en esta categoría</p>
            <p className="vnd-empty-sub">Cuando recibas pedidos aparecerán aquí</p>
          </div>
        ) : (
          <div className="vnd-table-wrap">
            <table className="vnd-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Pedido</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Artículos</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Estado</th>
                  <th>Driver Asignado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => {
                  const cfg     = S[order.status];
                  const nexts   = NEXT_STATUS[order.status] ?? [];
                  const isOpen  = expanded === order.id;

                  return (
                    <>
                      <tr key={order.id} style={{ cursor: 'pointer' }}
                        onClick={() => setExpanded(isOpen ? null : order.id)}>

                        {/* Number */}
                        <td style={{ paddingLeft: 22 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                              style={{ color: 'var(--vnd-text-muted)', flexShrink: 0,
                                transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--vnd-text-primary)' }}>
                              {order.number}
                            </span>
                            {order.negotiated && (
                              <span className="vnd-badge vnd-badge-gold" style={{ fontSize: '0.63rem', padding: '1px 6px' }}>
                                🤝 Negociado
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Date */}
                        <td>
                          <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', whiteSpace: 'nowrap' }}>
                            {fmtDate(order.createdAt)}
                          </span>
                        </td>

                        {/* Client */}
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{order.clientName}</div>
                          {order.clientPhone && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>{order.clientPhone}</div>
                          )}
                        </td>

                        {/* Items */}
                        <td>
                          <span style={{ fontSize: '0.82rem', color: 'var(--vnd-text-secondary)' }}>
                            {order.items.length} art. ({order.items.reduce((s, i) => s + i.qty, 0)} und)
                          </span>
                        </td>

                        {/* Total */}
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, color: 'var(--vnd-text-primary)' }}>
                            {fmtGs(order.total)}
                          </span>
                        </td>

                        {/* Status */}
                        <td onClick={e => e.stopPropagation()}>
                          <span className={`vnd-badge ${cfg.cls}`}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                            {cfg.label}
                          </span>
                        </td>

                        {/* Driver */}
                        <td>
                          {order.driver ? (
                            <div className="vnd-driver-chip">
                              <div className="vnd-driver-avatar">{order.driver.name[0]}</div>
                              <div>
                                <div className="vnd-driver-name">{order.driver.name}</div>
                                {order.driver.phone && (
                                  <div style={{ fontSize: '0.68rem', color: 'var(--vnd-text-muted)' }}>{order.driver.phone}</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)' }}>Sin asignar</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {nexts.map(next => (
                              <button
                                key={next}
                                className="vnd-btn vnd-btn-sm"
                                disabled={busyId === order.id}
                                style={{
                                  background: next === 'cancelled' ? 'var(--vnd-danger-bg)' : next === 'delivered' ? 'rgba(34,197,94,0.18)' : '#F5C518',
                                  color:      next === 'cancelled' ? 'var(--vnd-danger)' : next === 'delivered' ? '#4ade80' : '#0b1220',
                                  border:     next === 'cancelled' ? '1px solid transparent' : 'none',
                                  opacity: busyId === order.id ? 0.6 : 1,
                                }}
                                onClick={() => void changeStatus(order.id, next)}
                              >
                                {next === 'preparing'  && '▶ Preparar'}
                                {next === 'ready'      && '✓ Listo'}
                                {next === 'in_transit' && '🚗 Despachar'}
                                {next === 'delivered'  && '✅ Marcar entregado'}
                                {next === 'cancelled'  && '✕ Cancelar'}
                              </button>
                            ))}
                            {nexts.length === 0 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>—</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isOpen && (
                        <tr key={`${order.id}-detail`}>
                          <td colSpan={8} style={{ padding: 0, background: 'var(--vnd-surface-2)' }}>
                            <div style={{ padding: '16px 22px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                              {/* Items list */}
                              <div>
                                <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--vnd-text-muted)', marginBottom: 10 }}>
                                  Artículos del pedido
                                </p>
                                {order.items.map((item, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: idx < order.items.length - 1 ? '1px solid var(--vnd-border)' : 'none' }}>
                                    <span style={{ fontSize: '0.835rem', color: 'var(--vnd-text-primary)' }}>
                                      {item.name} <span style={{ color: 'var(--vnd-text-muted)' }}>×{item.qty}</span>
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: '0.835rem' }}>{fmtGs(item.price * item.qty)}</span>
                                  </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4 }}>
                                  <span style={{ fontWeight: 800, color: 'var(--vnd-text-primary)' }}>Total</span>
                                  <span style={{ fontWeight: 900, color: '#F5C518', fontSize: '1rem' }}>{fmtGs(order.total)}</span>
                                </div>
                              </div>

                              {/* Delivery info */}
                              <div>
                                <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--vnd-text-muted)', marginBottom: 10 }}>
                                  Dirección de entrega
                                </p>
                                <p style={{ fontSize: '0.835rem', color: 'var(--vnd-text-primary)', marginBottom: 14 }}>
                                  📍 {order.address}
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button className="vnd-btn vnd-btn-secondary vnd-btn-sm">
                                    💬 Mensaje
                                  </button>
                                  <button className="vnd-btn vnd-btn-secondary vnd-btn-sm">
                                    🖨 Imprimir
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', marginTop: 12, textAlign: 'right' }}>
        Mostrando {filtered.length} de {orders.length} pedidos
      </p>
    </div>
  );
}
