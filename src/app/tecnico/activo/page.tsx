'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkerContext } from '../../driver/context';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import DriverScreenLayout from '../../driver/components/DriverScreenLayout';
import ChatModal from '@/components/ChatModal';

const ACTIVE_STATUSES = ['accepted', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'] as const;
type ActiveStatus = typeof ACTIVE_STATUSES[number];

const STATUS_LABEL: Record<ActiveStatus, { label: string; color: string; bg: string; icon: string }> = {
  accepted:           { label: 'Confirmado',          color: '#4ade80', bg: 'rgba(74,222,128,0.15)',  icon: '✅' },
  en_camino:          { label: 'En camino',            color: '#60a5fa', bg: 'rgba(96,165,250,0.15)', icon: '🚗' },
  llegue:             { label: 'Llegué',               color: '#F5C518', bg: 'rgba(245,197,24,0.15)', icon: '📍' },
  en_proceso:         { label: 'En proceso',           color: '#fb923c', bg: 'rgba(251,146,60,0.15)', icon: '🔧' },
  completion_pending: { label: 'Esperando cliente',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)',icon: '⏳' },
};

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza',
  niera: '👶 Niñera',
  cocina: '🍳 Cocina',
  eventos: '🎉 Eventos',
  cuidado_mascotas: '🐾 Mascotas',
  cuidado_adultos: '👴 Adultos',
  gestor: '📋 Gestor',
  aire_split: '❄️ Tec Aire Split',
  electrico: '⚡ Serv. Eléctrico',
  plomeria: '🔧 Serv. Plomería',
  cerrajeria: '🔑 Cerrajería',
  otros: '✨ Otros',
};

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
  photos: string[] | null;
  accepted_at: string | null;
  completion_attempts: number;
  last_rejection_reason: string | null;
}

