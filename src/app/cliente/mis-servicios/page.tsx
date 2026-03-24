'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useClientContext } from '../context';

// ── Web Audio alert ──────────────────────────────────────────────────────────
let _clientAC: AudioContext | null = null;
function getClientAC() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!_clientAC || _clientAC.state === 'closed') _clientAC = new AudioCtx();
  if (_clientAC.state === 'suspended') _clientAC.resume();
  return _clientAC;
}
if (typeof window !== 'undefined') {
  const _u = () => { getClientAC(); window.removeEventListener('touchstart', _u); window.removeEventListener('click', _u); };
  window.addEventListener('touchstart', _u, { once: true });
  window.addEventListener('click', _u, { once: true });
}
function playOfferAlert() {
  try {
    const ctx = getClientAC();
    if (!ctx) return;
    const b = (t: number, f: number) => {
      const o = ctx!.createOscillator(); const g = ctx!.createGain();
      o.connect(g); g.connect(ctx!.destination);
      o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.6;
      o.start(t); o.stop(t + 0.1);
    };
    b(ctx.currentTime, 1000); b(ctx.currentTime + 0.14, 1200); b(ctx.currentTime + 0.28, 1400);
  } catch { /* silent */ }
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Job {
  id: string;
  created_at: string;
  status: string;
  service_type: string;
  description: string | null;
  address: string | null;
  scheduled_at: string | null;
  client_initial_price: number | null;
  agreed_price: number | null;
  extra_charge: number | null;
  total_price: number | null;
  completion_attempts: number;
  last_rejection_reason: string | null;
  tecnico_name: string | null;
  tecnico_photo: string | null;
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
  pending:            { label: 'En espera de ofertas', color: '#6366f1', bg: '#e0e7ff', step: 0 },
  accepted:           { label: 'Técnico confirmado',   color: '#059669', bg: '#d1fae5', step: 1 },
  en_camino:          { label: 'En camino',            color: '#0ea5e9', bg: '#e0f2fe', step: 2 },
  llegue:             { label: 'Llegó',                color: '#8b5cf6', bg: '#ede9fe', step: 3 },
  en_proceso:         { label: 'Servicio en proceso',  color: '#d97706', bg: '#fef3c7', step: 4 },
  completion_pending: { label: '¿Completado?',         color: '#6366f1', bg: '#ede9fe', step: 5 },
  completado:         { label: 'Completado ✅',        color: '#059669', bg: '#d1fae5', step: 6 },
  incidente:          { label: 'Incidente ⚠️',         color: '#ef4444', bg: '#fee2e2', step: 6 },
  cancelled:          { label: 'Cancelado',            color: '#94a3b8', bg: '#f1f5f9', step: 6 },
};

export default function MisServiciosPage() {
  const router  = useRouter();
  const { email } = useClientContext();

  const [jobs, setJobs]     = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers]   = useState<Record<string, Offer[]>>({});
  const [actionId, setActionId] = useState<string | null>(null);

  // Rejection modal
  const [rejectModal, setRejectModal] = useState<{ jobId: string; action: 'reject_completion' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Track seen offers per job to detect new ones
  const prevOfferCount = useState<Record<string, number>>(() => ({}))[0];

  const loadJobs = useCallback(async () => {
    if (!email) return;
    try {
      const res  = await fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setJobs(data);
      setLoading(false);

      // For pending jobs, also load their offers
      const pendingIds = data.filter((j: Job) => j.status === 'pending').map((j: Job) => j.id);
      for (const jobId of pendingIds) {
        const offerRes = await fetch(`/api/tecnico/jobs?job_offers=${jobId}`);
        const offerData = await offerRes.json();
        if (Array.isArray(offerData)) {
          setOffers(prev => {
            const old = prev[jobId]?.length ?? 0;
            if (offerData.length > old && old > 0) playOfferAlert();
            return { ...prev, [jobId]: offerData };
          });
        }
      }
    } catch { setLoading(false); }
  }, [email]);

  useEffect(() => {
    loadJobs();
    const iv = setInterval(loadJobs, 12_000);
    return () => clearInterval(iv);
  }, [loadJobs]);

  const doJobAction = async (jobId: string, action: string, extra?: object) => {
    if (!email || actionId) return;
    setActionId(jobId + action);
    try {
      const res  = await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId, clientEmail: email, ...extra }),
      });
      const json = await res.json();
      if (json.job) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...json.job } : j));
      }
    } catch {}
    finally { setActionId(null); }
  };

  const acceptOffer = async (jobId: string, offerId: string) => {
    if (!email || actionId) return;
    setActionId(jobId + 'accept');
    try {
      const res  = await fetch('/api/tecnico/jobs', {
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
      await fetch('/api/tecnico/jobs', {
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

  const submitReject = async () => {
    if (!rejectModal) return;
    await doJobAction(rejectModal.jobId, rejectModal.action, { reason: rejectReason });
    setRejectModal(null); setRejectReason('');
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs.` : '—';

  const STEPS = ['Aceptado', 'En camino', 'Llegó', 'En proceso', 'Confirmación'];

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#6366f1', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🛠 Mis Servicios</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Seguimiento en tiempo real</p>
        </div>
        <button onClick={loadJobs} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
          ↺
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p>Cargando servicios...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
            <p style={{ fontWeight: 600, color: '#6b7280' }}>Sin servicios activos</p>
            <button onClick={() => router.push('/cliente/servicio')}
              style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Solicitar servicio
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {jobs.map(job => {
              const st  = STATUS_CONFIG[job.status] ?? { label: job.status, color: '#64748b', bg: '#f1f5f9', step: 0 };
              const busy = !!actionId;
              const jobOffers = offers[job.id] ?? [];

              return (
                <div key={job.id} style={{ background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
                  {/* Service + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                      {SERVICE_LABELS[job.service_type] ?? job.service_type}
                    </span>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, background: st.bg, color: st.color, borderRadius: 8, padding: '3px 10px' }}>
                      {st.label}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.8rem', color: '#64748b', marginBottom: 10 }}>
                    {job.address && <span>📍 {job.address}</span>}
                    {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                    {job.client_initial_price != null && <span>💬 Tu oferta: {fmtGs(job.client_initial_price)}</span>}
                  </div>

                  {/* Tecnico info (once accepted) */}
                  {job.tecnico_name && job.status !== 'pending' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 10 }}>
                      {job.tecnico_photo ? (
                        <img src={job.tecnico_photo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>👷</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{job.tecnico_name}</div>
                        {job.agreed_price != null && (
                          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                            💰 Acordado: {fmtGs(job.agreed_price)}
                            {job.extra_charge != null && job.extra_charge > 0 && (
                              <> · Extra: {fmtGs(job.extra_charge)} · <strong>Total: {fmtGs(job.total_price)}</strong></>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Progress bar for active steps */}
                  {st.step > 0 && st.step < 6 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {STEPS.map((label, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{ height: 4, width: '100%', borderRadius: 2, background: i < st.step ? '#6366f1' : '#e2e8f0' }} />
                            <span style={{ fontSize: '0.6rem', color: i < st.step ? '#6366f1' : '#94a3b8', fontWeight: i < st.step ? 700 : 400, textAlign: 'center' }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending: list offers */}
                  {job.status === 'pending' && (
                    <div>
                      {jobOffers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px 8px', color: '#9ca3af', fontSize: '0.85rem' }}>
                          <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>⏳</div>
                          Esperando ofertas de técnicos…
                        </div>
                      ) : (
                        <div>
                          <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: '0.83rem', color: '#374151' }}>
                            🎁 {jobOffers.length} oferta{jobOffers.length !== 1 ? 's' : ''} recibida{jobOffers.length !== 1 ? 's' : ''}:
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {jobOffers.map(offer => (
                              <div key={offer.id} style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                  {offer.tecnico_photo ? (
                                    <img src={offer.tecnico_photo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>👷</div>
                                  )}
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{offer.tecnico_name ?? 'Técnico'}</div>
                                    <div style={{ display: 'flex', gap: 8, fontSize: '0.76rem', color: '#64748b' }}>
                                      {offer.tecnico_rating != null && <span>{'★'.repeat(Math.round(offer.tecnico_rating))} {offer.tecnico_rating.toFixed(1)}</span>}
                                      {offer.distance_km != null && <span>📍 {offer.distance_km.toFixed(1)} km</span>}
                                    </div>
                                  </div>
                                  <div style={{ marginLeft: 'auto', fontWeight: 800, color: '#059669', fontSize: '1rem' }}>
                                    {fmtGs(offer.proposed_price)}
                                  </div>
                                </div>
                                {offer.note && <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>"{offer.note}"</p>}
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => acceptOffer(job.id, offer.id)} disabled={busy}
                                    style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: busy ? '#86efac' : '#059669', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: busy ? 'default' : 'pointer' }}>
                                    ✅ Aceptar
                                  </button>
                                  <button onClick={() => rejectOffer(offer.id)} disabled={busy}
                                    style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontWeight: 600, fontSize: '0.85rem', cursor: busy ? 'default' : 'pointer' }}>
                                    ✕ Rechazar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={() => doJobAction(job.id, 'cancel', { clientEmail: email })} disabled={busy}
                        style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'default' : 'pointer' }}>
                        Cancelar solicitud
                      </button>
                    </div>
                  )}

                  {/* Completion pending: ask if done */}
                  {job.status === 'completion_pending' && (
                    <div style={{ marginTop: 4 }}>
                      <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#6366f1', fontSize: '0.9rem', textAlign: 'center' }}>
                        ¿El técnico completó el servicio? ({job.completion_attempts}/3)
                      </p>
                      {job.last_rejection_reason && (
                        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#ef4444', fontStyle: 'italic', textAlign: 'center' }}>
                          Motivo anterior: {job.last_rejection_reason}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => doJobAction(job.id, 'accept_completion')} disabled={busy}
                          style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#059669', color: '#fff', fontWeight: 800, cursor: busy ? 'default' : 'pointer' }}>
                          ✅ Sí, completado
                        </button>
                        <button onClick={() => setRejectModal({ jobId: job.id, action: 'reject_completion' })} disabled={busy}
                          style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                          ✕ No completado
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Completado */}
                  {job.status === 'completado' && (
                    <div style={{ textAlign: 'center', padding: '10px', borderRadius: 12, background: '#d1fae5', color: '#059669', fontWeight: 700, marginTop: 4 }}>
                      ✅ Servicio completado — Total: {fmtGs(job.total_price)}
                    </div>
                  )}

                  {/* Incidente */}
                  {job.status === 'incidente' && (
                    <div style={{ textAlign: 'center', padding: '10px 14px', borderRadius: 12, background: '#fee2e2', color: '#ef4444', fontWeight: 700, marginTop: 4, fontSize: '0.85rem' }}>
                      ⚠️ Incidente reportado. {job.last_rejection_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject completion modal */}
      {rejectModal && (
        <>
          <div onClick={() => setRejectModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 18px 40px', zIndex: 9999, boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}>
            <h3 style={{ margin: '0 0 6px', fontWeight: 800, color: '#ef4444' }}>✕ Rechazar servicio</h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: '#64748b' }}>Indica el motivo para que el técnico pueda corregirlo.</p>
            <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Motivo</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ej: El servicio no quedó terminado..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: '0.93rem', minHeight: 80, resize: 'vertical', boxSizing: 'border-box', outline: 'none', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitReject}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Confirmar rechazo
              </button>
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
