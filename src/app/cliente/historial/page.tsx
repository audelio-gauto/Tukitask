'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClientContext } from '../context';
import RatingModal from '@/components/RatingModal';
import ReportModal from '@/components/ReportModal';
import ChatModal from '@/components/ChatModal';
import { authFetch } from '@/lib/authFetch';

interface Order {
  id: string;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  offer: number | null;
  suggested_price: number | null;
  driver_name: string | null;
  driver_email: string | null;
  driver_photo: string | null;
  driver_rating: number | null;
  accepted_by: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Job {
  id: string;
  service_type: string;
  status: string;
  tecnico_name: string | null;
  tecnico_email: string | null;
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
  cerrajeria: 'Cerrajeria', gestor: 'Gestor', otros: 'Otros',
};

const SERVICE_ICONS: Record<string, string> = {
  limpieza: '🧹', niera: '👶', cocina: '🍳', eventos: '🎉',
  cuidado_mascotas: '🐾', cuidado_adultos: '👴', aire_split: '❄️',
  electrico: '⚡', plomeria: '🔧', cerrajeria: '🔑', gestor: '🗂️', otros: '✨',
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
  const [driverRatingModal, setDriverRatingModal] = useState<{ orderId: string; driverName: string | null; driverPhoto: string | null } | null>(null);
  const [localDriverRatings, setLocalDriverRatings] = useState<Record<string, number>>({});
  const [reportModal, setReportModal] = useState<{
    reportedEmail: string; reportedRole: 'driver' | 'tecnico';
    reportedName: string | null; referenceType: 'order' | 'job'; referenceId: string;
  } | null>(null);
  const [chatModal, setChatModal] = useState<{ orderId?: string; jobId?: string; otherName: string | null; otherPhoto: string | null } | null>(null);

  const loadHistory = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, histJobsRes, activeJobsRes] = await Promise.all([
        authFetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_history=true`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
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

  const handleDriverRating = async (rating: number, note: string) => {
    if (!driverRatingModal) return;
    await authFetch('/api/orders/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: driverRatingModal.orderId, rated_by: 'client', rating, note }),
    });
    setLocalDriverRatings(prev => ({ ...prev, [driverRatingModal.orderId]: rating }));
    setDriverRatingModal(null);
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

  const activeStatuses = ['pending', 'negotiating', 'assigned', 'accepted', 'in_progress', 'picking_up', 'in_transit', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'];
  const doneStatuses = ['completado', 'completed', 'delivered', 'cancelled', 'failed', 'incidente', 'return_delivered', 'returned', 'client_confirmed', 'commission_charged'];

  type UnifiedItem =
    | { kind: 'job';   data: Job;   date: string }
    | { kind: 'order'; data: Order; date: string };

  const sortByDate = (a: UnifiedItem, b: UnifiedItem) =>
    new Date(b.date).getTime() - new Date(a.date).getTime();


  // Pagination for historial
  const [activePage, setActivePage] = useState(1);
  const [donePage, setDonePage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const activeItems: UnifiedItem[] = [
    ...jobs.filter(j => activeStatuses.includes(j.status)).map(j => ({ kind: 'job' as const,   data: j, date: j.created_at })),
    ...orders.filter(o => activeStatuses.includes(o.status)).map(o => ({ kind: 'order' as const, data: o, date: o.created_at })),
  ].sort(sortByDate);
  const doneItems: UnifiedItem[] = [
    ...jobs.filter(j => doneStatuses.includes(j.status)).map(j => ({ kind: 'job' as const,   data: j, date: j.completed_at ?? j.created_at })),
    ...orders.filter(o => doneStatuses.includes(o.status)).map(o => ({ kind: 'order' as const, data: o, date: o.completed_at ?? o.created_at })),
  ].sort(sortByDate);
  const paginatedActive = activeItems.slice(0, activePage * ITEMS_PER_PAGE);
  const paginatedDone = doneItems.slice(0, donePage * ITEMS_PER_PAGE);

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
        }}>          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button>
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
            <svg style={{ width: 40, height: 40, marginBottom: 12 }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" style={{ animation: 'spin 1s linear infinite', transformOrigin: 'center' }} /></svg>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Cargando historial…</p>
          </div>
        ) : total === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <svg style={{ width: 56, height: 56, marginBottom: 16, opacity: 0.35 }} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
            <p style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem', marginBottom: 8 }}>Sin historial aún</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.88rem' }}>Tus envíos y servicios aparecerán aquí</p>
          </div>
        ) : (
          <>
            {activeItems.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ margin: '0 0 10px 2px', fontSize: '0.72rem', fontWeight: 800, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 2 }}>En Progreso</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {paginatedActive.map(item => item.kind === 'job' ? (
                    <div key={item.data.id} style={{ background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: '1.5rem' }}>{SERVICE_ICONS[item.data.service_type] || '✨'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{SERVICE_LABELS[item.data.service_type] || item.data.service_type}</div>
                          <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{getStatusLabel(item.data.status)}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{fmtDate(item.data.created_at)}</span>
                      </div>
                      <Link href="/cliente" style={{ display: 'block', padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', textAlign: 'center', textDecoration: 'none' }}>
                        📍 Ver en inicio
                      </Link>
                    </div>
                  ) : (
                    <div key={item.data.id} style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.22)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: '1.5rem' }}>📦</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{(item.data as Order).pickup_address?.slice(0, 28) || 'Envío'}</div>
                          <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{getStatusLabel(item.data.status)}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{fmtDate(item.data.created_at)}</span>
                      </div>
                      {/* Route A → B */}
                      {((item.data as Order).pickup_address || (item.data as Order).delivery_address) && (
                        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, gap: 2 }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5C518', display: 'block', flexShrink: 0 }} />
                              <span style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.18)', display: 'block' }} />
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'block', flexShrink: 0 }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1 }}>Punto A</div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>{(item.data as Order).pickup_address || '—'}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1 }}>Punto B</div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>{(item.data as Order).delivery_address || '—'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href="/cliente" style={{ flex: 1, display: 'block', padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#F5C518,#F58A07)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.85rem', textAlign: 'center', textDecoration: 'none' }}>
                          📍 Ver en inicio
                        </Link>
                        <button
                          onClick={() => setChatModal({ orderId: item.data.id, otherName: (item.data as Order).driver_name, otherPhoto: (item.data as Order).driver_photo })}
                          style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid rgba(245,197,24,0.3)', background: 'rgba(245,197,24,0.1)', color: '#F5C518', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          title="Chat 24h"
                        >💬</button>
                      </div>
                    </div>
                  ))}
                </div>
                {activeItems.length > paginatedActive.length && (
                  <button
                    onClick={() => setActivePage(p => p + 1)}
                    style={{ width: '100%', padding: '11px', borderRadius: 14, border: '1px solid #F5C518', background: 'rgba(245,197,24,0.08)', color: '#F5C518', fontWeight: 800, fontSize: '0.98rem', marginTop: 10, cursor: 'pointer' }}
                  >
                    Cargar más en progreso
                  </button>
                )}
              </div>
            )}

            {doneItems.length > 0 && (
              <div>
                <p style={{ margin: '0 0 10px 2px', fontSize: '0.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2 }}>Completados</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {paginatedDone.map(item => item.kind === 'job' ? (
                    <div key={item.data.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: item.data.status === 'completado' ? 10 : 0 }}>
                        <span style={{ fontSize: '1.4rem' }}>{SERVICE_ICONS[item.data.service_type] || '✨'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{SERVICE_LABELS[item.data.service_type] || item.data.service_type}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.73rem', color: item.data.status === 'completado' ? '#4ade80' : '#f87171' }}>
                              {item.data.status === 'completado' ? '✅ Completado' : item.data.status === 'cancelled' ? '❌ Cancelado' : '⚠️ Incidente'}
                            </span>
                            {item.data.tecnico_name && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{item.data.tecnico_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {item.data.total_price != null && <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '0.92rem' }}>{fmtGs(item.data.total_price)}</div>}
                          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{fmtDate(item.data.completed_at ?? item.data.created_at)}</div>
                        </div>
                      </div>
                      {item.data.status === 'completado' && !item.data.tecnico_rating && (
                        <button onClick={() => setRatingModal({ jobId: item.data.id, tecnicoName: item.data.tecnico_name, tecnicoPhoto: (item.data as Job).tecnico_photo })}
                          style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>
                          ⭐ Calificar técnico
                        </button>
                      )}
                      {item.data.tecnico_rating != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
                          Tu calificación: <StarRating rating={item.data.tecnico_rating} />
                        </div>
                      )}
                      {item.data.status !== 'pending' && (
                        <button
                          onClick={() => setReportModal({ reportedEmail: (item.data as Job).tecnico_email || '', reportedRole: 'tecnico', reportedName: item.data.tecnico_name, referenceType: 'job', referenceId: item.data.id })}
                          style={{ marginTop: 6, background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'rgba(239,68,68,0.7)', fontSize: '0.75rem', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}
                        >
                          🚨 Reportar
                        </button>
                      )}
                    </div>
                  ) : (
                    <div key={item.data.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: '1.4rem' }}>📦</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{(item.data as Order).pickup_address?.slice(0, 30) || 'Envío'}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.73rem', color: ['delivered','client_confirmed','commission_charged'].includes(item.data.status) ? '#4ade80' : '#f87171' }}>
                              {['delivered','client_confirmed','commission_charged'].includes(item.data.status) ? '✅ Entregado' : '❌ Cancelado'}
                            </span>
                            {(item.data as Order).driver_name && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{(item.data as Order).driver_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {((item.data as Order).offer ?? (item.data as Order).suggested_price) != null && <div style={{ fontWeight: 800, color: '#F5C518', fontSize: '0.92rem' }}>{fmtGs((item.data as Order).offer ?? (item.data as Order).suggested_price)}</div>}
                          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{fmtDate((item.data as Order).completed_at ?? item.data.created_at)}</div>
                        </div>
                      </div>
                      {/* Route A → B */}
                      {((item.data as Order).pickup_address || (item.data as Order).delivery_address) && (
                        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, gap: 2 }}>
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#F5C518', display: 'block', flexShrink: 0 }} />
                              <span style={{ width: 2, height: 18, background: 'rgba(255,255,255,0.15)', display: 'block' }} />
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', display: 'block', flexShrink: 0 }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1 }}>A</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>{(item.data as Order).pickup_address || '—'}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1 }}>B</div>
                                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>{(item.data as Order).delivery_address || '—'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Chat 24h */}
                      {(item.data as Order).driver_name && (
                        <button
                          onClick={() => setChatModal({ orderId: item.data.id, otherName: (item.data as Order).driver_name, otherPhoto: (item.data as Order).driver_photo })}
                          style={{ width: '100%', padding: '9px', borderRadius: 10, border: '1px solid rgba(99,180,255,0.3)', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          💬 Chat 24h con el driver
                        </button>
                      )}
                      {/* Driver rating */}
                      {['delivered','client_confirmed','commission_charged'].includes(item.data.status) && (item.data as Order).driver_name && (
                        localDriverRatings[item.data.id] != null || (item.data as Order).driver_rating != null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                            Tu calificación al driver: <StarRating rating={localDriverRatings[item.data.id] ?? (item.data as Order).driver_rating!} />
                          </div>
                        ) : (
                          <button
                            onClick={() => setDriverRatingModal({ orderId: item.data.id, driverName: (item.data as Order).driver_name, driverPhoto: (item.data as Order).driver_photo })}
                            style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer', marginBottom: 6 }}
                          >
                            ⭐ Calificar driver
                          </button>
                        )
                      )}
                      {(item.data as Order).driver_name && (
                        <button
                          onClick={() => setReportModal({ reportedEmail: (item.data as Order).driver_email || '', reportedRole: 'driver', reportedName: (item.data as Order).driver_name, referenceType: 'order', referenceId: item.data.id })}
                          style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'rgba(239,68,68,0.7)', fontSize: '0.75rem', padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}
                        >
                          🚨 Reportar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {doneItems.length > paginatedDone.length && (
                  <button
                    onClick={() => setDonePage(p => p + 1)}
                    style={{ width: '100%', padding: '11px', borderRadius: 14, border: '1px solid #F5C518', background: 'rgba(245,197,24,0.08)', color: '#F5C518', fontWeight: 800, fontSize: '0.98rem', marginTop: 10, cursor: 'pointer' }}
                  >
                    Cargar más completados
                  </button>
                )}
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

      {driverRatingModal && (
        <RatingModal
          title="Calificar driver"
          subtitle={driverRatingModal.driverName ?? undefined}
          avatarUrl={driverRatingModal.driverPhoto ?? undefined}
          avatarName={driverRatingModal.driverName ?? undefined}
          onSubmit={handleDriverRating}
          onClose={() => setDriverRatingModal(null)}
        />
      )}

      {reportModal && email && (
        <ReportModal
          reporterEmail={email}
          reporterRole="cliente"
          reportedEmail={reportModal.reportedEmail || 'desconocido@sistema'}
          reportedRole={reportModal.reportedRole}
          reportedName={reportModal.reportedName ?? undefined}
          referenceType={reportModal.referenceType}
          referenceId={reportModal.referenceId}
          onClose={() => setReportModal(null)}
        />
      )}

      {chatModal && email && (
        <ChatModal
          open={true}
          onClose={() => setChatModal(null)}
          orderId={chatModal.orderId}
          jobId={chatModal.jobId}
          myEmail={email}
          myName={null}
          otherName={chatModal.otherName}
          otherPhoto={chatModal.otherPhoto}
        />
      )}
    </div>
  );
}