function openMaps(address: string) {
  window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`, '_blank');
}

export default function TecnicoActivoPage() {
  const { email, displayName } = useWorkerContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  // Toast
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toastIdRef = useRef(0);

  // Chat
  const [chatModal, setChatModal] = useState<{ jobId: string; clientName: string | null; clientPhoto: string | null } | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // GPS
  const watchIdRef = useRef<number | null>(null);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);

  const showToast = (msg: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  };

  const fetchActive = useCallback(() => {
    if (!email) return;
    authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&active=true`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const active = data.filter(j => (ACTIVE_STATUSES as readonly string[]).includes(j.status));
          setJobs(active);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  const fetchUnreadCounts = useCallback((jobIds: string[]) => {
    if (!jobIds.length) return;
    jobIds.forEach(id => {
      authFetch(`/api/chat?job_id=${id}&count=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && typeof d.unread === 'number') {
            setUnreadCounts(prev => ({ ...prev, [id]: d.unread }));
          }
        })
        .catch(() => {});
    });
  }, []);

  // Realtime subscription + polling
  useEffect(() => {
    fetchActive();
    const iv = setInterval(fetchActive, 60_000);
    const ch = email
      ? supabase.channel(`tecnico-activo-${email}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'tecnico_jobs',
            filter: `tecnico_email=eq.${email}`,
          } as never, () => fetchActive())
          .subscribe()
      : null;
    return () => {
      clearInterval(iv);
      if (ch) supabase.removeChannel(ch);
    };
  }, [fetchActive, email]);

  // Poll unread counts when jobs change
  useEffect(() => {
    const ids = jobs.map(j => j.id);
    fetchUnreadCounts(ids);
    const iv = setInterval(() => fetchUnreadCounts(ids), 10_000);
    return () => clearInterval(iv);
  }, [jobs, fetchUnreadCounts]);

  // Clear unread when chat opens
  useEffect(() => {
    if (chatModal?.jobId) {
      setUnreadCounts(prev => ({ ...prev, [chatModal.jobId]: 0 }));
    }
  }, [chatModal?.jobId]);

  // GPS broadcast when en_camino, llegue, en_proceso
  useEffect(() => {
    if (!email) return;
    const TRACKING_STATUSES = ['en_camino', 'llegue', 'en_proceso'];
    const trackingJob = jobs.find(j => TRACKING_STATUSES.includes(j.status));

    if (trackingJob) {
      if (!navigator.geolocation) return;
      const MIN_DIST = 30;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const haversineDist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const R = 6371000;
        const x = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
      };
      const broadcast = (lat: number, lng: number) => {
        if (lastPosRef.current && haversineDist(lastPosRef.current, { lat, lng }) < MIN_DIST) return;
        lastPosRef.current = { lat, lng };
        fetch('/api/driver-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_email: email, job_id: trackingJob.id, lat, lng }),
        }).catch(() => {});
      };
      if (watchIdRef.current === null) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          p => broadcast(p.coords.latitude, p.coords.longitude),
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000 },
        );
      }
      if (gpsIntervalRef.current === null) {
        gpsIntervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            p => broadcast(p.coords.latitude, p.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 5000 },
          );
        }, 10_000);
      }
    } else {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (gpsIntervalRef.current !== null) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    }
    return () => {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (gpsIntervalRef.current !== null) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    };
  }, [jobs, email]);

  const doAction = async (jobId: string, action: string, extraBody?: Record<string, unknown>) => {
    const key = jobId + action;
    setActing(key);
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId, tecnicoEmail: email, ...extraBody }),
      });
      const json = await res.json();
      if (json.job) {
        if (['cancel'].includes(action)) {
          setJobs(prev => prev.filter(j => j.id !== jobId));
          showToast('Trabajo cancelado.');
        } else {
          setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...json.job } : j));
          if (action === 'mark_complete') showToast('⏳ Esperando confirmación del cliente…');
        }
      } else {
        showToast('❌ ' + (json?.error || 'Error al actualizar'));
      }
    } catch {
      showToast('❌ Error de conexión. Intentá de nuevo.');
    }
    setActing(null);
  };

  const doConfirm = (jobId: string, action: string, message: string) => {
    if (window.confirm(message)) doAction(jobId, action);
  };

  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs.` : '—';
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  const renderCard = (job: Job) => {
    const status = job.status as ActiveStatus;
    const statusInfo = STATUS_LABEL[status] ?? { label: job.status, color: '#64748b', bg: 'rgba(100,116,139,0.15)', icon: '•' };
    const clientName = job.client_name || job.client_email?.split('@')[0] || 'Cliente';
    const clientPhoto = job.client_photo || null;
    const busy = !!acting;

    return (
      <div key={job.id} style={{
        background: 'var(--glass-card)',
        border: `1.5px solid ${statusInfo.color}40`,
        borderRadius: 18,
        marginBottom: 16,
        overflow: 'hidden',
      }}>
        {/* Status header */}
        <div style={{
          background: statusInfo.bg,
          borderBottom: `1px solid ${statusInfo.color}30`,
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: statusInfo.color, fontWeight: 700, fontSize: '0.9rem' }}>
            {statusInfo.icon} {statusInfo.label}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            {SERVICE_LABELS[job.service_type] ?? job.service_type}
          </span>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: clientPhoto
                ? `url(${clientPhoto}) center/cover`
                : 'linear-gradient(135deg, #F5C518, #F58A07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1C1C2E', fontWeight: 700, fontSize: '1.2rem',
              border: '2px solid var(--border-strong)',
            }}>
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{clientName}</div>
              {job.client_rating != null && job.client_rating > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>⭐ {Number(job.client_rating).toFixed(1)}</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '1.15rem' }}>
                {fmtGs(job.total_price ?? job.agreed_price)}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>acordado</div>
            </div>
          </div>

          {/* Chat button */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => setChatModal({ jobId: job.id, clientName, clientPhoto })}
              style={{
                flex: 1, padding: '9px', borderRadius: 10,
                border: '1px solid rgba(99,180,255,0.3)',
                background: unreadCounts[job.id] ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.12)',
                color: '#60a5fa', fontWeight: 700, fontSize: '0.83rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              💬 Chat con el cliente
              {!!unreadCounts[job.id] && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 800 }}>
                  {unreadCounts[job.id]}
                </span>
              )}
            </button>
          </div>

          {/* Address */}
          {job.address && (
            <div style={{ background: 'var(--surface-3)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Dirección</div>
              <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginBottom: 10 }}>{job.address}</div>
              {job.lat && job.lng && (
                <button
                  onClick={() => openMaps(job.address!)}
                  style={{ width: '100%', padding: '8px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: '#4ade80', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  🗺️ Navegar
                </button>
              )}
            </div>
          )}

          {/* Scheduled */}
          {job.scheduled_at && (
            <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: '0.8rem', color: '#818cf8' }}>
              📅 Programado: {fmtDate(job.scheduled_at)}
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div style={{ background: 'var(--surface-3)', borderRadius: 10, padding: '9px 13px', marginBottom: 14, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Descripción: </span>
              {job.description}
            </div>
          )}

          {/* Audio */}
          {job.audio_url && (
            <div style={{ marginBottom: 14, padding: '8px 10px', background: 'rgba(5,150,105,0.1)', borderRadius: 8, border: '1px solid rgba(5,150,105,0.3)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase' }}>🎙 Audio del cliente</p>
              <audio controls src={job.audio_url} style={{ width: '100%', height: 36 }} />
            </div>
          )}

          {/* Photos */}
          {job.photos && job.photos.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Fotos</div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
                {job.photos.map((url, i) => (
                  <img key={i} src={url} alt={`foto ${i + 1}`} onClick={() => window.open(url, '_blank')}
                    style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)', cursor: 'pointer' }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          {status === 'accepted' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={busy}
                onClick={() => doAction(job.id, 'en_camino')}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: busy ? 'rgba(255,255,255,0.08)' : '#0ea5e9', color: busy ? 'rgba(255,255,255,0.4)' : '#fff', fontWeight: 700, fontSize: '0.95rem', opacity: busy ? 0.7 : 1 }}
              >
                {acting === job.id + 'en_camino' ? 'Actualizando...' : '🚗 Voy en camino'}
              </button>
              {job.lat && job.lng && (
                <button
                  onClick={() => openMaps(job.address!)}
                  style={{ padding: '13px 16px', borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  🧭
                </button>
              )}
            </div>
          )}

          {status === 'en_camino' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {job.address && (
                <button
                  onClick={() => openMaps(job.address!)}
                  style={{ width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  🧭 Navegar al cliente
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => doAction(job.id, 'llegue')}
                style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: busy ? 'rgba(255,255,255,0.08)' : '#F5C518', color: busy ? 'rgba(255,255,255,0.4)' : '#1C1C2E', fontWeight: 700, fontSize: '0.95rem', opacity: busy ? 0.7 : 1 }}
              >
                {acting === job.id + 'llegue' ? 'Actualizando...' : '📍 Ya llegué'}
              </button>
            </div>
          )}

          {status === 'llegue' && (
            <button
              disabled={busy}
              onClick={() => doAction(job.id, 'en_proceso')}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: busy ? 'rgba(255,255,255,0.08)' : '#fb923c', color: busy ? 'rgba(255,255,255,0.4)' : '#fff', fontWeight: 700, fontSize: '0.95rem', opacity: busy ? 0.7 : 1 }}
            >
              {acting === job.id + 'en_proceso' ? 'Actualizando...' : '▶ Iniciar servicio'}
            </button>
          )}

          {status === 'en_proceso' && (
            <button
              disabled={busy}
              onClick={() => doConfirm(job.id, 'mark_complete', '¿Marcar el servicio como completado? El cliente deberá confirmarlo.')}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: busy ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #10b981, #059669)', color: busy ? 'rgba(255,255,255,0.4)' : '#fff', fontWeight: 700, fontSize: '0.95rem', opacity: busy ? 0.7 : 1 }}
            >
              {acting === job.id + 'mark_complete' ? 'Enviando...' : '✅ Marcar como completado'}
            </button>
          )}

          {status === 'completion_pending' && (
            <div style={{ textAlign: 'center', padding: '14px', borderRadius: 12, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', fontWeight: 700, fontSize: '0.88rem' }}>
              ⏳ Esperando confirmación del cliente… ({job.completion_attempts}/3)
            </div>
          )}

          {/* Cancel option for early statuses */}
          {['accepted', 'en_camino'].includes(status) && (
            <button
              disabled={busy}
              onClick={() => doConfirm(job.id, 'cancel', '¿Cancelar este trabajo? Esta acción no se puede deshacer.')}
              style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 10, border: '1.5px solid var(--border-strong)', background: 'var(--glass-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              Cancelar trabajo
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Trabajo Activo">
      {/* Toast queue */}
      {toasts.map((t, i) => (
        <div key={t.id} style={{
          position: 'fixed', top: 80 + i * 48, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-1)', border: '1px solid var(--border-strong)',
          borderRadius: 12, padding: '10px 20px', color: 'var(--text-primary)',
          fontSize: '0.88rem', fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}>
          {t.msg}
        </div>
      ))}

      {loading ? (
        <div style={{ padding: 24 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 18, padding: 18, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
              <div style={{ height: 16, width: 120, borderRadius: 6, background: 'rgba(255,255,255,0.08)', marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, width: '60%', borderRadius: 5, background: 'rgba(255,255,255,0.08)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              </div>
              <div style={{ height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-muted)', padding: 24 }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🔧</div>
          <p style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: 8 }}>Sin trabajos activos</p>
          <p style={{ fontSize: '0.85rem', marginBottom: 0, lineHeight: 1.5 }}>
            Cuando aceptes un trabajo y esté en curso, aparecerá acá.
          </p>
        </div>
      ) : (
        <div style={{ padding: '16px 16px 24px' }}>
          {jobs.map(job => renderCard(job))}
        </div>
      )}

      {/* Chat Modal */}
      {chatModal && (
        <ChatModal
          open={!!chatModal}
          onClose={() => setChatModal(null)}
          jobId={chatModal.jobId}
          myEmail={email ?? ''}
          myName={displayName ?? ''}
          otherName={chatModal.clientName}
          otherPhoto={chatModal.clientPhoto}
        />
      )}
    </DriverScreenLayout>
  );
}
