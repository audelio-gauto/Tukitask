'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWorkerContext } from '../../driver/context';
import { authFetch } from '@/lib/authFetch';
import DriverScreenLayout from '../../driver/components/DriverScreenLayout';
import ChatModal from '@/components/ChatModal';
import ReportModal from '@/components/ReportModal';

const RatingModalDynamic = dynamic(() => import('@/components/RatingModal'), { ssr: false });

const SERVICE_LABELS: Record<string, string> = {
  limpieza:          '🧹 Limpieza',
  niera:             '👶 Niñera',
  cocina:            '🍳 Cocina',
  eventos:           '🎉 Eventos',
  cuidado_mascotas:  '🐾 Cuidado Mascotas',
  cuidado_adultos:   '👴 Cuidado adultos',
  aire_split:        '❄️ Tec Aire Split',
  electrico:         '⚡ Serv. Eléctrico',
  plomeria:          '🔧 Serv. Plomería',
  cerrajeria:        '🔑 Serv. Cerrajería',
  gestor:            '🗂️ Gestor',
  otros:             '✨ Otros',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  completado: { label: '✅ Completado',  color: '#10b981' },
  cancelled:  { label: '❌ Cancelado',   color: '#ef4444' },
  incidente:  { label: '⚠️ Incidente',   color: '#f59e0b' },
};

function StarRow({ rating }: { rating: number | null }) {
  if (!rating) return <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>Sin calificación</span>;
  return (
    <span style={{ color: '#f59e0b', fontSize: '0.9rem' }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))} {Number(rating).toFixed(1)}
    </span>
  );
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-PY', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

type Filter = 'all' | 'completado' | 'cancelled';

interface Job {
  id: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  service_type: string | null;
  client_name: string | null;
  client_email: string;
  client_photo: string | null;
  client_rating: number | null;          // snapshot al crear
  client_rating_given: number | null;   // calificación del técnico al cliente
  address: string | null;
  agreed_price: number | null;
  extra_charge: number | null;
  total_price: number | null;
  description: string | null;
  tecnico_rating: number | null;
}

