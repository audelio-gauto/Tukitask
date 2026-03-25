'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../../driver/context';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ── Haversine ────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Interactive map component with A & B pins ───────────────────────────────
function JobMap({ aLat, aLng, bLat, bLng }: { aLat: number; aLng: number; bLat: number; bLng: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    if (!MAPBOX_TOKEN || !mapRef.current) return;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      if (!mounted || !mapRef.current) return;

      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [(aLng + bLng) / 2, (aLat + bLat) / 2],
        zoom: 11,
        accessToken: MAPBOX_TOKEN,
        attributionControl: false,
        failIfMajorPerformanceCaveat: false,
      });

      mapInstance.current = map;

      // Marker A – green (my position)
      const elA = document.createElement('div');
      elA.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#10b981;border:3px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
      elA.textContent = 'A';
      new mapboxgl.Marker({ element: elA }).setLngLat([aLng, aLat]).addTo(map);

      // Marker B – red (destination)
      const elB = document.createElement('div');
      elB.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
      elB.textContent = 'B';
      new mapboxgl.Marker({ element: elB }).setLngLat([bLng, bLat]).addTo(map);

      map.on('load', () => {
        if (!mounted) return;
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([aLng, aLat]);
        bounds.extend([bLng, bLat]);
        map.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 600 });
      });
    })();

    return () => {
      mounted = false;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [aLat, aLng, bLat, bLng]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
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
  const { email } = useDriverContext();
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [loading, setLoading]   = useState(true);
  const [offerPrices, setOfferPrices] = useState<Record<string, number>>({});
  const [offerNotes, setOfferNotes]   = useState<Record<string, string>>({});
  const [sending, setSending]         = useState<string | null>(null);
  const [showInput, setShowInput]     = useState<string | null>(null);
  const [lightbox, setLightbox]       = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      pos => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

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
    const iv = setInterval(loadOffers, 8_000);
    return () => clearInterval(iv);
  }, [loadOffers]);

  const sendOffer = async (jobId: string) => {
    if (!email || sending) return;
    const price = offerPrices[jobId];
    if (!price || price <= 0) return;
    setSending(jobId);
    try {
      const res = await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_offer', jobId, tecnicoEmail: email,
          proposedPrice: price, note: offerNotes[jobId] || undefined,
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

  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0f172a', paddingBottom: 80 }}>
      <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', color: '#fff', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>🎁 Solicitudes disponibles</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Enviá tu precio — el cliente decide</p>
        </div>
        <button onClick={loadOffers} style={{ marginLeft: 'auto', background: '#334155', border: 'none', color: '#94a3b8', borderRadius: 8, padding: '6px 12px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>↺</button>
      </div>

      <div style={{ padding: '14px', maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
            <p>Buscando solicitudes…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#64748b' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</div>
            <p style={{ fontWeight: 600, color: '#94a3b8' }}>Sin solicitudes por ahora</p>
            <p style={{ fontSize: '0.85rem' }}>Cuando lleguen solicitudes que coincidan con tu perfil, aparecerán acá.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {jobs.map(job => {
              const alreadySent = !!job.my_offer;
              const isOpen      = showInput === job.id;
              const hasMap      = myPos != null && job.lat != null && job.lng != null;
              const distKm      = (myPos && job.lat != null && job.lng != null)
                ? haversineKm(myPos.lat, myPos.lng, Number(job.lat), Number(job.lng))
                : null;

              // Google Maps navigation URL
              const gmapsUrl = job.lat && job.lng
                ? `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`
                : null;

              return (
                <div key={job.id} style={{
                  background: '#1e293b',
                  borderRadius: 18,
                  overflow: 'hidden',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                  border: `1.5px solid ${alreadySent ? '#F5C518' : '#334155'}`,
                }}>
                  {/* Interactive map A→B */}
                  {hasMap && MAPBOX_TOKEN ? (
                    <div style={{ position: 'relative', height: 200, background: '#0f172a' }}>
                      <JobMap
                        aLat={myPos!.lat}
                        aLng={myPos!.lng}
                        bLat={Number(job.lat)}
                        bLng={Number(job.lng)}
                      />
                      {distKm != null && (
                        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, background: 'rgba(0,0,0,0.75)', color: '#c8ff00', borderRadius: 8, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 800, pointerEvents: 'none' }}>
                          📐 {distKm.toFixed(1)} km
                        </div>
                      )}
                    </div>
                  ) : distKm != null && (
                    <div style={{ background: '#0f172a', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.8rem', color: '#c8ff00', fontWeight: 700 }}>📐 {distKm.toFixed(1)} km</span>
                    </div>
                  )}

                  <div style={{ padding: '14px 14px 16px' }}>
                    {/* Service + price */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f5f9' }}>
                        {SERVICE_LABELS[job.service_type] ?? job.service_type}
                      </span>
                      {job.client_initial_price != null && (
                        <span style={{ fontWeight: 800, color: '#c8ff00', fontSize: '1.05rem' }}>
                          ₲{Number(job.client_initial_price).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* A→B route block + Navegar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>A</div>
                        <div style={{ width: 2, flex: 1, minHeight: 18, background: '#475569', margin: '3px 0' }} />
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>B</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.81rem', color: '#64748b', marginBottom: 6 }}>
                          {myPos ? `📍 Mi ubicación (${myPos.lat.toFixed(4)}, ${myPos.lng.toFixed(4)})` : '📍 Tu ubicación actual'}
                        </div>
                        <div style={{ height: 4 }} />
                        <div style={{ fontSize: '0.82rem', color: '#d1d5db', lineHeight: 1.4 }}>
                          {job.address ?? 'Dirección no especificada'}
                        </div>

                      </div>
                    </div>

                    {/* Client info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px', background: '#0f172a', borderRadius: 10 }}>
                      {job.client_photo ? (
                        <img src={job.client_photo} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #334155' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>👤</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f1f5f9' }}>{job.client_name ?? 'Cliente'}</div>
                        {job.client_rating != null && (
                          <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                            {'★'.repeat(Math.round(job.client_rating))} {job.client_rating.toFixed(1)}
                          </div>
                        )}
                      </div>
                      {job.scheduled_at && (
                        <div style={{ marginLeft: 'auto', fontSize: '0.73rem', color: '#64748b', textAlign: 'right' }}>
                          📅 {fmtDate(job.scheduled_at)}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {job.description && (
                      <div style={{ marginBottom: 10, padding: '7px 10px', background: 'rgba(245,197,24,0.10)', borderRadius: 8, borderLeft: '3px solid #F5C518' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#C8960A', lineHeight: 1.45 }}>{job.description}</p>
                      </div>
                    )}

                    {/* Client audio */}
                    {job.audio_url && (
                      <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>
                        <p style={{ margin: '0 0 5px', fontSize: '0.72rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎙 Audio del cliente</p>
                        <audio controls src={job.audio_url} style={{ width: '100%', height: 36 }} />
                      </div>
                    )}

                    {/* Client photos */}
                    {job.photos && job.photos.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fotos del cliente</p>
                        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                          {job.photos.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`foto ${i + 1}`}
                              onClick={() => setLightbox(url)}
                              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0, cursor: 'pointer', border: '1.5px solid #334155' }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ height: 1, background: '#334155', marginBottom: 12 }} />

                    {/* Offer state */}
                    {alreadySent ? (
                      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${job.my_offer!.status === 'accepted' ? '#10b981' : '#F5C518'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: job.my_offer!.status === 'accepted' ? 'rgba(16,185,129,0.15)' : 'rgba(245,197,24,0.15)' }}>
                          <span style={{ fontSize: '0.85rem', color: job.my_offer!.status === 'accepted' ? '#6ee7b7' : '#F7D060', fontWeight: 700 }}>
                            {job.my_offer!.status === 'accepted' ? '✅ Aceptada por el cliente' : '📤 Oferta enviada'}
                          </span>
                          <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#c8ff00', fontSize: '1rem' }}>
                            ₲{Number(job.my_offer!.proposed_price).toLocaleString()}
                          </span>
                          {job.my_offer!.status !== 'accepted' && <span style={{ fontSize: '0.72rem', color: '#F7D060' }}>⏳</span>}
                        </div>
                        {job.my_offer!.status === 'accepted' && gmapsUrl && (
                          <button
                            onClick={() => window.open(gmapsUrl, '_blank')}
                            style={{ width: '100%', padding: '11px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            🧭 Navegar al cliente
                          </button>
                        )}
                      </div>
                    ) : isOpen ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Tu precio (Gs.)</label>
                          <input
                            type="number"
                            value={offerPrices[job.id] || ''}
                            onChange={e => setOfferPrices(prev => ({ ...prev, [job.id]: Number(e.target.value) }))}
                            placeholder={job.client_initial_price ? String(job.client_initial_price) : 'Ej: 150000'}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #F5C518', background: '#0f172a', color: '#f1f5f9', fontSize: '1.05rem', fontWeight: 700, boxSizing: 'border-box', outline: 'none' }}
                          />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Nota (opcional)</label>
                          <input
                            type="text"
                            value={offerNotes[job.id] || ''}
                            onChange={e => setOfferNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                            placeholder="Ej: Tengo experiencia en esto…"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #334155', background: '#0f172a', color: '#d1d5db', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => sendOffer(job.id)}
                            disabled={sending === job.id || !(offerPrices[job.id] > 0)}
                            style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: sending === job.id || !(offerPrices[job.id] > 0) ? '#334155' : '#F5C518', color: sending === job.id || !(offerPrices[job.id] > 0) ? '#fff' : '#1C1C2E', fontWeight: 800, cursor: sending === job.id ? 'default' : 'pointer', fontSize: '0.9rem' }}
                          >
                            {sending === job.id ? 'Enviando…' : '📤 Enviar oferta'}
                          </button>
                          <button onClick={() => setShowInput(null)}
                            style={{ padding: '11px 14px', borderRadius: 12, border: '1.5px solid #334155', background: 'transparent', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>
                            ←
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowInput(job.id)}
                        style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#F5C518', color: '#1C1C2E', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}
                      >
                        💬 Enviar mi precio
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
