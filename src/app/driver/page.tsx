'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from './context';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';

// Mapbox GL must be loaded client-side only (no SSR)
const DriverMap = dynamic(() => import('./components/DriverMap'), { ssr: false });

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen d├¡a';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function DriverDashboard() {
  const { openDrawer, email, serviceFilters, toggleFilter, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm, profilePhoto, displayName, avgRating, totalRatings } = useDriverContext();
  const router = useRouter();

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTmRef.current) clearTimeout(toastTmRef.current);
    setToast(msg);
    toastTmRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // Persist online/offline across page navigations
  const [available, setAvailable] = useState(() => {
    try { return localStorage.getItem('driver_available') === 'true'; } catch { return false; }
  });
  // Auto-countdown: when online on dashboard, 20s to disconnect or auto-redirect to orders
  const [onlineCountdown, setOnlineCountdown] = useState(20);
  const onlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopOnlineCountdown = useCallback(() => {
    if (onlineTimerRef.current) { clearInterval(onlineTimerRef.current); onlineTimerRef.current = null; }
    setOnlineCountdown(20);
  }, []);

  useEffect(() => {
    if (!available) { stopOnlineCountdown(); return; }
    // Start 20s countdown when online on dashboard
    setOnlineCountdown(20);
    onlineTimerRef.current = setInterval(() => {
      setOnlineCountdown(prev => {
        if (prev <= 1) {
          stopOnlineCountdown();
          router.push('/driver/deliveries');
          return 20;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { stopOnlineCountdown(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);
  const [docAlerts, setDocAlerts] = useState<{ expired: string[]; soon: string[]; notApproved: string[] }>({ expired: [], soon: [], notApproved: [] });
  const [docCounts, setDocCounts] = useState<{ approved: number; pending: number; rejected: number; missing: number }>({ approved: 0, pending: 0, rejected: 0, missing: 0 });
  const DRIVER_TOTAL_DOCS = 7; // cedula_frente, antecedentes, domicilio + 4 vehicle docs (registro_frente, registro_dorso, cedula_verde_frente, cedula_verde_dorso)

  // Stats state
  const [statsLoading, setStatsLoading] = useState(true);
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [earningsData, setEarningsData] = useState({ dia: 0, semana: 0, mes: 0, anio: 0 });
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalShipments, setTotalShipments] = useState(0);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [showEarnings, setShowEarnings] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState<'dia' | 'semana' | 'mes' | 'anio'>('dia');
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);
  const locateFnRef = useRef<(() => void) | null>(null);

  // Filter modal open state
  const [filterOpen, setFilterOpen] = useState(false);

  // Wallet balance
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!email) return;
    authFetch('/api/wallet')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setWalletBalance(Number(d.balance)); })
      .catch(() => {});
  }, [email]);

  // Solicitudes pendientes en panel principal
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [offerAmounts, setOfferAmounts] = useState<Record<string, string>>({});
  const [sendingOfferId, setSendingOfferId] = useState<string | null>(null);
  const [dismissedOrders, setDismissedOrders] = useState<Set<string>>(new Set());

  const loadPendingOrders = useCallback(() => {
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPendingOrders(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPendingOrders();
    const iv = setInterval(loadPendingOrders, 8_000);
    const ch = supabase.channel('driver-home-pending')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' } as never, loadPendingOrders)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' } as never, loadPendingOrders)
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [loadPendingOrders]);

  const sendDriverOffer = async (orderId: string) => {
    const amount = Number(offerAmounts[orderId]);
    if (!amount || !email || !!sendingOfferId) return;
    setSendingOfferId(orderId);
    try {
      await authFetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, driver_email: email, amount, note: '' }),
      });
      setDismissedOrders(prev => new Set([...prev, orderId]));
    } catch {}
    setSendingOfferId(null);
  };

  // Verificar vencimiento de documentos cr├¡ticos
  useEffect(() => {
    if (!email) return;
    authFetch(`/api/upload-driver-doc?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(j => {
        const criticalKeys = new Set(['cedula_frente', 'antecedentes',
          'moto_registro_frente', 'auto_registro_frente', 'moto_carro_registro_frente', 'camion_registro_frente']);
        const now = Date.now();
        const tenDays = 10 * 24 * 60 * 60 * 1000;
        const expired: string[] = [];
        const soon: string[] = [];
        const notApproved: string[] = [];
        let cApproved = 0, cPending = 0, cRejected = 0;
        const docs = j.docs || [];
        for (const d of docs) {
          if (d.status === 'approved') cApproved++;
          else if (d.status === 'pending') cPending++;
          else if (d.status === 'rejected') cRejected++;
          if (d.status !== 'approved') notApproved.push(d.doc_type);
          if (!criticalKeys.has(d.doc_type) || !d.expires_at) continue;
          const ms = new Date(d.expires_at).getTime() - now;
          if (ms <= 0) expired.push(d.doc_type);
          else if (ms <= tenDays) soon.push(d.doc_type);
        }
        setDocCounts({ approved: cApproved, pending: cPending, rejected: cRejected, missing: Math.max(0, DRIVER_TOTAL_DOCS - docs.length) });
        setDocAlerts({ expired, soon, notApproved });
        // Si hay docs vencidos, no aprobados o faltantes, forzar offline
        const missing = Math.max(0, DRIVER_TOTAL_DOCS - docs.length);
        if (expired.length > 0 || notApproved.length > 0 || missing > 0) {
          setAvailable(false);
          try { localStorage.setItem('driver_available', 'false'); } catch {}
        }
      })
      .catch(() => {});
  }, [email]);

  // Fetch driver stats (delivered/failed counts + earnings)
  // Refreshes every 30 s AND immediately when the tab becomes visible again
  // (browsers throttle/suspend setInterval when tab is in background)
  useEffect(() => {
    if (!email) return;
    const fetchStats = () => {
      // cache-busting param so browsers never serve a stale cached response
      fetch(`/api/orders?driver_email=${encodeURIComponent(email)}&history=true&_t=${Date.now()}`, {
        cache: 'no-store',
      })
        .then(r => r.json())
        .then((data: any[]) => {
          if (!Array.isArray(data)) { setStatsLoading(false); return; }

          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const startOfYear = new Date(now.getFullYear(), 0, 1);

          const isToday = (o: any) => new Date(o.created_at) >= startOfDay;

          const DELIVERED_STATUSES = ['delivered', 'commission_charged', 'client_confirmed'];
          const CANCELLED_STATUSES = ['failed', 'cancelled', 'returned', 'return_rejected'];
          const delivered = data.filter(o => DELIVERED_STATUSES.includes(o.status));
          const failed = data.filter(o => CANCELLED_STATUSES.includes(o.status));
          // Cards: only today
          const deliveredToday = delivered.filter(isToday);
          const failedToday    = failed.filter(isToday);
          const totalToday     = data.filter(isToday);

          // For earnings: include delivered + commission_charged + client_confirmed + returned
          const earnable = data.filter(o => [...DELIVERED_STATUSES, 'returned'].includes(o.status));
          const ACTIVE_DRIVER_STATUSES = ['accepted', 'picking_up', 'in_transit', 'returning', 'driver_returning', 'return_delivered'];
          const activeOrders = data.filter(o => ACTIVE_DRIVER_STATUSES.includes(o.status));
          setDeliveredCount(deliveredToday.length);
          setFailedCount(failedToday.length);
          setTotalShipments(totalToday.length);
          setActiveOrderCount(activeOrders.length);
          const total = delivered.length + failed.length;
          setAcceptanceRate(total > 0 ? Math.round((delivered.length / total) * 100) : null);

          // Use whichever price field is available on the order
          const orderPrice = (o: any) =>
            Number(o.offer ?? o.offer_price ?? o.accepted_price ?? o.suggested_price ?? 0);
          const sum = (from: Date) =>
            earnable
              .filter(o => new Date(o.created_at) >= from)
              .reduce((acc, o) => acc + orderPrice(o), 0);
          setEarningsData({
            dia: sum(startOfDay),
            semana: sum(startOfWeek),
            mes: sum(startOfMonth),
            anio: sum(startOfYear),
          });
          setStatsLoading(false);
        })
        .catch(() => { setStatsLoading(false); });
    };

    fetchStats();

    // Regular interval (works while tab is focused)
    const iv = setInterval(fetchStats, 30_000);

    // Refresh immediately whenever the user returns to this tab/app
    // This covers: switching tabs, app backgrounded on mobile, screen lock/unlock
    const onVisible = () => { if (document.visibilityState === 'visible') fetchStats(); };
    document.addEventListener('visibilitychange', onVisible);

    // Also refresh on window focus (desktop browsers)
    window.addEventListener('focus', fetchStats);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchStats);
    };
  }, [email]);

  // Touch drag state
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startTranslate = useRef(0);

  // Check if tablet+ (side panel mode)
  const isDesktop = useCallback(() => window.matchMedia('(min-width: 768px)').matches, []);

  // Get current translateY from computed style
  const getTranslateY = useCallback(() => {
    if (!sheetRef.current) return 0;
    const st = window.getComputedStyle(sheetRef.current);
    const matrix = new DOMMatrix(st.transform);
    return matrix.m42;
  }, []);

  // Set sheet state via CSS class
  const setSheet = useCallback((state: 'collapsed' | 'half' | 'full') => {
    if (isDesktop()) return;
    setSheetState(state);
  }, [isDesktop]);

  // Touch/mouse handlers for bottom sheet drag
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    function onStart(e: TouchEvent | MouseEvent) {
      if (isDesktop()) return;
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase();
      if (['button', 'input', 'textarea', 'select', 'a'].includes(tag)) return;

      isDragging.current = true;
      startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
      startTranslate.current = getTranslateY();
      sheet!.style.transition = 'none';
    }

    function onMove(e: TouchEvent | MouseEvent) {
      if (!isDragging.current) return;
      const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = currentY - startY.current;
      const newTranslate = Math.max(0, startTranslate.current + delta);
      sheet!.style.transform = `translateY(${newTranslate}px)`;
    }

    function onEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      sheet!.style.transition = '';

      const finalTranslate = getTranslateY();
      const viewH = window.innerHeight;

      if (finalTranslate > viewH * 0.6) {
        setSheet('collapsed');
      } else if (finalTranslate > viewH * 0.3) {
        setSheet('half');
      } else {
        setSheet('full');
      }
    }

    sheet.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    sheet.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    const handleResize = () => {
      if (isDesktop()) {
        sheet.classList.remove('collapsed', 'half', 'full');
        sheet.style.transform = '';
      } else {
        setSheet('half');
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      sheet.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('mousedown', onStart);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      window.removeEventListener('resize', handleResize);
    };
  }, [getTranslateY, isDesktop, setSheet]);

  // Stats (placeholder ÔÇö would come from Supabase)
  const stats = [
    { label: 'Pedidos', value: activeOrderCount, href: '/driver/deliveries', icon: '­ƒôª', onClick: undefined as (() => void) | undefined },
    { label: 'Tasa Aceptaci├│n', value: acceptanceRate !== null ? `${acceptanceRate}%` : 'ÔÇö', href: '/driver/aceptacion', icon: '­ƒÅå', onClick: undefined as (() => void) | undefined },
  ];

  return (
    <>
      {/* Mapbox Map */}
      <div className="tuki-map">
        <DriverMap onLocate={(fn) => { locateFnRef.current = fn; }} />
      </div>

      {/* Profile pill ÔÇö top left */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {profilePhoto ? (
            <img src={profilePhoto} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {displayName?.[0]?.toUpperCase() || '­ƒæñ'}
            </div>
          )}
          {avgRating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(37,99,235,0.18)', borderRadius: 6, padding: '1px 6px' }}>
              <span style={{ color: '#2563EB', fontSize: '0.65rem' }}>Ôÿà</span>
              <span style={{ color: '#2563EB', fontSize: '0.65rem', fontWeight: 800 }}>{avgRating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <div style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, lineHeight: 1.2 }}>{getGreeting()}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{displayName?.split(' ')[0] || 'Driver'}</div>
        </div>
      </div>

      {/* Floating menu button ÔÇö top right */}
      <button className="tuki-float-btn menu" onClick={openDrawer} aria-label="Men├║">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Wallet balance pill ÔÇö centered top */}
      <Link href="/driver/billetera" className="tuki-wallet-pill" aria-label="Mi billetera">
        <span className="tuki-wallet-pill-amount">
          {walletBalance !== null
            ? `${Number(walletBalance).toLocaleString('es-PY')} Ôé▓`
            : 'Ôé▓ ...'}
        </span>
        <span className="tuki-wallet-pill-label">Billetera</span>
      </Link>

      {/* Floating locate button */}
      <button className="tuki-float-btn locate" onClick={() => locateFnRef.current?.()} aria-label="Mi ubicaci├│n">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Floating filter button */}
      <button
        className={`tuki-float-btn filter${Object.values(serviceFilters).some(v => !v) ? ' has-filter' : ''}`}
        onClick={() => setFilterOpen(true)}
        aria-label="Filtrar servicios"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      </button>

      {/* Service Filter Modal */}
      {filterOpen && (
        <>
          <div className="driver-filter-overlay" onClick={() => setFilterOpen(false)} />
          <div className="driver-filter-modal">
            <div className="driver-filter-header">
              <h3>Filtrar solicitudes</h3>
              <button className="driver-filter-close" onClick={() => setFilterOpen(false)} aria-label="Cerrar">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="driver-filter-subtitle">Eleg├¡ qu├® tipo de solicitudes quer├®s recibir</p>
            <div className="driver-filter-list">
              {[
                { key: 'moto_envios', label: 'Moto Env├¡os', icon: '­ƒÅì´©Å', desc: 'Paquetes peque├▒os en moto' },
                { key: 'auto_envios', label: 'Auto Env├¡os', icon: '­ƒÜù', desc: 'Paquetes medianos en auto' },
                { key: 'moto_carro_fletes', label: 'Moto Carro Fletes', icon: '­ƒøÁ', desc: 'Fletes en moto o carro' },
                { key: 'camion_fletes', label: 'Cami├│n Fletes', icon: '­ƒÜø', desc: 'Fletes grandes en cami├│n' },
              ].map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={`driver-filter-item${serviceFilters[item.key] ? ' active' : ''}`}
                  onClick={() => toggleFilter(item.key)}
                >
                  <span className="driver-filter-item-icon">{item.icon}</span>
                  <div className="driver-filter-item-info">
                    <span className="driver-filter-item-label">{item.label}</span>
                    <span className="driver-filter-item-desc">{item.desc}</span>
                  </div>
                  <span className={`driver-filter-toggle${serviceFilters[item.key] ? ' on' : ''}`}>
                    <span className="driver-filter-toggle-knob" />
                  </span>
                </button>
              ))}
            </div>

            {/* Rango de km */}
            <div style={{ padding: '0 4px', marginTop: 4 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tuki-text-main)' }}>­ƒôì Rango de recogida</label>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>{pickupRangeKm} km</span>
                </div>
                <input type="range" min={1} max={50} step={1} value={pickupRangeKm}
                  onChange={e => setPickupRangeKm(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#10b981' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>
                  <span>1 km</span><span>50 km</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tuki-text-main)' }}>­ƒÜø Rango de entrega</label>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#3b82f6' }}>{deliveryRangeKm} km</span>
                </div>
                <input type="range" min={1} max={100} step={1} value={deliveryRangeKm}
                  onChange={e => setDeliveryRangeKm(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#3b82f6' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>
                  <span>1 km</span><span>100 km</span>
                </div>
              </div>
            </div>

            <button className="driver-filter-done" onClick={() => {
              setFilterOpen(false);
              // Persist to DB so settings survive refresh
              authFetch('/api/driver-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email,
                  pickup_range: pickupRangeKm,
                  delivery_range: deliveryRangeKm,
                  service_filters: serviceFilters,
                }),
              }).catch(() => {});
            }}>
              Aplicar filtros
            </button>
          </div>
        </>
      )}

      {/* Online countdown ÔÇö InDrive-style bottom progress bar */}
      {available && (
        <div style={{
          position: 'fixed', bottom: 'var(--tuki-nav-h, 64px)', left: 0, right: 0,
          zIndex: 9990,
          background: '#111827',
          borderTop: '1px solid rgba(200,255,0,0.15)',
        }}>
          {/* Draining progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{
              height: '100%',
              width: `${(onlineCountdown / 20) * 100}%`,
              background: 'linear-gradient(90deg,#c8ff00,#a8e000)',
              transition: 'width 1s linear',
              borderRadius: '0 2px 2px 0',
            }} />
          </div>
          {/* Content row */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 1.1rem 1rem',
            gap: 12,
          }}>
            <div>
              <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>
                Redirigiendo a PedidosÔÇª
              </p>
              <p style={{ margin: '3px 0 0', color: '#6b7280', fontSize: '0.75rem' }}>
                Desconect├í el toggle para cancelar
              </p>
            </div>
            <div style={{
              minWidth: 48, height: 48, borderRadius: '50%',
              border: '3px solid #c8ff00',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontWeight: 900, fontSize: '1.2rem', color: '#c8ff00', lineHeight: 1 }}>
                {onlineCountdown}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="tuki-toast">{toast}</div>}

      {/* Earnings Breakdown Modal */}
      {showEarnings && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowEarnings(false)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999, background: '#1a1a2e',
            borderRadius: 22, width: 'min(380px, 94vw)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            border: '2px solid #facc15',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ background: 'rgba(250,204,21,0.1)', borderBottom: '1px solid rgba(250,204,21,0.2)', padding: '0.85rem 1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#facc15', fontWeight: 800, fontSize: '1rem' }}>­ƒÆ░ Ganancias</span>
              <button onClick={() => setShowEarnings(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0 }} aria-label="Cerrar">Ô£ò</button>
            </div>
            {/* Period tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '0.75rem 1rem 0' }}>
              {(['dia', 'semana', 'mes', 'anio'] as const).map(p => (
                <button key={p} onClick={() => setEarningsPeriod(p)}
                  style={{
                    flex: 1, padding: '0.5rem 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
                    background: earningsPeriod === p ? '#facc15' : 'rgba(255,255,255,0.06)',
                    color: earningsPeriod === p ? '#111' : '#9ca3af',
                    transition: 'all 0.2s',
                  }}>
                  {p === 'dia' ? 'Hoy' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'anio'}
                </button>
              ))}
            </div>
            {/* Amount */}
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#c8ff00', lineHeight: 1 }}>
                {earningsData[earningsPeriod].toLocaleString('es-PY')}
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: 6 }}>Guaran├¡es</div>
            </div>
            {/* Summary row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '0 1rem 1rem' }}>
              <div style={{ flex: 1, background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: '0.75rem', textAlign: 'center', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.1rem' }}>{deliveredCount}</div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Entregados</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: '0.75rem', textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '1.1rem' }}>{failedCount}</div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Fallidos</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bottom Sheet */}
      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`}>
        <div className="tuki-sheet-handle">
          <span className="tuki-sheet-bar" />
        </div>
        <div className="tuki-sheet-content">
          {/* Availability Toggle */}
          <div className="tuki-availability">
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--tuki-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado</p>
              <span className={`tuki-status-badge ${available ? 'tuki-status-online' : 'tuki-status-offline'}`} style={{ fontSize: '1rem', padding: '0.35rem 1rem' }}>
                {available ? '­ƒÆ░ Hacer money' : '­ƒÆ© Money off'}
              </span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available} onChange={() => {
                if (!available && (docAlerts.expired.length > 0 || docAlerts.notApproved.length > 0 || docCounts.missing > 0)) return;
                if (!available) {
                  // Going online ÔåÆ save state and redirect to deliveries immediately
                  setAvailable(true);
                  try { localStorage.setItem('driver_available', 'true'); } catch {}
                  showToast('­ƒÆ░ ┬íOnline! Buscando pedidosÔÇª');
                  router.push('/driver/deliveries');
                } else {
                  // Going offline ÔåÆ stop countdown and stay on dashboard
                  stopOnlineCountdown();
                  setAvailable(false);
                  try { localStorage.setItem('driver_available', 'false'); } catch {}
                  showToast('­ƒÆ© Offline ÔÇö descansando');
                }
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Tarjeta de estado de documentos */}
          {(docCounts.approved < DRIVER_TOTAL_DOCS || docAlerts.expired.length > 0 || docAlerts.soon.length > 0 || docAlerts.notApproved.length > 0) && (
            <Link href="/driver/settings" style={{ display: 'block', textDecoration: 'none', marginBottom: '0.75rem' }}>
              <div style={{
                padding: '0.85rem 1rem', borderRadius: 14,
                background: (docAlerts.expired.length > 0 || docCounts.rejected > 0)
                  ? 'linear-gradient(135deg,#fee2e2,#fecaca)'
                  : 'linear-gradient(135deg,#fefce8,#fef3c7)',
                border: `1.5px solid ${(docAlerts.expired.length > 0 || docCounts.rejected > 0) ? '#fca5a5' : '#fcd34d'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.5rem' }}>
                    {docAlerts.expired.length > 0 ? '­ƒÜ½' : docCounts.rejected > 0 ? 'ÔØî' : '­ƒôÄ'}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: '#1f2937' }}>Mis documentos</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#4b5563' }}>
                      {docAlerts.expired.length > 0
                        ? 'Documentos vencidos ÔÇö no pod├®s conectarte'
                        : `${docCounts.approved}/${DRIVER_TOTAL_DOCS} aprobados${docCounts.pending > 0 ? ` ┬À ${docCounts.pending} pendiente${docCounts.pending > 1 ? 's' : ''}` : ''}${docCounts.rejected > 0 ? ` ┬À ${docCounts.rejected} rechazado${docCounts.rejected > 1 ? 's' : ''}` : ''}${docCounts.missing > 0 ? ` ┬À ${docCounts.missing} sin subir` : ''}${docAlerts.soon.length > 0 ? ' ┬À pr├│ximos a vencer' : ''}`
                      }
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: '1rem', color: '#6b7280', flexShrink: 0 }}>ÔÇ║</span>
              </div>
            </Link>
          )}

          {/* Alertas de documentos */}
          {docAlerts.expired.length > 0 && (
            <div style={{ margin: '0 0 0.75rem', padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1.5px solid #fca5a5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>­ƒÜ½</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#991b1b' }}>Documentos vencidos ÔÇö no pod├®s ponerte En L├¡nea</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#b91c1c' }}>Actualiz├í tus documentos en Perfil ÔåÆ Configuraci├│n</p>
              </div>
            </div>
          )}
          {docAlerts.notApproved.length > 0 && docAlerts.expired.length === 0 && (
            <div style={{ margin: '0 0 0.75rem', padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1.5px solid #fca5a5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>­ƒôï</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#991b1b' }}>No pod├®s ponerte En L├¡nea a├║n</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#b91c1c' }}>Ten├®s {docAlerts.notApproved.length} documento{docAlerts.notApproved.length !== 1 ? 's' : ''} pendiente{docAlerts.notApproved.length !== 1 ? 's' : ''} de aprobaci├│n. Revis├í Configuraci├│n.</p>
              </div>
            </div>
          )}
          {docAlerts.expired.length === 0 && docAlerts.notApproved.length === 0 && docAlerts.soon.length > 0 && (
            <div style={{ margin: '0 0 0.75rem', padding: '10px 12px', borderRadius: 12, background: '#fffbeb', border: '1.5px solid #fcd34d', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>ÔÜá´©Å</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#92400e' }}>Documentos pr├│ximos a vencer</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#b45309' }}>Actualiz├í antes de que venzan para seguir operando</p>
              </div>
            </div>
          )}

          {/* Active service types chip strip */}
          {Object.values(serviceFilters).some(v => v) && (
            <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.20)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#C8960A' }}>
                  ­ƒôª Serv. activos ┬À ­ƒôì{pickupRangeKm} km recogida ┬À ­ƒÜÜ{deliveryRangeKm} km entrega
                </span>
                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#C8960A', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Editar ÔåÆ
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {([
                  { key: 'moto_envios',       label: 'Moto Env├¡os',      icon: '­ƒÅì´©Å' },
                  { key: 'auto_envios',       label: 'Auto Env├¡os',      icon: '­ƒÜù' },
                  { key: 'moto_carro_fletes', label: 'Moto Carro Fletes',icon: '­ƒøÁ' },
                  { key: 'camion_fletes',     label: 'Cami├│n Fletes',    icon: '­ƒÜø' },
                ] as { key: string; label: string; icon: string }[]).filter(s => serviceFilters[s.key]).map(s => (
                  <span key={s.key} style={{ fontSize: '0.75rem', background: 'rgba(245,197,24,0.10)', color: '#C8960A', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>
                    {s.icon} {s.label}
                  </span>
                ))}
                {!Object.values(serviceFilters).some(v => v) && (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Ning├║n servicio activo ÔÇö abr├¡ el filtro para activar.</span>
                )}
              </div>
            </div>
          )}

          {/* Solicitudes pendientes */}
          {pendingOrders.filter(o => !dismissedOrders.has(o.id)).length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                  📦 Solicitudes 
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 800 }}>
                    {pendingOrders.filter(o => !dismissedOrders.has(o.id)).length}
                  </span>
                </span>
                <Link href="/driver/deliveries" style={{ color: '#F5C518', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>Ver todo →</Link>
              </div>
              {pendingOrders.filter(o => !dismissedOrders.has(o.id)).map(order => (
                <div key={order.id} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: 14, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.83rem', flex: 1, marginRight: 8 }}>{order.pickup_address?.slice(0, 28) || 'Recogida'}</span>
                    <span style={{ color: '#F5C518', fontWeight: 800, fontSize: '0.83rem', flexShrink: 0 }}>₲{Number(order.suggested_price||0).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>→ {order.delivery_address?.slice(0, 28) || '—'}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number"
                      placeholder="Tu oferta Gs"
                      value={offerAmounts[order.id] || ''}
                      onChange={e => setOfferAmounts(prev => ({ ...prev, [order.id]: e.target.value }))}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: '0.83rem', padding: '7px 10px', outline: 'none', minWidth: 0 }}
                    />
                    <button
                      onClick={() => sendDriverOffer(order.id)}
                      disabled={!offerAmounts[order.id] || !!sendingOfferId}
                      style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#F5C518', color: '#1C1C2E', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0, opacity: !offerAmounts[order.id] ? 0.5 : 1 }}
                    >{sendingOfferId === order.id ? '...' : 'Ofrecer'}</button>
                    <button
                      onClick={() => setDismissedOrders(prev => new Set([...prev, order.id]))}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', background: 'none', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats Grid */}
          {statsLoading ? (
            <div className="tuki-stats-grid">
              {[0,1,2,3].map(i => (
                <div key={i} className="tuki-stat-card" style={i === 0 ? { gridColumn: 'span 2' } : {}}>
                  <div className="tuki-skeleton" style={{ width: 28, height: 28, borderRadius: '50%', marginBottom: 8 }} />
                  <div className="tuki-skeleton" style={{ width: '60%', height: 24, marginBottom: 6 }} />
                  <div className="tuki-skeleton" style={{ width: '80%', height: 14 }} />
                </div>
              ))}
            </div>
          ) : (
          <div className="tuki-stats-grid">
            {/* Ganancias Hoy ÔÇö full width, first so always visible */}
            <div className="tuki-stat-card" style={{ gridColumn: 'span 2' }}
              onClick={() => setShowEarnings(true)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setShowEarnings(true)}>
              <span className="tuki-stat-icon">­ƒÆ░</span>
              <div className="tuki-stat-value">
                {earningsData.dia.toLocaleString('es-PY')} <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--tuki-text-secondary)' }}>Gs</span>
              </div>
              <div className="tuki-stat-label">Ganancias Hoy</div>
            </div>
            {stats.map((s) => (
              s.onClick ? (
                <div key={s.label} className="tuki-stat-card" onClick={s.onClick} role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && s.onClick?.()}>
                  <span className="tuki-stat-icon">{s.icon}</span>
                  <div className="tuki-stat-value">{s.value}</div>
                  <div className="tuki-stat-label">{s.label}</div>
                </div>
              ) : (
                <Link key={s.label} href={s.href} className="tuki-stat-card">
                  <span className="tuki-stat-icon">{s.icon}</span>
                  <div className="tuki-stat-value">{s.value}</div>
                  <div className="tuki-stat-label">{s.label}</div>
                </Link>
              )
            ))}
            {/* Entregados + Fallidos side by side */}
            <Link href="/driver/delivered" className="tuki-stat-card">
              <span className="tuki-stat-icon">Ô£à</span>
              <div className="tuki-stat-value">{deliveredCount}</div>
              <div className="tuki-stat-label">Entregados Hoy</div>
            </Link>
            <Link href="/driver/failed" className="tuki-stat-card">
              <span className="tuki-stat-icon">ÔØî</span>
              <div className="tuki-stat-value">{failedCount}</div>
              <div className="tuki-stat-label">Fallidos Hoy</div>
            </Link>
          </div>
          )}

        </div>
      </div>
    </>
  );
}