export default function TecnicoHistorialPage() {
  const { email, displayName } = useWorkerContext();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [ratingJobId, setRatingJobId] = useState<string | null>(null);
  const [ratingJob, setRatingJob] = useState<Job | null>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [chatModal, setChatModal] = useState<{ jobId: string; clientName: string | null; clientPhoto: string | null } | null>(null);
  const [reportModal, setReportModal] = useState<{ jobId: string; clientEmail: string; clientName: string | null } | null>(null);

  const fetchHistory = useCallback(() => {
    if (!email) return;
    setLoading(true);
    authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&history=true`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setJobs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const filtered = jobs.filter(j => filter === 'all' || j.status === filter);
  const todayJobs = filtered.filter(j => isToday(j.completed_at || j.created_at));
  const olderJobs = filtered.filter(j => !isToday(j.completed_at || j.created_at));

  const handleSubmitRating = async (rating: number, note: string) => {
    if (!ratingJobId) return;
    const res = await authFetch('/api/tecnico/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rate_client', jobId: ratingJobId, rating, note }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setLocalRatings(prev => ({ ...prev, [ratingJobId]: rating }));
    setRatingJobId(null);
    setRatingJob(null);
  };

  const renderCard = (job: Job) => {
    const clientName = job.client_name || job.client_email?.split('@')[0] || 'Cliente';
    const clientPhoto = job.client_photo || null;
    const totalPrice = Number(job.total_price ?? job.agreed_price ?? 0);
    const date = fmtDate(job.completed_at || job.created_at);
    const st = STATUS_CONFIG[job.status] ?? { label: job.status, color: '#9ca3af' };
    const serviceLabel = SERVICE_LABELS[job.service_type ?? ''] ?? (job.service_type ?? '—');
    const existingRating = job.client_rating_given ?? localRatings[job.id] ?? null;

    const refDate = job.completed_at || job.created_at;
    const chatAvailable = refDate
      ? Date.now() - new Date(refDate).getTime() < 24 * 60 * 60 * 1000
      : false;

    return (
      <div key={job.id} style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 16,
        marginBottom: 12,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Header */}
        <div style={{
          background: job.status === 'completado'
            ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.18))'
            : job.status === 'incidente'
              ? 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(217,119,6,0.18))'
              : 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(220,38,38,0.12))',
          borderBottom: `1px solid ${st.color}33`,
          padding: '0.65rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: st.color, fontWeight: 700, fontSize: '0.85rem' }}>
            {st.label} · {serviceLabel}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>{date}</span>
        </div>

        {/* Body */}
        <div style={{ padding: '0.85rem 1rem' }}>
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: clientPhoto ? `url(${clientPhoto}) center/cover` : 'linear-gradient(135deg, #F5C518, #F58A07)',
              backgroundSize: 'cover',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1C1C2E', fontWeight: 700, fontSize: '1.1rem',
              border: '2px solid rgba(255,255,255,0.12)',
            }}>
              {!clientPhoto && (clientName[0]?.toUpperCase() || '?')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{clientName}</div>
              <StarRow rating={existingRating} />
            </div>
            {totalPrice > 0 && (
              <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '1rem' }}>
                ₲{totalPrice.toLocaleString('es-PY')}
              </div>
            )}
          </div>

          {/* Address */}
          {job.address && (
            <div style={{
              background: 'rgba(0,0,0,0.25)', borderRadius: 10,
              padding: '8px 12px', marginBottom: 10,
              fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)',
            }}>
              📍 {job.address}
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 8,
              padding: '7px 10px', marginBottom: 10,
              fontSize: '0.77rem', color: 'rgba(255,255,255,0.55)',
              fontStyle: 'italic',
            }}>
              "{job.description}"
            </div>
          )}

          {/* Price breakdown */}
          {job.extra_charge && Number(job.extra_charge) > 0 ? (
            <div style={{
              background: 'rgba(245,197,24,0.08)', borderRadius: 8,
              padding: '6px 10px', marginBottom: 10,
              fontSize: '0.77rem', color: 'rgba(255,255,255,0.5)',
            }}>
              Base: ₲{Number(job.agreed_price ?? 0).toLocaleString('es-PY')}
              {' + '}Extra: ₲{Number(job.extra_charge).toLocaleString('es-PY')}
              {' = '}
              <strong style={{ color: '#F5C518' }}>₲{totalPrice.toLocaleString('es-PY')}</strong>
            </div>
          ) : null}

          {/* Chat — solo disponible las primeras 24h */}
          {chatAvailable && (
            <button
              onClick={() => setChatModal({ jobId: job.id, clientName: clientName, clientPhoto: clientPhoto })}
              style={{
                width: '100%', padding: '9px', borderRadius: 10,
                border: '1px solid rgba(99,180,255,0.3)',
                background: 'rgba(59,130,246,0.12)',
                color: '#60a5fa', fontWeight: 700, fontSize: '0.83rem',
                cursor: 'pointer', marginBottom: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              💬 Chat con el cliente
            </button>
          )}

          {/* Rate button — only for completado and if not yet rated */}
          {job.status === 'completado' && existingRating == null && (
            <button
              onClick={() => { setRatingJob(job); setRatingJobId(job.id); }}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 10, border: 'none',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #F5C518, #f59e0b)',
                color: '#1C1C2E', fontWeight: 700, fontSize: '0.88rem', marginTop: 2,
              }}
            >
              ⭐ Calificar Cliente
            </button>
          )}

          {/* Report button */}
          <button
            onClick={() => setReportModal({ jobId: job.id, clientEmail: job.client_email, clientName: job.client_name })}
            style={{
              marginTop: 8, background: 'none',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, color: 'rgba(239,68,68,0.65)',
              fontSize: '0.72rem', padding: '5px 12px',
              cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Reportar cliente
          </button>
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Historial">
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'completado', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.35rem 0.85rem',
              borderRadius: 9999,
              border: 'none',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              background: filter === f ? '#F5C518' : '#f1f5f9',
              color: filter === f ? '#1C1C2E' : '#64748b',
              transition: 'all 0.15s',
            }}
          >
            {f === 'all' ? 'Todos' : f === 'completado' ? '✅ Completados' : '❌ Cancelados'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#9ca3af', alignSelf: 'center' }}>
          {filtered.length} {filtered.length === 1 ? 'trabajo' : 'trabajos'}
        </span>
      </div>

      {/* Skeleton */}
      {loading && [0, 1, 2].map(i => (
        <div key={i} className="tuki-skeleton" style={{ height: 100, borderRadius: 16, marginBottom: 12 }} />
      ))}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'rgba(255,255,255,0.7)' }}>
            Sin trabajos en el historial
          </div>
          <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 6 }}>
            {filter === 'all'
              ? 'Los trabajos completados o cancelados aparecerán aquí'
              : 'No hay trabajos con ese filtro'}
          </div>
        </div>
      )}

      {/* Today section */}
      {!loading && todayJobs.length > 0 && (
        <>
          <p style={{ color: '#9ca3af', fontSize: '0.82rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Hoy ({todayJobs.length})
          </p>
          {todayJobs.map(renderCard)}
        </>
      )}

      {/* Older section */}
      {!loading && olderJobs.length > 0 && (
        <>
          <p style={{ color: '#9ca3af', fontSize: '0.82rem', fontWeight: 700, margin: '12px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Anteriores ({olderJobs.length})
          </p>
          {olderJobs.map(renderCard)}
        </>
      )}

      {/* Chat modal */}
      {chatModal && (
        <ChatModal
          open
          onClose={() => setChatModal(null)}
          jobId={chatModal.jobId}
          myEmail={email}
          myName={displayName || null}
          otherName={chatModal.clientName}
          otherPhoto={chatModal.clientPhoto}
        />
      )}

      {/* Report modal */}
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

      {/* Rating modal */}
      {ratingJobId && ratingJob && (
        <RatingModalDynamic
          title={`Calificar a ${ratingJob.client_name || ratingJob.client_email?.split('@')[0] || 'Cliente'}`}
          subtitle="¿Cómo fue tu experiencia con este cliente?"
          avatarUrl={ratingJob.client_photo || undefined}
          avatarName={ratingJob.client_name || ratingJob.client_email?.split('@')[0]}
          onSubmit={handleSubmitRating}
          onClose={() => { setRatingJobId(null); setRatingJob(null); }}
        />
      )}
    </DriverScreenLayout>
  );
}
