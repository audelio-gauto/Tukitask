'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/* ── Helpers ─────────────────────────────────────────────── */
function fmtGs(n: number) {
  return '₲\u00a0' + new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

/* ── Weekly Bar Chart (pure SVG, zero deps) ──────────────── */
function WeekChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max    = Math.max(...data, 1);
  const BAR_W  = 32;
  const GAP    = 18;
  const H      = 130;
  const PAD_L  = 8;
  const totalW = PAD_L + data.length * (BAR_W + GAP) - GAP + PAD_L;
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0

  return (
    <svg
      viewBox={`0 0 ${totalW} ${H + 46}`}
      width="100%"
      style={{ overflow: 'visible', display: 'block' }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = 8 + H - ratio * H;
        return (
          <line key={ratio} x1={0} y1={y} x2={totalW} y2={y}
            stroke="var(--vnd-chart-grid)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6}
          />
        );
      })}

      {data.map((val, i) => {
        const barH = Math.max((val / max) * H, val > 0 ? 6 : 0);
        const x    = PAD_L + i * (BAR_W + GAP);
        const y    = 8 + H - barH;
        const isToday = i === todayIdx;
        const fill    = isToday ? 'var(--vnd-chart-bar-alt)' : 'var(--vnd-chart-bar)';
        const opacity = val === 0 ? 0.18 : 1;

        return (
          <g key={i}>
            <rect x={x} y={8} width={BAR_W} height={H} rx={6} fill={fill} opacity={0.06} />
            <rect x={x} y={y} width={BAR_W} height={barH} rx={6} fill={fill} opacity={opacity} />
            {isToday && (
              <rect x={x - 1} y={y - 1} width={BAR_W + 2} height={barH + 2} rx={7}
                fill="none" stroke={fill} strokeWidth={1.5} opacity={0.5}
              />
            )}
            {val > 0 && (
              <text x={x + BAR_W / 2} y={y - 5}
                textAnchor="middle" fontSize={9} fontWeight={700}
                fill={isToday ? 'var(--vnd-chart-bar-alt)' : 'var(--vnd-text-muted)'}
              >
                {new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 0 }).format(val)}
              </text>
            )}
            <text x={x + BAR_W / 2} y={H + 28}
              textAnchor="middle" fontSize={11} fontWeight={isToday ? 800 : 600}
              fill={isToday ? '#F5C518' : 'var(--vnd-text-muted)'}
            >
              {labels[i]}
            </text>
            {isToday && <circle cx={x + BAR_W / 2} cy={H + 38} r={3} fill="#F5C518" />}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Order status badge ──────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:           { cls: 'vnd-badge-amber',  label: 'En espera' },
    preparing:         { cls: 'vnd-badge-blue',   label: 'Preparando' },
    ready:             { cls: 'vnd-badge-gold',   label: 'Listo' },
    in_transit:        { cls: 'vnd-badge-purple', label: 'En camino' },
    delivered:         { cls: 'vnd-badge-green',  label: 'Entregado' },
    commission_charged:{ cls: 'vnd-badge-green',  label: 'Cobrado' },
    cancelled:         { cls: 'vnd-badge-red',    label: 'Cancelado' },
  };
  const { cls, label } = map[status] ?? { cls: 'vnd-badge-gray', label: status };
  return <span className={`vnd-badge ${cls}`}>{label}</span>;
}

