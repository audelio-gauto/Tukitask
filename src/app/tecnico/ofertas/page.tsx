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
  client_rating: number | null;
  address: string | null;
  scheduled_at: string | null;
  client_initial_price: number | null;
  description: string | null;
  my_offer: { status: string; proposed_price: number } | null;
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
  const router  = useRouter();
  const { email } = useDriverContext();
  const [jobs, setJobs]   = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-job offer input state
  const [offerPrices, setOfferPrices] = useState<Record<string, number>>({});
  const [offerNotes, setOfferNotes]   = useState<Record<string, string>>({});
  const [sending, setSending]         = useState<string | null>(null);
  const [showInput, setShowInput]     = useState<string | null>(null); // jobId with open price input

  const loadOffers = useCallback(() => {
    if (!email) return;
    fetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&offers=true`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setJobs(arr);
        // Pre-fill offer prices with client's suggested price
        setOfferPrices(prev => {
          const next = { ...prev };
          arr.forEach((j: Job) => { if (!(j.id in next)) next[j.id] = j.client_initial_price ?? 0; });
          return next;
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    loadOffers();
    const iv = setInterval(loadOffers, 15_000);
    return () => clearInterval(iv);
  }, [loadOffers]);

  const sendOffer = async (jobId: string) => {
    if (!email || sending) return;
    const price = offerPrices[jobId];
    if (!price || price <= 0) return;
    setSending(jobId);
    try {
      const res  = await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_offer',
          jobId,
          tecnicoEmail: email,
          proposedPrice: price,
          note: offerNotes[jobId] || undefined,
        }),
      });
      const json = await res.json();
      if (json.offer) {
        setJobs(prev => prev.map(j => j.id === jobId
          ? { ...j, my_offer: { status: 'pending', proposed_price: price } }
          : j
        ));
        setShowInput(null);
      }
    } catch {}
    finally { setSending(null); }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs.` : null;

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#6366f1', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🎁 Solicitudes disponibles</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>Enviá tu precio — el cliente decide</p>
        </div>
        <button onClick={loadOffers} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
          ↺
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p>Buscando solicitudes...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</div>
            <p style={{ fontWeight: 600, color: '#6b7280' }}>Sin solicitudes por ahora</p>
            <p style={{ fontSize: '0.85rem' }}>Cuando llegue una solicitud que coincida con tu perfil aparecerá acá.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jobs.map(job => {
              const alreadySent = !!job.my_offer;
              const isOpen      = showInput === job.id;
              return (
                <div key={job.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: `1.5px solid ${alreadySent ? '#a5b4fc' : '#e2e8f0'}` }}>
                  {/* Service + client */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                      {SERVICE_LABELS[job.service_type] ?? job.service_type}
                    </span>
                    {job.client_initial_price != null && (
                      <span style={{ fontWeight: 800, color: '#0ea5e9', fontSize: '0.9rem' }}>
                        💬 {fmtGs(job.client_initial_price)}
                      </span>
                    )}
                  </div>

                  {job.description && (
                    <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#64748b' }}>{job.description}</p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, fontSize: '0.79rem', color: '#64748b' }}>
                    {job.client_name && <span>👤 {job.client_name}</span>}
                    {job.client_rating != null && <span>{'★'.repeat(Math.round(job.client_rating))} {job.client_rating.toFixed(1)}</span>}
                    {job.address && <span>📍 {job.address}</span>}
                    {job.scheduled_at && <span>📅 {fmtDate(job.scheduled_at)}</span>}
                  </div>

                  {/* Already sent */}
                  {alreadySent ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#e0e7ff', color: '#6366f1', fontWeight: 700, fontSize: '0.85rem' }}>
                      <span>📤 Oferta enviada:</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#4f46e5' }}>
                        {fmtGs(job.my_offer!.proposed_price)}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#818cf8' }}>⏳ esperando</span>
                    </div>
                  ) : isOpen ? (
                    /* Price input form */
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>
                          Tu precio (Gs.)
                        </label>
                        <input
                          type="number"
                          value={offerPrices[job.id] || ''}
                          onChange={e => setOfferPrices(prev => ({ ...prev, [job.id]: Number(e.target.value) }))}
                          placeholder={job.client_initial_price ? String(job.client_initial_price) : 'Ej: 150000'}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #6366f1', fontSize: '1rem', fontWeight: 700, boxSizing: 'border-box', outline: 'none' }}
                        />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 3 }}>
                          Nota (opcional)
                        </label>
                        <input
                          type="text"
                          value={offerNotes[job.id] || ''}
                          onChange={e => setOfferNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                          placeholder="Ej: Tengo experiencia en esto..."
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => sendOffer(job.id)}
                          disabled={sending === job.id || !(offerPrices[job.id] > 0)}
                          style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', background: sending === job.id || !(offerPrices[job.id] > 0) ? '#a5b4fc' : '#6366f1', color: '#fff', fontWeight: 700, cursor: sending === job.id ? 'default' : 'pointer' }}
                        >
                          {sending === job.id ? 'Enviando…' : '📤 Enviar oferta'}
                        </button>
                        <button onClick={() => setShowInput(null)}
                          style={{ padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>
                          ←
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Initial send button */
                    <button
                      onClick={() => setShowInput(job.id)}
                      style={{ width: '100%', padding: '10px', borderRadius: 12, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      💬 Enviar mi precio
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
