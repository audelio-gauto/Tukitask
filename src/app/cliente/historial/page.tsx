'use client';

import { useEffect, useState, useCallback } from 'react';
import type React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClientContext } from '../context';
import RatingModal from '@/components/RatingModal';
import ReportModal from '@/components/ReportModal';
import ChatModal from '@/components/ChatModal';
import { Icon } from '@/components/Icon';
import { authFetch } from '@/lib/authFetch';
import { getStatusTone } from '@/lib/statusPalette';

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
  fail_reason: string | null;
  tip_amount: number | null;
  created_at: string;
  completed_at: string | null;
  order_stops?: Array<{ sequence: number; address: string; status?: string; fail_reason?: string | null }> | null;
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
  agreed_price: number | null;
  extra_charge: number | null;
  extra_items: Array<{ amount: number; reason: string }> | null;
  warranty_days: number | null;
  created_at: string;
  completed_at: string | null;
}

interface MarketOrder {
  id: string;
  status: string;
  vendor_email: string;
  vendor_id?: string | null;
  client_name: string | null;
  items: Array<{ productId: string; name: string; price: number; qty: number; image?: string | null }>;
  total: number;
  shipping_price?: number | null;
  address?: string | null;
  payment_method?: string | null;
  created_at: string;
  delivery: { ciudad?: string; barrio?: string; referencia?: string; nombre?: string } | null;
  store_name?: string | null;
  store_logo?: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  limpieza: 'Limpieza', niera: 'Niera', cocina: 'Cocina',
  eventos: 'Eventos', cuidado_mascotas: 'Mascotas', cuidado_adultos: 'Adultos',
  aire_split: 'Aire Split', electrico: 'Electrico', plomeria: 'Plomeria',
  cerrajeria: 'Cerrajeria', gestor: 'Gestor', otros: 'Otros',
};

