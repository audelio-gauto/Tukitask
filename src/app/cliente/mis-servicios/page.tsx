'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useClientContext } from '../context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { playClientOfferAlert as playOfferAlert, playStatusSound } from '@/lib/audio';
import RatingModal from '@/components/RatingModal';

const TecnicoTrackMap = dynamic(() => import('./TecnicoTrackMap'), { ssr: false });

interface Job {
  id: string;
  created_at: string;
  status: string;
  service_type: string;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_at: string | null;
  client_initial_price: number | null;
  agreed_price: number | null;
  extra_charge: number | null;
  total_price: number | null;
  completion_attempts: number;
  last_rejection_reason: string | null;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
}

interface DriverLocation {
  lat: number;
  lng: number;
  updated_at: string;
}

interface Offer {
  id: string;
  tecnico_email: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  proposed_price: number;
  note: string | null;
  distance_km: number | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza', niera: '👶 Niñera', cocina: '🍳 Cocina',
  eventos: '🎉 Eventos', cuidado_mascotas: '🐾 Mascotas', cuidado_adultos: '👴 Adultos',
  aire_split: '❄️ Aire Split', electrico: '⚡ Eléctrico', plomeria: '🔧 Plomería',
  cerrajeria: '🔑 Cerrajería', otros: '✨ Otros',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; step: number }> = {
  pending:            { label: 'Buscando técnico…',   color: '#C8960A', bg: '#FEF9E7', step: 0 },
  accepted:           { label: 'Técnico confirmado',  color: '#059669', bg: '#d1fae5', step: 1 },
  en_camino:          { label: 'En camino',           color: '#0ea5e9', bg: '#e0f2fe', step: 2 },
  llegue:             { label: 'Llegó',               color: '#C8960A', bg: '#FEF9E7', step: 3 },
  en_proceso:         { label: 'En proceso',          color: '#d97706', bg: '#fef3c7', step: 4 },
  completion_pending: { label: '¿Completado?',        color: '#C8960A', bg: '#FEF9E7', step: 5 },
  completado:         { label: 'Completado ✅',       color: '#059669', bg: '#d1fae5', step: 6 },
  incidente:          { label: 'Incidente ⚠️',        color: '#ef4444', bg: '#fee2e2', step: 6 },
  cancelled:          { label: 'Cancelado',           color: '#94a3b8', bg: '#f1f5f9', step: 6 },
};

const STEPS = ['Aceptado', 'En camino', 'Llegó', 'En proceso', 'Confirmación'];

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span style={{ color: '#F5C518', fontSize: '0.82rem', letterSpacing: 1 }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
    </span>
  );
}

function PulseDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#F5C518',
          animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'inline-block',
        }} />
      ))}
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}

