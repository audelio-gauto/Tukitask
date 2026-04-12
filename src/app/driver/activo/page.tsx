'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDriverContext } from '../context';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import DriverScreenLayout from '../components/DriverScreenLayout';

const ACTIVE_STATUSES = ['accepted', 'picking_up', 'in_transit'] as const;
type ActiveStatus = typeof ACTIVE_STATUSES[number];

const STATUS_LABEL: Record<ActiveStatus, { label: string; color: string; bg: string; icon: string }> = {
  accepted:   { label: 'Aceptado',      color: '#F5C518', bg: 'rgba(245,197,24,0.15)',   icon: '✅' },
  picking_up: { label: 'Recogiendo',    color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',   icon: '📦' },
  in_transit: { label: 'En camino',     color: '#4ade80', bg: 'rgba(74,222,128,0.15)',   icon: '🚗' },
};

const NEXT_ACTION: Record<ActiveStatus, { label: string; nextStatus: string } | null> = {
  accepted:   { label: 'Iniciar recogida',  nextStatus: 'picking_up' },
  picking_up: { label: 'Iniciar entrega',   nextStatus: 'in_transit' },
  in_transit: { label: 'Marcar entregado',  nextStatus: 'delivered'  },
};

function genTrackingCode(id: string) {
  return 'TK' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function openMaps(navApp: string, address: string) {
  const q = encodeURIComponent(address);
  if (navApp === 'waze') {
    window.open(`https://waze.com/ul?q=${q}&navigate=yes`, '_blank');
  } else {
    window.open(`https://maps.google.com/?q=${q}`, '_blank');
  }
}

export default function ActivoPage() {
  const { email, navApp } = useDriverContext();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  };

  const fetchActive = useCallback(() => {
    if (!email) return;
    authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const active = data.filter(o => (ACTIVE_STATUSES as readonly string[]).includes(o.status));
          setOrders(active);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  useEffect(() => {
    fetchActive();
    const iv = setInterval(fetchActive, 8_000);
    const ch = email
      ? supabase.channel(`driver-activo-${email}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `accepted_by=eq.${email}`,
          } as never, () => fetchActive())
          .subscribe()
      : null;
    return () => {
      clearInterval(iv);
      if (ch) supabase.removeChannel(ch);
    };
  }, [fetchActive, email]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    const key = orderId + newStatus;
    setActing(key);
    try {
      const res = await authFetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: newStatus, driver_email: email }),
      });
      if (res.ok) {
        if (newStatus === 'delivered') {
          // Remove from active list — it's done
          setOrders(prev => prev.filter(o => o.id !== orderId));
          showToast('✅ ¡Entrega marcada como completada!');
        } else {
          // Update status in-place
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('❌ ' + (err?.error || 'Error al actualizar estado'));
      }
    } catch {
      showToast('❌ Error de conexión. Intentá de nuevo.');
    }
    setActing(null);
  };

  const renderCard = (order: any) => {
    const status = order.status as ActiveStatus;
    const statusInfo = STATUS_LABEL[status];
    const action = NEXT_ACTION[status];
    const clientName = order.client_name || order.client_email?.split('@')[0] || 'Cliente';
    const clientPhoto = order.client_photo || null;
    const price = Number(order.offer ?? order.accepted_price ?? order.suggested_price ?? 0).toLocaleString('es-PY');
    const track = genTrackingCode(order.id);
    const actionKey = order.id + (action?.nextStatus ?? '');
    const isActing = acting === actionKey;
    const phone = order.client_phone || order.sender_phone || null;

    return (
      <div key={order.id} style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1.5px solid ${statusInfo.color}40`,
        borderRadius: 18,
        marginBottom: 16,
        overflow: 'hidden',
      }}>
        {/* Status header */}
        <div style={{
          background: statusInfo.bg,
          borderBottom: `1px solid ${statusInfo.color}30`,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ color: statusInfo.color, fontWeight: 700, fontSize: '0.9rem' }}>
            {statusInfo.icon} {statusInfo.label}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>#{track}</span>
        </div>

        <div style={{ padding: '14px 16px' }}>
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: clientPhoto
                ? `url(${clientPhoto}) center/cover`
                : 'linear-gradient(135deg, #F5C518, #F58A07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1C1C2E', fontWeight: 700, fontSize: '1.2rem',
              border: '2px solid rgba(255,255,255,0.12)',
            }}>
              {!clientPhoto && clientName[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{clientName}</div>
              {phone && (
                <a href={`tel:${phone}`} style={{ color: '#60a5fa', fontSize: '0.8rem', textDecoration: 'none' }}>
                  📞 {phone}
                </a>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '1.15rem' }}>₲{price}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>acordado</div>
            </div>
          </div>

          {/* Addresses */}
          {(order.pickup_address || order.delivery_address) && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  paddingTop: 4, gap: 3, flexShrink: 0,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5C518', display: 'block' }} />
                  <span style={{ width: 2, height: 22, background: 'rgba(255,255,255,0.15)', display: 'block' }} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80', display: 'block' }} />
                </div>
                <div style={{ flex: 1 }}>
                  {order.pickup_address && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F5C518', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Recogida</div>
                      <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.35 }}>{order.pickup_address}</div>
                    </div>
                  )}
                  {order.delivery_address && (
                    <div>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Entrega</div>
                      <div style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.35 }}>{order.delivery_address}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Map buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {order.pickup_address && (
                  <button
                    onClick={() => openMaps(navApp, order.pickup_address)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: 10, border: '1px solid rgba(245,197,24,0.3)',
                      background: 'rgba(245,197,24,0.1)', color: '#F5C518',
                      fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                    }}
                  >
                    🗺️ Ir a Recogida
                  </button>
                )}
                {order.delivery_address && (
                  <button
                    onClick={() => openMaps(navApp, order.delivery_address)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: 10, border: '1px solid rgba(74,222,128,0.3)',
                      background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                      fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                    }}
                  >
                    🗺️ Ir a Entrega
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Package description */}
          {order.package_description && (
            <div style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '9px 13px',
              marginBottom: 14, fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Paquete: </span>
              {order.package_description}
            </div>
          )}

          {/* Note */}
          {order.note && (
            <div style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '9px 13px',
              marginBottom: 14, fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Nota: </span>
              {order.note}
            </div>
          )}

          {/* Action button */}
          {action && (
            <button
              disabled={!!acting}
              onClick={() => updateStatus(order.id, action.nextStatus)}
              style={{
                width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: acting ? 'not-allowed' : 'pointer',
                background: acting
                  ? 'rgba(255,255,255,0.08)'
                  : action.nextStatus === 'delivered'
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #F5C518, #f59e0b)',
                color: acting ? 'rgba(255,255,255,0.4)' : action.nextStatus === 'delivered' ? '#fff' : '#1C1C2E',
                fontWeight: 700, fontSize: '0.95rem',
                transition: 'opacity 0.2s',
                opacity: acting ? 0.7 : 1,
              }}
            >
              {isActing ? 'Actualizando...' : action.label}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <DriverScreenLayout title="Envío Activo">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: '10px 20px', color: '#fff',
          fontSize: '0.88rem', fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      <div style={{ padding: '16px 16px 100px' }}>
        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
            <svg style={{ width: 36, height: 36, marginBottom: 10, display: 'inline-block', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="#F5C518" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p style={{ margin: 0 }}>Cargando...</p>
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div style={{
            textAlign: 'center', paddingTop: 60,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)',
              border: '2px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem',
            }}>
              📭
            </div>
            <p style={{ color: '#9ca3af', fontWeight: 600, margin: 0, fontSize: '1rem' }}>
              Sin envíos activos
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: 0, maxWidth: 240 }}>
              Cuando un cliente acepte tu oferta, el envío aparecerá aquí.
            </p>
          </div>
        )}

        {!loading && orders.map(renderCard)}
      </div>
    </DriverScreenLayout>
  );
}
