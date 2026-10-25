'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* ── Helpers ─────────────────────────────────────────────── */
function fmtGs(n: number) {
  return '₲\u00a0' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}
function today() { return new Date().toISOString().split('T')[0]; }
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function getDateRangeData(data: number[], labels: string[]) {
  const max = Math.max(...data, 1);
  return data.map((value, i) => ({
    label: labels[i],
    value,
    height: Math.max(value === 0 ? 0 : 8, (value / max) * 100),
  }));
}

/* ── Area sparkline (SVG) ────────────────────────────────── */
function AreaChart({ data, color = '#F5C518' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const W = 500, H = 120, PAD = 10;
  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - v / max) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const area = `${PAD},${H - PAD} ` + polyline + ` ${W - PAD},${H - PAD}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.30} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      {[0,1,2,3].map(i => (
        <line key={i}
          x1={PAD} y1={PAD + (i / 3) * (H - PAD * 2)}
          x2={W - PAD} y2={PAD + (i / 3) * (H - PAD * 2)}
          stroke="var(--vnd-chart-grid)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6}
        />
      ))}
      <polygon points={area} fill="url(#chartGrad)" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((pt, i) => {
        const [x, y] = pt.split(',').map(Number);
        return data[i] > 0 ? <circle key={i} cx={x} cy={y} r={3.5} fill={color} /> : null;
      })}
    </svg>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--vnd-text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--vnd-text-primary)' }}>{fmtGs(value)}</span>
      </div>
      <div style={{ height: 8, background: 'var(--vnd-surface-2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
        <span style={{ color: 'var(--vnd-text-muted)', fontSize: '0.82rem' }}>Sin datos</span>
      </div>
    );
  }
  const R = 50, CX = 70, CY = 70;
  let cumAngle = -90;
  const slices = segments.map(seg => {
    const angle = (seg.value / total) * 360;
    const start = cumAngle;
    cumAngle += angle;
    const startRad = (start * Math.PI) / 180;
    const endRad = (cumAngle * Math.PI) / 180;
    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);
    const large = angle > 180 ? 1 : 0;
    return { ...seg, d: `M${CX},${CY} L${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} Z` };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg viewBox="0 0 140 140" width={140} height={140} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.9} />)}
        <circle cx={CX} cy={CY} r={28} fill="var(--vnd-surface)" />
        <text x={CX} y={CY + 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--vnd-text-primary)">
          {total}
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" fontSize={9} fill="var(--vnd-text-muted)">total</text>
      </svg>
      <div style={{ flex: 1 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--vnd-text-secondary)', flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--vnd-text-primary)' }}>
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function AnalisisPage() {
  const [dateFrom, setDateFrom] = useState(weekAgo());
  const [dateTo, setDateTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<number[]>(Array(7).fill(0));
  const [ordersData, setOrdersData] = useState<number[]>(Array(7).fill(0));
  const [topProducts, setTopProducts] = useState<Array<{ name: string; sales: number }>>([]);
  const [orderStatuses, setOrderStatuses] = useState<Array<{ label: string; value: number; color: string }>>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [averageTicket, setAverageTicket] = useState(0);
  const [bestProduct, setBestProduct] = useState<'—' | string>('—');
  const [negotiationRate, setNegotiationRate] = useState(0);

  async function loadVendorAnalytics(from: string, to: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;

    const fromIso = new Date(`${from}T00:00:00`).toISOString();
    const toIso = new Date(`${to}T23:59:59`).toISOString();

    const { data: rows, error } = await supabase
      .from('market_orders')
      .select('id, created_at, total, status, negotiated, items, vendor_email, vendor_id')
      .or(`vendor_email.eq.${user.email},vendor_id.eq.${user.id}`)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Vendor analytics fetch failed:', error.message);
      return { salesData: Array(7).fill(0), ordersData: Array(7).fill(0), topProducts: [], orderStatuses: [], totalSales: 0, averageTicket: 0, bestProduct: '—', negotiationRate: 0 };
    }

    const orders = (rows ?? []) as Array<{
      id: string;
      created_at?: string | null;
      total?: number | null;
      status?: string | null;
      negotiated?: boolean | null;
      items?: Array<{ name?: string | null; qty?: number | null; price?: number | null }> | null;
    }>;

    const salesByDay = Array(7).fill(0);
    const ordersByDay = Array(7).fill(0);
    const productMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    let total = 0;
    let deliveredCount = 0;
    let negotiatedCount = 0;
    let salesSum = 0;

    orders.forEach((order) => {
      const status = String(order.status ?? 'pending');
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);

      const orderTotal = Number(order.total ?? 0) || 0;
      if (['delivered', 'commission_charged', 'client_confirmed'].includes(status)) {
        total += orderTotal;
        deliveredCount += 1;
        salesSum += orderTotal;
      }

      if (order.negotiated) negotiatedCount += 1;

      const created = order.created_at ? new Date(order.created_at) : null;
      if (created && !Number.isNaN(created.getTime())) {
        const diffDays = Math.floor((new Date().getTime() - created.getTime()) / 86400000);
        const idx = Math.max(0, Math.min(6, 6 - diffDays));
        if (diffDays >= 0 && diffDays <= 6) {
          salesByDay[idx] += orderTotal;
          ordersByDay[idx] += 1;
        }
      }

      const items = order.items ?? [];
      items.forEach((item) => {
        const name = String(item.name ?? '').trim();
        if (!name) return;
        const itemTotal = Number(item.price ?? 0) * Number(item.qty ?? 1);
        productMap.set(name, (productMap.get(name) ?? 0) + itemTotal);
      });
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, sales]) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 4);

    const bestProduct = topProducts[0]?.name ?? '—';
    const statusList = [
      { label: 'Entregados', value: statusMap.get('delivered') ?? 0, color: '#4ade80' },
      { label: 'Cancelados', value: statusMap.get('cancelled') ?? 0, color: '#f87171' },
      { label: 'En proceso', value: [statusMap.get('pending') ?? 0, statusMap.get('preparing') ?? 0, statusMap.get('ready') ?? 0, statusMap.get('in_transit') ?? 0].reduce((sum, item) => sum + item, 0), color: '#38bdf8' },
    ];

    return {
      salesData: salesByDay,
      ordersData: ordersByDay,
      topProducts,
      orderStatuses: statusList,
      totalSales: total,
      averageTicket: deliveredCount > 0 ? salesSum / deliveredCount : 0,
      bestProduct,
      negotiationRate: orders.length > 0 ? (negotiatedCount / orders.length) * 100 : 0,
    };
  }

  useEffect(() => {
    let active = true;

    const run = async () => {
      const analytics = await loadVendorAnalytics(dateFrom, dateTo);
      if (!active) return;
      if (!analytics) {
        setLoading(false);
        return;
      }

      setSalesData(analytics.salesData);
      setOrdersData(analytics.ordersData);
      setTopProducts(analytics.topProducts);
      setOrderStatuses(analytics.orderStatuses);
      setTotalSales(analytics.totalSales);
      setAverageTicket(analytics.averageTicket);
      setBestProduct(analytics.bestProduct);
      setNegotiationRate(analytics.negotiationRate);
      setLoading(false);
    };

    void run();
    return () => { active = false; };
  }, [dateFrom, dateTo]);

  const topMax = topProducts[0]?.sales ?? 1;
  const weekLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading">Análisis y Reportes</h1>
          <p className="vnd-page-sub">Métricas de rendimiento de tu tienda</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="vnd-date-range">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: 'var(--vnd-text-muted)' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input type="date" className="vnd-date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="vnd-date-sep">→</span>
            <input type="date" className="vnd-date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button className="vnd-btn vnd-btn-primary vnd-btn-sm" onClick={() => window.location.reload()}>Aplicar</button>
        </div>
      </div>

      {loading ? (
        <div className="vnd-empty" style={{ padding: 32 }}>
          <div className="vnd-empty-icon">📊</div>
          <p className="vnd-empty-title">Cargando métricas…</p>
        </div>
      ) : (
        <>
          <div className="vnd-kpi-grid">
            <div className="vnd-kpi-card" style={{ borderTop: '3px solid #F5C518' }}>
              <span className="vnd-kpi-label">💰 Rendimiento de Ventas</span>
              <span className="vnd-kpi-value">{fmtGs(totalSales)}</span>
              <span className="vnd-kpi-sub">{dateFrom} → {dateTo}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>
                {totalSales > 0 ? 'Ventas reales del período' : 'Sin ventas en el período'}
              </span>
            </div>

            <div className="vnd-kpi-card" style={{ borderTop: '3px solid #F58A07' }}>
              <span className="vnd-kpi-label">🏆 Mejor Producto</span>
              <span className="vnd-kpi-value" style={{ fontSize: '1.25rem' }}>{bestProduct}</span>
              <span className="vnd-kpi-sub">{bestProduct === '—' ? 'Sin ventas en el período' : 'Más vendido en el rango'}</span>
            </div>

            <div className="vnd-kpi-card" style={{ borderTop: '3px solid #10b981' }}>
              <span className="vnd-kpi-label">🎯 Ticket Promedio</span>
              <span className="vnd-kpi-value">{fmtGs(averageTicket)}</span>
              <span className="vnd-kpi-sub">Por pedido en el período</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div className="vnd-card">
              <div className="vnd-card-header">
                <span className="vnd-card-title">
                  <span className="vnd-card-title-dot" />
                  Ventas Diarias (Gs)
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>Últimos 7 días</span>
              </div>
              <div className="vnd-card-body">
                <AreaChart data={salesData} color="#F5C518" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {weekLabels.map((d, i) => (
                    <span key={i} style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', textAlign: 'center', flex: 1 }}>{d}</span>
                  ))}
                </div>
                {salesData.every(v => v === 0) && (
                  <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--vnd-text-muted)', marginTop: 12 }}>
                    Sin ventas registradas en este período
                  </p>
                )}
              </div>
            </div>

            <div className="vnd-card">
              <div className="vnd-card-header">
                <span className="vnd-card-title">
                  <span className="vnd-card-title-dot" style={{ background: '#F58A07' }} />
                  Pedidos por Día
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)' }}>Últimos 7 días</span>
              </div>
              <div className="vnd-card-body">
                <AreaChart data={ordersData} color="#F58A07" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {weekLabels.map((d, i) => (
                    <span key={i} style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', textAlign: 'center', flex: 1 }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
            <div className="vnd-card">
              <div className="vnd-card-header">
                <span className="vnd-card-title">
                  <span className="vnd-card-title-dot" style={{ background: '#10b981' }} />
                  Top Productos por Ventas
                </span>
              </div>
              <div className="vnd-card-body">
                {topProducts.length > 0 ? topProducts.map((p, i) => (
                  <HBar key={i} label={p.name} value={p.sales} max={topMax} color={i === 0 ? '#F5C518' : i === 1 ? '#F58A07' : '#10b981'} />
                )) : (
                  <div className="vnd-empty" style={{ padding: '20px 0' }}>
                    <div className="vnd-empty-icon">📊</div>
                    <p className="vnd-empty-title">Sin datos de ventas</p>
                  </div>
                )}
              </div>
            </div>

            <div className="vnd-card">
              <div className="vnd-card-header">
                <span className="vnd-card-title">
                  <span className="vnd-card-title-dot" style={{ background: '#8b5cf6' }} />
                  Estado de Pedidos
                </span>
              </div>
              <div className="vnd-card-body">
                <Donut segments={orderStatuses.length > 0 ? orderStatuses : [{ label: 'Sin datos', value: 1, color: '#e5e7eb' }]} />

                <div style={{ marginTop: 20, padding: '14px 0', borderTop: '1px solid var(--vnd-border)' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--vnd-text-muted)', marginBottom: 8 }}>
                    Tasa de Negociación
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--vnd-surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, negotiationRate))}%`, background: 'linear-gradient(90deg, #F5C518, #F58A07)', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#F5C518', flexShrink: 0 }}>{Math.round(negotiationRate)}%</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 6 }}>
                    de pedidos fueron negociados
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
