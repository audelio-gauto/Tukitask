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
  clientEmail?: string;
  clientPhone?: string;
  items: { name: string; qty: number; price: number; image?: string | null }[];
  total: number;
  status: OrderStatus;
  driver?: { name: string; phone?: string };
  address: string;
  barrio?: string;
  ciudad?: string;
  referencia?: string;
  negotiated: boolean;
  paymentMethod?: string;
  paymentProofUrl?: string | null;
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
  const billing  = (raw.billing as Record<string, unknown>) ?? {};
  const delivery = (raw.delivery as Record<string, unknown>) ?? {};
  return {
    id: String(raw.id),
    number: '#' + String(raw.id).slice(0, 8).toUpperCase(),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
    clientName: String(raw.client_name ?? raw.clientName ?? ''),
    clientEmail: raw.client_email ? String(raw.client_email) : undefined,
    clientPhone: billing.phone ? String(billing.phone) : undefined,
    items: rawItems.map(i => ({
      name:  String(i.name ?? ''),
      qty:   Number(i.qty ?? 1),
      price: Number(i.price ?? 0),
      image: (i.image as string | null) ?? null,
    })),
    total: Number(raw.total ?? 0),
    status: (raw.status as OrderStatus) ?? 'pending',
    address: String(raw.address ?? ''),
    barrio: delivery.barrio ? String(delivery.barrio) : undefined,
    ciudad: delivery.ciudad ? String(delivery.ciudad) : undefined,
    referencia: delivery.referencia ? String(delivery.referencia) : undefined,
    negotiated: Boolean(raw.negotiated),
    paymentMethod: raw.payment_method ? String(raw.payment_method) : undefined,
    paymentProofUrl: (raw.payment_proof_url as string | null) ?? null,
  };
}

/* ── Escape helper — prevents HTML/script injection when building the print window ── */
function escHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/* ── Build a wa.me link for the client's phone (Paraguay country code) ── */
function buildWhatsAppLink(phone: string, orderNumber: string) {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.startsWith('595') ? digits : `595${digits.replace(/^0/, '')}`;
  const msg = encodeURIComponent(`Hola! Te escribo sobre tu pedido ${orderNumber}`);
  return `https://wa.me/${withCountry}?text=${msg}`;
}

/* ── Open a print-friendly packing slip for one order ── */
function printOrder(order: MarketOrder) {
  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) return;
  const itemsHtml = order.items.map(it => `
    <tr>
      <td>${escHtml(it.name)}</td>
      <td style="text-align:center">${it.qty}</td>
      <td style="text-align:right">${escHtml(fmtGs(it.price * it.qty))}</td>
    </tr>`).join('');
  const addressLine = [order.barrio, order.ciudad].filter(Boolean).join(', ') || order.address;
  w.document.write(`<!DOCTYPE html><html><head><title>Pedido ${escHtml(order.number)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;padding:18px;color:#111;max-width:360px}
    h1{font-size:16px;margin:0 0 6px}
    p{font-size:12px;margin:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
    th,td{padding:5px 2px;border-bottom:1px solid #ddd;text-align:left}
    .total{font-weight:bold;font-size:14px;margin-top:10px;text-align:right}
    hr{border:none;border-top:1px dashed #999;margin:10px 0}
  </style></head><body>
    <h1>Pedido ${escHtml(order.number)}</h1>
    <p>Fecha: ${escHtml(fmtDate(order.createdAt))}</p>
    <p>Cliente: ${escHtml(order.clientName)}${order.clientPhone ? ' · ' + escHtml(order.clientPhone) : ''}</p>
    <p>Dirección: ${escHtml(addressLine)}</p>
    ${order.referencia ? `<p>Referencia: ${escHtml(order.referencia)}</p>` : ''}
    <p>Pago: ${order.paymentMethod === 'contra_entrega' ? 'Contra entrega' : 'Transferencia bancaria'}</p>
    <hr />
    <table><thead><tr><th>Producto</th><th>Cant.</th><th>Subtotal</th></tr></thead><tbody>${itemsHtml}</tbody></table>
    <p class="total">Total: ${escHtml(fmtGs(order.total))}</p>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    .filter(o => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        o.clientName.toLowerCase().includes(q) ||
        o.number.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        (o.clientEmail?.toLowerCase().includes(q) ?? false) ||
        o.items.some(it => it.name.toLowerCase().includes(q))
      );
    });

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

  function handleStatusClick(id: string, next: OrderStatus) {
    if (next === 'cancelled' && !window.confirm('¿Seguro que deseas cancelar este pedido? Esta acción no se puede deshacer.')) return;
    if (next === 'delivered' && !window.confirm('¿Confirmas que el pedido fue entregado? Se descontará la comisión automáticamente y no se puede deshacer.')) return;
    void changeStatus(id, next);
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
            placeholder="Buscar pedido, cliente o producto..."
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
                                onClick={() => handleStatusClick(order.id, next)}
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
                                <p style={{ fontSize: '0.835rem', color: 'var(--vnd-text-primary)', marginBottom: 2 }}>
                                  📍 {[order.barrio, order.ciudad].filter(Boolean).join(', ') || order.address}
                                </p>
                                {order.referencia && (
                                  <p style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', marginBottom: 10 }}>
                                    Referencia: {order.referencia}
                                  </p>
                                )}
                                {order.clientEmail && (
                                  <p style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)', marginBottom: 14 }}>
                                    ✉️ {order.clientEmail}
                                  </p>
                                )}
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {order.clientPhone ? (
                                    <a
                                      href={buildWhatsAppLink(order.clientPhone, order.number)}
                                      target="_blank" rel="noopener noreferrer"
                                      className="vnd-btn vnd-btn-secondary vnd-btn-sm"
                                      style={{ textDecoration: 'none' }}
                                    >
                                      💬 WhatsApp
                                    </a>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>Sin teléfono de contacto</span>
                                  )}
                                  <button className="vnd-btn vnd-btn-secondary vnd-btn-sm" onClick={() => printOrder(order)}>
                                    🖨 Imprimir
                                  </button>
                                </div>

                                {order.paymentMethod === 'transferencia' && (
                                  <div style={{ marginTop: 16 }}>
                                    <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--vnd-text-muted)', marginBottom: 8 }}>
                                      Comprobante de pago
                                    </p>
                                    {order.paymentProofUrl ? (
                                      <button
                                        className="vnd-btn vnd-btn-secondary vnd-btn-sm"
                                        onClick={() => setPreviewUrl(order.paymentProofUrl!)}
                                      >
                                        🖼 Ver comprobante
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-muted)' }}>Aún sin comprobante</span>
                                    )}
                                  </div>
                                )}
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

      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer', padding: 20 }}
        >
          <img src={previewUrl} alt="Comprobante de pago" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
