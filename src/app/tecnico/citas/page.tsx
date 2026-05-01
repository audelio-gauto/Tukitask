'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useWorkerContext } from '../../driver/context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import ChatModal from '@/components/ChatModal';
import { playMessageAlert } from '@/lib/audio';

interface ExtraItem { amount: number; reason: string }

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
  extra_items: ExtraItem[] | null;
  total_price: number | null;
  description: string | null;
  audio_url: string | null;
  accepted_at: string | null;
  completion_attempts: number;
  last_rejection_reason: string | null;
  warranty_days: number | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: 'Limpieza',
  niera: 'Niñera',
  cocina: 'Cocina',
  eventos: 'Eventos',
  cuidado_mascotas: 'Cuidado Mascotas',
  cuidado_adultos: 'Cuidado adultos',
  aire_split: 'Tec Aire Split',
  electrico: 'Serv. Eléctrico',
  plomeria: 'Serv. Plomería',
  cerrajeria: 'Serv. Cerrajería',
  gestor: 'Gestor',
  otros: 'Otros',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  accepted:           { label: 'Confirmada',          color: '#059669', bg: '#d1fae5' },
  en_camino:          { label: 'En camino',            color: '#0ea5e9', bg: '#e0f2fe' },
  llegue:             { label: 'Llegué',               color: '#C8960A', bg: '#FEF9E7' },
  en_proceso:         { label: 'En proceso',           color: '#d97706', bg: '#fef3c7' },
  completion_pending: { label: 'Esperando cliente',    color: '#C8960A', bg: '#FEF9E7' },
  incidente:          { label: 'Incidente',            color: '#ef4444', bg: '#fee2e2' },
};
const BRAND = '#F5C518';
const BRAND_SHADOW = 'rgba(245,197,24,0.35)';

