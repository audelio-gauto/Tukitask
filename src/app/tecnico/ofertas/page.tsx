'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useDriverContext } from '../../driver/context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import ChatModal from '@/components/ChatModal';

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

const CARD_TIMER = 50;
function getRemaining(createdAt: string) {
  return Math.max(0, CARD_TIMER - Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
}
function CountdownRing({ seconds }: { seconds: number }) {
  const r = 14, circ = 2 * Math.PI * r;
  const dash = circ * (seconds / CARD_TIMER);
  const c = seconds > 20 ? '#22c55e' : seconds > 10 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#1e293b" strokeWidth="3"/>
      <circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 18 18)" style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}/>
      <text x="18" y="23" textAnchor="middle" fontSize="10" fontWeight="800" fill={c}>{seconds}</text>
    </svg>
  );
}

export default function OfertasPage() {
  const router = useRouter();
  const { email, profilePhoto, displayName, avgRating } = useDriverContext();
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [loading, setLoading]         = useState(true);
  const [offerPrices, setOfferPrices] = useState<Record<string, number>>({});
  const [offerNotes, setOfferNotes] = useState<Record<string, string>>({});
  const [sending, setSending]         = useState<string | null>(null);
  const [showInput, setShowInput]     = useState<string | null>(null);
  const [lightbox, setLightbox]       = useState<string | null>(null);
  const [myPos, setMyPos]             = useState<{ lat: number; lng: number } | null>(null);
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set());
  const [tick, setTick]               = useState(0);

  // Chat state
  const [chatOpen, setChatOpen]     = useState(false);
  const [chatJobId, setChatJobId]   = useState<string | undefined>(undefined);
  const [chatOtherName, setChatOtherName] = useState<string | null>(null);

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
    // Fallback polling at 8s — primary signal is realtime INSERT on tecnico_jobs
    const iv = setInterval(loadOffers, 8_000);

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
          note: offerNotes[jobId] || null,
          distanceKm: null,
        }),
      });
      const json = await res.json();
      if (json.offer) {
        setJobs(prev => prev.map(j => j.id === jobId
          ? { ...j, my_offer: { status: 'pending', proposed_price: price } } : j));
        setShowInput(null);
        setOfferNotes(n => ({ ...n, [jobId]: '' }));
      } else {
        alert(json.error || 'No se pudo enviar la oferta. Intentá de nuevo.');
      }
    } catch { alert('Error de red al enviar la oferta.'); }
    finally { setSending(null); }
  };

  // Visible (not dismissed) jobs
  const [jobsPage, setJobsPage] = useState(1);
  const JOBS_PER_PAGE = 10;
  const visibleJobs = useMemo(() => jobs.filter(j => !dismissed.has(j.id)).slice(0, jobsPage * JOBS_PER_PAGE), [jobs, dismissed, jobsPage]);

  const dismissJob = (jobId: string) => {
    setDismissed(prev => new Set([...prev, jobId]));
    setShowInput(null);
    setTimeout(() => {
      setDismissed(prev => { const next = new Set(prev); next.delete(jobId); return next; });
    }, 60_000);
  };

  // 1-second tick for countdown rings
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Auto-dismiss cards when timer expires and no offer was sent
  useEffect(() => {
    jobs.forEach(j => {
      if (!dismissed.has(j.id) && !j.my_offer && getRemaining(j.created_at) === 0) {
        dismissJob(j.id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#1a1a2e', zIndex: 0 }}>

      {/* ── FULL-SCREEN MAP BACKGROUND ── */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <DriverMap
          pickup={myPos ?? undefined}
          delivery={null}
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

      {/* ── LISTA DE SOLICITUDES (flotante sobre el mapa) ── */}
      {!loading && visibleJobs.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}>
          {/* Scrollable list */}
          <div style={{ overflowY: 'auto', padding: '0 10px 16px', display: 'flex', flexDirection: 'column', gap: 8, WebkitOverflowScrolling: 'touch' as never, overscrollBehavior: 'contain' }}>
            {visibleJobs.map(job => {
              const alreadySent = !!job.my_offer;
              const isOpen = showInput === job.id;
              const clientPrice = Number(job.client_initial_price || 0);
              const qo_15 = Math.round(clientPrice * 1.15 / 1000) * 1000;
              const qo_30 = Math.round(clientPrice * 1.30 / 1000) * 1000;
              const qo_50 = Math.round(clientPrice * 1.50 / 1000) * 1000;
              const cardDistKm = (myPos && job.lat != null && job.lng != null)
                ? haversineKm(myPos.lat, myPos.lng, Number(job.lat), Number(job.lng)) : null;
              const gmapsUrl = job.lat && job.lng
                ? `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}` : null;
              const remaining = getRemaining(job.created_at);
              return (
                <div key={job.id} style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', padding: '12px 14px' }}>
                  {/* Row 1: photo + service + client + price + timer + dismiss */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {job.client_photo
                      ? <img src={job.client_photo} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c8ff00', flexShrink: 0 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, border: '1.5px solid #334155' }}>👤</div>
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{SERVICE_LABELS[job.service_type] ?? job.service_type}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{job.client_name ?? 'Cliente'}</span>
                        {job.client_rating != null && <span style={{ color: '#f59e0b', fontWeight: 700 }}>⭐{job.client_rating.toFixed(1)}</span>}
                        {cardDistKm != null && <span>📐{cardDistKm.toFixed(1)}km</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, color: '#c8ff00', fontSize: '1rem' }}>{clientPrice.toLocaleString()}</div>
                      <div style={{ fontSize: '0.62rem', color: '#6b7280' }}>Gs</div>
                    </div>
                    {!alreadySent && <CountdownRing seconds={remaining} />}
                    <button onClick={() => dismissJob(job.id)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6b7280', borderRadius: 99, padding: '4px 8px', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  </div>
                  {/* Row 2: address */}
                  {job.address && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ color: '#ef4444', flexShrink: 0 }}>📍</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{job.address}</span>
                      {gmapsUrl && <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', fontWeight: 700, fontSize: '0.68rem', flexShrink: 0, textDecoration: 'none', background: 'rgba(16,185,129,0.12)', padding: '2px 7px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.3)' }}>Mapa</a>}
                    </div>
                  )}
                  {/* Row 3: offer zone */}
                  {alreadySent ? (() => {
                    const status = job.my_offer!.status;
                    let color = '#F7D060', bg = 'rgba(245,197,24,0.15)', icon = '📤', text = 'Enviada · esperando...';
                    if (status === 'accepted') { color = '#6ee7b7'; bg = 'rgba(16,185,129,0.15)'; icon = '✅'; text = 'Aceptada'; }
                    else if (status === 'rejected') { color = '#f87171'; bg = 'rgba(239,68,68,0.13)'; icon = '❌'; text = 'Rechazada'; }
                    else if (status === 'expired') { color = '#a3a3a3'; bg = 'rgba(156,163,175,0.13)'; icon = '⌛'; text = 'Expirada'; }
                    else if (status === 'cancelled') { color = '#f59e42'; bg = 'rgba(245,158,66,0.13)'; icon = '🚫'; text = 'Cancelada'; }
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: bg, borderRadius: 10, border: `1.5px solid ${color}` }}>
                        <span style={{ color, fontWeight: 700 }}>{icon}</span>
                        <span style={{ fontSize: '0.8rem', color, fontWeight: 700, flex: 1 }}>{text}</span>
                        <span style={{ fontWeight: 800, color: '#c8ff00', fontSize: '0.95rem' }}>₲{Number(job.my_offer!.proposed_price).toLocaleString()}</span>
                        {status === 'accepted' && gmapsUrl && <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '3px 8px', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: '0.72rem', textDecoration: 'none', flexShrink: 0 }}>🧭 Ir</a>}
                        {status === 'accepted' && (
                          <button
                            onClick={() => { setChatJobId(job.id); setChatOtherName(job.client_name); setChatOpen(true); }}
                            style={{ padding: '3px 8px', borderRadius: 8, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}
                          >💬 Chat</button>
                        )}
                      </div>
                    );
                  })() : isOpen ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="number" value={offerPrices[job.id] || ''} onChange={e => setOfferPrices(prev => ({ ...prev, [job.id]: Number(e.target.value) }))} placeholder={clientPrice ? String(clientPrice) : '150000'} style={{ flex: 1, padding: '7px 10px', borderRadius: 10, border: '1.5px solid #F5C518', background: '#0f172a', color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 700, outline: 'none' }} />
                      <button onClick={() => sendOffer(job.id)} disabled={sending === job.id || !(offerPrices[job.id] > 0)} style={{ padding: '7px 12px', borderRadius: 10, border: 'none', background: (sending === job.id || !(offerPrices[job.id] > 0)) ? '#334155' : '#F5C518', color: (sending === job.id || !(offerPrices[job.id] > 0)) ? '#fff' : '#1C1C2E', fontWeight: 800, cursor: 'pointer' }}>📤</button>
                      <button onClick={() => setShowInput(null)} style={{ padding: '7px 10px', borderRadius: 10, border: '1.5px solid #334155', background: 'transparent', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>←</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea value={offerNotes[job.id] || ''} onChange={e => setOfferNotes(n => ({ ...n, [job.id]: e.target.value }))} placeholder="Mensaje opcional para el cliente..." maxLength={300} rows={2} style={{ width: '100%', padding: '7px 10px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: '0.8rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={() => sendOffer(job.id, clientPrice)} disabled={sending === job.id} style={{ width: '100%', padding: '11px 0', border: 'none', borderRadius: 12, cursor: 'pointer', background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1rem', opacity: sending === job.id ? 0.6 : 1, letterSpacing: '0.01em' }}>Aceptar · ₲{clientPrice.toLocaleString()}</button>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => sendOffer(job.id, qo_15)} disabled={sending === job.id} style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>₲{qo_15.toLocaleString()}</span><span style={{ fontSize: '0.58rem', color: '#64748b' }}>+15%</span></button>
                        <button onClick={() => sendOffer(job.id, qo_30)} disabled={sending === job.id} style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>₲{qo_30.toLocaleString()}</span><span style={{ fontSize: '0.58rem', color: '#64748b' }}>+30%</span></button>
                        <button onClick={() => sendOffer(job.id, qo_50)} disabled={sending === job.id} style={{ flex: 1, padding: '7px 0', border: '1px solid #334155', borderRadius: 10, background: 'rgba(200,255,0,0.07)', color: '#c8ff00', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>₲{qo_50.toLocaleString()}</span><span style={{ fontSize: '0.58rem', color: '#64748b' }}>+50%</span></button>
                        <button onClick={() => setShowInput(job.id)} style={{ width: 36, flexShrink: 0, border: '1px solid #334155', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 700, cursor: 'pointer', fontSize: '1.1rem' }}>+</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {jobs.filter(j => !dismissed.has(j.id)).length > visibleJobs.length && (
              <button onClick={() => setJobsPage(p => p + 1)} style={{ width: '100%', padding: '11px', borderRadius: 14, border: '1px solid #F5C518', background: 'rgba(245,197,24,0.08)', color: '#F5C518', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>Cargar más</button>
            )}
          </div>
        </div>
      )}

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

      {/* ── Chat Modal ─────────────────────────────────────────────── */}
      <ChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        jobId={chatJobId}
        myEmail={email ?? ''}
        myName={displayName}
        otherName={chatOtherName}
        otherPhoto={null}
      />

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

