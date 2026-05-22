'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type TimeoutAction = 'auto_counter' | 'auto_accept' | 'pressure_client';
type TimeoutResultStatus = 'timeout_auto_counter' | 'timeout_auto_accept' | 'timeout_pressure';

interface TimeoutRow {
  id: string;
  product_name: string | null;
  buyer_offer: number;
  counter_amount: number | null;
  final_amount: number | null;
  status: TimeoutResultStatus;
  timeout_action: TimeoutAction;
  timed_out_at: string | null;
}

const TIMEOUT_STATUSES: TimeoutResultStatus[] = ['timeout_auto_counter', 'timeout_auto_accept', 'timeout_pressure'];

const gs = (n: number | null | undefined) => `₲${(n ?? 0).toLocaleString('es-PY')}`;

function timeoutStatusLabel(status: TimeoutResultStatus) {
  if (status === 'timeout_auto_counter') return '🔁 Auto-contraoferta';
  if (status === 'timeout_auto_accept') return '✅ Auto-aceptado';
  return '📢 Presión al cliente';
}

function actionLabel(action: TimeoutAction) {
  if (action === 'auto_accept') return 'Auto-aceptar';
  if (action === 'pressure_client') return 'Presionar';
  return 'Auto-contraoferta';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vnd-card" style={{ marginBottom: 20 }}>
      <div className="vnd-card-header">
        <span className="vnd-card-title">
          <span className="vnd-card-title-dot" />
          {title}
        </span>
      </div>
      <div className="vnd-card-body">{children}</div>
    </div>
  );
}

export default function ResultadosAutomaticosPage() {
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [recentTimeouts, setRecentTimeouts] = useState<TimeoutRow[]>([]);
  const [stats, setStats] = useState({ total: 0, autoCounter: 0, autoAccept: 0, pressure: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const id = user?.id || user?.user_metadata?.store_slug || user?.email || 'default';
      setVendorId(String(id));
    });
  }, []);

  useEffect(() => {
    if (!vendorId) return;
    loadTimeoutStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function loadTimeoutStats() {
    if (!vendorId) return;
    setLoadingStats(true);
    setStatsError(null);
    try {
      const [rowsResp, counterResp, acceptResp, pressureResp] = await Promise.all([
        supabase
          .from('tukibot_negotiations')
          .select('id, product_name, buyer_offer, counter_amount, final_amount, status, timeout_action, timed_out_at')
          .eq('vendor_id', vendorId)
          .in('status', TIMEOUT_STATUSES)
          .order('timed_out_at', { ascending: false })
          .limit(8),
        supabase.from('tukibot_negotiations').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId).eq('status', 'timeout_auto_counter'),
        supabase.from('tukibot_negotiations').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId).eq('status', 'timeout_auto_accept'),
        supabase.from('tukibot_negotiations').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId).eq('status', 'timeout_pressure'),
      ]);
      if (rowsResp.error || counterResp.error || acceptResp.error || pressureResp.error) {
        throw new Error('No se pudieron cargar métricas de timeout.');
      }
      const autoCounter = counterResp.count ?? 0;
      const autoAccept = acceptResp.count ?? 0;
      const pressure = pressureResp.count ?? 0;
      setStats({ total: autoCounter + autoAccept + pressure, autoCounter, autoAccept, pressure });
      setRecentTimeouts((rowsResp.data ?? []) as TimeoutRow[]);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Error cargando métricas.');
    } finally {
      setLoadingStats(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="vnd-page-heading">📊 Resultados Automáticos</h1>
        <p className="vnd-page-sub">Negociaciones procesadas automáticamente por TukiBot</p>
      </div>

      <Section title="📊 Resultados Automáticos">
        {loadingStats ? (
          <p style={{ color: 'var(--vnd-text-muted)', fontSize: '0.85rem' }}>Cargando resultados del TukiBot...</p>
        ) : statsError ? (
          <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#f87171', fontSize: '0.82rem', fontWeight: 700 }}>
            {statsError}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--vnd-surface-2)', border: '1px solid var(--vnd-border)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', fontWeight: 700, marginBottom: 4 }}>TOTAL TIMEOUTS</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--vnd-text-primary)' }}>{stats.total}</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', fontWeight: 700, marginBottom: 4 }}>AUTO-CONTRAOFERTA</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#F5C518' }}>{stats.autoCounter}</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', fontWeight: 700, marginBottom: 4 }}>AUTO-ACEPTADO</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#4ade80' }}>{stats.autoAccept}</div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', fontWeight: 700, marginBottom: 4 }}>PRESIÓN CLIENTE</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#60a5fa' }}>{stats.pressure}</div>
              </div>
            </div>

            <div style={{ borderRadius: 10, border: '1px solid var(--vnd-border)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 12px', background: 'var(--vnd-surface-2)', borderBottom: '1px solid var(--vnd-border)' }}>
                {['Producto', 'Oferta', 'Final', 'Acción', 'Hora'].map(h => (
                  <span key={h} style={{ fontSize: '0.7rem', color: 'var(--vnd-text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>
              {recentTimeouts.length === 0 ? (
                <div style={{ padding: '16px 12px', color: 'var(--vnd-text-muted)', fontSize: '0.82rem' }}>
                  Todavía no hay negociaciones vencidas procesadas por el bot.
                </div>
              ) : (
                recentTimeouts.map(row => (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--vnd-border)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--vnd-text-primary)', fontWeight: 700 }}>{row.product_name || 'Producto sin nombre'}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-secondary)' }}>{gs(row.buyer_offer)}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--vnd-text-secondary)' }}>{gs(row.final_amount ?? row.counter_amount)}</span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--vnd-text-secondary)' }} title={actionLabel(row.timeout_action)}>{timeoutStatusLabel(row.status)}</span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--vnd-text-muted)' }}>
                      {row.timed_out_at ? new Date(row.timed_out_at).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
