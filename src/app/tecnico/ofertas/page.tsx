'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useDriverContext } from '../../driver/context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';

const DriverMap = dynamic(() => import('../../driver/components/DriverMap'), { ssr: false });

// ── Haversine ────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Job {
  id: string;
  created_at: string;
  service_type: string;
  service_gender: string;
  client_name: string | null;
  client_photo: string | null;
  client_rating: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_at: string | null;
  client_initial_price: number | null;
  description: string | null;
  photos: string[] | null;
  audio_url: string | null;
  my_offer: { status: string; proposed_price: number } | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza', niera: '👶 Niñera', cocina: '🍳 Cocina',
  eventos: '🎉 Eventos', cuidado_mascotas: '🐾 Mascotas', cuidado_adultos: '👴 Adultos',
  aire_split: '❄️ Aire Split', electrico: '⚡ Eléctrico', plomeria: '🔧 Plomería',
  cerrajeria: '🔑 Cerrajería', otros: '✨ Otros',
};

export default function OfertasPage() {
  const router = useRouter();
  const { email, profilePhoto, displayName, avgRating } = useDriverContext();
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [loading, setLoading]         = useState(true);
  const [offerPrices, setOfferPrices] = useState<Record<string, number>>({});
  const [sending, setSending]         = useState<string | null>(null);
  const [showInput, setShowInput]     = useState<string | null>(null);
  const [lightbox, setLightbox]       = useState<string | null>(null);
  const [myPos, setMyPos]             = useState<{ lat: number; lng: number } | null>(null);
  const [sheetIndex, setSheetIndex]   = useState(0);
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set());

  // GPS live position
  useEffect(() => {
    if (!navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      pos => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  // Load pending service requests
  const loadOffers = useCallback(() => {
    if (!email) return;
    fetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&offers=true`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setJobs(arr);
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
    // Fallback polling at 60s; realtime is primary
    const iv = setInterval(loadOffers, 60_000);

    // Realtime: new pending jobs + offer status changes
    const ch = supabase.channel('tecnico-ofertas-marketplace')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tecnico_jobs' } as never, () => loadOffers())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tecnico_jobs' } as never, () => loadOffers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_job_offers' } as never, () => loadOffers())
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(ch);
    };
  }, [loadOffers]);

  const sendOffer = async (jobId: string, directPrice?: number) => {
    if (!email || sending) return;
    const price = directPrice ?? offerPrices[jobId];
    if (!price || price <= 0) return;
    setSending(jobId);
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_offer', jobId,
          tecnicoEmail: email,
          tecnicoName: displayName || null,
          tecnicoPhoto: profilePhoto || null,
          tecnicoRating: avgRating > 0 ? avgRating : null,
          proposedPrice: price,
          distanceKm: (myPos && currentJob?.lat != null && currentJob?.lng != null)
            ? haversineKm(myPos.lat, myPos.lng, Number(currentJob.lat), Number(currentJob.lng))
            : null,
        }),
      });
      const json = await res.json();
      if (json.offer) {
        setJobs(prev => prev.map(j => j.id === jobId
          ? { ...j, my_offer: { status: 'pending', proposed_price: price } } : j));
        setShowInput(null);
      }
    } catch {}
    finally { setSending(null); }
  };

  // Visible (not dismissed) jobs

  // Pagination for visibleJobs
  const [jobsPage, setJobsPage] = useState(1);
  const JOBS_PER_PAGE = 10;
  const visibleJobs = useMemo(() => jobs.filter(j => !dismissed.has(j.id)).slice(0, jobsPage * JOBS_PER_PAGE), [jobs, dismissed, jobsPage]);
  const safeIndex   = visibleJobs.length > 0 ? Math.min(sheetIndex, visibleJobs.length - 1) : 0;
  const currentJob  = visibleJobs[safeIndex] ?? null;

  const distKm = (myPos && currentJob?.lat != null && currentJob?.lng != null)
    ? haversineKm(myPos.lat, myPos.lng, Number(currentJob.lat), Number(currentJob.lng))
    : null;

  const dismissCurrent = () => {
    if (!currentJob) return;
    setDismissed(prev => new Set([...prev, currentJob.id]));
    setSheetIndex(0);
    setShowInput(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#1a1a2e', zIndex: 0 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      {/* ── FULL-SCREEN MAP BACKGROUND ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <DriverMap
          pickup={myPos ?? undefined}
          delivery={currentJob?.lat != null ? { lat: Number(currentJob.lat), lng: Number(currentJob.lng) } : null}
        />
      </div>

      {/* ── FLOATING HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        paddingTop: 'max(env(safe-area-inset-top, 8px), 12px)',
        padding: '0.75rem 1rem',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={() => router.back()}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0 }}>
          ←
        </button>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', flex: 1 }}>TukiTécnico</span>
        <button onClick={loadOffers}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
          ↺
        </button>
        {visibleJobs.length > 0 && (
          <span style={{ background: '#F5C518', color: '#1C1C2E', paddingInline: 10, paddingBlock: 4, borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
            {visibleJobs.length} solicitud{visibleJobs.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* ── LOADING overlay ── */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
          <div style={{ background: 'rgba(0,0,0,0.75)', borderRadius: 16, padding: '1.5rem 2rem', textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p style={{ margin: 0 }}>Buscando solicitudes…</p>
          </div>
        </div>
      )}

      {/* ── BOTTOM SHEET: incoming request ── */}
      {!loading && currentJob && (() => {
        const job         = currentJob;
        const alreadySent = !!job.my_offer;
        const isOpen      = showInput === job.id;
        const clientPrice = Number(job.client_initial_price || 0);
        const qo1 = Math.round(clientPrice * 1.0 / 1000) * 1000;
        const qo2 = Math.round(clientPrice * 1.1 / 1000) * 1000;
        const qo3 = Math.round(clientPrice * 1.2 / 1000) * 1000;
        const gmapsUrl = job.lat && job.lng
          ? `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`
          : null;

        return (
          <div key={job.id} style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
            height: '68vh', background: '#1a1a2e', borderRadius: '24px 24px 0 0',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
            animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            border: alreadySent ? '1.5px solid rgba(245,197,24,0.35)' : 'none',
            borderBottom: 'none',
          }}>
            {/* Pull tab */}
            <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 6, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#444' }} />
            </div>

            {/* Sheet header */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 16, paddingBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Solicitud de servicio</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {visibleJobs.length > 1 && (
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{safeIndex + 1}/{visibleJobs.length}</span>
                )}
                <button onClick={dismissCurrent}
                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9ca3af', borderRadius: 99, padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                  Cerrar
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', paddingInline: 16, paddingBottom: 20, WebkitOverflowScrolling: 'touch' as never }}>

              {/* Client + price hero */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                {job.client_photo ? (
                  <img src={job.client_photo} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>👤</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{job.client_name ?? 'Cliente'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {SERVICE_LABELS[job.service_type] ?? job.service_type}
                    {job.client_rating != null && ` · ⭐ ${job.client_rating.toFixed(1)}`}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                    {new Date(job.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#c8ff00', lineHeight: 1 }}>{clientPrice.toLocaleString()}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Gs</div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: '#2d2d2d', marginBottom: 14 }} />

              {/* Route A → B */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>A</div>
                  <div style={{ width: 2, flex: 1, minHeight: 18, background: '#333', margin: '4px 0' }} />
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800 }}>B</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.35, marginBottom: 4 }}>
                    Tu ubicación actual
                  </div>
                  {distKm != null && (
                    <div style={{ fontSize: '0.75rem', color: '#c8ff00', fontWeight: 700, marginBottom: 6 }}>📐 {distKm.toFixed(1)} km</div>
                  )}
                  <div style={{ height: 4 }} />
                  <div style={{ fontSize: '0.88rem', color: '#e5e7eb', lineHeight: 1.35 }}>{job.address ?? 'Dirección no especificada'}</div>
                </div>
              </div>

              {/* Description */}
              {job.description && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 10, borderLeft: '3px solid #F5C518' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#C8960A', lineHeight: 1.45 }}>📝 {job.description}</p>
                </div>
              )}

              {/* Audio */}
              {job.audio_url && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
                  <p style={{ margin: '0 0 5px', fontSize: '0.72rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎙 Audio del cliente</p>
                  <audio controls src={job.audio_url} style={{ width: '100%', height: 36 }} />
                </div>
              )}

              {/* Photos */}
              {job.photos && job.photos.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fotos del cliente</p>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                    {job.photos.map((url, i) => (
                      <img key={i} src={url} alt={`foto ${i + 1}`}
                        onClick={() => setLightbox(url)}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', border: '1.5px solid #334155' }} />
                    ))}
                  </div>
                </div>
              )}

              <div style={{ height: 1, background: '#2d2d2d', marginBottom: 14 }} />

              {/* ── OFFER ZONE ── */}
              {alreadySent ? (
                (() => {
                  const status = job.my_offer!.status;
                  let color = '#F7D060', bg = 'rgba(245,197,24,0.15)', icon = '📤', text = 'Oferta enviada · esperando...';
                  if (status === 'accepted') { color = '#6ee7b7'; bg = 'rgba(16,185,129,0.15)'; icon = '✅'; text = 'Aceptada — el cliente te eligió'; }
                  else if (status === 'rejected') { color = '#f87171'; bg = 'rgba(239,68,68,0.13)'; icon = '❌'; text = 'Rechazada por el cliente'; }
                  else if (status === 'expired') { color = '#a3a3a3'; bg = 'rgba(156,163,175,0.13)'; icon = '⌛'; text = 'Expirada'; }
                  else if (status === 'cancelled') { color = '#f59e42'; bg = 'rgba(245,158,66,0.13)'; icon = '🚫'; text = 'Cancelada'; }
                  return (
                    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${color}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: bg }}>
                        <span style={{ fontSize: '1.1rem', color, fontWeight: 700 }}>{icon}</span>
                        <span style={{ fontSize: '0.85rem', color, fontWeight: 700 }}>{text}</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#c8ff00', fontSize: '1.1rem' }}>
                          ₲{Number(job.my_offer!.proposed_price).toLocaleString()}
                        </span>
                      </div>
                      {status === 'accepted' && gmapsUrl && (
                        <button onClick={() => window.open(gmapsUrl, '_blank')}
                          style={{ width: '100%', padding: '12px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          🧭 Navegar al cliente
                        </button>
                      )}
                    </div>
                  );
                })()
              ) : isOpen ? (
                <div>
                  {/* Quick chips */}
                  {clientPrice > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      {[{ label: 'Exacto', val: qo1 }, { label: '+10%', val: qo2 }, { label: '+20%', val: qo3 }].map(ch => (
                        <button key={ch.val}
                          onClick={() => setOfferPrices(prev => ({ ...prev, [job.id]: ch.val }))}
                          style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: `1.5px solid ${offerPrices[job.id] === ch.val ? '#F5C518' : '#334155'}`, background: offerPrices[job.id] === ch.val ? 'rgba(245,197,24,0.15)' : '#0f172a', color: offerPrices[job.id] === ch.val ? '#F5C518' : '#9ca3af', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'center' }}>
                          {ch.label}<br />
                          <span style={{ fontSize: '0.72rem' }}>₲{ch.val.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Tu precio (Gs.)</label>
                    <input type="number"
                      value={offerPrices[job.id] || ''}
                      onChange={e => setOfferPrices(prev => ({ ...prev, [job.id]: Number(e.target.value) }))}
                      placeholder={clientPrice ? String(clientPrice) : 'Ej: 150000'}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #F5C518', background: '#0f172a', color: '#f1f5f9', fontSize: '1.05rem', fontWeight: 700, boxSizing: 'border-box' as never, outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => sendOffer(job.id)}
                      disabled={sending === job.id || !(offerPrices[job.id] > 0)}
                      style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: (sending === job.id || !(offerPrices[job.id] > 0)) ? '#334155' : '#F5C518', color: (sending === job.id || !(offerPrices[job.id] > 0)) ? '#fff' : '#1C1C2E', fontWeight: 800, cursor: 'pointer', fontSize: '0.95rem' }}>
                      {sending === job.id ? 'Enviando…' : '📤 Enviar oferta'}
                    </button>
                    <button onClick={() => setShowInput(null)}
                      style={{ padding: '12px 14px', borderRadius: 12, border: '1.5px solid #334155', background: 'transparent', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>←</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Accept at client price */}
                  <button onClick={() => sendOffer(job.id, clientPrice)} disabled={sending === job.id}
                    style={{ width: '100%', padding: '0.95rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1.05rem', marginBottom: 12, opacity: sending === job.id ? 0.6 : 1 }}>
                    {sending === job.id ? 'Enviando...' : `Aceptar por ${clientPrice.toLocaleString()} Gs`}
                  </button>

                  {/* Counter-offer chips */}
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginBottom: 8 }}>Ofrece tu tarifa</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[qo2, qo3].map(q => (
                      <button key={q} onClick={() => sendOffer(job.id, q)} disabled={sending === job.id}
                        style={{ flex: 1, padding: '0.65rem 0', border: '1px solid #333', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                        {q.toLocaleString()}
                      </button>
                    ))}
                    <button onClick={() => setShowInput(job.id)}
                      style={{ width: 44, flexShrink: 0, border: '1px solid #333', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                      +
                    </button>
                  </div>
                </>
              )}

              {/* Nav dots for multiple jobs */}
              {visibleJobs.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                  {visibleJobs.map((_, i) => (
                    <button key={i} onClick={() => setSheetIndex(i)}
                      style={{ width: i === safeIndex ? 20 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', transition: 'width 0.2s', background: i === safeIndex ? '#c8ff00' : '#333' }} />
                  ))}
                </div>
              )}

              {/* Pagination: Load more button */}
              {jobs.filter(j => !dismissed.has(j.id)).length > visibleJobs.length && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
                  <button
                    onClick={() => setJobsPage(p => p + 1)}
                    style={{
                      padding: '13px 28px',
                      borderRadius: 14,
                      border: '1px solid #F5C518',
                      background: 'rgba(245,197,24,0.08)',
                      color: '#F5C518',
                      fontWeight: 800,
                      fontSize: '0.98rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cargar más trabajos
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── EMPTY STATE ── */}
      {!loading && visibleJobs.length === 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: '#1a1a2e', borderRadius: '24px 24px 0 0',
          padding: '2rem 1.5rem 2.5rem', textAlign: 'center',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.25s ease-out',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🔍</div>
          <div style={{ color: '#d1d5db', fontWeight: 700, fontSize: '1rem' }}>Sin solicitudes pendientes</div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 6 }}>Las solicitudes que coincidan con tu perfil aparecerán acá</div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '94vw', maxHeight: '90dvh', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '50%', width: 38, height: 38, fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

