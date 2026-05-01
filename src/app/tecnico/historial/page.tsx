'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWorkerContext } from '../../driver/context';
import { authFetch } from '@/lib/authFetch';
import DriverScreenLayout from '../../driver/components/DriverScreenLayout';
import ChatModal from '@/components/ChatModal';
import ReportModal from '@/components/ReportModal';
import { Icon } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';

const RatingModalDynamic = dynamic(() => import('@/components/RatingModal'), { ssr: false });

const SERVICE_LABELS: Record<string, string> = {
  limpieza:          'Limpieza',
  niera:             'Niñera',
  cocina:            'Cocina',
  eventos:           'Eventos',
  cuidado_mascotas:  'Cuidado Mascotas',
  cuidado_adultos:   'Cuidado adultos',
  aire_split:        'Tec Aire Split',
  electrico:         'Serv. Eléctrico',
  plomeria:          'Serv. Plomería',
  cerrajeria:        'Serv. Cerrajería',
  gestor:            'Gestor',
  otros:             'Otros',
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentProps<typeof Icon>['name'] }> = {
  completado: { label: 'Completado', icon: 'check' },
  cancelled: { label: 'Cancelado', icon: 'x' },
  incidente: { label: 'Incidente', icon: 'exclamation' },
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
  warranty_days: number | null;
}

export default function TecnicoHistorialPage() {
  const { email, displayName } = useWorkerContext();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
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

  const filtered = jobs;
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
    const st = STATUS_CONFIG[job.status] ?? { label: job.status, icon: 'tag' };
    const statusTone = getStatusTone(job.status);
    const serviceLabel = SERVICE_LABELS[job.service_type ?? ''] ?? (job.service_type ?? '—');
    const existingRating = job.client_rating_given ?? localRatings[job.id] ?? null;

    const refDate = job.completed_at || job.created_at;
    const chatDays = job.warranty_days != null && job.warranty_days > 0 ? job.warranty_days : 1;
    const chatAvailable = refDate
      ? Date.now() - new Date(refDate).getTime() < chatDays * 24 * 60 * 60 * 1000
      : false;

    return (
      <div
        key={job.id}
        className="tuki-card"
        style={{
          marginBottom: 12,
          ['--status-color' as never]: statusTone.color,
          ['--status-bg' as never]: statusTone.bg,
          ['--status-border' as never]: statusTone.border,
          ['--status-outline' as never]: statusTone.border,
        }}
      >
        <div className="tuki-card-header">
          <span className="tuki-card-title">
            <Icon name={st.icon} size={14} color={statusTone.color} />
            {st.label} · {serviceLabel}
          </span>
          <span className="tuki-card-subtitle">{date}</span>
        </div>

        <div className="tuki-card-body">
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              className="tuki-avatar"
              style={{
                background: clientPhoto ? `url(${clientPhoto}) center/cover` : 'linear-gradient(135deg, #F5C518, #F58A07)',
                backgroundSize: 'cover',
                color: '#1C1C2E',
              }}
            >
              {!clientPhoto && (clientName[0]?.toUpperCase() || '?')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{clientName}</div>
              <StarRow rating={existingRating} />
            </div>
            {totalPrice > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div className="tuki-price">₲{totalPrice.toLocaleString('es-PY')}</div>
                <div className="tuki-price-label">total</div>
              </div>
            )}
          </div>

          {/* Address */}
          {job.address && (
            <div className="tuki-address-box" style={{ marginBottom: 10 }}>
              <div className="tuki-address-label">Direccion</div>
              <div className="tuki-address-text">{job.address}</div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div style={{
              background: 'var(--glass-card)', borderRadius: 8,
              padding: '7px 10px', marginBottom: 10,
              fontSize: '0.77rem', color: 'var(--text-secondary)',
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
              fontSize: '0.77rem', color: 'var(--text-muted)',
            }}>
              Base: ₲{Number(job.agreed_price ?? 0).toLocaleString('es-PY')}
              {' + '}Extra: ₲{Number(job.extra_charge).toLocaleString('es-PY')}
              {' = '}
              <strong style={{ color: '#F5C518' }}>₲{totalPrice.toLocaleString('es-PY')}</strong>
            </div>
          ) : null}

          {/* Warranty */}
          {job.warranty_days != null && job.warranty_days > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '5px 10px', marginBottom: 10, fontSize: '0.8rem', fontWeight: 700, color: '#818cf8' }}>
              🛡️ Garantía: {job.warranty_days} {job.warranty_days === 1 ? 'día' : 'días'}
            </div>
          )}

          {/* Chat — solo disponible las primeras 24h */}
          {chatAvailable && (
            <button
              onClick={() => setChatModal({ jobId: job.id, clientName: clientName, clientPhoto: clientPhoto })}
              className="tuki-btn tuki-btn-info tuki-btn-block"
            >
              <Icon name="chat" size={15} /> Chat con el cliente
            </button>
          )}

          {/* Rate button — only for completado and if not yet rated */}
          {job.status === 'completado' && existingRating == null && (
            <button
              onClick={() => { setRatingJob(job); setRatingJobId(job.id); }}
              className="tuki-btn tuki-btn-warning tuki-btn-block"
            >
              <Icon name="star" size={15} /> Calificar Cliente
            </button>
          )}

          {/* Report button */}
          <button
            onClick={() => setReportModal({ jobId: job.id, clientEmail: job.client_email, clientName: job.client_name })}
            className="tuki-btn tuki-btn-danger tuki-btn-sm"
            style={{ marginTop: 8 }}
          >
            <Icon name="exclamation" size={12} />
            Reportar cliente
          </button>
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Historial">
      {/* Skeleton */}
      {loading && [0, 1, 2].map(i => (
        <div key={i} className="tuki-skeleton" style={{ height: 100, borderRadius: 16, marginBottom: 12 }} />
      ))}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <Icon name="clipboard" size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
            Sin trabajos en el historial
          </div>
          <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 6 }}>
            Los trabajos completados o cancelados aparecerán aquí
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
