'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../../driver/context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import ChatModal from '@/components/ChatModal';

interface Job {
  id: string;
  created_at: string;
  status: string;
  service_type: string;
  client_name: string | null;
  client_email: string;
  client_rating?: number | null;
  client_photo?: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_at: string | null;
  agreed_price: number | null;
  extra_charge: number | null;
  total_price: number | null;
  description: string | null;
  audio_url: string | null;
  accepted_at: string | null;
  completion_attempts: number;
  last_rejection_reason: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza',
  niera: '👶 Niñera',
  cocina: '🍳 Cocina',
  eventos: '🎉 Eventos',
  cuidado_mascotas: '🐾 Cuidado Mascotas',
  cuidado_adultos: '👴 Cuidado adultos',
  aire_split: '❄️ Tec Aire Split',
  electrico: '⚡ Serv. Eléctrico',
  plomeria: '🔧 Serv. Plomería',
  cerrajeria: '🔑 Serv. Cerrajería',
  gestor: '🗂️ Gestor',
  otros: '✨ Otros',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  accepted:           { label: 'Confirmada',          color: '#059669', bg: '#d1fae5' },
  en_camino:          { label: 'En camino',            color: '#0ea5e9', bg: '#e0f2fe' },
  llegue:             { label: 'Llegué',               color: '#C8960A', bg: '#FEF9E7' },
  en_proceso:         { label: 'En proceso',           color: '#d97706', bg: '#fef3c7' },
  completion_pending: { label: 'Esperando cliente',    color: '#C8960A', bg: '#FEF9E7' },
  incidente:          { label: 'Incidente',            color: '#ef4444', bg: '#fee2e2' },
};

