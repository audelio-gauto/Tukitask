'use client';
import { useState, useEffect, useCallback } from 'react';
import DriverScreenLayout from '../components/DriverScreenLayout';
import { useWorkerContext } from '../context';
import { authFetch } from '@/lib/authFetch';

type Period = 'dia' | 'semana' | 'mes' | 'año';

interface OrderRow {
  status: string;
  created_at: string;
  offer?: number;
  offer_price?: number;

  suggested_price?: number;
  origin?: string;
  destination?: string;
  id?: string;
  order_stops?: Array<{ sequence: number; address: string; status: string; fail_reason?: string | null }> | null;
}

function orderPrice(o: OrderRow) {
  return Number(o.offer ?? o.suggested_price ?? 0);
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

const STATUS_HUMAN: Record<string, string> = {
  delivered:          'Entregado',
  commission_charged: 'Entregado',
  client_confirmed:   'Confirmado',
  returned:           'Devuelto',
  failed:             'Fallido',
  cancelled:          'Cancelado',
  return_rejected:    'Devolución rechazada',
};

export default function GananciasPage() {
  const { email } = useWorkerContext();
  const [period, setPeriod] = useState<Period>('semana');
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stopsOpen, setStopsOpen] = useState<Record<string, boolean>>({});

  const handleExportPDF = () => {
    window.print();
  };

  const fetchOrders = useCallback(async () => {
    if (!email) return;
    setFetchError(null);
    try {
      const res = await authFetch(
        `/api/orders?driver_email=${encodeURIComponent(email)}&history=true&_t=${Date.now()}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setFetchError(`Error ${res.status}: ${data?.error ?? 'Error del servidor'}`);
        setOrders([]);
      } else {
        setOrders(Array.isArray(data) ? data : []);
        if (!Array.isArray(data)) {
          setFetchError('Respuesta inesperada del servidor');
        }
      }
    } catch (e) {
      setFetchError('Sin conexión');
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

  // Deduplicate by order ID to prevent double-counting if any order appears multiple times
  const seenIds = new Set<string>();
  const uniqueOrders = orders.filter(o => {
    if (!o.id) return true;
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id); return true;
  });

  const delivered  = uniqueOrders.filter(o => DELIVERED_STATUSES.includes(o.status) && inPeriod(o));
  const failed     = uniqueOrders.filter(o => FAILED_STATUSES.includes(o.status)    && inPeriod(o));
  const earnings   = delivered.reduce((acc, o) => acc + orderPrice(o), 0);
  const total      = delivered.length + failed.length;
  const acceptance = total > 0 ? Math.round((delivered.length / total) * 100) : null;

  // Summary cards for all periods
  const allPeriodEarnings = (Object.keys(boundaries) as Period[]).map(p => ({
    period: p,
    amount: uniqueOrders
      .filter(o => DELIVERED_STATUSES.includes(o.status) && new Date(o.created_at) >= boundaries[p])
      .reduce((acc, o) => acc + orderPrice(o), 0),
  }));

  const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const days: { label: string; amount: number }[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const amount   = uniqueOrders
      .filter(o => DELIVERED_STATUSES.includes(o.status))
      .filter(o => { const t = new Date(o.created_at).getTime(); return t >= dayStart && t < dayEnd; })
      .reduce((s, o) => s + orderPrice(o), 0);
    return { label: dayLabels[d.getDay()], amount };
  });
  const maxAmt = Math.max(...days.map(d => d.amount), 1);
  const BAR_H = 72;

  return (
    <DriverScreenLayout title="Ganancias">
      <div className="tuki-earn-page">
        <div className="tuki-earn-periods">
          <div className="tuki-segmented" role="tablist">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                className={period === p ? 'is-active' : ''}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button type="button" className="tuki-earn-export" onClick={handleExportPDF} title="Exportar PDF" aria-label="Exportar PDF">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </svg>
          </button>
        </div>

        {fetchError && <div className="tuki-form-msg is-error">{fetchError}</div>}

        {loading ? (
          <>
            <div className="tuki-skeleton" style={{ height: 130, borderRadius: 18, marginBottom: 12 }} />
            <div className="tuki-earn-stats">
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
            <section className="tuki-wallet-hero">
              <div className="tuki-wallet-balance-label">Ganancias · {PERIOD_LABELS[period]}</div>
              <div className="tuki-wallet-balance" style={{ marginBottom: 4 }}><span>Gs.</span>{fmtGs(earnings)}</div>
              <div className="tuki-earn-sub">
                {delivered.length} {delivered.length === 1 ? 'viaje completado' : 'viajes completados'}
              </div>
            </section>

            <div className="tuki-earn-stats">
              <div className="tuki-wallet-stat">
                <div className="tuki-wallet-stat-value is-in">{delivered.length}</div>
                <div className="tuki-wallet-stat-label">Entregados</div>
              </div>
              <div className="tuki-wallet-stat">
                <div className="tuki-wallet-stat-value is-out">{failed.length}</div>
                <div className="tuki-wallet-stat-label">Fallidos</div>
              </div>
              <div className="tuki-wallet-stat">
                <div className="tuki-wallet-stat-value">{acceptance !== null ? `${acceptance}%` : '—'}</div>
                <div className="tuki-wallet-stat-label">Aceptación</div>
              </div>
            </div>

            <section className="tuki-form-card">
              <div className="tuki-section-label">Últimos 7 días</div>
              <div className="tuki-earn-chart" style={{ height: BAR_H + 22 }}>
                {days.map((d, i) => {
                  const h = Math.max(4, Math.round((d.amount / maxAmt) * BAR_H));
                  const isToday = i === 6;
                  return (
                    <div key={i} className="tuki-earn-bar-col">
                      <div
                        className={`tuki-earn-bar${isToday ? ' is-today' : d.amount > 0 ? ' has-value' : ''}`}
                        style={{ height: h }}
                      />
                      <span className={`tuki-earn-bar-label${isToday ? ' is-today' : ''}`}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="tuki-form-card">
              <div className="tuki-section-label">Resumen</div>
              {allPeriodEarnings.map(({ period: p, amount }) => (
                <div key={p} className={`tuki-earn-summary-row${p === period ? ' is-active' : ''}`}>
                  <span>{PERIOD_LABELS[p]}</span>
                  <strong>{fmtGs(amount)} <small>Gs</small></strong>
                </div>
              ))}
            </section>

            <div className="tuki-list-heading">Pedidos recientes</div>
            {delivered.length === 0 ? (
              <div className="tuki-empty-state">
                <div className="tuki-empty-title">Sin pedidos entregados</div>
                <div>No hay entregas en este período.</div>
              </div>
            ) : (
              delivered.slice(0, 20).map((o, idx) => (
                <div key={o.id ?? idx} className="tuki-tx-row tuki-earn-order">
                  <div className="tuki-tx-main">
                    <div className="tuki-tx-title tuki-earn-route">
                      {o.origin || 'Origen'} → {o.destination || 'Destino'}
                    </div>
                    {o.order_stops && o.order_stops.length > 0 && (
                      <div className="tuki-earn-stops">
                        <button
                          type="button"
                          onClick={() => setStopsOpen(prev => ({ ...prev, [o.id!]: !prev[o.id!] }))}
                        >
                          <span>{o.order_stops.length} paradas de entrega</span>
                          <span>{stopsOpen[o.id!] ? '▲' : '▼'}</span>
                        </button>
                        {stopsOpen[o.id!] && (
                          <div className="tuki-earn-stops-list">
                            {[...o.order_stops].sort((a, b) => a.sequence - b.sequence).map((s, si) => {
                              const isDelivered = s.status === 'delivered';
                              const isFailed = s.status === 'failed';
                              const tone = isDelivered ? 'is-ok' : isFailed ? 'is-fail' : 'is-pending';
                              const icon = isDelivered ? '✓' : isFailed ? '✗' : String(s.sequence);
                              return (
                                <div key={si} className="tuki-earn-stop">
                                  <span className={`tuki-route-stop ${tone}`}>{icon}</span>
                                  <div>
                                    <div>{s.address}</div>
                                    {isFailed && s.fail_reason && <div className="tuki-route-fail">{s.fail_reason}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="tuki-tx-date">{fmtDate(o.created_at)} · {STATUS_HUMAN[o.status] ?? o.status}</div>
                  </div>
                  <div className="tuki-tx-side">
                    <div className="tuki-tx-amount" style={{ color: '#059669' }}>+{fmtGs(orderPrice(o))} Gs</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </DriverScreenLayout>
  );
}
