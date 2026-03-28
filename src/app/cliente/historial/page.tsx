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

export default function ClienteHistorialPage() {
  const router = useRouter();
  const { email } = useClientContext();
  const [orders, setOrders]   = useState<Order[]>([]);
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingModal, setRatingModal] = useState<{ jobId: string; tecnicoName: string | null; tecnicoPhoto: string | null } | null>(null);

  const loadHistory = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, jobsRes, activeJobsRes] = await Promise.all([
        fetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_history=true`),
        fetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const jobsData   = await jobsRes.json();
      const activeJobsData = await activeJobsRes.json();
      
      // Combine all orders and jobs
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      const allJobs = [
        ...(Array.isArray(activeJobsData) ? activeJobsData : []),
        ...(Array.isArray(jobsData) ? jobsData : [])
      ];
      // Remove duplicates
      const uniqueJobs = allJobs.reduce((acc, job) => {
        if (!acc.find((j: Job) => j.id === job.id)) acc.push(job);
        return acc;
      }, [] as Job[]);
      setJobs(uniqueJobs);
      setLoading(false);
    } catch { setLoading(false); }
  }, [email]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRating = async (rating: number, note: string) => {
    if (!ratingModal || !email) return;
    await authFetch('/api/tecnico/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rate_tecnico', jobId: ratingModal.jobId, clientEmail: email, rating, note }),
    });
    setJobs(prev => prev.map(j => j.id === ratingModal.jobId ? { ...j, tecnico_rating: rating } : j));
    setRatingModal(null);
  };

  const fmtGs   = (n: number | null) => n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '—';
  const fmtDate = (s: string | null) => !s ? '' : new Date(s).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '⏳ Buscando',
      negotiating: '💬 Negociando',
      assigned: '✅ Asignado',
      accepted: '✅ Asignado',
      in_progress: '🔧 En progreso',
      picking_up: '🚗 Recogiendo',
      in_transit: '🚚 En camino',
      completado: '✅ Completado',
      completed: '✅ Completado',
      delivered: '✅ Entregado',
      cancelled: '❌ Cancelado',
      failed: '⚠️ Fallido',
      incidente: '⚠️ Incidente',
      client_confirmed: '✅ Confirmado',
      commission_charged: '✅ Completado',
    };
    return labels[status] || status;
  };

  // Separate active vs completed
  const activeStatuses = ['pending', 'negotiating', 'assigned', 'accepted', 'in_progress', 'picking_up', 'in_transit'];
  const completedStatuses = ['completado', 'completed', 'delivered', 'cancelled', 'failed', 'incidente', 'return_delivered', 'returned', 'client_confirmed', 'commission_charged'];

  const activeJobs = jobs.filter(j => activeStatuses.includes(j.status));
  const completedJobs = jobs.filter(j => completedStatuses.includes(j.status));
  const activeOrders = orders.filter(o => activeStatuses.includes(o.status));
  const completedOrders = orders.filter(o => completedStatuses.includes(o.status));

  const total = orders.length + jobs.length;

  return (
    <>
      <div style={{ minHeight: '100dvh', background: 'linear-gradient(145deg, #1C1C2E 0%, #16213E 60%, #0F3460 100%)', paddingBottom: 90 }}>
        <div style={{ padding: '16px', background: 'rgba(28,28,46,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(245,197,24,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>📋 Historial</h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Envíos y servicios completados</p>
            </div>
            <button onClick={loadHistory} style={{ background: 'rgba(245,197,24,0.15)', border: '1px solid rgba(245,197,24,0.3)', color: '#F5C518', borderRadius: 10, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>
              ↺
            </button>
          </div>
        </div>

        <div style={{ padding: '14px 12px', paddingBottom: 100 }}>
          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: 'rgba(255,255,255,0.6)' }}>Cargando…</div>
          ) : total === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>📂</div>
              <p style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem', marginBottom: 8 }}>Sin historial aún</p>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem' }}>Tus envíos y servicios aparecerán aquí</p>
            </div>
          ) : (
            <>
              {/* Active orders section */}
              {(activeJobs.length > 0 || activeOrders.length > 0) && (
                <>
                  <h2 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1 }}>En Progreso</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
                    {/* Active Services */}
                    {activeJobs.map(job => (
                      <div key={job.id} style={{
                        background: 'rgba(99,102,241,0.12)', backdropFilter: 'blur(20px)', border: '1px solid rgba(99,102,241,0.25)',
                        borderRadius: 18, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: '1.5rem' }}>{SERVICE_LABELS[job.service_type]?.split(' ')[0] || '✨'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>
                              {SERVICE_LABELS[job.service_type] || job.service_type}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                              {getStatusLabel(job.status)}
                            </div>
                          </div>
                        </div>
                        <Link href="/cliente/mis-servicios" 
                          style={{ display: 'block', width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                          📍 Ver tracking
                        </Link>
                      </div>
                    ))}
                    {/* Active Orders */}
                    {activeOrders.map(order => (
                      <div key={order.id} style={{
                        background: 'rgba(245,197,24,0.12)', backdropFilter: 'blur(20px)', border: '1px solid rgba(245,197,24,0.25)',
                        borderRadius: 18, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: '1.5rem' }}>📦</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>
                              {order.origin_address ? order.origin_address.slice(0, 30) : 'Envío'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                              {getStatusLabel(order.status)}
                            </div>
                          </div>
                        </div>
                        <Link href="/cliente/mis-envios" 
                          style={{ display: 'block', width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F5C518,#F58A07)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}>
                          📍 Ver tracking
                        </Link>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Completed section */}
              {(completedJobs.length > 0 || completedOrders.length > 0) && (
                <>
                  <h2 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>Completados</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Completed Services */}
                    {completedJobs.map(job => (
                      <div key={job.id} style={{
                        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(245,197,24,0.18)',
                        borderRadius: 18, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: '1.5rem' }}>{SERVICE_LABELS[job.service_type]?.split(' ')[0] || '✨'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>
                              {SERVICE_LABELS[job.service_type] || job.service_type}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                              {job.status === 'completado' ? '✅ Completado' : job.status === 'cancelled' ? 'Cancelado' : '⚠️ Incidente'}
                            </div>
                          </div>
                          {job.total_price != null && (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '1rem' }}>{fmtGs(job.total_price)}</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: job.status === 'completado' && !job.tecnico_rating ? 10 : 0 }}>
                          {job.tecnico_name && <span>👷 {job.tecnico_name}</span>}
                          <span>📅 {fmtDate(job.completed_at ?? job.created_at)}</span>
                        </div>
                        {job.status === 'completado' && !job.tecnico_rating && (
                          <button onClick={() => setRatingModal({ jobId: job.id, tecnicoName: job.tecnico_name, tecnicoPhoto: job.tecnico_photo })}
                            style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>
                            ⭐ Calificar técnico
                          </button>
                        )}
                        {job.tecnico_rating != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                            <span>Tu calificación:</span>
                            <StarRating rating={job.tecnico_rating} />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Completed Orders */}
                    {completedOrders.map(order => (
                      <div key={order.id} style={{
                        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(245,197,24,0.18)',
                        borderRadius: 18, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: '1.5rem' }}>📦</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>
                              {order.origin_address ? order.origin_address.slice(0, 30) : 'Envío'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                              {order.status === 'delivered' || order.status === 'client_confirmed' || order.status === 'commission_charged' ? '✅ Entregado' : order.status === 'cancelled' ? 'Cancelado' : order.status}
                            </div>
                          </div>
                          {order.price != null && (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '1rem' }}>{fmtGs(order.price)}</div>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                          {order.driver_name && <span>🚗 {order.driver_name} · </span>}
                          <span>📅 {fmtDate(order.completed_at ?? order.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(28,28,46,0.95)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(245,197,24,0.18)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 4, justifyContent: 'space-around',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.3)',
      }}>
        {[
          { icon: '🏠', label: 'Home', path: '/cliente' },
          { icon: '➕', label: 'Publicar', path: '/cliente' },
          { icon: '📋', label: 'Historial', path: '/cliente/historial', active: true },
          { icon: '👤', label: 'Cuenta', path: '/cliente/settings' },
        ].map(item => (
          <Link key={item.label} href={item.path}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, background: item.active ? 'rgba(245,197,24,0.15)' : 'transparent' }}>
            <div style={{ fontSize: '1.5rem' }}>{item.icon}</div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: item.active ? '#F5C518' : 'rgba(255,255,255,0.5)' }}>{item.label}</span>
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
    </>
  );
}
