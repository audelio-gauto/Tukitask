'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useClientContext } from './context';
import { authFetch } from '@/lib/authFetch';

const ClientMap = dynamic(() => import('./components/ClientMap'), { ssr: false });

interface Order {
  id: string;
  status: string;
  origin_address: string | null;
  destination_address: string | null;
  price: number | null;
  driver_name: string | null;
  driver_photo: string | null;
  driver_rating: number | null;
  created_at: string;
}

interface JobOffer {
  id: string;
  job_id: string;
  tecnico_email: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  proposed_price: number;
  note: string | null;
  distance_km: number | null;
  service_type: string;
}

interface PendingJob {
  id: string;
  service_type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: '🧹 Limpieza', niera: '👶 Niñera', cocina: '🍳 Cocina',
  eventos: '🎉 Eventos', cuidado_mascotas: '🐾 Mascotas', cuidado_adultos: '👴 Adultos',
  aire_split: '❄️ Aire Split', electrico: '⚡ Eléctrico', plomeria: '🔧 Plomería',
  cerrajeria: '🔑 Cerrajería', otros: '✨ Otros',
};

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span style={{ color: '#F5C518', fontSize: '0.82rem', letterSpacing: 1 }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
    </span>
  );
}

function PulseDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#F5C518',
          animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'inline-block',
        }} />
      ))}
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}

