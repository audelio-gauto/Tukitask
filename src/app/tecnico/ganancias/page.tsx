'use client';

import { useEffect, useState } from 'react';
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

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza',
  niera: '👶 Niñera',
  cocina: '🍳 Cocina',
  eventos: '🎉 Eventos',
  cuidado_mascotas: '🐾 Mascotas',
  cuidado_adultos: '👴 Adultos',
  aire_split: '❄️ Aire Split',
  electrico: '⚡ Eléctrico',
  plomeria: '🔧 Plomería',
  cerrajeria: '🔑 Cerrajería',
  gestor: '🗂️ Gestor',
  otros: '✨ Otros',
};

function startOf(unit: 'day' | 'week' | 'month' | 'year'): Date {
  const d = new Date();
  if (unit === 'day')   { d.setHours(0, 0, 0, 0); }
  if (unit === 'week')  { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
  if (unit === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
  if (unit === 'year')  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
  return d;
}

export default function GananciasPage() {
  const router = useRouter();
  const { email } = useDriverContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [reportModal, setReportModal] = useState<{ jobId: string; clientEmail: string; clientName: string | null } | null>(null);

  useEffect(() => {
    if (!email) return;
    authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&history=true`)
      .then(r => r.json())
      .then(data => {
        const completed = Array.isArray(data) ? data.filter((j: Job) => j.status === 'completado') : [];
        setJobs(completed);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  const from = startOf(period);
  const filtered = jobs.filter(j => {
    const d = new Date(j.completed_at ?? j.created_at);
    return d >= from;
  });
  const total = filtered.reduce((sum, j) => sum + Number(j.total_price ?? 0), 0);

  const fmtGs  = (n: number) => n === 0 ? '0 Gs.' : `${n.toLocaleString('es-PY')} Gs.`;
  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const PERIODS: { key: 'day' | 'week' | 'month' | 'year'; label: string }[] = [
    { key: 'day',   label: 'Hoy' },
    { key: 'week',  label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'year',  label: 'Año' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#059669', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>💰 Ganancias</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Tus ingresos por servicios</p>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: '#fff', borderRadius: 12, padding: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.82rem',
                background: period === p.key ? '#059669' : 'transparent',
                color: period === p.key ? '#fff' : '#64748b',
                transition: 'background 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Total card */}
        <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: 18, padding: '24px 20px', textAlign: 'center', color: '#fff', marginBottom: 16, boxShadow: '0 4px 16px rgba(5,150,105,0.35)' }}>
          {loading ? (
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>…</div>
          ) : (
            <>
              <div style={{ fontSize: '0.82rem', opacity: 0.85, marginBottom: 4 }}>
                {PERIODS.find(p => p.key === period)?.label}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.5px' }}>{fmtGs(total)}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 4 }}>
                {filtered.length} {filtered.length === 1 ? 'servicio' : 'servicios'} completados
              </div>
            </>
          )}
        </div>

        {/* History list */}
        {!loading && (
          filtered.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 40, color: '#9ca3af' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>💸</div>
              <p style={{ fontWeight: 600, color: '#6b7280' }}>Sin ganancias en este período</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 700, color: '#64748b' }}>Detalle</h3>
              {filtered.map(job => (
                <div key={job.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                        {SERVICE_LABELS[job.service_type] ?? job.service_type}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>
                        {job.client_name && `${job.client_name} · `}{fmtDate(job.completed_at)}
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {fmtGs(Number(job.total_price ?? 0))}
                    </span>
                  </div>
                  {job.client_email && (
                    <button
                      onClick={() => setReportModal({ jobId: job.id, clientEmail: job.client_email!, clientName: job.client_name })}
                      style={{ marginTop: 8, background: 'none', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, color: '#ef4444', fontSize: '0.73rem', padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      🚨 Reportar cliente
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
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
