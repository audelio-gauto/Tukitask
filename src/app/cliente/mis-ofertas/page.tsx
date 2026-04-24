'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { useClientContext } from '../context';
import { Icon } from '@/components/Icon';

/* ── Types ──────────────────────────────────────────────────────────────── */
interface ActiveOrder {
  id: string;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  offer: number | null;
  suggested_price: number | null;
  created_at: string;
  driver_name: string | null;
  driver_photo: string | null;
  vehicle_type: string | null;
  order_type: string | null;
}

interface ActiveJob {
  id: string;
  status: string;
  service_type: string | null;
  address: string | null;
  agreed_price: number | null;
  created_at: string;
  tecnico_name: string | null;
  tecnico_photo: string | null;
}

/* ── Config ─────────────────────────────────────────────────────────────── */
const ACTIVE_ORDER_STS = ['pending', 'negotiating', 'accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered'];
const ACTIVE_JOB_STS   = ['pending', 'accepted', 'in_progress'];

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:          { label: 'Buscando conductor', color: '#f59e0b' },
  negotiating:      { label: 'Negociando',          color: '#f59e0b' },
  accepted:         { label: 'Conductor asignado',  color: '#22c55e' },
  picking_up:       { label: 'Recogiendo',          color: '#3b82f6' },
  in_transit:       { label: 'En camino',           color: '#3b82f6' },
  returning:        { label: 'Devolviendo',         color: '#f97316' },
  driver_returning: { label: 'Conductor regresando',color: '#f97316' },
  return_delivered: { label: 'Devuelto',            color: '#6b7280' },
};

const JOB_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Buscando técnico', color: '#f59e0b' },
  accepted:    { label: 'Técnico asignado', color: '#22c55e' },
  in_progress: { label: 'En progreso',      color: '#3b82f6' },
};

const SERVICE_LABELS: Record<string, string> = {
  limpieza:         'Limpieza',
  niera:            'Niñera',
  cocina:           'Cocina',
  eventos:          'Eventos',
  cuidado_mascotas: 'Cuidado Mascotas',
  cuidado_adultos:  'Cuidado adultos',
  aire_split:       'Tec. Aire Split',
  electrico:        'Serv. Eléctrico',
  plomeria:         'Serv. Plomería',
  cerrajeria:       'Serv. Cerrajería',
  gestor:           'Gestor',
  otros:            'Otros',
};

const VEHICLE_LABELS: Record<string, string> = {
  moto:       'Moto',
  auto:       'Auto',
  moto_carro: 'Moto Carro',
  camion:     'Camión',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  envio:      'Envío',
  mandadito:  'Mandadito',
  flete:      'Flete',
};

/* ── Pulse animation injected once ─────────────────────────────────────── */
const PULSE_CSS = `@keyframes mis-ofertas-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`;