export default function ClienteHomePage() {
  const router = useRouter();
  const { email, displayName, profilePhoto } = useClientContext();

  const [pendingOrders, setPendingOrders]     = useState<Order[]>([]);
  const [jobOffers, setJobOffers]             = useState<JobOffer[]>([]);
  const [pendingJobs, setPendingJobs]         = useState<PendingJob[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [actionId, setActionId]               = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [mapTouched, setMapTouched]           = useState(false);

  const handleMapTouch = useCallback(() => {
    setMapTouched(true);
    const onEnd = () => {
      setMapTouched(false);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  }, []);

  const handleMapMouseDown = useCallback(() => {
    setMapTouched(true);
    const onUp = () => {
      setMapTouched(false);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mouseup', onUp);
  }, []);

  const loadOffers = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, jobsRes] = await Promise.all([
        fetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const jobsData   = await jobsRes.json();

      const pending = Array.isArray(ordersData) ? ordersData.filter((o: Order) => o.status === 'pending' || o.status === 'negotiating') : [];
      setPendingOrders(pending);

      const pendingServiceJobs = Array.isArray(jobsData) ? jobsData.filter((j: PendingJob) => j) : [];
      setPendingJobs(pendingServiceJobs);

      const allOffers: JobOffer[] = [];
      for (const job of pendingServiceJobs) {
        const offersRes  = await fetch(`/api/tecnico/jobs?job_offers=${job.id}`);
        const offersData = await offersRes.json();
        if (Array.isArray(offersData)) {
          allOffers.push(...offersData.map((o: JobOffer) => ({ ...o, job_id: job.id, service_type: job.service_type })));
        }
      }
      setJobOffers(allOffers);
      setLoading(false);
    } catch { setLoading(false); }
  }, [email]);

  useEffect(() => {
    loadOffers();
    const iv = setInterval(loadOffers, 5000);
    return () => clearInterval(iv);
  }, [loadOffers]);

  const acceptJobOffer = async (jobId: string, offerId: string) => {
    if (!email || actionId) return;
    setActionId(offerId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_offer', jobId, offerId }),
      });
      loadOffers();
    } catch {}
    finally { setActionId(null); }
  };

  const rejectJobOffer = async (offerId: string) => {
    if (!email || actionId) return;
    setActionId(offerId);
    try {
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_offer', offerId }),
      });
      loadOffers();
    } catch {}
    finally { setActionId(null); }
  };

  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '—';

  const totalOffers = pendingOrders.length + jobOffers.length;
  const busy = !!actionId;

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Map base layer */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ClientMap dark showMyLocationButton={false} />
      </div>

      {/* Vignette overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(12,12,26,0.65) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 65%, rgba(12,12,26,0.55) 100%)', pointerEvents: 'none', zIndex: 1 }} />

      {/* Scrollable content layer */}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column', overflowY: mapTouched ? 'hidden' : 'auto', padding: '16px 14px 90px', pointerEvents: mapTouched ? 'none' : 'auto' }}
        onTouchStart={e => { if ((e.target as HTMLElement) === e.currentTarget) handleMapTouch(); }}
        onMouseDown={e => { if ((e.target as HTMLElement) === e.currentTarget) handleMapMouseDown(); }}
      >
        <div style={{
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          opacity: mapTouched ? 0 : 1,
          transform: mapTouched ? 'translateY(-10px)' : 'translateY(0)',
          pointerEvents: mapTouched ? 'none' : 'auto',
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            {profilePhoto ? (
              <img src={profilePhoto} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid #F5C518' }}>
                {displayName?.[0]?.toUpperCase() || '👤'}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Buen día</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{displayName || 'Cliente'}</div>
            </div>
            <button onClick={loadOffers} style={{ background: 'rgba(245,197,24,0.15)', border: '1px solid rgba(245,197,24,0.3)', color: '#F5C518', borderRadius: 10, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>
              ↺
            </button>
          </div>
          {totalOffers > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.5rem' }}>📬</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '0.95rem' }}>{totalOffers} oferta{totalOffers !== 1 ? 's' : ''} disponible{totalOffers !== 1 ? 's' : ''}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Revisá y aceptá la mejor opción</div>
              </div>
            </div>
          )}

        {/* Offers list */}
        <div style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <PulseDots />
              <p style={{ marginTop: 16, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>Cargando ofertas…</p>
            </div>
          ) : totalOffers === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>📭</div>
              <p style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem', marginBottom: 8 }}>No tenés ofertas pendientes</p>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', marginBottom: 28 }}>Publicá un envío o servicio para recibir ofertas</p>
              <button onClick={() => setShowPublishModal(true)}
                style={{ padding: '14px 32px', borderRadius:14, border: 'none', background: 'linear-gradient(135deg, #F5C518, #F58A07)', color: '#1C1C2E', fontWeight: 800, cursor: 'pointer', fontSize: '0.98rem', boxShadow: '0 4px 20px rgba(245,197,24,0.4)' }}>
                ➕ Publicar ahora
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Job offers (tecnicos) */}
              {jobOffers.map(offer => (
                <div key={offer.id} style={{
                  background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(245,197,24,0.18)',
                  borderRadius: 18, padding: '16px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: '1.8rem' }}>{SERVICE_LABELS[offer.service_type]?.split(' ')[0] || '✨'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>
                        {SERVICE_LABELS[offer.service_type] || offer.service_type}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Oferta de técnico</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '12px', background: 'rgba(0,0,0,0.25)', borderRadius: 12 }}>
                    {offer.tecnico_photo ? (
                      <img src={offer.tecnico_photo} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(245,197,24,0.3)' }} />
                    ) : (
                      <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', border: '2px solid rgba(245,197,24,0.3)' }}>👷</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.93rem', marginBottom: 2 }}>
                        {offer.tecnico_name || 'Técnico'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {offer.tecnico_rating != null && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <StarRating rating={offer.tecnico_rating} />
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{offer.tecnico_rating.toFixed(1)}</span>
                          </span>
                        )}
                        {offer.distance_km != null && (
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>📍 {offer.distance_km.toFixed(1)} km</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, color: '#F5C518', fontSize: '1.35rem', lineHeight: 1 }}>
                        {Number(offer.proposed_price).toLocaleString('es-PY')}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', marginTop: 2 }}>Gs</div>
                    </div>
                  </div>
                  {offer.note && (
                    <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, borderLeft: '3px solid #F5C518' }}>
                      "{offer.note}"
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => rejectJobOffer(offer.id)} disabled={busy}
                      style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.88rem', cursor: busy ? 'default' : 'pointer' }}>
                      Rechazar
                    </button>
                    <button onClick={() => acceptJobOffer(offer.job_id, offer.id)} disabled={busy}
                      style={{ flex: 2, padding: '11px 0', borderRadius: 12, border: 'none', background: busy ? 'rgba(34,197,94,0.5)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: busy ? 'default' : 'pointer', boxShadow: busy ? 'none' : '0 4px 14px rgba(34,197,94,0.35)' }}>
                      Aceptar
                    </button>
                  </div>
                </div>
              ))}

              {/* TODO: Pending orders (drivers) - similar UI */}
            </div>
          )}
        </div>
        </div>{/* end animated content wrapper */}
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div onClick={() => setShowPublishModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 90px' }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420, background: 'rgba(28,28,46,0.98)', backdropFilter: 'blur(30px)',
            borderRadius: '24px 24px 0 0', padding: '24px 20px 32px', border: '1px solid rgba(245,197,24,0.18)', boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 20px' }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 800, fontSize: '1.3rem', color: '#fff', textAlign: 'center' }}>¿Qué necesitás hoy?</h3>
            <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>Elegí el tipo de publicación</p>
            
            <Link href="/cliente/enviar" onClick={() => setShowPublishModal(false)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 16, background: 'rgba(245,197,24,0.12)', border: '2px solid rgba(245,197,24,0.25)', marginBottom: 12, textDecoration: 'none', transition: 'all 0.2s' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
                📦
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', marginBottom: 2 }}>Enviar Paquete</div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Delivery rápido y seguro</div>
              </div>
              <span style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,0.3)' }}>→</span>
            </Link>

            <Link href="/cliente/servicio" onClick={() => setShowPublishModal(false)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 16, background: 'rgba(99,102,241,0.12)', border: '2px solid rgba(99,102,241,0.25)', textDecoration: 'none', transition: 'all 0.2s' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
                🛠️
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', marginBottom: 2 }}>Solicitar Servicio</div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Técnicos, limpieza, plomería...</div>
              </div>
              <span style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,0.3)' }}>→</span>
            </Link>
          </div>
        </div>
      )}

      {/* Footer with 4 buttons */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3,
        background: 'rgba(28,28,46,0.95)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(245,197,24,0.18)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 4, justifyContent: 'space-around',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.3)',
      }}>
        {[
          { icon: '🏠', label: 'Home', path: '/cliente', active: true },
          { icon: '➕', label: 'Publicar', path: null },
          { icon: '📋', label: 'Historial', path: '/cliente/historial' },
          { icon: '👤', label: 'Cuenta', path: '/cliente/settings' },
        ].map(item => (
          item.path === null ? (
            <button key={item.label} onClick={() => setShowPublishModal(true)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 12 }}>
              <div style={{ fontSize: '1.5rem', transition: 'transform 0.2s' }}>{item.icon}</div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{item.label}</span>
            </button>
          ) : (
            <Link key={item.label} href={item.path}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, background: item.active ? 'rgba(245,197,24,0.15)' : 'transparent' }}>
              <div style={{ fontSize: '1.5rem', transition: 'transform 0.2s' }}>{item.icon}</div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: item.active ? '#F5C518' : 'rgba(255,255,255,0.5)' }}>{item.label}</span>
            </Link>
          )
        ))}
      </div>
    </div>
  );
}