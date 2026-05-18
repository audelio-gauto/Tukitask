'use client';
import { useState } from 'react';

/* ── Helpers ─────────────────────────────────────────────── */
function fmtGs(n: number) {
  return '₲\u00a0' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}
function today() { return new Date().toISOString().split('T')[0]; }
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
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
  const area     = `${PAD},${H - PAD} ` + polyline + ` ${W - PAD},${H - PAD}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.30} />
          <stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </linearGradient>
      </defs>
      {/* Grid */}
      {[0,1,2,3].map(i => (
        <line key={i}
          x1={PAD} y1={PAD + (i / 3) * (H - PAD * 2)}
          x2={W - PAD} y2={PAD + (i / 3) * (H - PAD * 2)}
          stroke="var(--vnd-chart-grid)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6}
        />
      ))}
      {/* Area fill */}
      <polygon points={area} fill="url(#chartGrad)" />
      {/* Line */}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots on each point */}
      {pts.map((pt, i) => {
        const [x, y] = pt.split(',').map(Number);
        return data[i] > 0
          ? <circle key={i} cx={x} cy={y} r={3.5} fill={color} />
          : null;
      })}
    </svg>
  );
}

/* ── Horizontal bar ──────────────────────────────────────── */
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

/* ── Donut chart (SVG) ───────────────────────────────────── */
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
    const angle  = (seg.value / total) * 360;
    const start  = cumAngle;
    cumAngle += angle;
    const startRad = (start * Math.PI) / 180;
    const endRad   = (cumAngle * Math.PI) / 180;
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
              {total > 0 ? Math.round(s.value / total * 100) : 0}%
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
  const [dateTo,   setDateTo]   = useState(today());

  /* Mock data — replace with real Supabase aggregation */
  const salesData  = [0, 0, 0, 0, 0, 0, 0];
  const ordersData = [0, 0, 0, 0, 0, 0, 0];

  const topProducts = [
    { name: 'Auricular JBL Tune 510', sales: 420000 },
    { name: 'Cargador 65W GaN',       sales: 240000 },
    { name: 'Cable USB-C 2m',         sales: 105000 },
    { name: 'Soporte Magnético Auto', sales: 90000  },
  ];
  const topMax = topProducts[0]?.sales ?? 1;

  const orderStatuses = [
    { label: 'Entregados',  value: 12, color: '#4ade80' },
    { label: 'Cancelados',  value: 2,  color: '#f87171' },
    { label: 'En proceso',  value: 3,  color: '#38bdf8' },
  ];

  return (
    <div>
      {/* Heading */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="vnd-page-heading">Análisis y Reportes</h1>
          <p className="vnd-page-sub">Métricas de rendimiento de tu tienda</p>
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="vnd-date-range">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} style={{ color: 'var(--vnd-text-muted)' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input type="date" className="vnd-date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="vnd-date-sep">→</span>
            <input type="date" className="vnd-date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <button className="vnd-btn vnd-btn-primary vnd-btn-sm">Aplicar</button>
          <button className="vnd-btn vnd-btn-secondary vnd-btn-sm">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="vnd-kpi-grid">
        <div className="vnd-kpi-card" style={{ borderTop: '3px solid #F5C518' }}>
          <span className="vnd-kpi-label">💰 Rendimiento de Ventas</span>
          <span className="vnd-kpi-value">{fmtGs(0)}</span>
          <span className="vnd-kpi-sub">
            {dateFrom} → {dateTo}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', marginTop: 4 }}>
            — Publicá productos para ver datos
          </span>
        </div>

        <div className="vnd-kpi-card" style={{ borderTop: '3px solid #F58A07' }}>
          <span className="vnd-kpi-label">🏆 Mejor Producto</span>
          <span className="vnd-kpi-value" style={{ fontSize: '1.25rem' }}>—</span>
          <span className="vnd-kpi-sub">Sin ventas en el período</span>
        </div>

        <div className="vnd-kpi-card" style={{ borderTop: '3px solid #10b981' }}>
          <span className="vnd-kpi-label">🎯 Ticket Promedio</span>
          <span className="vnd-kpi-value">{fmtGs(0)}</span>
          <span className="vnd-kpi-sub">Por pedido en el período</span>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Sales line chart */}
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
              {['L','M','X','J','V','S','D'].map((d, i) => (
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

        {/* Orders line chart */}
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
              {['L','M','X','J','V','S','D'].map((d, i) => (
                <span key={i} style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', textAlign: 'center', flex: 1 }}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Top products */}
        <div className="vnd-card">
          <div className="vnd-card-header">
            <span className="vnd-card-title">
              <span className="vnd-card-title-dot" style={{ background: '#10b981' }} />
              Top Productos por Ventas
            </span>
          </div>
          <div className="vnd-card-body">
            {topProducts.map((p, i) => (
              <HBar key={i} label={p.name} value={p.sales} max={topMax}
                color={i === 0 ? '#F5C518' : i === 1 ? '#F58A07' : '#10b981'}
              />
            ))}
            {topProducts.length === 0 && (
              <div className="vnd-empty" style={{ padding: '20px 0' }}>
                <div className="vnd-empty-icon">📊</div>
                <p className="vnd-empty-title">Sin datos de ventas</p>
              </div>
            )}
          </div>
        </div>

        {/* Order status donut */}
        <div className="vnd-card">
          <div className="vnd-card-header">
            <span className="vnd-card-title">
              <span className="vnd-card-title-dot" style={{ background: '#8b5cf6' }} />
              Estado de Pedidos
            </span>
          </div>
          <div className="vnd-card-body">
            <Donut segments={orderStatuses} />

            {/* Negotiation rate */}
            <div style={{ marginTop: 20, padding: '14px 0', borderTop: '1px solid var(--vnd-border)' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--vnd-text-muted)', marginBottom: 8 }}>
                Tasa de Negociación
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--vnd-surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '35%', background: 'linear-gradient(90deg, #F5C518, #F58A07)', borderRadius: 99 }} />
                </div>
                <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#F5C518', flexShrink: 0 }}>35%</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--vnd-text-muted)', marginTop: 6 }}>
                de pedidos fueron negociados
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