const SERVICE_ICONS: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  limpieza: 'tool',
  niera: 'user',
  cocina: 'clipboard',
  eventos: 'calendar',
  cuidado_mascotas: 'tag',
  cuidado_adultos: 'user',
  aire_split: 'refresh',
  electrico: 'bolt',
  plomeria: 'tool',
  cerrajeria: 'lock',
  gestor: 'clipboard',
  otros: 'settings',
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
  const [marketOrders, setMarketOrders] = useState<MarketOrder[]>([]);
  const [doneTab, setDoneTab] = useState<'movilidad' | 'servicios' | 'pedidos'>('movilidad');
  const [loading, setLoading] = useState(true);
  const [ratingModal, setRatingModal] = useState<{ jobId: string; tecnicoName: string | null; tecnicoPhoto: string | null } | null>(null);
  const [driverRatingModal, setDriverRatingModal] = useState<{ orderId: string; driverName: string | null; driverPhoto: string | null } | null>(null);
  const [localDriverRatings, setLocalDriverRatings] = useState<Record<string, number>>({});
  const [tipModal, setTipModal] = useState<{ orderId: string; driverName: string | null } | null>(null);
  const [tipInput, setTipInput] = useState('');
  const [tipSending, setTipSending] = useState(false);
  const [localTips, setLocalTips] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favLoading, setFavLoading] = useState<Record<string, boolean>>({});
  const [reportModal, setReportModal] = useState<{
    reportedEmail: string; reportedRole: 'driver' | 'tecnico';
    reportedName: string | null; referenceType: 'order' | 'job'; referenceId: string;
  } | null>(null);
  const [chatModal, setChatModal] = useState<{ orderId?: string; jobId?: string; otherName: string | null; otherPhoto: string | null } | null>(null);
  const [orderStopsOpen, setOrderStopsOpen] = useState<Record<string, boolean>>({});

  const loadHistory = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, histJobsRes, activeJobsRes, mktOrdersRes] = await Promise.all([
        authFetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_history=true`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
        authFetch(`/api/tienda/mis-pedidos?email=${encodeURIComponent(email)}`),
      ]);
      const ordersData = await ordersRes.json();
      const histJobsData = await histJobsRes.json();
      const activeJobsData = await activeJobsRes.json();
      const mktData = await mktOrdersRes.json();
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setMarketOrders(Array.isArray(mktData) ? mktData : []);
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

  // Load favourites
  useEffect(() => {
    if (!email) return;
    authFetch('/api/favorites').then(r => r.json()).then((data: { driver_email: string }[]) => {
      if (Array.isArray(data)) setFavorites(new Set(data.map(d => d.driver_email)));
    }).catch(() => {});
  }, [email]);

  const toggleFavorite = async (driverEmail: string) => {
    setFavLoading(prev => ({ ...prev, [driverEmail]: true }));
    const isFav = favorites.has(driverEmail);
    try {
      await authFetch('/api/favorites', {
        method: isFav ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_email: driverEmail }),
      });
      setFavorites(prev => {
        const next = new Set(prev);
        isFav ? next.delete(driverEmail) : next.add(driverEmail);
        return next;
      });
    } catch { /* silent */ }
    setFavLoading(prev => ({ ...prev, [driverEmail]: false }));
  };

  const handleTip = async () => {
    if (!tipModal || !tipInput) return;
    const amount = parseInt(tipInput.replace(/\D/g, ''), 10);
    if (!amount || amount <= 0) return;
    setTipSending(true);
    try {
      const res = await authFetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: tipModal.orderId, amount }),
      });
      if (res.ok) {
        setLocalTips(prev => ({ ...prev, [tipModal.orderId]: amount }));
        setTipModal(null);
        setTipInput('');
      }
    } catch { /* silent */ }
    setTipSending(false);
  };

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

  const getStatusInfo = (status: string) => {
    const labels: Record<string, { label: string; icon: React.ComponentProps<typeof Icon>['name'] }> = {
      pending: { label: 'Buscando...', icon: 'refresh' },
      negotiating: { label: 'Negociando', icon: 'chat' },
      assigned: { label: 'Asignado', icon: 'check' },
      accepted: { label: 'Asignado', icon: 'check' },
      in_progress: { label: 'En progreso', icon: 'tool' },
      picking_up: { label: 'Recogiendo', icon: 'truck' },
      in_transit: { label: 'En camino', icon: 'truck' },
      completado: { label: 'Completado', icon: 'check' },
      completed: { label: 'Completado', icon: 'check' },
      delivered: { label: 'Entregado', icon: 'check' },
      cancelled: { label: 'Cancelado por cliente', icon: 'x' },
      failed: { label: 'Entrega fallida', icon: 'exclamation' },
      return_rejected: { label: 'Devolucion rechazada', icon: 'package' },
      returning: { label: 'Devolviendo', icon: 'refresh' },
      returned: { label: 'Devuelto', icon: 'refresh' },
      return_delivered: { label: 'Devolucion entregada', icon: 'refresh' },
      incident_closed: { label: 'Incidente cerrado', icon: 'check' },
      incidente: { label: 'Incidente', icon: 'exclamation' },
      client_confirmed: { label: 'Confirmado', icon: 'check' },
      commission_charged: { label: 'Completado', icon: 'check' },
      driver_returning: { label: 'Tasker devolviendo', icon: 'refresh' },
    };
    return labels[status] || { label: status, icon: 'tag' };
  };

  const activeStatuses = ['pending', 'negotiating', 'assigned', 'accepted', 'in_progress', 'picking_up', 'in_transit', 'en_camino', 'llegue', 'en_proceso', 'completion_pending'];
  const doneStatuses = ['completado', 'completed', 'delivered', 'cancelled', 'failed', 'incidente', 'return_delivered', 'returned', 'return_rejected', 'client_confirmed', 'commission_charged'];

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
  const doneMovilidad: UnifiedItem[] = orders
    .filter(o => doneStatuses.includes(o.status))
    .map(o => ({ kind: 'order' as const, data: o, date: o.completed_at ?? o.created_at }))
    .sort(sortByDate);
  const doneServicios: UnifiedItem[] = jobs
    .filter(j => doneStatuses.includes(j.status))
    .map(j => ({ kind: 'job' as const, data: j, date: j.completed_at ?? j.created_at }))
    .sort(sortByDate);
  const doneItems: UnifiedItem[] = [
    ...doneServicios,
    ...doneMovilidad,
  ].sort(sortByDate);
  const activeDoneList = doneTab === 'movilidad' ? doneMovilidad : doneTab === 'servicios' ? doneServicios : [];
  const paginatedActive = activeItems.slice(0, activePage * ITEMS_PER_PAGE);
  const paginatedDone = activeDoneList.slice(0, donePage * ITEMS_PER_PAGE);
  const paginatedMarketOrders = marketOrders.slice(0, donePage * ITEMS_PER_PAGE);

  const total = activeItems.length + doneItems.length + marketOrders.length;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--background)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px 12px', background: 'var(--header-bg)',
        borderBottom: '1px solid rgba(245,197,24,0.12)',
      }}>
        <button onClick={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: 'var(--ghost-btn)', color: 'var(--ghost-btn-color)', fontSize: '1.1rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Historial</h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Envíos y servicios</p>
        </div>
        <button onClick={loadHistory} style={{
          width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(245,197,24,0.3)',
          background: 'rgba(245,197,24,0.15)', color: '#F5C518', fontSize: '1.1rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <svg style={{ width: 40, height: 40, marginBottom: 12 }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" style={{ animation: 'spin 1s linear infinite', transformOrigin: 'center' }} /></svg>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cargando historial…</p>
          </div>
        ) : total === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <svg style={{ width: 56, height: 56, marginBottom: 16, opacity: 0.35 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: 8 }}>Sin historial aún</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Tus envíos y servicios aparecerán aquí</p>
          </div>
        ) : (
          <>
            {(doneItems.length > 0 || marketOrders.length > 0) && (
              <div>
                {/* 3-chip selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {(['movilidad', 'servicios', 'pedidos'] as const).map(tab => {
                    const labels = { movilidad: 'Movilidad', servicios: 'Servicios', pedidos: 'Pedidos' };
                    const active = doneTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => { setDoneTab(tab); setDonePage(1); }}
                        style={{
                          flex: 1, padding: '6px 4px', borderRadius: 20, border: active ? '1.5px solid #F5C518' : '1px solid rgba(245,197,24,0.25)',
                          background: active ? 'rgba(245,197,24,0.18)' : 'var(--ghost-btn)',
                          color: active ? '#F5C518' : 'var(--text-muted)', fontWeight: active ? 800 : 500,
                          fontSize: '0.72rem', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>

                {/* Pedidos tab — market orders */}
                {doneTab === 'pedidos' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {marketOrders.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        Sin pedidos aún
                      </div>
                    ) : paginatedMarketOrders.map(mo => {
                      const moStatus: Record<string, { label: string; color: string }> = {
                        pending:            { label: 'En espera',  color: '#F5C518' },
                        preparing:          { label: 'Preparando', color: '#60a5fa' },
                        ready:              { label: 'Listo',      color: '#F5C518' },
                        in_transit:         { label: 'En camino',  color: '#a78bfa' },
                        delivered:          { label: 'Entregado',  color: '#4ade80' },
                        commission_charged: { label: 'Completado', color: '#4ade80' },
                        cancelled:          { label: 'Cancelado',  color: '#f87171' },
                      };
                      const badge = moStatus[mo.status] ?? { label: mo.status, color: 'var(--text-muted)' };
                      const items = Array.isArray(mo.items) ? mo.items : [];
                      const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
                      const shippingPrice = Number(mo.shipping_price ?? 0) || 0;
                      const storeName = mo.store_name || mo.vendor_email.split('@')[0] || 'Tienda';
                      const addressLine = [mo.delivery?.barrio, mo.delivery?.ciudad].filter(Boolean).join(', ') || mo.address || null;
                      return (
                        <Link key={mo.id} href={`/cliente/pedidos/${mo.id}`} className="tuki-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                          <div className="tuki-card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                              <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{mo.id.slice(0, 8).toUpperCase()}</span>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: badge.color, background: `${badge.color}22`, padding: '2px 8px', borderRadius: 20 }}>{badge.label}</span>
                            </div>

                            {/* Tienda */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--ghost-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {mo.store_logo
                                  ? <img src={mo.store_logo} alt={storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : storeName.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>{storeName}</span>
                            </div>

                            {items.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                                {items.map((it, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ghost-btn)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                      {it.image
                                        ? <img src={it.image} alt={it.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <span style={{ fontSize: '0.95rem' }}>📦</span>}
                                    </div>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {it.name} ×{it.qty}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {addressLine && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                                📍 {addressLine}{mo.delivery?.referencia ? ` (${mo.delivery.referencia})` : ''}
                              </div>
                            )}

                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                              {mo.payment_method === 'contra_entrega' ? '💵 Contra entrega' : '🏦 Transferencia bancaria'}
                            </div>

                            <div style={{ borderTop: '1px solid rgba(245,197,24,0.12)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Subtotal</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)' }}>{fmtGs(subtotal)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Envío</span>
                                <span style={{ fontSize: '0.72rem', color: shippingPrice === 0 ? '#4ade80' : 'var(--text-primary)' }}>
                                  {shippingPrice === 0 ? 'Gratis' : fmtGs(shippingPrice)}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{fmtDate(mo.created_at)}</span>
                              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#F5C518' }}>{fmtGs(mo.total)}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {marketOrders.length > paginatedMarketOrders.length && (
                      <button onClick={() => setDonePage(p => p + 1)} className="tuki-btn tuki-btn-warning tuki-btn-block" style={{ fontSize: '0.98rem', marginTop: 10 }}>
                        Cargar más pedidos
                      </button>
                    )}
                  </div>
                )}

                {/* Movilidad / Servicios tabs — existing rendering */}
                {doneTab !== 'pedidos' && (
                <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeDoneList.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                      Sin {doneTab === 'movilidad' ? 'envíos' : 'servicios'} completados aún
                    </div>
                  )}
                  {paginatedDone.map(item => {
                    const statusTone = getStatusTone(item.data.status);
                    return item.kind === 'job' ? (
                    <div
                      key={item.data.id}
                      className="tuki-card"
                      style={{
                        ['--status-color' as never]: statusTone.color,
                        ['--status-bg' as never]: statusTone.bg,
                        ['--status-border' as never]: statusTone.border,
                        ['--status-outline' as never]: statusTone.border,
                      }}
                    >
                      <div className="tuki-card-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: item.data.status === 'completado' ? 10 : 0 }}>
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                          <Icon name={SERVICE_ICONS[item.data.service_type] || 'settings'} size={16} />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{SERVICE_LABELS[item.data.service_type] || item.data.service_type}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.73rem', color: statusTone.color }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Icon
                                  name={item.data.status === 'completado' ? 'check' : item.data.status === 'cancelled' ? 'x' : 'exclamation'}
                                  size={12}
                                  color={statusTone.color}
                                />
                                {item.data.status === 'completado' ? 'Completado' : item.data.status === 'cancelled' ? 'Cancelado' : 'Incidente'}
                              </span>
                            </span>
                            {item.data.tecnico_name && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.data.tecnico_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {item.data.total_price != null && (
                            <div className="tuki-price" style={{ color: '#F5C518', fontSize: '0.92rem' }}>
                              {fmtGs(item.data.total_price)}
                            </div>
                          )}
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(item.data.completed_at ?? item.data.created_at)}</div>
                        </div>
                      </div>
                      {(item.data as Job).warranty_days != null && (item.data as Job).warranty_days! > 0 && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '5px 10px', marginBottom: 6, fontSize: '0.8rem', fontWeight: 700, color: '#818cf8' }}>
                          🛡️ Garantía: {(item.data as Job).warranty_days} {(item.data as Job).warranty_days === 1 ? 'día' : 'días'}
                        </div>
                      )}
                      {/* Bloque precio unificado */}
                      {(item.data as Job).agreed_price != null && (
                        <div style={{ marginBottom: 8, background: 'rgba(245,197,24,0.07)', border: '1px solid rgba(245,197,24,0.22)', borderRadius: 14, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(245,197,24,0.65)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acordado</span>
                            <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#F5C518' }}>{Number((item.data as Job).agreed_price).toLocaleString('es-PY')} Gs.</span>
                          </div>
                          {Array.isArray((item.data as Job).extra_items) && (item.data as Job).extra_items!.length > 0 && (
                            <>
                              <div style={{ height: 1, background: 'rgba(245,197,24,0.15)', margin: '0 14px' }} />
                              {(item.data as Job).extra_items!.map((it, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px' }}>
                                  <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>➕ {it.reason || 'Extra'}</span>
                                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>{Number(it.amount).toLocaleString('es-PY')} Gs.</span>
                                </div>
                              ))}
                              {item.data.total_price != null && (
                                <>
                                  <div style={{ height: 1, background: 'rgba(245,197,24,0.25)', margin: '0 14px' }} />
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'rgba(245,197,24,0.1)' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(245,197,24,0.75)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
                                    <span style={{ fontSize: '1.12rem', fontWeight: 900, color: '#F5C518' }}>{Number(item.data.total_price).toLocaleString('es-PY')} Gs.</span>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {item.data.tecnico_name && (() => {
                        const refDate = item.data.completed_at ?? item.data.created_at;
                        const chatDays = (item.data as Job).warranty_days != null && (item.data as Job).warranty_days! > 0 ? (item.data as Job).warranty_days! : 1;
                        const chatOk = refDate ? Date.now() - new Date(refDate).getTime() < chatDays * 24 * 60 * 60 * 1000 : false;
                        return chatOk ? (
                          <button
                            onClick={() => setChatModal({ jobId: item.data.id, otherName: item.data.tecnico_name, otherPhoto: (item.data as Job).tecnico_photo })}
                            className="tuki-btn tuki-btn-info tuki-btn-block"
                            style={{ fontSize: '0.83rem', marginBottom: 6 }}
                          >
                            <Icon name="chat" size={14} />
                            Chat con el Tasker
                          </button>
                        ) : null;
                      })()}
                      {item.data.status === 'completado' && !item.data.tecnico_rating && (
                        <button
                          onClick={() => setRatingModal({ jobId: item.data.id, tecnicoName: item.data.tecnico_name, tecnicoPhoto: (item.data as Job).tecnico_photo })}
                          className="tuki-btn tuki-btn-primary tuki-btn-block"
                          style={{ fontSize: '0.83rem' }}
                        >
                          <Icon name="star" size={14} />
                          Calificar Tasker
                        </button>
                      )}
                      {item.data.tecnico_rating != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Tu calificación: <StarRating rating={item.data.tecnico_rating} />
                        </div>
                      )}
                      {item.data.status !== 'pending' && (
                        <button
                          onClick={() => setReportModal({ reportedEmail: (item.data as Job).tecnico_email || '', reportedRole: 'tecnico', reportedName: item.data.tecnico_name, referenceType: 'job', referenceId: item.data.id })}
                          className="tuki-btn tuki-btn-danger tuki-btn-sm"
                          style={{ marginTop: 6, fontSize: '0.75rem' }}
                        >
                          <Icon name="flag" size={12} />
                          Reportar
                        </button>
                      )}
                    </div>
                    </div>
                  ) : (
                    <div
                      key={item.data.id}
                      className="tuki-card"
                      style={{
                        ['--status-color' as never]: statusTone.color,
                        ['--status-bg' as never]: statusTone.bg,
                        ['--status-border' as never]: statusTone.border,
                        ['--status-outline' as never]: statusTone.border,
                      }}
                    >
                      <div className="tuki-card-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                          <Icon name="package" size={16} />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{(item.data as Order).pickup_address?.slice(0, 30) || 'Envío'}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: '0.73rem', color: statusTone.color }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Icon
                                  name={getStatusInfo(item.data.status).icon}
                                  size={12}
                                  color={statusTone.color}
                                />
                                {getStatusInfo(item.data.status).label}
                              </span>
                            </span>
                            {(item.data as Order).driver_name && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{(item.data as Order).driver_name}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {((item.data as Order).offer ?? (item.data as Order).suggested_price) != null && (
                            <div className="tuki-price" style={{ color: '#F5C518', fontSize: '0.92rem' }}>
                              {fmtGs((item.data as Order).offer ?? (item.data as Order).suggested_price)}
                            </div>
                          )}
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate((item.data as Order).completed_at ?? item.data.created_at)}</div>
                        </div>
                      </div>
                      {/* Route A → stops → B — completed order */}
                      {((item.data as Order).pickup_address || (item.data as Order).delivery_address) && (
                        <div className="tuki-address-box" style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3, gap: 2 }}>
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#F5C518', display: 'block', flexShrink: 0 }} />
                              <span style={{ width: 2, height: 18, background: 'var(--border-subtle)', display: 'block' }} />
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', display: 'block', flexShrink: 0 }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1 }}>A</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{(item.data as Order).pickup_address || '—'}</div>
                              </div>
                              {(item.data as Order).order_stops && (item.data as Order).order_stops!.length > 0 && (
                                <div style={{ borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
                                  <button onClick={() => setOrderStopsOpen(p => ({ ...p, [item.data.id]: !p[item.data.id] }))}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(245,158,11,0.08)', padding: '4px 8px', cursor: 'pointer', border: 'none' }}>
                                    <span style={{ color: '#fbbf24', display: 'inline-flex' }}>
                                      <Icon name="package" size={12} />
                                    </span>
                                    <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24', textAlign: 'left' }}>{(item.data as Order).order_stops!.length} paradas de entrega</span>
                                    <span style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 700 }}>{orderStopsOpen[item.data.id] ? '▲' : '▼ ver todas'}</span>
                                  </button>
                                  {orderStopsOpen[item.data.id] && (
                                    <div style={{ maxHeight: 200, overflowY: 'auto', padding: '5px 8px 7px', display: 'flex', flexDirection: 'column', gap: 5, WebkitOverflowScrolling: 'touch' as never }}>
                                      {[...(item.data as Order).order_stops!].sort((a, b) => a.sequence - b.sequence).map((s, si) => {
                                        const done = s.status === 'delivered'; const fail = s.status === 'failed';
                                        return (
                                          <div key={si} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                            <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: done ? 'rgba(34,197,94,0.2)' : fail ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)', border: `1px solid ${done ? '#22c55e' : fail ? '#ef4444' : 'rgba(245,158,11,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 900, color: done ? '#22c55e' : fail ? '#ef4444' : '#fbbf24', marginTop: 1 }}>{done ? '✓' : fail ? '✗' : s.sequence}</div>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontSize: '0.73rem', color: done ? '#4ade80' : fail ? '#f87171' : '#fde68a', wordBreak: 'break-word', lineHeight: 1.35, fontWeight: done || fail ? 600 : 400 }}>{s.address}</div>
                                              {done && <div style={{ fontSize: '0.6rem', color: '#4ade80', marginTop: 1, fontWeight: 700 }}>✓ Entregado</div>}
                                              {fail && <div style={{ fontSize: '0.6rem', color: '#f87171', marginTop: 1, fontWeight: 700 }}>✗ Fallido{s.fail_reason ? ` — ${s.fail_reason}` : ''}</div>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {/* Summary counts */}
                                      {(() => {
                                        const deliveredCount = (item.data as Order).order_stops!.filter(s => s.status === 'delivered').length;
                                        const failedCount = (item.data as Order).order_stops!.filter(s => s.status === 'failed').length;
                                        return deliveredCount > 0 || failedCount > 0 ? (
                                          <div style={{ display: 'flex', gap: 10, fontSize: '0.65rem', paddingTop: 4, borderTop: '1px solid var(--border-subtle)', marginTop: 2 }}>
                                            {deliveredCount > 0 && <span style={{ color: '#4ade80', fontWeight: 700 }}>✓ {deliveredCount} entregada{deliveredCount !== 1 ? 's' : ''}</span>}
                                            {failedCount > 0 && <span style={{ color: '#f87171', fontWeight: 700 }}>✗ {failedCount} fallida{failedCount !== 1 ? 's' : ''}</span>}
                                          </div>
                                        ) : null;
                                      })()}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div>
                                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1 }}>B</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{(item.data as Order).delivery_address || '—'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* fail_reason — visible al cliente si la entrega falló */}
                      {item.data.status === 'failed' && (item.data as Order).fail_reason && (
                        <div style={{
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 10, padding: '9px 12px', marginBottom: 8,
                        }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            Motivo del fallo
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {(item.data as Order).fail_reason}
                          </div>
                        </div>
                      )}
                      {/* Chat — solo disponible las primeras 24h tras completar */}
                      {(item.data as Order).driver_name && (() => {
                        const refDate = (item.data as Order).completed_at ?? item.data.created_at;
                        const chatOk = refDate ? Date.now() - new Date(refDate).getTime() < 24 * 60 * 60 * 1000 : false;
                        return chatOk ? (
                          <button
                            onClick={() => setChatModal({ orderId: item.data.id, otherName: (item.data as Order).driver_name, otherPhoto: (item.data as Order).driver_photo })}
                            className="tuki-btn tuki-btn-info tuki-btn-block"
                            style={{ fontSize: '0.83rem', marginBottom: 6 }}
                          >
                            <Icon name="chat" size={14} />
                            Chat con el driver
                          </button>
                        ) : null;
                      })()}
                      {/* Driver rating */}
                      {['delivered','client_confirmed','commission_charged'].includes(item.data.status) && (item.data as Order).driver_name && (
                        localDriverRatings[item.data.id] != null || (item.data as Order).driver_rating != null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                            Tu calificación al driver: <StarRating rating={localDriverRatings[item.data.id] ?? (item.data as Order).driver_rating!} />
                          </div>
                        ) : (
                          <button
                            onClick={() => setDriverRatingModal({ orderId: item.data.id, driverName: (item.data as Order).driver_name, driverPhoto: (item.data as Order).driver_photo })}
                            className="tuki-btn tuki-btn-primary tuki-btn-block"
                            style={{ fontSize: '0.83rem', marginBottom: 6 }}
                          >
                            <Icon name="star" size={14} />
                            Calificar driver
                          </button>
                        )
                      )}
                      {(item.data as Order).driver_name && (
                        <button
                          onClick={() => setReportModal({ reportedEmail: (item.data as Order).driver_email || '', reportedRole: 'driver', reportedName: (item.data as Order).driver_name, referenceType: 'order', referenceId: item.data.id })}
                          className="tuki-btn tuki-btn-danger tuki-btn-sm"
                          style={{ fontSize: '0.75rem' }}
                        >
                          <Icon name="flag" size={12} />
                          Reportar
                        </button>
                      )}
                      {/* Tip + Favourite row */}
                      {['delivered','client_confirmed','commission_charged'].includes(item.data.status) && (item.data as Order).driver_email && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          {/* Tip */}
                          {(localTips[(item.data as Order).id] ?? (item.data as Order).tip_amount ?? 0) > 0 && (
                            <div style={{ flex: 1, padding: '8px', borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#4ade80', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Icon name="money" size={12} color="#4ade80" />
                              Propina: {(localTips[(item.data as Order).id] ?? (item.data as Order).tip_amount!).toLocaleString('es-PY')} Gs
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    </div>
                  );
                  })}
                </div>
                {activeDoneList.length > paginatedDone.length && (
                  <button
                    onClick={() => setDonePage(p => p + 1)}
                    className="tuki-btn tuki-btn-warning tuki-btn-block"
                    style={{ fontSize: '0.98rem', marginTop: 10 }}
                  >
                    Cargar más
                  </button>
                )}
                </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 4, justifyContent: 'space-around',
        background: 'var(--header-bg)', borderTop: '1px solid rgba(245,197,24,0.15)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
      }}>
        {([
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>),
            label: 'Home', path: '/cliente', active: false,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>),
            label: 'Solicitar', path: '/cliente', active: false,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5h6M9 9h6M9 13h6M7 5h.01M7 9h.01M7 13h.01"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg>),
            label: 'Historial', path: '/cliente/historial', active: true,
          },
          {
            icon: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
            label: 'Cuenta', path: '/cliente/settings', active: false,
          },
        ] as { icon: React.ReactNode; label: string; path: string; active: boolean }[]).map(item => (
          <Link key={item.label} href={item.path} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '8px 4px', textDecoration: 'none', borderRadius: 12,
            background: item.active ? 'rgba(245,197,24,0.12)' : 'transparent',
            color: item.active ? '#F5C518' : 'var(--nav-icon-inactive)',
          }}>
            {item.icon}
            <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>{item.label}</span>
            {item.active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#F5C518', marginTop: 1 }} />}
          </Link>
        ))}
      </div>

      {ratingModal && (
        <RatingModal
          title="Calificar Tasker"
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

      {/* Tip modal */}
      {tipModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--modal-bg)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, border: '1px solid rgba(245,197,24,0.2)' }}>
            <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 800 }}>Dar propina</h3>
            <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {tipModal.driverName ? `Para ${tipModal.driverName}` : 'Para el Tasker'} · ingresa monto en Gs
            </p>
            <input
              type="number"
              placeholder="Ej: 10000"
              value={tipInput}
              onChange={e => setTipInput(e.target.value)}
              style={{ width: '100%', padding: '13px 14px', borderRadius: 12, border: '1px solid rgba(245,197,24,0.3)', background: 'var(--surface-2)', color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setTipModal(null)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--ghost-btn)', color: 'var(--ghost-btn-color)', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={handleTip} disabled={tipSending || !tipInput} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: tipSending || !tipInput ? 'rgba(245,197,24,0.3)' : 'linear-gradient(135deg,#F5C518,#f59e0b)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.9rem', cursor: tipSending || !tipInput ? 'not-allowed' : 'pointer' }}>
                {tipSending ? 'Enviando...' : 'Confirmar propina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}