/* ── Component ──────────────────────────────────────────────────────────── */
export default function MisOfertasPage() {
  const { email } = useClientContext();
  const router = useRouter();

  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [jobs,   setJobs]   = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!email) return;
    try {
      const [ordersRes, jobsRes] = await Promise.all([
        authFetch(`/api/orders?client_email=${encodeURIComponent(email)}`),
        authFetch(`/api/tecnico/jobs?client_email=${encodeURIComponent(email)}&client_active=true`),
      ]);
      const ordersData = await ordersRes.json();
      const jobsData   = await jobsRes.json();

      setOrders(
        Array.isArray(ordersData)
          ? ordersData.filter((o: ActiveOrder) => ACTIVE_ORDER_STS.includes(o.status))
          : [],
      );
      setJobs(
        Array.isArray(jobsData)
          ? jobsData.filter((j: ActiveJob) => ACTIVE_JOB_STS.includes(j.status))
          : [],
      );
    } catch { /* keep previous data */ }
    setLoading(false);
  }, [email]);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 20_000);

    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);

    const ch = email
      ? supabase.channel(`mis-ofertas-${email}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',       filter: `client_email=eq.${email}` } as never, loadData)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_jobs', filter: `client_email=eq.${email}` } as never, loadData)
          .subscribe()
      : null;

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      if (ch) supabase.removeChannel(ch);
    };
  }, [loadData, email]);

  const total = orders.length + jobs.length;

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function WorkerAvatar({ photo, name }: { photo: string | null; name: string | null }) {
    return photo ? (
      <img src={photo} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
    ) : (
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--glass-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{name?.[0]?.toUpperCase() || '?'}</span>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
      <style>{PULSE_CSS}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(245,197,24,0.15)',
        padding: 'max(16px, env(safe-area-inset-top)) 16px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
          aria-label="Volver"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>Mis ofertas</h1>
          {!loading && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {total === 0 ? 'Sin solicitudes activas' : `${total} ${total === 1 ? 'solicitud activa' : 'solicitudes activas'}`}
            </p>
          )}
        </div>
        <button
          onClick={loadData}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 8 }}
          aria-label="Actualizar"
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '14px 14px 8px', overflowY: 'auto' }}>

        {/* Skeletons */}
        {loading && [0, 1, 2].map(i => (
          <div
            key={i}
            style={{ height: 110, borderRadius: 16, background: 'var(--glass-card)', marginBottom: 12, animation: 'mis-ofertas-pulse 1.5s ease-in-out infinite' }}
          />
        ))}

        {/* Empty state */}
        {!loading && total === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ marginBottom: 14, opacity: 0.25 }}>
              <Icon name="clipboard" size={52} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)' }}>Sin solicitudes activas</div>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Cuando un conductor o técnico acepte<br />tu solicitud aparecerá aquí
            </div>
            <Link
              href="/cliente"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 20, padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#F5C518,#F58A07)', color: '#1C1C2E', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none' }}
            >
              <Icon name="plus" size={16} />
              Nueva solicitud
            </Link>
          </div>
        )}

        {/* ── Driver orders ──────────────────────────────────────────── */}
        {orders.map(order => {
          const st = ORDER_STATUS_CONFIG[order.status] ?? { label: order.status, color: '#9ca3af' };
          const price = order.offer ?? order.suggested_price;
          const hasWorker = ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered'].includes(order.status);
          const typeLabel = ORDER_TYPE_LABELS[order.order_type || ''] ?? 'Envío';
          const vehicleLabel = VEHICLE_LABELS[order.vehicle_type || ''] ?? '';

          return (
            <Link
              key={order.id}
              href={`/cliente/seguimiento/${order.id}`}
              style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}
            >
              <div style={{
                background: 'var(--surface-2)',
                border: `1px solid ${st.color}30`,
                borderRadius: 16,
                padding: '14px 16px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                transition: 'transform 0.15s',
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="truck" size={18} color="#F5C518" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {typeLabel}{vehicleLabel ? ` · ${vehicleLabel}` : ''}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>{fmtDate(order.created_at)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: st.color, background: `${st.color}18`, borderRadius: 8, padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {st.label}
                  </span>
                </div>

                {/* Addresses */}
                <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  {order.pickup_address && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                      <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1, color: '#22c55e' }}><Icon name="map-pin" size={12} /></span>
                      <span style={{ lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{order.pickup_address}</span>
                    </div>
                  )}
                  {order.delivery_address && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1, color: '#3b82f6' }}><Icon name="map-pin" size={12} /></span>
                      <span style={{ lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{order.delivery_address}</span>
                    </div>
                  )}
                </div>

                {/* Bottom row: worker + price + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {hasWorker && order.driver_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <WorkerAvatar photo={order.driver_photo} name={order.driver_name} />
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{order.driver_name}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Esperando conductor…</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {price != null && (
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#F5C518' }}>
                        ₲{Number(price).toLocaleString('es-PY')}
                      </span>
                    )}
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {/* ── Tecnico jobs ───────────────────────────────────────────── */}
        {jobs.map(job => {
          const st = JOB_STATUS_CONFIG[job.status] ?? { label: job.status, color: '#9ca3af' };
          const serviceLabel = SERVICE_LABELS[job.service_type || ''] ?? job.service_type ?? 'Servicio';
          const hasWorker = ['accepted', 'in_progress'].includes(job.status);

          return (
            <Link
              key={job.id}
              href={`/cliente/seguimiento/${job.id}?type=service`}
              style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}
            >
              <div style={{
                background: 'var(--surface-2)',
                border: `1px solid ${st.color}30`,
                borderRadius: 16,
                padding: '14px 16px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="tool" size={18} color="#8b5cf6" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{serviceLabel}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>{job.created_at ? fmtDate(job.created_at) : '—'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: st.color, background: `${st.color}18`, borderRadius: 8, padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {st.label}
                  </span>
                </div>

                {/* Address */}
                {job.address && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 10, fontSize: '0.77rem', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1 }}><Icon name="map-pin" size={12} /></span>
                    <span style={{ lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{job.address}</span>
                  </div>
                )}

                {/* Bottom row: worker + price + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {hasWorker && job.tecnico_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <WorkerAvatar photo={job.tecnico_photo} name={job.tecnico_name} />
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{job.tecnico_name}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Esperando técnico…</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {job.agreed_price != null && (
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#F5C518' }}>
                        ₲{Number(job.agreed_price).toLocaleString('es-PY')}
                      </span>
                    )}
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Bottom Nav ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(245,197,24,0.15)',
        padding: '8px 8px max(8px, env(safe-area-inset-bottom))',
        display: 'flex', gap: 4, justifyContent: 'space-around',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
      }}>
        {/* Home */}
        <Link href="/cliente" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, color: 'var(--nav-icon-inactive)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Home</span>
        </Link>

        {/* Mis ofertas — ACTIVE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 12, background: 'rgba(245,197,24,0.12)', color: '#F5C518', position: 'relative' }}>
          <Icon name="clipboard" size={24} />
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Mis ofertas</span>
          {total > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 'calc(50% - 20px)', minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
              {total}
            </span>
          )}
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#F5C518' }} />
        </div>

        {/* Historial */}
        <Link href="/cliente/historial" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, color: 'var(--nav-icon-inactive)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Historial</span>
        </Link>

        {/* Cuenta */}
        <Link href="/cliente/settings" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', textDecoration: 'none', borderRadius: 12, color: 'var(--nav-icon-inactive)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>Cuenta</span>
        </Link>
      </div>
    </div>
  );
}