export default function CitasPage() {
  const router = useRouter();
  const { email, displayName } = useDriverContext();
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  // Chat
  const [chatOpen, setChatOpen]             = useState(false);
  const [chatJobId, setChatJobId]           = useState<string | undefined>(undefined);
  const [chatOtherName, setChatOtherName]   = useState<string | null>(null);
  const [chatOtherPhoto, setChatOtherPhoto] = useState<string | null>(null);

  // Extra charge modal
  const [extraModal, setExtraModal]       = useState<{ jobId: string } | null>(null);
  const [extraAmount, setExtraAmount]     = useState(0);
  const [extraReason, setExtraReason]     = useState('');
  const [extraSending, setExtraSending]   = useState(false);

  // GPS broadcasting refs
  const watchIdRef     = useRef<number | null>(null);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef     = useRef<{ lat: number; lng: number } | null>(null);

  // Start/stop GPS broadcast depending on active jobs
  useEffect(() => {
    if (!email) return;

    const TRACKING_STATUSES = ['en_camino', 'en_proceso', 'llegue'];
    const trackingJob = jobs.find(j => TRACKING_STATUSES.includes(j.status));

    if (trackingJob) {
      if (!navigator.geolocation) return;

      const MIN_DISTANCE_M = 30; // Only broadcast if moved > 30 meters
      const toRad = (d: number) => (d * Math.PI) / 180;
      const haversineDist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const R = 6371000;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
      };
      const broadcast = (lat: number, lng: number) => {
        if (lastPosRef.current && haversineDist(lastPosRef.current, { lat, lng }) < MIN_DISTANCE_M) return;
        lastPosRef.current = { lat, lng };
        fetch('/api/driver-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_email: email, job_id: trackingJob.id, lat, lng }),
        }).catch(() => {});
      };

      // Start watching position
      if (watchIdRef.current === null) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => broadcast(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000 },
        );
      }

      // Also poll every 6s in case watchPosition fires slowly
      if (gpsIntervalRef.current === null) {
        gpsIntervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => broadcast(pos.coords.latitude, pos.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 5000 },
          );
        }, 10_000);
      }
    } else {
      // No active tracking job — stop broadcasting
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (gpsIntervalRef.current !== null) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (gpsIntervalRef.current !== null) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    };
  }, [jobs, email]);

  const loadJobs = useCallback(() => {
    if (!email) return;
    authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&active=true`)
      .then(r => r.json())
      .then(data => { setJobs(Array.isArray(data) ? data : []); setLoading(false); setFetchError(false); })
      .catch(() => { setLoading(false); setFetchError(true); });
  }, [email]);

  useEffect(() => {
    loadJobs();
    // Fallback polling at 60s; realtime is primary
    const iv = setInterval(loadJobs, 60_000);

    // Realtime: job status changes for this técnico
    const ch = email
      ? supabase.channel(`tecnico-citas-${email}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'tecnico_jobs',
            filter: `tecnico_email=eq.${email}`,
          } as never, () => loadJobs())
          .subscribe()
      : null;

    return () => {
      clearInterval(iv);
      if (ch) supabase.removeChannel(ch);
    };
  }, [loadJobs, email]);

  const doAction = async (jobId: string, action: string) => {
    if (!email || actionId) return;
    setActionId(jobId + action);
    try {
      const res  = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId, tecnicoEmail: email }),
      });
      const json = await res.json();
      if (json.job) setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...json.job } : j));
    } catch {}
    finally { setActionId(null); }
  };

  /** Wrap doAction with a native confirm dialog for destructive actions */
  const doActionConfirmed = (jobId: string, action: string, message: string) => {
    if (!window.confirm(message)) return;
    doAction(jobId, action);
  };

  const submitExtra = async () => {
    if (!extraModal || !email || extraSending || extraAmount <= 0) return;
    setExtraSending(true);
    try {
      const res  = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_extra', jobId: extraModal.jobId, tecnicoEmail: email, extraCharge: extraAmount, extraReason }),
      });
      const json = await res.json();
      if (json.job) setJobs(prev => prev.map(j => j.id === extraModal!.jobId ? { ...j, ...json.job } : j));
    } catch {}
    setExtraSending(false);
    setExtraModal(null); setExtraAmount(0); setExtraReason('');
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs.` : '—';

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#0ea5e9', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>📅 Citas Activas</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Tus trabajos en curso</p>
        </div>
        <button onClick={loadJobs} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
          ↺
        </button>
      </div>

      {/* Offline / error banner */}
      {fetchError && (
        <div style={{ background: '#fef2f2', borderBottom: '2px solid #f87171', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#b91c1c' }}>Sin conexión</p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#ef4444' }}>No se pudieron cargar las citas. Verificá tu internet.</p>
          </div>
          <button onClick={loadJobs} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      )}

      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p>Cargando citas...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, color: '#6b7280' }}>Sin citas activas</p>
            <p style={{ fontSize: '0.85rem' }}>Envía una oferta para que aparezca acá.</p>
            <button onClick={() => router.push('/tecnico/ofertas')} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#F5C518', color: '#1C1C2E', fontWeight: 700, cursor: 'pointer' }}>
              Ver ofertas
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jobs.map(job => {
              const st = STATUS_CONFIG[job.status] ?? { label: job.status, color: '#64748b', bg: '#f1f5f9' };
              const busy = !!actionId;
              return (
                <div key={job.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0' }}>
                  {/* Title row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                      {SERVICE_LABELS[job.service_type] ?? job.service_type}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: st.color, background: st.bg, borderRadius: 8, padding: '3px 10px' }}>
                      {st.label}
                    </span>
                    <button
                      onClick={() => { setChatJobId(job.id); setChatOtherName(job.client_name); setChatOtherPhoto(job.client_photo ?? null); setChatOpen(true); }}
                      style={{ padding: '3px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#16a34a', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}
                    >
                      💬 Chat
                    </button>
                  </div>

                  {/* Client info row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {job.client_photo
                      ? <img src={job.client_photo} alt={job.client_name ?? 'Cliente'} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>👤</div>
                    }
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: '#64748b' }}>
                      {job.client_name && <span style={{ fontWeight: 600, color: '#1e293b' }}>{job.client_name}</span>}
                      {job.address && <span>📍 {job.address}</span>}
                      {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                    </div>
                  </div>

                  {/* Audio del cliente */}
                  {job.audio_url && (
                    <div style={{ marginBottom: 10, padding: '8px 10px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>🎙 Audio del cliente</p>
                      <audio controls src={job.audio_url} style={{ width: '100%', height: 36 }} />
                    </div>
                  )}

                  {/* Price row */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: '0.82rem' }}>
                    {job.agreed_price != null && (
                      <span style={{ fontWeight: 700, color: '#059669' }}>💰 Acordado: {fmtGs(job.agreed_price)}</span>
                    )}
                    {job.extra_charge != null && job.extra_charge > 0 && (
                      <span style={{ fontWeight: 700, color: '#f59e0b' }}>➕ Extra: {fmtGs(job.extra_charge)}</span>
                    )}
                    {job.total_price != null && job.extra_charge != null && job.extra_charge > 0 && (
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>= {fmtGs(job.total_price)}</span>
                    )}
                  </div>

                  {/* State-based action buttons */}
                  {job.status === 'accepted' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => doAction(job.id, 'en_camino')} disabled={busy}
                        style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                        🚗 Voy en camino
                      </button>
                      {job.lat && job.lng && (
                        <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`, '_blank')}
                          style={{ padding: '10px 14px', borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          🧭 Navegar
                        </button>
                      )}
                    </div>
                  )}

                  {job.status === 'en_camino' && job.lat && job.lng && (
                    <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`, '_blank')}
                      style={{ width: '100%', marginBottom: 8, padding: '10px', borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      🧭 Navegar al cliente
                    </button>
                  )}

                  {job.status === 'en_camino' && (
                    <button onClick={() => doAction(job.id, 'llegue')} disabled={busy}
                      style={{ width: '100%', padding: '10px', borderRadius: 12, border: 'none', background: '#F5C518', color: '#1C1C2E', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                      📍 Ya llegué
                    </button>
                  )}

                  {job.status === 'llegue' && (
                    <button onClick={() => doAction(job.id, 'en_proceso')} disabled={busy}
                      style={{ width: '100%', padding: '10px', borderRadius: 12, border: 'none', background: '#d97706', color: '#fff', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                      ▶ Iniciar servicio
                    </button>
                  )}

                  {job.status === 'en_proceso' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => doActionConfirmed(job.id, 'completion_pending', '¿Marcar el servicio como completado? El cliente deberá confirmarlo.')} disabled={busy}
                        style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                        ✅ Marcar completado
                      </button>
                      <button onClick={() => { setExtraModal({ jobId: job.id }); setExtraAmount(job.extra_charge ?? 0); setExtraReason(''); }}
                        style={{ padding: '10px 12px', borderRadius: 12, border: '1.5px solid #f59e0b', background: '#fff', color: '#d97706', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                        💰 Extra
                      </button>
                    </div>
                  )}

                  {job.status === 'completion_pending' && (
                    <div style={{ textAlign: 'center', padding: '10px', borderRadius: 12, background: '#FEF9E7', color: '#C8960A', fontWeight: 700, fontSize: '0.85rem' }}>
                      ⏳ Esperando confirmación del cliente… ({job.completion_attempts}/3)
                    </div>
                  )}

                  {job.status === 'incidente' && (
                    <div style={{ padding: '10px', borderRadius: 12, background: '#fee2e2', color: '#ef4444', fontWeight: 700, fontSize: '0.85rem', textAlign: 'center' }}>
                      ⚠️ Incidente — {job.last_rejection_reason ?? 'Cliente rechazó 3 veces'}
                    </div>
                  )}

                  {/* Cancel option for early statuses */}
                  {['accepted', 'en_camino'].includes(job.status) && (
                    <button onClick={() => doActionConfirmed(job.id, 'cancel', '¿Cancelar este trabajo? Esta acción no se puede deshacer.')} disabled={busy}
                      style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'default' : 'pointer' }}>
                      Cancelar trabajo
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chat Modal */}
      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        jobId={chatJobId}
        myEmail={email ?? ''}
        myName={displayName ?? ''}
        otherName={chatOtherName}
        otherPhoto={chatOtherPhoto}
      />

      {/* Extra charge modal */}
      {extraModal && (
        <>
          <div onClick={() => setExtraModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 18px 32px', zIndex: 9999, boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}>
            <h3 style={{ margin: '0 0 14px', fontWeight: 800, color: '#1e293b' }}>💰 Agregar cobro extra</h3>
            <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Monto extra (Gs.)</label>
            <input type="number" value={extraAmount || ''} onChange={e => setExtraAmount(Number(e.target.value))} placeholder="Ej: 20000"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: '1rem', marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Motivo</label>
            <input type="text" value={extraReason} onChange={e => setExtraReason(e.target.value)} placeholder="Ej: Material adicional"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: '0.93rem', marginBottom: 16, boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitExtra} disabled={extraSending || extraAmount <= 0}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: extraSending || extraAmount <= 0 ? '#86efac' : '#059669', color: '#fff', fontWeight: 700, cursor: extraSending || extraAmount <= 0 ? 'default' : 'pointer' }}>
                {extraSending ? 'Guardando…' : 'Confirmar'}
              </button>
              <button onClick={() => setExtraModal(null)}
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