export default function MisServiciosPage() {
  const router = useRouter();
  const { email } = useClientContext();

  const [jobs, setJobs]         = useState<Job[]>([]);
  const [loading, setLoading]   = useState(true);
  const [offers, setOffers]     = useState<Record<string, Offer[]>>({});
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ jobId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [driverLocs, setDriverLocs] = useState<Record<string, DriverLocation | null>>({});
  const [historyJobs, setHistoryJobs] = useState<Job[]>([]);
  const [ratingModal, setRatingModal] = useState<{ jobId: string; tecnicoName: string | null; tecnicoPhoto: string | null } | null>(null);
  const jobStatusRef      = useRef<Record<string, string>>({});
  const prevOfferCountRef = useRef<Record<string, number>>({});
  const newOfferJobRef    = useRef<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!email) return;
    try {
      const res  = await fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      data.forEach((j: Job) => {
        const prev = jobStatusRef.current[j.id];
        if (prev && prev !== j.status) playStatusSound(j.status);
        jobStatusRef.current[j.id] = j.status;
      });
      setJobs(data);
      setLoading(false);

      // Fetch live location for active (non-pending) jobs with a tecnico
      const trackableStatuses = ['accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'];
      const trackableJobs = data.filter((j: Job) => trackableStatuses.includes(j.status));
      for (const job of trackableJobs) {
        const locRes  = await fetch(`/api/driver-location?job_id=${job.id}`);
        const locData = await locRes.json();
        setDriverLocs(prev => ({ ...prev, [job.id]: locData ?? null }));
      }

      const pendingIds = data.filter((j: Job) => j.status === 'pending').map((j: Job) => j.id);
      for (const jobId of pendingIds) {
        const offerRes  = await fetch(`/api/tecnico/jobs?job_offers=${jobId}`);
        const offerData = await offerRes.json();
        if (Array.isArray(offerData)) {
          const prevCount = prevOfferCountRef.current[jobId] ?? 0;
          if (offerData.length > prevCount && prevCount > 0) {
            playOfferAlert();
            newOfferJobRef.current = jobId;
            setTimeout(() => { newOfferJobRef.current = null; }, 3000);
          }
          prevOfferCountRef.current[jobId] = offerData.length;
          setOffers(prev => ({ ...prev, [jobId]: offerData }));
        }
      }
    } catch { setLoading(false); }
  }, [email]);

  const loadHistory = useCallback(async () => {
    if (!email) return;
    try {
      const res  = await fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_history=true`);
      const data = await res.json();
      if (Array.isArray(data)) setHistoryJobs(data);
    } catch {}
  }, [email]);

  useEffect(() => {
    loadJobs();
    loadHistory();
    // Fallback polling at 60s; realtime is primary
    const iv1 = setInterval(loadJobs,    60_000);
    const iv2 = setInterval(loadHistory, 60_000);

    // Realtime: job status changes + new offers for client's jobs
    const ch = email
      ? supabase.channel(`client-servicios-${email}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tecnico_jobs',
            filter: `client_email=eq.${email}`,
          } as never, () => { loadJobs(); loadHistory(); })
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'tecnico_job_offers',
          } as never, () => loadJobs())
          .subscribe()
      : null;

    return () => {
      clearInterval(iv1); clearInterval(iv2);
      if (ch) supabase.removeChannel(ch);
    };
  }, [loadJobs, loadHistory, email]);

  const acceptOffer = async (jobId: string, offerId: string) => {
    if (!email || actionId) return;
    setActionId(jobId + 'accept');
    try {
      const res  = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_offer', jobId, offerId }),
      });
      const json = await res.json();
      if (json.job) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...json.job } : j));
        setOffers(prev => { const n = { ...prev }; delete n[jobId]; return n; });
      }
    } catch {}
    finally { setActionId(null); }
  };

  const rejectOffer = async (offerId: string) => {
    if (!email || actionId) return;
    setActionId(offerId + 'reject');
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_offer', offerId }),
      });
      setOffers(prev => {
        const n = { ...prev };
        Object.keys(n).forEach(k => { n[k] = n[k].filter(o => o.id !== offerId); });
        return n;
      });
    } catch {}
    finally { setActionId(null); }
  };

  const doJobAction = async (jobId: string, action: string, extra?: object) => {
    if (!email || actionId) return;
    setActionId(jobId + action);
    try {
      const res  = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId, clientEmail: email, ...extra }),
      });
      const json = await res.json();
      if (json.job) setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...json.job } : j));
    } catch {}
    finally { setActionId(null); }
  };

  const handleRating = async (rating: number, note: string) => {
    if (!ratingModal || !email) return;
    const res  = await authFetch('/api/tecnico/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rate_tecnico', jobId: ratingModal.jobId, clientEmail: email, rating, note }),
    });
    const json = await res.json();
    if (json.success) {
      setHistoryJobs(prev => prev.map(j => j.id === ratingModal.jobId ? { ...j, tecnico_rating: rating } : j));
      setRatingModal(null);
    }
  };

  const fmtGs   = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '—';
  const fmtDate = (s: string | null) => !s ? '' : new Date(s).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // First job that is actively being tracked (tecnico moving/working)
  // Show full-screen map for any non-terminal job (from pending onwards)
  const trackingJob = jobs.find(j => !['completado', 'incidente', 'cancelled'].includes(j.status)) ?? null;
  // Only pass tecnico location when they are actually moving/working
  const SHOW_TECNICO_STATUSES = ['en_camino', 'llegue', 'en_proceso', 'completion_pending'];

  return (
    <>
      {/* ── Full-screen live map (InDrive style) ────────────────────────── */}
      {trackingJob && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0b1220' }}>
          {/* Map fills entire screen */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <TecnicoTrackMap
              tecnicoLat={SHOW_TECNICO_STATUSES.includes(trackingJob.status) ? (driverLocs[trackingJob.id]?.lat ?? null) : null}
              tecnicoLng={SHOW_TECNICO_STATUSES.includes(trackingJob.status) ? (driverLocs[trackingJob.id]?.lng ?? null) : null}
              clientLat={trackingJob.lat}
              clientLng={trackingJob.lng}
              status={trackingJob.status}
              tecnicoName={trackingJob.tecnico_name}
            />
          </div>

          {/* Top gradient header */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, transparent 100%)', padding: '48px 16px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => router.back()}
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '50%', width: 42, height: 42, color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >←</button>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{SERVICE_LABELS[trackingJob.service_type] ?? trackingJob.service_type}</div>
                {trackingJob.address && (
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', marginTop: 2 }}>
                    📍 {trackingJob.address.length > 38 ? trackingJob.address.slice(0, 38) + '…' : trackingJob.address}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom info sheet */}
          {(() => {
            const st        = STATUS_CONFIG[trackingJob.status] ?? { label: trackingJob.status, color: '#64748b', bg: '#334155', step: 0 };
            const loc       = driverLocs[trackingJob.id];
            const busy      = !!actionId;
            const jobOffers = offers[trackingJob.id] ?? [];
            return (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, background: '#1e293b', borderRadius: '24px 24px 0 0', padding: '10px 20px 40px', boxShadow: '0 -12px 40px rgba(0,0,0,0.5)', maxHeight: '55vh', overflowY: 'auto' }}>
                {/* Drag handle */}
                <div style={{ width: 40, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 16px' }} />

                {/* Status row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1.05rem' }}>{st.label}</span>
                  {loc && (
                    <span style={{ fontSize: '0.68rem', color: '#475569' }}>
                      ↺ {new Date(loc.updated_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Progress steps */}
                {st.step > 0 && st.step < 6 && (
                  <div style={{ display: 'flex', gap: 3, marginBottom: 14 }}>
                    {STEPS.map((label, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div style={{ height: 3, width: '100%', borderRadius: 2, background: i < st.step ? '#F5C518' : '#334155', transition: 'background 0.4s' }} />
                        <span style={{ fontSize: '0.55rem', color: i < st.step ? '#F5C518' : '#475569', fontWeight: i < st.step ? 700 : 400 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending — offers list */}
                {trackingJob.status === 'pending' && (
                  jobOffers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <PulseDots />
                      <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Buscando técnicos cercanos…</span>
                      <span style={{ color: '#475569', fontSize: '0.76rem' }}>Te notificamos cuando lleguen ofertas</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem', marginBottom: 4 }}>
                        {jobOffers.length} oferta{jobOffers.length !== 1 ? 's' : ''} recibida{jobOffers.length !== 1 ? 's' : ''}
                      </div>
                      {jobOffers.map((offer, idx) => {
                        const isMyPrice = trackingJob.client_initial_price != null &&
                          Math.abs(offer.proposed_price - trackingJob.client_initial_price) / (trackingJob.client_initial_price || 1) < 0.05;
                        const isBest = idx === 0 && jobOffers.length > 1 &&
                          offer.proposed_price === Math.min(...jobOffers.map(o => o.proposed_price));
                        return (
                          <div key={offer.id} style={{ background: '#0f172a', borderRadius: 14, padding: '12px 13px', border: isMyPrice ? '1.5px solid #22c55e' : '1.5px solid #334155' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              {offer.tecnico_photo
                                ? <img src={offer.tecnico_photo} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155', flexShrink: 0 }} />
                                : <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>👷</div>}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.88rem' }}>{offer.tecnico_name ?? 'Técnico'}</div>
                                <div style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 800, marginTop: 2 }}>{fmtGs(offer.proposed_price)}</div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                                {isMyPrice && <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.62rem', fontWeight: 800, borderRadius: 20, padding: '2px 8px' }}>👍 Tu tarifa</span>}
                                {isBest && !isMyPrice && <span style={{ background: '#F5C518', color: '#1C1C2E', fontSize: '0.62rem', fontWeight: 800, borderRadius: 20, padding: '2px 8px' }}>⭐ Mejor</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 7 }}>
                              <button onClick={() => acceptOffer(trackingJob.id, offer.id)} disabled={busy}
                                style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                                Aceptar
                              </button>
                              <button onClick={() => rejectOffer(offer.id)} disabled={busy}
                                style={{ flex: 1, padding: '10px', borderRadius: 12, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem', cursor: busy ? 'default' : 'pointer' }}>
                                Rechazar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Tecnico card (accepted / en_camino / etc.) */}
                {trackingJob.tecnico_name && trackingJob.status !== 'pending' && (
                  <div style={{ background: '#0f172a', borderRadius: 14, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    {trackingJob.tecnico_photo
                      ? <img src={trackingJob.tecnico_photo} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155', flexShrink: 0 }} />
                      : <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>👷</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.95rem' }}>{trackingJob.tecnico_name}</div>
                      {trackingJob.agreed_price != null && (
                        <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 700, marginTop: 2 }}>
                          💰 {fmtGs(trackingJob.agreed_price)}
                          {trackingJob.extra_charge != null && Number(trackingJob.extra_charge) > 0 && (
                            <span style={{ color: '#f59e0b' }}> + {fmtGs(trackingJob.extra_charge)} extra</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* completion_pending — confirm buttons */}
                {trackingJob.status === 'completion_pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => doJobAction(trackingJob.id, 'accept_completion')}
                      disabled={busy}
                      style={{ flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, boxShadow: '0 4px 12px rgba(34,197,94,0.3)' }}
                    >✅ Sí, listo</button>
                    <button
                      onClick={() => setRejectModal({ jobId: trackingJob.id })}
                      disabled={busy}
                      style={{ flex: 1, padding: '14px', borderRadius: 14, border: 'none', background: '#7f1d1d', color: '#fca5a5', fontWeight: 700, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer' }}
                    >✕ No listo</button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div style={{ minHeight: '100dvh', background: '#0f172a', paddingBottom: 90 }}>
      <div style={{ background: '#1e293b', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155' }}>
        <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>🛠 Mis Solicitudes</h1>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Seguimiento en tiempo real</p>
        </div>
        <button onClick={loadJobs} style={{ background: 'rgba(245,197,24,0.15)', border: '1px solid rgba(245,197,24,0.3)', color: '#F5C518', borderRadius: 10, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>
          ↺ Actualizar
        </button>
      </div>

      <div style={{ padding: '14px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#64748b' }}>
            <PulseDots />
            <p style={{ marginTop: 16, color: '#94a3b8' }}>Cargando solicitudes…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 70 }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>📋</div>
            <p style={{ fontWeight: 700, color: '#94a3b8', fontSize: '1rem' }}>Sin solicitudes activas</p>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 24 }}>Solicita un servicio y recibe ofertas de técnicos</p>
            <button onClick={() => router.push('/cliente/servicio')}
              style={{ padding: '12px 28px', borderRadius: 14, border: 'none', background: '#F5C518', color: '#1C1C2E', fontWeight: 800, cursor: 'pointer', fontSize: '0.95rem' }}>
              Solicitar servicio
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jobs.map(job => {
              const st        = STATUS_CONFIG[job.status] ?? { label: job.status, color: '#64748b', bg: '#1e293b', step: 0 };
              const busy      = !!actionId;
              const jobOffers = offers[job.id] ?? [];
              const hasNewOffer = newOfferJobRef.current === job.id;

              return (
                <div key={job.id} style={{ background: '#1e293b', borderRadius: 20, overflow: 'hidden', border: '1px solid #334155' }}>

                  <div style={{ padding: '14px 16px 12px', borderBottom: (jobOffers.length > 0 || job.status !== 'pending') ? '1px solid #334155' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '1rem' }}>
                        {SERVICE_LABELS[job.service_type] ?? job.service_type}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, background: st.bg, color: st.color, borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.78rem', color: '#64748b' }}>
                      {job.address && <span>📍 {job.address.length > 40 ? job.address.slice(0, 40) + '…' : job.address}</span>}
                      {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                      {job.client_initial_price != null && (
                        <span style={{ color: '#F5C518', fontWeight: 700 }}>💬 Tu precio: {fmtGs(job.client_initial_price)}</span>
                      )}
                    </div>
                  </div>

                  {job.status === 'pending' && (
                    <div style={{ padding: '12px 14px 14px' }}>
                      {jobOffers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '22px 8px' }}>
                          <PulseDots />
                          <p style={{ margin: '12px 0 4px', color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem' }}>Esperando ofertas de técnicos</p>
                          <p style={{ margin: 0, color: '#475569', fontSize: '0.78rem' }}>Los técnicos cercanos verán tu solicitud</p>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontWeight: 800, color: '#f1f5f9', fontSize: '0.95rem' }}>
                              {jobOffers.length} oferta{jobOffers.length !== 1 ? 's' : ''} recibida{jobOffers.length !== 1 ? 's' : ''}
                            </span>
                            {hasNewOffer && (
                              <span style={{ background: '#22c55e', color: '#fff', fontSize: '0.68rem', fontWeight: 800, borderRadius: 20, padding: '2px 8px' }}>NUEVA</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {jobOffers.map((offer, idx) => {
                              const isMyPrice = job.client_initial_price != null &&
                                Math.abs(offer.proposed_price - job.client_initial_price) / (job.client_initial_price || 1) < 0.05;
                              const isBest = idx === 0 && jobOffers.length > 1 &&
                                offer.proposed_price === Math.min(...jobOffers.map(o => o.proposed_price));

                              return (
                                <div key={offer.id} style={{
                                  background: '#0f172a', borderRadius: 14, padding: '13px 14px',
                                  border: isMyPrice ? '1.5px solid #22c55e' : '1.5px solid #334155',
                                }}>
                                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    {isMyPrice && (
                                      <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.68rem', fontWeight: 800, borderRadius: 20, padding: '2px 9px' }}>
                                        👍 Tu tarifa
                                      </span>
                                    )}
                                    {isBest && !isMyPrice && (
                                      <span style={{ background: '#F5C518', color: '#1C1C2E', fontSize: '0.68rem', fontWeight: 800, borderRadius: 20, padding: '2px 9px' }}>
                                        ⭐ Mejor precio
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                    <div style={{ flexShrink: 0 }}>
                                      {offer.tecnico_photo ? (
                                        <img src={offer.tecnico_photo} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155' }} />
                                      ) : (
                                        <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', border: '2px solid #334155' }}>👷</div>
                                      )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.93rem', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {offer.tecnico_name ?? 'Técnico'}
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        {offer.tecnico_rating != null && (
                                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <StarRating rating={offer.tecnico_rating} />
                                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{offer.tecnico_rating.toFixed(1)}</span>
                                          </span>
                                        )}
                                        {offer.distance_km != null && (
                                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>📍 {offer.distance_km.toFixed(1)} km</span>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontWeight: 900, color: '#f1f5f9', fontSize: '1.25rem', lineHeight: 1 }}>
                                        {Number(offer.proposed_price).toLocaleString('es-PY')}
                                      </div>
                                      <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>Gs</div>
                                    </div>
                                  </div>

                                  {offer.note && (
                                    <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.4 }}>
                                      "{offer.note}"
                                    </p>
                                  )}

                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      onClick={() => rejectOffer(offer.id)}
                                      disabled={busy}
                                      style={{
                                        flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
                                        background: '#1e293b', color: '#94a3b8',
                                        fontWeight: 700, fontSize: '0.88rem', cursor: busy ? 'default' : 'pointer',
                                      }}
                                    >
                                      Rechazar
                                    </button>
                                    <button
                                      onClick={() => acceptOffer(job.id, offer.id)}
                                      disabled={busy}
                                      style={{
                                        flex: 2, padding: '11px 0', borderRadius: 12, border: 'none',
                                        background: busy ? '#16a34a88' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        color: '#fff', fontWeight: 800, fontSize: '0.95rem',
                                        cursor: busy ? 'default' : 'pointer',
                                        boxShadow: busy ? 'none' : '0 4px 14px rgba(34,197,94,0.35)',
                                      }}
                                    >
                                      Aceptar
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => doJobAction(job.id, 'cancel', { clientEmail: email })}
                        disabled={busy}
                        style={{ marginTop: 14, width: '100%', padding: '11px', borderRadius: 14, border: 'none', background: '#7f1d1d', color: '#fca5a5', fontWeight: 700, fontSize: '0.88rem', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        ✕ Cancelar solicitud
                      </button>
                    </div>
                  )}

                  {job.status !== 'pending' && job.status !== 'completado' && job.status !== 'cancelled' && job.status !== 'incidente' && (
                    <div style={{ padding: '12px 16px 14px' }}>
                      {st.step > 0 && st.step < 6 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {STEPS.map((label, i) => (
                              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <div style={{ height: 4, width: '100%', borderRadius: 2, background: i < st.step ? '#F5C518' : '#334155', transition: 'background 0.4s' }} />
                                <span style={{ fontSize: '0.58rem', color: i < st.step ? '#F5C518' : '#64748b', fontWeight: i < st.step ? 700 : 400, textAlign: 'center' }}>{label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}



                      {job.tecnico_name && (
                        <div style={{ background: '#0f172a', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          {job.tecnico_photo ? (
                            <img src={job.tecnico_photo} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>👷</div>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem' }}>{job.tecnico_name}</div>
                            {job.agreed_price != null && (
                              <div style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 700, marginTop: 2 }}>
                                💰 {fmtGs(job.agreed_price)}
                                {job.extra_charge != null && Number(job.extra_charge) > 0 && (
                                  <span style={{ color: '#f59e0b' }}> + {fmtGs(job.extra_charge)} extra</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {job.status === 'completion_pending' && (
                    <div style={{ padding: '0 16px 16px' }}>
                      <div style={{ background: '#0f172a', borderRadius: 14, padding: '13px', marginBottom: 12, border: '1px solid #334155' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Resumen de cobro</div>
                        {job.agreed_price != null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: 4 }}>
                            <span>Precio acordado</span><span style={{ fontWeight: 700 }}>{fmtGs(job.agreed_price)}</span>
                          </div>
                        )}
                        {job.extra_charge != null && Number(job.extra_charge) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#f59e0b', marginBottom: 4 }}>
                            <span>⚡ Cargo extra</span><span style={{ fontWeight: 700 }}>{fmtGs(job.extra_charge)}</span>
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid #334155', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 900, color: '#22c55e' }}>
                          <span>Total</span><span>{fmtGs(job.total_price ?? job.agreed_price)}</span>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 12px', fontWeight: 700, color: '#fbbf24', fontSize: '0.88rem', textAlign: 'center' }}>
                        ¿El técnico completó el servicio? (intento {job.completion_attempts}/3)
                      </p>
                      {job.last_rejection_reason && (
                        <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#f87171', fontStyle: 'italic', textAlign: 'center' }}>
                          Motivo anterior: {job.last_rejection_reason}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => doJobAction(job.id, 'accept_completion')} disabled={busy}
                          style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.3)' }}>
                          ✅ Sí, listo
                        </button>
                        <button onClick={() => setRejectModal({ jobId: job.id })} disabled={busy}
                          style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: '#7f1d1d', color: '#fca5a5', fontWeight: 700, fontSize: '0.9rem', cursor: busy ? 'default' : 'pointer' }}>
                          ✕ No completado
                        </button>
                      </div>
                    </div>
                  )}

                  {job.status === 'completado' && (
                    <div style={{ margin: '0 14px 14px', padding: '12px', borderRadius: 14, background: '#052e16', border: '1px solid #16a34a', color: '#4ade80', fontWeight: 700, textAlign: 'center', fontSize: '0.88rem' }}>
                      ✅ Servicio completado · {fmtGs(job.total_price ?? job.agreed_price)}
                    </div>
                  )}
                  {job.status === 'incidente' && (
                    <div style={{ margin: '0 14px 14px', padding: '12px', borderRadius: 14, background: '#450a0a', border: '1px solid #dc2626', color: '#f87171', fontWeight: 700, textAlign: 'center', fontSize: '0.85rem' }}>
                      ⚠️ Incidente reportado{job.last_rejection_reason ? `: ${job.last_rejection_reason}` : ''}
                    </div>
                  )}
                  {job.status === 'cancelled' && (
                    <div style={{ margin: '0 14px 14px', padding: '12px', borderRadius: 14, background: '#1e293b', color: '#64748b', fontWeight: 600, textAlign: 'center', fontSize: '0.85rem' }}>
                      Solicitud cancelada
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectModal && (
        <>
          <div onClick={() => setRejectModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1e293b', borderRadius: '20px 20px 0 0', padding: '22px 18px 44px', zIndex: 9999, border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 6px', fontWeight: 800, color: '#f87171' }}>✕ No completado</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.84rem', color: '#64748b' }}>Indica el motivo para que el técnico pueda corregirlo.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ej: El servicio no quedó terminado..."
              style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: '1.5px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '0.9rem', minHeight: 80, resize: 'vertical', boxSizing: 'border-box', outline: 'none', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => { await doJobAction(rejectModal.jobId, 'reject_completion', { reason: rejectReason }); setRejectModal(null); setRejectReason(''); }}
                style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: '#7f1d1d', color: '#fca5a5', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}>
                Confirmar
              </button>
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid #334155', background: '#0f172a', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Historial de servicios ─────────────────────────────────────── */}
      {historyJobs.length > 0 && (
        <div style={{ padding: '0 12px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10, paddingTop: 4 }}>
            Historial
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {historyJobs.map(job => {
              const st       = STATUS_CONFIG[job.status] ?? { label: job.status, color: '#64748b', bg: '#1e293b', step: 0 };
              const canRate  = job.status === 'completado' && (job.tecnico_rating == null || job.tecnico_rating === undefined);
              return (
                <div key={job.id} style={{ background: '#1e293b', borderRadius: 16, border: '1px solid #334155', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.88rem' }}>
                        {SERVICE_LABELS[job.service_type] ?? job.service_type}
                      </span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, background: st.bg, color: st.color, borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: '0.75rem', color: '#64748b', marginBottom: canRate || job.tecnico_rating != null ? 10 : 0 }}>
                      {job.tecnico_name && <span>👷 {job.tecnico_name}</span>}
                      {job.total_price != null && <span style={{ color: '#22c55e', fontWeight: 700 }}>💰 {fmtGs(job.total_price)}</span>}
                      <span>📅 {fmtDate(job.created_at)}</span>
                    </div>
                    {canRate && (
                      <button
                        onClick={() => setRatingModal({ jobId: job.id, tecnicoName: job.tecnico_name, tecnicoPhoto: job.tecnico_photo })}
                        style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}
                      >
                        ⭐ Calificar técnico
                      </button>
                    )}
                    {job.tecnico_rating != null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#64748b' }}>
                        <span>Tu calificación:</span>
                        <StarRating rating={job.tecnico_rating} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>

    {/* ── Rating modal ─────────────────────────────────────────────────── */}
    {ratingModal && (
      <RatingModal
        title="Calificar técnico"
        subtitle={ratingModal.tecnicoName ?? undefined}
        avatarUrl={ratingModal.tecnicoPhoto ?? undefined}
        avatarName={ratingModal.tecnicoName ?? undefined}
        onSubmit={handleRating}
        onClose={() => setRatingModal(null)}
      />
    )}
    </>
  );
}