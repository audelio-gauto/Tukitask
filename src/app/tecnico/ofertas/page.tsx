'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../../driver/context';

interface Job {
  id: string;
  created_at: string;
  service_type: string;
  service_gender: string;
  client_name: string | null;
  address: string | null;
  scheduled_at: string | null;
  price: number | null;
  description: string | null;
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

export default function OfertasPage() {
  const router = useRouter();
  const { email } = useDriverContext();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const loadOffers = useCallback(() => {
    if (!email) return;
    fetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&offers=true`)
      .then(r => r.json())
      .then(data => { setJobs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    loadOffers();
    const iv = setInterval(loadOffers, 15_000);
    return () => clearInterval(iv);
  }, [loadOffers]);

  const accept = async (jobId: string) => {
    if (!email || accepting) return;
    setAccepting(jobId);
    try {
      const res = await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', jobId, tecnicoEmail: email }),
      });
      const json = await res.json();
      if (json.job) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        router.push('/tecnico/citas');
      }
    } catch {}
    finally { setAccepting(null); }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#6366f1', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🎁 Ofertas Activas</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Servicios disponibles para vos</p>
        </div>
        <button
          onClick={loadOffers}
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
        >
          ↺ Actualizar
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p>Buscando ofertas...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</div>
            <p style={{ fontWeight: 600, color: '#6b7280' }}>Sin ofertas por ahora</p>
            <p style={{ fontSize: '0.85rem' }}>Te avisaremos cuando llegue una solicitud que coincida con tu perfil.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {jobs.map(job => (
              <div key={job.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                    {SERVICE_LABELS[job.service_type] ?? job.service_type}
                  </span>
                  {job.price != null && (
                    <span style={{ fontWeight: 800, color: '#059669', fontSize: '0.95rem' }}>
                      {Number(job.price).toLocaleString('es-PY')} Gs.
                    </span>
                  )}
                </div>
                {job.description && (
                  <p style={{ margin: '0 0 6px', fontSize: '0.83rem', color: '#64748b' }}>{job.description}</p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, fontSize: '0.8rem', color: '#64748b' }}>
                  {job.client_name && <span>👤 {job.client_name}</span>}
                  {job.address && <span>📍 {job.address}</span>}
                  {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                </div>
                <button
                  onClick={() => accept(job.id)}
                  disabled={accepting === job.id}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                    background: accepting === job.id ? '#e0e7ff' : '#6366f1',
                    color: accepting === job.id ? '#6366f1' : '#fff',
                    fontWeight: 700, fontSize: '0.9rem', cursor: accepting === job.id ? 'default' : 'pointer',
                  }}
                >
                  {accepting === job.id ? 'Aceptando...' : '✅ Aceptar trabajo'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
