'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClientContext } from '../context';
import RatingModal from '@/components/RatingModal';
import { authFetch } from '@/lib/authFetch';

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
  completed_at: string | null;
}

interface Job {
  id: string;
  service_type: string;
  status: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
  tecnico_rating: number | null;
  total_price: number | null;
  created_at: string;
  completed_at: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: 'Limpieza', niera: 'Niera', cocina: 'Cocina',
  eventos: 'Eventos', cuidado_mascotas: 'Mascotas', cuidado_adultos: 'Adultos',
  aire_split: 'Aire Split', electrico: 'Electrico', plomeria: 'Plomeria',
  cerrajeria: 'Cerrajeria', otros: 'Otros',
};

const SERVICE_ICONS: Record<string, string> = {
  limpieza: '🧹', niera: '👶', cocina: '🍳', eventos: '🎉',
  cuidado_mascotas: '🐾', cuidado_adultos: '👴', aire_split: '❄️',
  electrico: '⚡', plomeria: '🔧', cerrajeria: '🔑', otros: '✨',
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

export default function ClienteHistorialPage() {
  const router = useRouter();
  const { email } = useClientContext();
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingModal, setRatingModal] = useState<{ jobId: string; tecnicoName: string | null; tecnicoPhoto: string | null } | null>(null);

  const loadHistory = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, histJobsRes, activeJobsRes] = await Promise.all([
        fetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_history=true`),
        fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const histJobsData = await histJobsRes.json();
      const activeJobsData = await activeJobsRes.json();
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      const merged = [
        ...(Array.isArray(activeJobsData) ? activeJobsData : []),
        ...(Array.isArray(histJobsData) ? histJobsData : []),
      ];
      const unique = merged.reduce((acc: Job[], j: Job) => {
        if (!acc.find(x => x.id === j.id)) acc.push(j);
        return acc;
      }, []);
      setJobs(unique);
      setLoading(false);
    } catch { setLoading(false); }
  }, [email]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleRating = async (rating: number, note: string) => {
    if (!ratingModal || !email) return;
    await authFetch('/api/tecnico/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rate_tecnico', jobId: ratingModal.jobId, clientEmail: email, rating, note }),
    });
    setJobs(prev => prev.map(j => j.id === ratingModal!.jobId ? { ...j, tecnico_rating: rating } : j));
    setRatingModal(null);
  };

  const fmtGs = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '';
  const fmtDate = (s: string | null) => !s ? '' : new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '⏳ Buscando...', negotiating: '💬 Negociando', assigned: '✅ Asignado',
      accepted: '✅ Asignado', in_progress: '🔧 En progreso', picking_up: '🚗 Recogiendo',
      in_transit: '🚚 En camino', completado: '✅ Completado', completed: '✅ Completado',
      delivered: '✅ Entregado', cancelled: '❌ Cancelado', failed: '⚠️ Fallido',
      incidente: '⚠️ Incidente', client_confirmed: '✅ Confirmado', commission_charged: '✅ Completado',
    };
    return labels[status] || status;
  };

  const activeStatuses = ['pending', 'negotiating', 'assigned', 'accepted', 'in_progress', 'picking_up', 'in_transit'];
  const doneStatuses = ['completado', 'completed', 'delivered', 'cancelled', 'failed', 'incidente', 'return_delivered', 'returned', 'client_confirmed', 'commission_charged'];

  const activeJobs = jobs.filter(j => activeStatuses.includes(j.status));
  const doneJobs = jobs.filter(j => doneStatuses.includes(j.status));
  const activeOrders = orders.filter(o => activeStatuses.includes(o.status));
  const doneOrders = orders.filter(o => doneStatuses.includes(o.status));
  const total = jobs.length + orders.length;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(160deg, #0d0d1a 0%, #16213E 55%, #0F3460 100%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px 12px', background: 'rgba(13,13,26,0.95)',
        borderBottom: '1px solid rgba(245,197,24,0.12)',
      }}>
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '1.1rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>Historial</h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Envíos y servicios</p>
        </div>
        <button onClick={loadHistory} style={{
          width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(245,197,24,0.3)',
          background: 'rgba(245,197,24,0.15)', color: '#F5C518', fontSize: '1.1rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>↺</button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Cargando historial…</p>
          </div>
        ) : total === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>📂</div>
            <p style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem', marginBottom: 8 }}>Sin historial aún</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.88rem' }}>Tus envíos y servicios aparecerán aquí</p>
          </div>
        ) : (
          <>
            {(activeJobs.length > 0 || activeOrders.length > 0) && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ margin: '0 0 10px 2px', fontSize: '0.72rem', fontWeight: 800, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 2 }}>En Progreso</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeJobs.map(job => (
                    <div key={job.id} style={{ background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: '1.5rem' }}>{SERVICE_ICONS[job.service_type] || '✨'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{SERVICE_LABELS[job.service_type] || job.service_type}</div>
                          <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{getStatusLabel(job.status)}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{fmtDate(job.created_at)}</span>
                      </div>
                      <Link href="/cliente/mis-servicios" style={{ display: 'block', padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', textAlign: 'center', textDecoration: 'none' }}>
                        📍 Ver tracking
                      </Link>
                    </div>
                  ))}
                  {activeOrders.map(order => (
                    <div key={order.id} style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.22)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: '1.5rem' }}>📦</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{order.origin_address?.slice(0, 28) || 'Envío'}</div>
                          <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{getStatusLabel(order.status)}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{fmtDate(order.created_at)}</span>
                      </div>
                      <Link href="/cliente/mis-envios" style={{ display: 'block', padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#F5C518,#F58A07)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.85rem', textAlign: 'center', textDecoration: 'none' }}>
                        📍 Ver tracking
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(doneJobs.length > 0 || doneOrders.length > 0) && (
              <div>
                <p style={{ margin: '0 0 10px 2px', fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2 }}>Completados</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {doneJobs.map(job => (
                    <div key={job.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: job.status === 'completado' ? 10 : 0 }}>
                        <span style={{ fontSize: '1.4rem' }}>{SERVICE_ICONS[job.service_type] || '✨'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{SERVICE_LABELS[job.service_type] || job.service_type}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.73rem', color: job.status === 'completado' ? '#4ade80' : '#f87171' }}>
                              {job.status === 'completado' ? '✅ Completado' : job.status === 'cancelled' ? '❌ Cancelado' : '⚠️ Incidente'}
                            </span>
                            {job.tecnico_name && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{job.tecnico_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {job.total_price != null && <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '0.92rem' }}>{fmtGs(job.total_price)}</div>}
                          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{fmtDate(job.completed_at ?? job.created_at)}</div>
                        </div>
                      </div>
                      {job.status === 'completado' && !job.tecnico_rating && (
                        <button onClick={() => setRatingModal({ jobId: job.id, tecnicoName: job.tecnico_name, tecnicoPhoto: job.tecnico_photo })}
                          style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>
                          ⭐ Calificar técnico
                        </button>
                      )}
                      {job.tecnico_rating != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
                          Tu calificación: <StarRating rating={job.tecnico_rating} />
                        </div>
                      )}
                    </div>
                  ))}
                  {doneOrders.map(order => (
                    <div key={order.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.4rem' }}>📦</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{order.origin_address?.slice(0, 28) || 'Envío'}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.73rem', color: ['delivered','client_confirmed','commission_charged'].includes(order.status) ? '#4ade80' : '#f87171' }}>
                              {['delivered','client_confirmed','commission_charged'].includes(order.status) ? '✅ Entregado' : '❌ Cancelado'}
                            </span>
                            {order.driver_name && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{order.driver_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {order.price != null && <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '0.92rem' }}>{fmtGs(order.price)}</div>}
                          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{fmtDate(order.completed_at ?? order.created_at)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 4, justifyContent: 'space-around',
        background: 'rgba(13,13,26,0.97)', borderTop: '1px solid rgba(245,197,24,0.15)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
      }}>
        {([
          { icon: '🏠', label: 'Home', path: '/cliente', active: false },
          { icon: '➕', label: 'Publicar', path: '/cliente', active: false },
          { icon: '📋', label: 'Historial', path: '/cliente/historial', active: true },
          { icon: '👤', label: 'Cuenta', path: '/cliente/settings', active: false },
        ] as { icon: string; label: string; path: string; active: boolean }[]).map(item => (
          <Link key={item.label} href={item.path} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '8px 4px', textDecoration: 'none', borderRadius: 12,
            background: item.active ? 'rgba(245,197,24,0.15)' : 'transparent',
          }}>
            <span style={{ fontSize: '1.35rem' }}>{item.icon}</span>
            <span style={{ fontSize: '0.67rem', fontWeight: 700, color: item.active ? '#F5C518' : 'rgba(255,255,255,0.45)' }}>{item.label}</span>
          </Link>
        ))}
      </div>

      {ratingModal && (
        <RatingModal
          title="Calificar técnico"
          subtitle={ratingModal.tecnicoName ?? undefined}
          avatarUrl={ratingModal.tecnicoPhoto ?? undefined}
          avatarName={ratingModal.tecnicoName ?? undefined}
          onSubmit={handleRating}
          onClose={() => setRatingModal(null)}
        />
      )}
    </div>
  );
}