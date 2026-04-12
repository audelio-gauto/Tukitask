'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../../driver/context';
import { authFetch } from '@/lib/authFetch';
import ReportModal from '@/components/ReportModal';

interface Job {
  id: string;
  created_at: string;
  completed_at: string | null;
  service_type: string;
  client_name: string | null;
  client_email: string | null;
  total_price: number | null;
  status: string;
}

type Period = 'dia' | 'semana' | 'mes' | 'año';

const PERIOD_LABELS: Record<Period, string> = {
  dia: 'Hoy', semana: 'Semana', mes: 'Mes', año: 'Año',
};

const SERVICE_LABELS: Record<string, string> = {
  limpieza: 'Limpieza',
  niera: 'Niñera',
  cocina: 'Cocina',
  eventos: 'Eventos',
  cuidado_mascotas: 'Mascotas',
  cuidado_adultos: 'Adultos',
  aire_split: 'Aire Split',
  electrico: 'Eléctrico',
  plomeria: 'Plomería',
  cerrajeria: 'Cerrajería',
  gestor: 'Gestor',
  otros: 'Otros',
};

function startOf(unit: Period): Date {
  const d = new Date();
  if (unit === 'dia')    { d.setHours(0, 0, 0, 0); }
  if (unit === 'semana') { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
  if (unit === 'mes')    { d.setDate(1); d.setHours(0, 0, 0, 0); }
  if (unit === 'año')    { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
  return d;
}

function fmtGs(n: number) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-PY', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function TecnicoGananciasPage() {
  const router = useRouter();
  const { email } = useDriverContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('mes');
  const [reportModal, setReportModal] = useState<{ jobId: string; clientEmail: string; clientName: string | null } | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!email) return;
    try {
      const res = await authFetch(
        `/api/tecnico/jobs?email=${encodeURIComponent(email)}&history=true`,
      );
      const data = await res.json();
      const completed = Array.isArray(data)
        ? data.filter((j: Job) => j.status === 'completado')
        : [];
      setJobs(completed);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Period boundaries — recomputed each render so they stay current
  const boundaries: Record<Period, Date> = {
    dia:    startOf('dia'),
    semana: startOf('semana'),
    mes:    startOf('mes'),
    año:    startOf('año'),
  };

  const from     = boundaries[period];
  const filtered = jobs.filter(j => new Date(j.completed_at ?? j.created_at) >= from);
  const earnings = filtered.reduce((acc, j) => acc + Number(j.total_price ?? 0), 0);

  const allPeriodEarnings = (Object.keys(boundaries) as Period[]).map(p => ({
    period: p,
    amount: jobs
      .filter(j => new Date(j.completed_at ?? j.created_at) >= boundaries[p])
      .reduce((acc, j) => acc + Number(j.total_price ?? 0), 0),
  }));

  return (
    <div style={{ minHeight: '100dvh', background: '#13131F', color: '#fff' }}>

      {/* ── Header ── */}
      <div style={{
        background: '#1C1C2E',
        borderBottom: '1px solid rgba(245,197,24,0.12)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>Ganancias</h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Tus ingresos por servicios</p>
        </div>
        <button
          onClick={fetchJobs}
          style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(245,197,24,0.25)',
            background: 'rgba(245,197,24,0.1)', color: '#F5C518', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>

      <div style={{ padding: '16px 14px', paddingBottom: 100 }}>

        {/* ── Period selector ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex: 1, padding: '0.55rem 0',
                borderRadius: 12, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.82rem',
                background: period === p
                  ? 'linear-gradient(135deg, #F5C518, #F58A07)'
                  : 'rgba(255,255,255,0.06)',
                color: period === p ? '#1C1C2E' : 'rgba(255,255,255,0.5)',
                transition: 'all 0.18s',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading ? (
          /* ── Skeleton ── */
          <>
            <div className="tuki-skeleton" style={{ height: 120, borderRadius: 18, marginBottom: '1rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
              {[0, 1].map(i => (
                <div key={i} className="tuki-skeleton" style={{ height: 74, borderRadius: 14 }} />
              ))}
            </div>
            {[0, 1, 2].map(i => (
              <div key={i} className="tuki-skeleton" style={{ height: 68, borderRadius: 14, marginBottom: 8 }} />
            ))}
          </>
        ) : (
          <>
            {/* ── Main earnings card ── */}
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e, #0f172a)',
              borderRadius: 18, padding: '1.5rem 1.25rem',
              marginBottom: '1rem', textAlign: 'center',
              border: '1.5px solid rgba(245,197,24,0.2)',
              boxShadow: '0 4px 24px rgba(245,197,24,0.08)',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                Ganancias · {PERIOD_LABELS[period]}
              </div>
              <div style={{ fontSize: '2.8rem', fontWeight: 900, color: '#F5C518', lineHeight: 1 }}>
                {fmtGs(earnings)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem', marginTop: 6 }}>
                Guaraníes · {filtered.length} {filtered.length === 1 ? 'servicio' : 'servicios'}
              </div>
            </div>

            {/* ── Stats row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
              <div style={{
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 14, padding: '0.75rem 0.5rem', textAlign: 'center',
              }}>
                <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.5rem' }}>{filtered.length}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', marginTop: 2 }}>Completados</div>
              </div>
              <div style={{
                background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.2)',
                borderRadius: 14, padding: '0.75rem 0.5rem', textAlign: 'center',
              }}>
                <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '1.5rem' }}>{jobs.length}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', marginTop: 2 }}>Total histórico</div>
              </div>
            </div>

            {/* ── Summary by all periods ── */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '0.85rem 1rem',
              marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Resumen
              </div>
              {allPeriodEarnings.map(({ period: p, amount }) => (
                <div key={p} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.4rem 0',
                  borderBottom: p !== 'año' ? '1px solid rgba(255,255,255,0.05)' : 'none',
                }}>
                  <span style={{
                    color: p === period ? '#F5C518' : 'rgba(255,255,255,0.45)',
                    fontWeight: p === period ? 700 : 500, fontSize: '0.88rem',
                  }}>
                    {PERIOD_LABELS[p]}
                  </span>
                  <span style={{
                    color: p === period ? '#F5C518' : 'rgba(255,255,255,0.8)',
                    fontWeight: 800, fontSize: '0.95rem',
                  }}>
                    {fmtGs(amount)}{' '}
                    <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.3)' }}>Gs</span>
                  </span>
                </div>
              ))}
            </div>

            {/* ── Services list ── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Servicios recientes
              </div>

              {filtered.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '2.5rem 1rem',
                  background: 'rgba(255,255,255,0.03)', borderRadius: 16,
                  border: '1px dashed rgba(255,255,255,0.07)',
                }}>
                  <svg style={{ width: 40, height: 40, marginBottom: 10, opacity: 0.3 }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  <p style={{ color: 'rgba(255,255,255,0.3)', margin: 0, fontSize: '0.88rem' }}>
                    Sin servicios completados en este período
                  </p>
                </div>
              ) : (
                filtered.slice(0, 30).map((job) => (
                  <div key={job.id} style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.07)',
                    padding: '0.8rem 1rem', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                        <div style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 700, marginBottom: 2 }}>
                          {SERVICE_LABELS[job.service_type] ?? job.service_type}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.35)' }}>
                          {job.client_name && `${job.client_name} · `}{fmtDate(job.completed_at)}
                        </div>
                      </div>
                      <span style={{
                        background: 'rgba(245,197,24,0.12)', color: '#F5C518',
                        fontWeight: 800, fontSize: '0.9rem', padding: '3px 10px',
                        borderRadius: 8, border: '1px solid rgba(245,197,24,0.2)',
                        flexShrink: 0,
                      }}>
                        +{fmtGs(Number(job.total_price ?? 0))} Gs
                      </span>
                    </div>

                    {job.client_email && (
                      <button
                        onClick={() => setReportModal({ jobId: job.id, clientEmail: job.client_email!, clientName: job.client_name })}
                        style={{
                          marginTop: 8, background: 'none',
                          border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 8, color: 'rgba(239,68,68,0.7)',
                          fontSize: '0.72rem', padding: '4px 10px',
                          cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        Reportar cliente
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {reportModal && email && (
        <ReportModal
          reporterEmail={email}
          reporterRole="tecnico"
          reportedEmail={reportModal.clientEmail}
          reportedRole="cliente"
          reportedName={reportModal.clientName ?? undefined}
          referenceType="job"
          referenceId={reportModal.jobId}
          onClose={() => setReportModal(null)}
        />
      )}
    </div>
  );
}
