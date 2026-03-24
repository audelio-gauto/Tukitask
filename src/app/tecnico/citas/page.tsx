'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../../driver/context';

interface Job {
  id: string;
  created_at: string;
  status: string;
  service_type: string;
  client_name: string | null;
  client_email: string;
  address: string | null;
  scheduled_at: string | null;
  price: number | null;
  description: string | null;
  accepted_at: string | null;
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
  otros: '✨ Otros',
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  accepted:    { label: 'Confirmada',   color: '#059669', bg: '#d1fae5' },
  in_progress: { label: 'En progreso',  color: '#d97706', bg: '#fef3c7' },
};

export default function CitasPage() {
  const router = useRouter();
  const { email } = useDriverContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadJobs = useCallback(() => {
    if (!email) return;
    fetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&active=true`)
      .then(r => r.json())
      .then(data => { setJobs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    loadJobs();
    const iv = setInterval(loadJobs, 20_000);
    return () => clearInterval(iv);
  }, [loadJobs]);

  const doAction = async (jobId: string, action: 'complete' | 'cancel') => {
    if (!email || actionId) return;
    setActionId(jobId + action);
    try {
      const res = await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId, tecnicoEmail: email }),
      });
      const json = await res.json();
      if (json.job) setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch {}
    finally { setActionId(null); }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#0ea5e9', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>📅 Citas Confirmadas</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Tus trabajos activos</p>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p>Cargando citas...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, color: '#6b7280' }}>Sin citas confirmadas</p>
            <p style={{ fontSize: '0.85rem' }}>Aceptá una oferta para que aparezca acá.</p>
            <button
              onClick={() => router.push('/tecnico/ofertas')}
              style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              Ver ofertas
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {jobs.map(job => {
              const st = STATUS_LABEL[job.status] ?? { label: job.status, color: '#64748b', bg: '#f1f5f9' };
              return (
                <div key={job.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                      {SERVICE_LABELS[job.service_type] ?? job.service_type}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: st.color, background: st.bg, borderRadius: 8, padding: '3px 10px' }}>
                      {st.label}
                    </span>
                  </div>
                  {job.description && (
                    <p style={{ margin: '0 0 6px', fontSize: '0.83rem', color: '#64748b' }}>{job.description}</p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, fontSize: '0.8rem', color: '#64748b' }}>
                    {job.client_name && <span>👤 {job.client_name}</span>}
                    {job.address && <span>📍 {job.address}</span>}
                    {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                    {job.price != null && (
                      <span style={{ fontWeight: 700, color: '#059669' }}>
                        💰 {Number(job.price).toLocaleString('es-PY')} Gs.
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => doAction(job.id, 'complete')}
                      disabled={!!actionId}
                      style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      ✅ Completar
                    </button>
                    <button
                      onClick={() => doAction(job.id, 'cancel')}
                      disabled={!!actionId}
                      style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      ✕ Cancelar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
