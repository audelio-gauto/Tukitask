'use client';
import { useState, useEffect, useCallback } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useDriverContext } from '../context';

type Period = 'dia' | 'semana' | 'mes' | 'año';

interface OrderRow {
  status: string;
  created_at: string;
  offer?: number;
  offer_price?: number;
  accepted_price?: number;
  suggested_price?: number;
  origin?: string;
  destination?: string;
  id?: string;
}

function orderPrice(o: OrderRow) {
  return Number(o.offer ?? o.offer_price ?? o.accepted_price ?? o.suggested_price ?? 0);
}

function fmtGs(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PY', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const PERIOD_LABELS: Record<Period, string> = {
  dia: 'Hoy', semana: 'Semana', mes: 'Mes', año: 'Año',
};

const DELIVERED_STATUSES = ['delivered', 'commission_charged', 'client_confirmed', 'returned'];
const FAILED_STATUSES    = ['failed', 'cancelled', 'return_rejected'];

export default function GananciasPage() {
  const { email } = useDriverContext();
  const [period, setPeriod] = useState<Period>('dia');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const fetchOrders = useCallback(async () => {
    if (!email) return;
    try {
      const res = await fetch(
        `/api/orders?driver_email=${encodeURIComponent(email)}&history=true&_t=${Date.now()}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Date boundaries
  const now = new Date();
  const boundaries: Record<Period, Date> = {
    dia:    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    semana: (() => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() - d.getDay()); return d; })(),
    mes:    new Date(now.getFullYear(), now.getMonth(), 1),
    año:    new Date(now.getFullYear(), 0, 1),
  };

  const from = boundaries[period];
  const inPeriod = (o: OrderRow) => new Date(o.created_at) >= from;

  const delivered  = orders.filter(o => DELIVERED_STATUSES.includes(o.status) && inPeriod(o));
  const failed     = orders.filter(o => FAILED_STATUSES.includes(o.status)    && inPeriod(o));
  const earnings   = delivered.reduce((acc, o) => acc + orderPrice(o), 0);
  const total      = delivered.length + failed.length;
  const acceptance = total > 0 ? Math.round((delivered.length / total) * 100) : null;

  // Summary cards for all periods
  const allPeriodEarnings = (Object.keys(boundaries) as Period[]).map(p => ({
    period: p,
    amount: orders
      .filter(o => DELIVERED_STATUSES.includes(o.status) && new Date(o.created_at) >= boundaries[p])
      .reduce((acc, o) => acc + orderPrice(o), 0),
  }));

  return (
    <DriverScreenLayout title="Ganancias">
      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1, padding: '0.55rem 0',
              borderRadius: 12, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.82rem',
              background: period === p ? '#c8ff00' : 'rgba(255,255,255,0.08)',
              color: period === p ? '#111' : '#9ca3af',
              transition: 'all 0.18s',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        /* Skeleton */
        <>
          <div className="tuki-skeleton" style={{ height: 110, borderRadius: 18, marginBottom: '1rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: '1rem' }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="tuki-skeleton" style={{ height: 74, borderRadius: 14 }} />
            ))}
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="tuki-skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 8 }} />
          ))}
        </>
      ) : (
        <>
          {/* Main earnings card */}
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e, #0f172a)',
            borderRadius: 18, padding: '1.5rem 1.25rem',
            marginBottom: '1rem', textAlign: 'center',
            border: '1.5px solid rgba(200,255,0,0.2)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <div style={{ color: '#9ca3af', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              💰 Ganancias • {PERIOD_LABELS[period]}
            </div>
            <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#c8ff00', lineHeight: 1 }}>
              {fmtGs(earnings)}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 6 }}>Guaraníes</div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: '1rem' }}>
            <div style={{
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: 14, padding: '0.75rem 0.5rem', textAlign: 'center',
            }}>
              <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.3rem' }}>{delivered.length}</div>
              <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 2 }}>Entregados</div>
            </div>
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 14, padding: '0.75rem 0.5rem', textAlign: 'center',
            }}>
              <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '1.3rem' }}>{failed.length}</div>
              <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 2 }}>Fallidos</div>
            </div>
            <div style={{
              background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.25)',
              borderRadius: 14, padding: '0.75rem 0.5rem', textAlign: 'center',
            }}>
              <div style={{ fontWeight: 800, color: '#facc15', fontSize: '1.3rem' }}>
                {acceptance !== null ? `${acceptance}%` : '—'}
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 2 }}>Aceptación</div>
            </div>
          </div>

          {/* Summary by all periods */}
          <div style={{
            background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '0.85rem 1rem',
            marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resumen
            </div>
            {allPeriodEarnings.map(({ period: p, amount }) => (
              <div key={p} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.4rem 0',
                borderBottom: p !== 'año' ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ color: p === period ? '#c8ff00' : '#9ca3af', fontWeight: p === period ? 700 : 500, fontSize: '0.88rem' }}>
                  {PERIOD_LABELS[p]}
                </span>
                <span style={{ color: p === period ? '#c8ff00' : '#d1d5db', fontWeight: 800, fontSize: '0.95rem' }}>
                  {fmtGs(amount)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#6b7280' }}>Gs</span>
                </span>
              </div>
            ))}
          </div>

          {/* Recent delivered orders */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pedidos recientes
            </div>
            {delivered.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '2rem 1rem',
                background: 'rgba(255,255,255,0.04)', borderRadius: 16,
                border: '1px dashed rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                <p style={{ color: '#6b7280', margin: 0, fontSize: '0.88rem' }}>
                  Sin pedidos entregados en este período
                </p>
              </div>
            ) : (
              delivered.slice(0, 20).map((o, idx) => (
                <div key={o.id ?? idx} style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '0.75rem 1rem', marginBottom: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', color: '#d1d5db', fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.origin || 'Origen'} → {o.destination || 'Destino'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{fmtDate(o.created_at)}</div>
                  </div>
                  <div style={{ marginLeft: 12, flexShrink: 0 }}>
                    <span style={{
                      background: 'rgba(200,255,0,0.12)', color: '#c8ff00',
                      fontWeight: 800, fontSize: '0.9rem', padding: '3px 10px',
                      borderRadius: 8, border: '1px solid rgba(200,255,0,0.2)',
                    }}>
                      +{fmtGs(orderPrice(o))} Gs
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </DriverScreenLayout>
  );
}