/* ── Stat card ───────────────────────────────────────────── */
function StatCard({
  label, value, sub, icon, accentColor, iconBg, trend, trendUp,
}: {
  label: string; value: string; sub: string; icon: string;
  accentColor: string; iconBg: string; trend?: string; trendUp?: boolean;
}) {
  return (
    <div className="vnd-stat-card" style={{ ['--vnd-stat-accent' as string]: accentColor, ['--vnd-stat-icon-bg' as string]: iconBg }}>
      <div className="vnd-stat-top">
        <span className="vnd-stat-label">{label}</span>
        <div className="vnd-stat-icon">{icon}</div>
      </div>
      <div className="vnd-stat-value">{value}</div>
      {trend && (
        <div className={`vnd-stat-trend ${trendUp ? 'up' : trendUp === false ? 'down' : 'neutral'}`}>
          {trendUp === true  && '↑'}
          {trendUp === false && '↓'}
          {trendUp === undefined && '─'}
          {' '}{trend}
        </div>
      )}
      <div style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function getWeekdayDataRows(rows: Array<{ created_at?: string | null; total?: number | null }>) {
  const weekData = Array(7).fill(0);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  for (const row of rows) {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
    if (createdAt < start) continue;
    const idx = (createdAt.getDay() + 6) % 7;
    weekData[idx] += Number(row.total ?? 0);
  }

  return weekData;
}

export default function VendedorDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    salesTotal: 0,
    ordersTotal: 0,
    productsOnline: 0,
    negotiations: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Array<{
    id: string;
    time: string;
    client: string;
    items: number;
    total: number;
    status: string;
  }>>([]);
  const [weekData, setWeekData] = useState<number[]>(Array(7).fill(0));

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const [productsRes, ordersRes, negRes] = await Promise.all([
          supabase
            .from('products')
            .select('id, status, vendor_id')
            .eq('vendor_id', user.id),
          supabase
            .from('market_orders')
            .select('id, total, status, client_name, items, created_at, vendor_id')
            .eq('vendor_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('tukibot_negotiations')
            .select('id, status, vendor_id, expires_at')
            .eq('vendor_id', user.id)
            .gt('expires_at', new Date().toISOString())
        ]);

        const productRows = productsRes.data ?? [];
        const orderRows = ordersRes.data ?? [];
        const negRows = negRes.data ?? [];

        const salesTotal = (orderRows as Array<{ total?: number | null }>).reduce((sum, row) => {
          const status = String(row.status ?? '');
          if (status === 'cancelled') return sum;
          return sum + Number(row.total ?? 0);
        }, 0);

        const productsOnline = productRows.filter((row) => String(row.status) === 'published').length;
        const negotiations = negRows.length;

        if (isMounted) {
          setStats({
            salesTotal,
            ordersTotal: orderRows.length,
            productsOnline,
            negotiations,
          });

          setRecentOrders((orderRows as Array<{ id: string; created_at?: string | null; client_name?: string | null; items?: number | null; total?: number | null; status?: string | null }>).map((order) => ({
            id: `#${String(order.id).slice(-4)}`,
            time: order.created_at ?? new Date().toISOString(),
            client: order.client_name || 'Cliente',
            items: Number(order.items ?? 0),
            total: Number(order.total ?? 0),
            status: String(order.status ?? 'pending'),
          })));

          setWeekData(getWeekdayDataRows(orderRows as Array<{ created_at?: string | null; total?: number | null }>));
        }
      } catch (error) {
        console.error('Vendor dashboard fetch failed:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const weekLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  if (loading) {
    return (
      <div>
        <div style={{ height: 28, width: 200, borderRadius: 8, marginBottom: 8 }} className="vnd-skeleton" />
        <div style={{ height: 16, width: 280, borderRadius: 6, marginBottom: 28 }} className="vnd-skeleton" />
        <div className="vnd-stats-grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="vnd-stat-card" style={{ minHeight: 110 }}>
              <div style={{ height: 14, width: '60%', borderRadius: 6 }} className="vnd-skeleton" />
              <div style={{ height: 32, width: '80%', borderRadius: 8, marginTop: 8 }} className="vnd-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="vnd-page-heading">Vista General</h1>
      <p className="vnd-page-sub">
        Bienvenido a TukiMarket · {new Date().toLocaleDateString('es-PY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <div className="vnd-stats-grid">
        <StatCard
          label="Ventas Totales"
          value={fmtGs(stats.salesTotal)}
          sub="Ingresos acumulados"
          icon="💰"
          accentColor="#F5C518"
          iconBg="rgba(245,197,24,0.12)"
          trend={stats.salesTotal > 0 ? 'Actualizado' : 'Sin datos aún'}
          trendUp={stats.salesTotal > 0}
        />
        <StatCard
          label="Pedidos Totales"
          value={String(stats.ordersTotal)}
          sub="Órdenes recibidas"
          icon="🛒"
          accentColor="#F58A07"
          iconBg="rgba(245,138,7,0.12)"
          trend={stats.ordersTotal > 0 ? 'Pedidos activos' : 'Sin datos aún'}
          trendUp={stats.ordersTotal > 0}
        />
        <StatCard
          label="Productos Online"
          value={String(stats.productsOnline)}
          sub="Activos en catálogo"
          icon="📦"
          accentColor="#10b981"
          iconBg="rgba(16,185,129,0.12)"
          trend={stats.productsOnline > 0 ? 'Catálogo visible' : 'Sin datos aún'}
          trendUp={stats.productsOnline > 0}
        />
        <StatCard
          label="Negociaciones"
          value={String(stats.negotiations)}
          sub="En proceso ahora"
          icon="🤝"
          accentColor="#8b5cf6"
          iconBg="rgba(139,92,246,0.12)"
          trend={stats.negotiations > 0 ? 'Abiertas' : 'Sin datos aún'}
          trendUp={stats.negotiations > 0}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        <div className="vnd-card">
          <div className="vnd-card-header">
            <span className="vnd-card-title">
              <span className="vnd-card-title-dot" />
              Tendencia de Ventas — Esta semana
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--vnd-text-muted)' }}>
              {new Date().toLocaleDateString('es-PY', { month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="vnd-card-body">
            {weekData.every(v => v === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
                <WeekChart data={weekData} labels={weekLabels} />
                <p style={{ fontSize: '0.8rem', color: 'var(--vnd-text-muted)', marginTop: 8, textAlign: 'center' }}>
                  Publicá tu primer producto para ver datos de ventas aquí
                </p>
              </div>
            ) : (
              <div className="vnd-chart-container">
                <WeekChart data={weekData} labels={weekLabels} />
              </div>
            )}
          </div>
        </div>

        <div className="vnd-card">
          <div className="vnd-card-header">
            <span className="vnd-card-title">
              <span className="vnd-card-title-dot" style={{ background: '#F58A07' }} />
              Últimos Pedidos
            </span>
            <Link href="/vendedor/pedidos" className="vnd-card-link">Ver todos →</Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentOrders.length === 0 ? (
              <div className="vnd-empty">
                <div className="vnd-empty-icon">📭</div>
                <p className="vnd-empty-title">Sin pedidos aún</p>
                <p className="vnd-empty-sub">Cuando recibas pedidos aparecerán aquí</p>
              </div>
            ) : (
              recentOrders.map((order, i) => (
                <div key={order.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 22px',
                  borderBottom: i < recentOrders.length - 1 ? '1px solid var(--vnd-border)' : 'none',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', fontFamily: 'monospace' }}>
                        {fmtTime(order.time)}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--vnd-text-primary)' }}>
                        {order.id}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.76rem', color: 'var(--vnd-text-muted)' }}>
                      {order.client} · {order.items} artículo{order.items !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--vnd-text-primary)' }}>
                      {fmtGs(order.total)}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/vendedor/productos" className="vnd-btn vnd-btn-primary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Añadir Producto
        </Link>
        <Link href="/vendedor/configuracion" className="vnd-btn vnd-btn-secondary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configurar Robot
        </Link>
        <Link href="/vendedor/analisis" className="vnd-btn vnd-btn-secondary">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Ver Reportes
        </Link>
      </div>
    </div>
  );
}