const JOB_STEPS = [
  { key: 'accepted',           label: 'Aceptado'  },
  { key: 'en_camino',          label: 'En camino' },
  { key: 'llegue',             label: 'Llegüé'    },
  { key: 'en_proceso',         label: 'Trabajando'},
  { key: 'completion_pending', label: 'Completado'},
] as const;
export default function CitasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { email, displayName } = useWorkerContext();
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  // Chat
  const [chatOpen, setChatOpen]             = useState(false);
  const [chatJobId, setChatJobId]           = useState<string | undefined>(undefined);
  const [chatOtherName, setChatOtherName]   = useState<string | null>(null);
  const [chatOtherPhoto, setChatOtherPhoto] = useState<string | null>(null);
  // Chat toast for incoming messages
  const [chatToast, setChatToast] = useState<{ jobId: string; clientName: string | null; text: string } | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-open most recent unread chat when badge redirects here
  useEffect(() => {
    if (!searchParams.get('openChat') || jobs.length === 0 || chatOpen) return;
    authFetch('/api/chat/threads')
      .then(r => r.json())
      .then((threads: Array<{ job_id: string | null; unread_count: number; last_message_at: string }>) => {
        const target = threads
          .filter(t => t.job_id && t.unread_count > 0)
          .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())[0];
        const targetJobId = target?.job_id ?? jobs[0]?.id;
        const job = jobs.find(j => j.id === targetJobId) ?? jobs[0];
        if (job) {
          setChatJobId(job.id);
          setChatOtherName(job.client_name || job.client_email?.split('@')[0] || 'Cliente');
          setChatOtherPhoto(job.client_photo ?? null);
          setChatOpen(true);
        }
      })
      .catch(() => {});
  }, [searchParams, jobs, chatOpen]);

  // Confirm action modal
  const [confirmModal, setConfirmModal] = useState<{ jobId: string; action: string; message: string } | null>(null);

  // Warranty modal
  const [warrantyModal, setWarrantyModal] = useState<{ jobId: string; input: string } | null>(null);
  const [warrantySending, setWarrantySending] = useState(false);

  // Extra charge modal
  interface ExtraModalState {
    jobId: string;
    items: ExtraItem[];
    editIndex: number | null;
    formAmount: number;
    formAmountDisplay: string;
    formReason: string;
  }
  const [extraModal, setExtraModal] = useState<ExtraModalState | null>(null);
  const [extraSending, setExtraSending] = useState(false);

  // GPS broadcasting refs
  const watchIdRef     = useRef<number | null>(null);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef     = useRef<{ lat: number; lng: number } | null>(null);
  const lastSentAtRef  = useRef(0);

  // Start/stop GPS broadcast depending on active jobs
  useEffect(() => {
    if (!email) return;

    const TRACKING_STATUSES = ['en_camino', 'en_proceso', 'llegue'];
    const trackingJob = jobs.find(j => TRACKING_STATUSES.includes(j.status));

    if (trackingJob) {
      try {
        localStorage.setItem('tecnico_active_job_id', trackingJob.id);
        localStorage.setItem('tecnico_active_job_ts', String(Date.now()));
      } catch {}
      if (!navigator.geolocation) return;

      const MIN_DISTANCE_M = 50; // Only broadcast if moved > 50 meters
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
        const now = Date.now();
        if (now - lastSentAtRef.current < 15000) return;
        lastSentAtRef.current = now;
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

      // Also poll every 30s in case watchPosition fires slowly
      if (gpsIntervalRef.current === null) {
        gpsIntervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => broadcast(pos.coords.latitude, pos.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 5000 },
          );
        }, 30_000);
      }
    } else {
      try {
        localStorage.removeItem('tecnico_active_job_id');
        localStorage.removeItem('tecnico_active_job_ts');
      } catch {}
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
    // Fallback polling at 3 min; realtime is primary
    const iv = setInterval(loadJobs, 180_000);

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

  // Realtime subscription for incoming chat messages → show toast
  useEffect(() => {
    if (!email || jobs.length === 0) return;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    jobs.forEach(job => {
      const ch = supabase
        .channel(`tecnico-chat-${job.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'chat_messages',
          filter: `job_id=eq.${job.id}`,
        } as never, (payload: { new: { sender_email: string; sender_name: string | null; content: string } }) => {
          const msg = payload.new;
          if (msg.sender_email?.toLowerCase() === email.toLowerCase()) return;
          if (chatOpen && chatJobId === job.id) return;
          if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
          playMessageAlert();
          setChatToast({ jobId: job.id, clientName: job.client_name || 'Cliente', text: msg.content.slice(0, 70) });
          chatToastTimerRef.current = setTimeout(() => setChatToast(null), 6000);
        })
        .subscribe();
      channels.push(ch);
    });
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, email]);

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

  /** Wrap doAction with an inline confirm modal for destructive actions */
  const doActionConfirmed = (jobId: string, action: string, message: string) => {
    setConfirmModal({ jobId, action, message });
  };

  const openExtraModal = (job: Job) => {
    const items: ExtraItem[] = Array.isArray(job.extra_items) ? job.extra_items : [];
    setExtraModal({ jobId: job.id, items, editIndex: null, formAmount: 0, formAmountDisplay: '', formReason: '' });
  };

  const extraFormConfirm = () => {
    if (!extraModal || extraModal.formAmount <= 0) return;
    const newItem: ExtraItem = { amount: extraModal.formAmount, reason: extraModal.formReason };
    const newItems = extraModal.editIndex !== null
      ? extraModal.items.map((it, i) => i === extraModal.editIndex ? newItem : it)
      : [...extraModal.items, newItem];
    setExtraModal(prev => prev ? { ...prev, items: newItems, editIndex: null, formAmount: 0, formAmountDisplay: '', formReason: '' } : null);
  };

  const extraItemDelete = (index: number) => {
    if (!extraModal) return;
    setExtraModal(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== index), editIndex: null } : null);
  };

  const extraItemEdit = (index: number) => {
    if (!extraModal) return;
    const item = extraModal.items[index];
    setExtraModal(prev => prev ? { ...prev, editIndex: index, formAmount: item.amount, formAmountDisplay: Number(item.amount).toLocaleString('es-PY'), formReason: item.reason } : null);
  };

  const submitWarranty = async () => {
    if (!warrantyModal || !email || warrantySending) return;
    const days = parseInt(warrantyModal.input, 10);
    if (isNaN(days) || days <= 0) return;
    setWarrantySending(true);
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_warranty', jobId: warrantyModal.jobId, tecnicoEmail: email, warrantyDays: days }),
      });
      const json = await res.json();
      if (json.job) setJobs(prev => prev.map(j => j.id === warrantyModal!.jobId ? { ...j, ...json.job } : j));
    } catch {}
    setWarrantySending(false);
    setWarrantyModal(null);
  };

  const submitExtra = async () => {
    if (!extraModal || !email || extraSending) return;
    setExtraSending(true);
    try {
      const res  = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_extra', jobId: extraModal.jobId, tecnicoEmail: email, extraItems: extraModal.items }),
      });
      const json = await res.json();
      if (json.job) setJobs(prev => prev.map(j => j.id === extraModal!.jobId ? { ...j, ...json.job } : j));
    } catch {}
    setExtraSending(false);
    setExtraModal(null);
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs.` : '—';

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--content-bg)', paddingBottom: 80 }}>
      {/* Chat toast — new message incoming */}
      {chatToast && (
        <div
          onClick={() => {
            if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
            setChatToast(null);
            const job = jobs.find(j => j.id === chatToast.jobId);
            setChatJobId(chatToast.jobId);
            setChatOtherName(chatToast.clientName);
            setChatOtherPhoto(job?.client_photo ?? null);
            setChatOpen(true);
          }}
          style={{
            position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, width: 'calc(100% - 28px)', maxWidth: 400,
            background: '#0f2920', border: '1.5px solid rgba(34,197,94,0.55)',
            borderRadius: 18, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.75)',
            cursor: 'pointer',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '0.72rem', marginBottom: 2 }}>NUEVO MENSAJE · CLIENTE</div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chatToast.clientName ? `${chatToast.clientName}: ` : ''}{chatToast.text}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current); setChatToast(null); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 28, height: 28, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
        </div>
      )}
      <div style={{ background: 'var(--header-bg)', borderBottom: '1px solid var(--header-border)', color: 'var(--text-primary)', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Citas Activas</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Tus trabajos en curso</p>
        </div>
          <button onClick={loadJobs} style={{ marginLeft: 'auto', background: 'rgba(245,197,24,0.15)', border: 'none', color: '#F5C518', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1, 2].map(i => (
              <div key={i} style={{ background: 'var(--surface-2)', borderRadius: 16, padding: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ height: 16, width: 120, borderRadius: 6, background: 'rgba(255,255,255,0.08)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 24, width: 80, borderRadius: 8, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 12, width: '60%', borderRadius: 5, background: 'rgba(255,255,255,0.08)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    <div style={{ height: 10, width: '80%', borderRadius: 5, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </div>
                </div>
                <div style={{ height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Sin citas activas</p>
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
                <div key={job.id} style={{
                  background: 'var(--card-bg)',
                  borderRadius: 16,
                  border: `1.5px solid ${st.color}33`,
                  boxShadow: `0 2px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)`,
                  overflow: 'hidden',
                }}>
                  {/* Status header strip */}
                  <div style={{
                    background: `linear-gradient(135deg, ${st.color}22, ${st.color}10)`,
                    borderBottom: `1px solid ${st.color}30`,
                    padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {SERVICE_LABELS[job.service_type] ?? job.service_type}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: st.color, background: `${st.color}22`, borderRadius: 8, padding: '3px 10px', border: `1px solid ${st.color}40`, flexShrink: 0 }}>
                      {st.label}
                    </span>
                  </div>

                  <div style={{ padding: '14px 16px 16px' }}>
                  {/* Progress stepper */}
                  {job.status !== 'incidente' && (() => {
                    const activeIdx = JOB_STEPS.findIndex(s => s.key === job.status);
                    return (
                      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16, padding: '2px 0 0' }}>
                        {JOB_STEPS.map((step, i) => {
                          const done = i < activeIdx;
                          const active = i === activeIdx;
                          return (
                            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                              {i > 0 && (
                                <div style={{
                                  position: 'absolute', top: 5, right: '50%', left: '-50%',
                                  height: 2,
                                  background: done ? BRAND : active ? 'rgba(245,197,24,0.35)' : 'rgba(255,255,255,0.1)',
                                  transition: 'background 0.3s',
                                }} />
                              )}
                              <div style={{
                                width: 12, height: 12, borderRadius: '50%', zIndex: 1, position: 'relative',
                                background: done || active ? BRAND : 'rgba(255,255,255,0.15)',
                                boxShadow: active ? `0 0 0 3px ${BRAND_SHADOW}` : 'none',
                                transition: 'all 0.3s',
                              }} />
                              <span style={{
                                fontSize: '0.58rem',
                                color: active ? BRAND : done ? 'rgba(245,197,24,0.6)' : 'rgba(255,255,255,0.25)',
                                fontWeight: active ? 700 : 400,
                                marginTop: 4,
                                textAlign: 'center',
                                lineHeight: 1.2,
                              }}>{step.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Client info row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    {job.client_photo
                      ? <img src={job.client_photo} alt={job.client_name ?? 'Cliente'} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BRAND}`, boxShadow: `0 0 0 3px ${BRAND_SHADOW}`, flexShrink: 0 }} />
                      : <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg, ${BRAND}, #F58A07)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0, border: `2px solid ${BRAND}`, boxShadow: `0 0 0 3px ${BRAND_SHADOW}`, color: '#1C1C2E', fontWeight: 800 }}>
                          {(job.client_name ?? 'C')[0].toUpperCase()}
                        </div>
                    }
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {job.client_name && <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{job.client_name}</span>}
                      {job.address && <span>📍 {job.address}</span>}
                      {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                    </div>
                    {/* Chat button */}
                    <button
                      onClick={() => { setChatJobId(job.id); setChatOtherName(job.client_name); setChatOtherPhoto(job.client_photo ?? null); setChatOpen(true); }}
                      style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#16a34a', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}
                    >
                      💬 Chat
                    </button>
                  </div>

                  {/* Audio del cliente */}
                  {job.audio_url && (
                    <div style={{ marginBottom: 10, padding: '8px 10px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>🎙 Audio del cliente</p>
                      <audio controls src={job.audio_url} style={{ width: '100%', height: 36 }} />
                    </div>
                  )}

                  {/* Price row */}
                  <div style={{ marginBottom: 12, fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {job.agreed_price != null && (
                        <span style={{ fontWeight: 700, color: '#059669' }}>💰 Acordado: {fmtGs(job.agreed_price)}</span>
                      )}
                      {job.total_price != null && job.extra_charge != null && job.extra_charge > 0 && (
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>= Total: {fmtGs(job.total_price)}</span>
                      )}
                    </div>
                    {Array.isArray(job.extra_items) && job.extra_items.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {job.extra_items.map((it, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: '#f59e0b' }}>➕ {it.reason || 'Extra'}: {fmtGs(it.amount)}</span>
                          </div>
                        ))}
                      </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Row 1: Extras + Garantía */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openExtraModal(job)}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1.5px solid #f59e0b', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                          💰 Extras
                        </button>
                        <button onClick={() => setWarrantyModal({ jobId: job.id, input: job.warranty_days != null ? String(job.warranty_days) : '' })}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `1.5px solid ${job.warranty_days ? '#6366f1' : 'rgba(99,102,241,0.4)'}`, background: job.warranty_days ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.08)', color: '#818cf8', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                          🛡️ {job.warranty_days ? `${job.warranty_days}d` : 'Garantía'}
                        </button>
                      </div>
                      {/* Row 2: Marcar completado full width */}
                      <button onClick={() => doActionConfirmed(job.id, 'completion_pending', '¿Marcar el servicio como completado? El cliente deberá confirmarlo.')} disabled={busy}
                        style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #10b981, #059669)', color: busy ? '#6b7280' : '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : '0 4px 16px rgba(16,185,129,0.3)' }}>
                        ✅ Marcar completado
                      </button>
                    </div>
                  )}

                  {job.status === 'completion_pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 12, background: '#FEF9E7', color: '#C8960A', fontWeight: 700, fontSize: '0.85rem' }}>
                        ⏳ Esperando cliente… ({job.completion_attempts}/3)
                      </div>
                      <button onClick={() => openExtraModal(job)}
                        style={{ padding: '10px 12px', borderRadius: 12, border: '1.5px solid #f59e0b', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                        💰 Extras
                      </button>
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
                      style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: 10, border: '1.5px solid var(--border-strong)', background: 'var(--glass-card)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', cursor: busy ? 'default' : 'pointer' }}>
                      Cancelar trabajo
                    </button>
                  )}
                  </div>{/* end inner padding */}
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
        myRole="tecnico"
        otherName={chatOtherName}
        otherPhoto={chatOtherPhoto}
      />

      {/* Warranty modal */}
      {warrantyModal && (
        <>
          <div onClick={() => setWarrantyModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--modal-bg)', borderRadius: '20px 20px 0 0', padding: '24px 18px 36px', zIndex: 9999, boxShadow: '0 -4px 24px rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)' }}>
            <h3 style={{ margin: '0 0 6px', fontWeight: 800, color: 'var(--text-primary)' }}>🛡️ Días de garantía</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>Ingresá la cantidad de días de garantía del trabajo (ej: 15, 30, 90).</p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={warrantyModal.input}
              onChange={e => setWarrantyModal(prev => prev ? { ...prev, input: e.target.value } : null)}
              placeholder="Ej: 30"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '1.2rem', fontWeight: 700, marginBottom: 16, boxSizing: 'border-box', outline: 'none', textAlign: 'center' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={submitWarranty}
                disabled={warrantySending || !warrantyModal.input || Number(warrantyModal.input) <= 0}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: warrantySending || !warrantyModal.input || Number(warrantyModal.input) <= 0 ? 'rgba(99,102,241,0.3)' : '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                {warrantySending ? 'Guardando…' : '💾 Guardar garantía'}
              </button>
              <button onClick={() => setWarrantyModal(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid var(--border-strong)', background: 'var(--glass-card)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Extra charge modal */}
      {extraModal && (
        <>
          <div onClick={() => setExtraModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--modal-bg)', borderRadius: '20px 20px 0 0', padding: '20px 18px 32px', zIndex: 9999, boxShadow: '0 -4px 24px rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 14px', fontWeight: 800, color: 'var(--text-primary)' }}>💰 Cobros extras</h3>

            {/* Current extras list */}
            {extraModal.items.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {extraModal.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 10, marginBottom: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.9rem' }}>{fmtGs(it.amount)}</div>
                      {it.reason && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{it.reason}</div>}
                    </div>
                    <button onClick={() => extraItemEdit(i)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>✏️</button>
                    <button onClick={() => extraItemDelete(i)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>🗑️</button>
                  </div>
                ))}
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', marginTop: 4 }}>
                  Total extras: {fmtGs(extraModal.items.reduce((s, i) => s + i.amount, 0))}
                </div>
              </div>
            )}

            {/* Add / Edit form */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px', marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {extraModal.editIndex !== null ? `✏️ Editando ítem ${extraModal.editIndex + 1}` : '➕ Agregar ítem'}
              </p>
              <label style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Monto (Gs.)</label>
              <input type="text" inputMode="numeric" value={extraModal.formAmountDisplay}
                onChange={e => { const raw = e.target.value.replace(/\D/g, ''); setExtraModal(prev => prev ? { ...prev, formAmountDisplay: raw ? Number(raw).toLocaleString('es-PY') : '', formAmount: raw ? Number(raw) : 0 } : null); }}
                placeholder="Ej: 20.000"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '1rem', marginBottom: 10, boxSizing: 'border-box', outline: 'none' }} />
              <label style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Motivo</label>
              <input type="text" value={extraModal.formReason}
                onChange={e => setExtraModal(prev => prev ? { ...prev, formReason: e.target.value } : null)}
                placeholder="Ej: Material adicional"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.93rem', marginBottom: 10, boxSizing: 'border-box', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={extraFormConfirm} disabled={extraModal.formAmount <= 0}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: extraModal.formAmount <= 0 ? 'rgba(245,158,11,0.3)' : '#f59e0b', color: '#1C1C2E', fontWeight: 700, cursor: extraModal.formAmount <= 0 ? 'default' : 'pointer' }}>
                  {extraModal.editIndex !== null ? '✔ Actualizar' : '+ Agregar'}
                </button>
                {extraModal.editIndex !== null && (
                  <button onClick={() => setExtraModal(prev => prev ? { ...prev, editIndex: null, formAmount: 0, formAmountDisplay: '', formReason: '' } : null)}
                    style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--glass-card)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Save / Cancel */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitExtra} disabled={extraSending}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: extraSending ? 'rgba(5,150,105,0.4)' : '#059669', color: '#fff', fontWeight: 700, cursor: extraSending ? 'default' : 'pointer' }}>
                {extraSending ? 'Guardando…' : '💾 Guardar'}
              </button>
              <button onClick={() => setExtraModal(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid var(--border-strong)', background: 'var(--glass-card)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
      {/* Confirm action modal */}
      {confirmModal && (
        <>
          <div onClick={() => setConfirmModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--modal-bg)', borderRadius: '20px 20px 0 0', padding: '24px 18px 36px', zIndex: 9999, boxShadow: '0 -4px 24px rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ margin: '0 0 20px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1.4 }}>{confirmModal.message}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { doAction(confirmModal.jobId, confirmModal.action); setConfirmModal(null); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid var(--border-strong)', background: 'var(--glass-card)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
