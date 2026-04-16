'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useDriverContext } from './context';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import RequestsFeed, { type FeedItem } from './components/RequestsFeed';

// Mapbox GL must be loaded client-side only (no SSR)
const DriverMap = dynamic(() => import('./components/DriverMap'), { ssr: false });

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function DriverDashboard() {
  const { openDrawer, email, serviceFilters, toggleFilter, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm, profilePhoto, displayName, avgRating, totalRatings } = useDriverContext();

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

  const [docAlerts, setDocAlerts] = useState<{ expired: string[]; soon: string[]; notApproved: string[] }>({ expired: [], soon: [], notApproved: [] });
  const [docCounts, setDocCounts] = useState<{ approved: number; pending: number; rejected: number; missing: number }>({ approved: 0, pending: 0, rejected: 0, missing: 0 });
  const DRIVER_TOTAL_DOCS = 7; // cedula_frente, antecedentes, domicilio + 4 vehicle docs (registro_frente, registro_dorso, cedula_verde_frente, cedula_verde_dorso)

  // Stats state
  const [statsLoading, setStatsLoading] = useState(true);
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [earningsData, setEarningsData] = useState({ dia: 0, semana: 0, mes: 0, año: 0 });
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalShipments, setTotalShipments] = useState(0);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [showEarnings, setShowEarnings] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState<'dia' | 'semana' | 'mes' | 'año'>('dia');
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);
  const locateFnRef = useRef<(() => void) | null>(null);

  // Filter modal open state
  const [filterOpen, setFilterOpen] = useState(false);

  // Wallet balance — initial load + realtime subscription
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletBlocked, setWalletBlocked] = useState(false);
  useEffect(() => {
    if (!email) return;
    const refreshWallet = () => authFetch('/api/wallet')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setWalletBalance(Number(d.balance)); })
      .catch(() => {});
    refreshWallet();
    // Subscribe to wallet changes so balance updates without page reload
    const ch = supabase.channel(`driver-wallet-${email}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'driver_wallets',
        filter: `driver_email=eq.${email}`,
      } as never, () => refreshWallet())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [email]);

  // ── GPS position for distance calculation ──────────────────────────────
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Requests feed state ──────────────────────────────────────────────────
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [sendingOfferId, setSendingOfferId] = useState<string | null>(null);
  const [dismissedHome, setDismissedHome] = useState<Set<string>>(new Set());
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const isLoadingOrdersRef = useRef(false);  // A-2: prevent concurrent mutations

  const loadPendingOrders = useCallback(() => {
    if (isLoadingOrdersRef.current) return;  // skip if already in-flight
    isLoadingOrdersRef.current = true;
    authFetch('/api/orders')
      .then(async r => {
        if (r.status === 402) {
          // Saldo insuficiente — bloquear acceso al mercado
          const body = await r.json().catch(() => ({}));
          setWalletBlocked(true);
          setWalletBalance(Number(body.balance ?? 0));
          setPendingOrders([]);
          return null;
        }
        setWalletBlocked(false);
        return r.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data)) return;
        const incomingIds = new Set(data.map((o: any) => String(o.id)));
        const freshIds = new Set([...incomingIds].filter(id => !knownOrderIdsRef.current.has(id)));
        knownOrderIdsRef.current = incomingIds;  // safe: only one write at a time
        if (freshIds.size > 0) {
          // Highlight new cards
          setNewOrderIds(prev => new Set([...prev, ...freshIds]));
          // Auto-bump sheet if it was collapsed
          setSheetState(s => s === 'collapsed' ? 'half' : s);
          // Clear highlight after 9 s
          setTimeout(() => {
            setNewOrderIds(prev => {
              const next = new Set(prev);
              freshIds.forEach(id => next.delete(id));
              return next;
            });
          }, 9_000);
        }
        setPendingOrders(data);
      })
      .catch(() => {})
      .finally(() => { isLoadingOrdersRef.current = false; });
  }, []);

  useEffect(() => {
    loadPendingOrders();
    // Realtime for instant new-order notifications; 60s fallback poll
    const iv = setInterval(loadPendingOrders, 60_000);
    const ch = supabase.channel('driver-home-pending')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' } as never, loadPendingOrders)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' } as never, loadPendingOrders)
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [loadPendingOrders]);

  const sendDriverOffer = async (orderId: string, amount: number, note: string, distanceKm: number | null = null) => {
    if (!amount || !email || !!sendingOfferId) return;
    if (walletBlocked) {
      showToast('⚠️ Recargá tu billetera para enviar ofertas');
      return;
    }
    setSendingOfferId(orderId);
    try {
      const res = await authFetch('/api/orders/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, driver_email: email, amount, note, distance_km: distanceKm }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => ({}));
        setWalletBlocked(true);
        setWalletBalance(Number(body.balance ?? 0));
        setPendingOrders([]);
        showToast('⚠️ Saldo insuficiente — recargá tu billetera');
        setSendingOfferId(null);
        return;
      }
      setDismissedHome(prev => new Set([...prev, orderId]));
    } catch {
      showToast('❌ Error al enviar oferta. Intentá de nuevo.');
    }
    setSendingOfferId(null);
  };

  // Verificar vencimiento de documentos críticos
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
      authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}&history=true&_t=${Date.now()}`)
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
            año: sum(startOfYear),
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

  // Stats
  const stats = [
    { label: 'Tasa Aceptación', value: acceptanceRate !== null ? `${acceptanceRate}%` : '—', href: '/driver/aceptacion', icon: '🏆', onClick: undefined as (() => void) | undefined },
  ];

  const feedVisible = available && !walletBlocked && pendingOrders.filter(o => !dismissedHome.has(o.id)).length > 0;

  // Pre-filter orders by service type preferences before passing to feed
  const VEHICLE_FILTER_MAP: Record<string, string> = {
    moto: 'moto_envios',
    auto: 'auto_envios',
    motocarro: 'moto_carro_fletes',
    camion2t: 'camion_fletes',
  };
  const filteredFeedItems: FeedItem[] = pendingOrders
    .filter(o => {
      // ── Filtro 1: tipo de vehículo ──────────────────────────────────────
      const key = VEHICLE_FILTER_MAP[o.vehicle_type as string || ''];
      if (key && serviceFilters[key] === false) return false;

      // ── Filtro 2: rango de recogida y entrega ───────────────────────────
      // Solo filtrar si ya tenemos posición GPS. Si no hay GPS, mostrar todo
      // para no bloquear al conductor que no dio permisos de ubicación aún.
      if (driverPos) {
        const dLat = driverPos.lat;
        const dLng = driverPos.lng;

        // Rango de recogida: distancia del conductor al punto A
        if (o.pickup_lat != null && o.pickup_lng != null) {
          const distPickup = haversineKm(dLat, dLng, Number(o.pickup_lat), Number(o.pickup_lng));
          if (distPickup > pickupRangeKm) return false;
        }

        // Rango de entrega: distancia del conductor al punto B
        if (o.delivery_lat != null && o.delivery_lng != null) {
          const distDelivery = haversineKm(dLat, dLng, Number(o.delivery_lat), Number(o.delivery_lng));
          if (distDelivery > deliveryRangeKm) return false;
        }
      }

      return true;
    })
    .map((o): FeedItem => ({
      id: o.id,
      title: o.vehicle_type || 'moto',
      orderType: (o.order_type as 'envio' | 'mandadito' | 'flete') || 'envio',
      from: o.pickup_address,
      to: o.delivery_address,
      price: o.suggested_price,
      createdAt: o.created_at,
      pickupLat: o.pickup_lat,
      pickupLng: o.pickup_lng,
      clientPhoto: o.client_photo,
      clientName: o.client_name || o.client_email?.split('@')[0],
      clientRating: o.client_avg_rating,
      clientVerified: Boolean(o.client_is_verified),
      instructions: o.instructions,
      dateScheduled: o.date_scheduled ?? null,
      shoppingList: o.shopping_list ?? null,
      maxBudget: o.max_budget ?? null,
      stops: Array.isArray(o.order_stops) && o.order_stops.length > 0
        ? o.order_stops.map((s: any) => ({ sequence: s.sequence, address: s.address }))
        : null,
    }));

  return (
    <>
      {/* Mapbox Map */}
      <div className="tuki-map">
        <DriverMap onLocate={(fn) => { locateFnRef.current = fn; }} />
      </div>

      {/* Profile pill — top left */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {profilePhoto ? (
            <img src={profilePhoto} alt="" loading="lazy" decoding="async" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {displayName?.[0]?.toUpperCase() || '👤'}
            </div>
          )}
          {avgRating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(245,197,24,0.18)', borderRadius: 6, padding: '1px 6px' }}>
              <span style={{ color: '#F5C518', fontSize: '0.65rem' }}>★</span>
              <span style={{ color: '#F5C518', fontSize: '0.65rem', fontWeight: 800 }}>{avgRating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <div style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, lineHeight: 1.2 }}>{getGreeting()}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{displayName?.split(' ')[0] || 'Driver'}</div>
        </div>
      </div>

      {/* Floating menu button — top right */}
      <button className="tuki-float-btn menu" onClick={openDrawer} aria-label="Menú">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Wallet balance pill — centered top */}
      <Link href="/driver/billetera" className="tuki-wallet-pill" aria-label="Mi billetera"
        style={walletBlocked ? { background: 'rgba(239,68,68,0.18)', border: '1.5px solid rgba(239,68,68,0.5)', boxShadow: '0 0 0 3px rgba(239,68,68,0.12)' } : undefined}
      >
        <span className="tuki-wallet-pill-amount" style={walletBlocked ? { color: '#f87171' } : undefined}>
          {walletBalance !== null
            ? `${Number(walletBalance).toLocaleString('es-PY')} ₲`
            : <span style={{ display: 'inline-block', width: 72, height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.15)', animation: 'pulse 1.5s ease-in-out infinite' }} />}
        </span>
        <span className="tuki-wallet-pill-label" style={walletBlocked ? { color: 'rgba(248,113,113,0.9)' } : undefined}>
          {walletBlocked ? '⚠️ Recargar' : 'Billetera'}
        </span>
      </Link>

      {/* Floating locate button */}
      <button className="tuki-float-btn locate" onClick={() => locateFnRef.current?.()} aria-label="Mi ubicación">
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
            <p className="driver-filter-subtitle">Elegí qué tipo de solicitudes querés recibir</p>
            <div className="driver-filter-list">
              {[
                { key: 'moto_envios', label: 'Moto Envíos', icon: '🏍️', desc: 'Paquetes pequeños en moto' },
                { key: 'auto_envios', label: 'Auto Envíos', icon: '🚗', desc: 'Paquetes medianos en auto' },
                { key: 'moto_carro_fletes', label: 'Moto Carro Fletes', icon: '🛵', desc: 'Fletes en moto o carro' },
                { key: 'camion_fletes', label: 'Camión Fletes', icon: '🚛', desc: 'Fletes grandes en camión' },
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
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tuki-text-main)' }}>📍 Rango de recogida</label>
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
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tuki-text-main)' }}>🚛 Rango de entrega</label>
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
              <span style={{ color: '#facc15', fontWeight: 800, fontSize: '1rem' }}>💰 Ganancias</span>
              <button onClick={() => setShowEarnings(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0 }} aria-label="Cerrar">✕</button>
            </div>
            {/* Period tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '0.75rem 1rem 0' }}>
              {(['dia', 'semana', 'mes', 'año'] as const).map(p => (
                <button key={p} onClick={() => setEarningsPeriod(p)}
                  style={{
                    flex: 1, padding: '0.5rem 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem',
                    background: earningsPeriod === p ? '#facc15' : 'rgba(255,255,255,0.06)',
                    color: earningsPeriod === p ? '#111' : '#9ca3af',
                    transition: 'all 0.2s',
                  }}>
                  {p === 'dia' ? 'Hoy' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Año'}
                </button>
              ))}
            </div>
            {/* Amount */}
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#c8ff00', lineHeight: 1 }}>
                {earningsData[earningsPeriod].toLocaleString('es-PY')}
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: 6 }}>Guaraníes</div>
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

      {/* ── Solicitudes overlay (floating over map) ── */}
      <RequestsFeed
        mode="driver"
        available={available}
        items={filteredFeedItems}
        dismissed={dismissedHome}
        onAccept={sendDriverOffer}
        onDismiss={(id) => setDismissedHome(prev => new Set([...prev, id]))}
        sendingId={sendingOfferId}
        driverLat={driverPos?.lat}
        driverLng={driverPos?.lng}
      />

      {/* Bottom Sheet */}
      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`} style={feedVisible ? { display: 'none' } : undefined}>
        <div
          className="tuki-sheet-handle"
          role="button"
          aria-label="Expandir panel"
          onClick={() => setSheet(sheetState === 'collapsed' ? 'half' : sheetState === 'half' ? 'full' : 'collapsed')}
        >
          <span className="tuki-sheet-bar" />
        </div>
        {/* Collapsed hint — visible when dragged down */}
        {sheetState === 'collapsed' && (
          <div
            className="tuki-sheet-hint"
            role="button"
            onClick={() => setSheet('half')}
          >
            {walletBlocked ? (
              <span className="tuki-sheet-hint-text" style={{ color: '#f87171', fontWeight: 700 }}>
                ⚠️ Recargá tu billetera para recibir pedidos
              </span>
            ) : available ? (
              <>
                <span className="tuki-sheet-hint-dot" />
                <span className="tuki-sheet-hint-text">
                  {pendingOrders.filter(o => !dismissedHome.has(o.id)).length > 0
                    ? `${pendingOrders.filter(o => !dismissedHome.has(o.id)).length} solicitudes cerca de ti`
                    : 'Buscando solicitudes…'}
                </span>
                {pendingOrders.filter(o => !dismissedHome.has(o.id)).length > 0 && (
                  <span className="tuki-sheet-hint-badge">
                    {pendingOrders.filter(o => !dismissedHome.has(o.id)).length}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 600 }}>
                💤 Actívate para recibir solicitudes
              </span>
            )}
          </div>
        )}
        <div className="tuki-sheet-content">
          {/* Availability Toggle */}
          <div className="tuki-availability">
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--tuki-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado</p>
              <span className={`tuki-status-badge ${available && !walletBlocked ? 'tuki-status-online' : 'tuki-status-offline'}`} style={{ fontSize: '1rem', padding: '0.35rem 1rem' }}>
                {available && !walletBlocked ? '💰 Hacer money' : '💸 Money off'}
              </span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available && !walletBlocked} onChange={() => {
                if (walletBlocked) { showToast('⚠️ Recargá tu billetera para activarte'); return; }
                if (!available && (docAlerts.expired.length > 0 || docAlerts.notApproved.length > 0 || docCounts.missing > 0)) return;
                if (!available) {
                  // Going online → save state
                  setAvailable(true);
                  try { localStorage.setItem('driver_available', 'true'); } catch {}
                  showToast('💰 ¡Online! Buscando pedidos…');
                } else {
                  // Going offline → stay on dashboard
                  setAvailable(false);
                  try { localStorage.setItem('driver_available', 'false'); } catch {}
                  showToast('💸 Offline — descansando');
                }
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* ⚠️ Billetera bloqueada — banner de alta prioridad */}
          {walletBlocked && (
            <Link href="/driver/billetera" style={{ display: 'block', textDecoration: 'none', marginBottom: '0.75rem' }}>
              <div style={{
                padding: '1rem', borderRadius: 16,
                background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
                border: '2px solid #fca5a5',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 4px 16px rgba(239,68,68,0.15)',
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" fill="none" stroke="#ef4444" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="9" width="20" height="12" rx="2"/>
                    <path d="M16 9V7a4 4 0 00-8 0v2"/>
                    <circle cx="12" cy="15" r="1.5" fill="#ef4444" stroke="none"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: '#991b1b' }}>Billetera bloqueada</p>
                  <p style={{ margin: '3px 0 0', fontSize: '0.73rem', color: '#b91c1c', lineHeight: 1.4 }}>
                    Necesitás saldo para recibir solicitudes.
                    Saldo actual: <strong>{Number(walletBalance ?? 0).toLocaleString('es-PY')} ₲</strong>
                  </p>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 700, flexShrink: 0, background: '#ef4444', padding: '6px 12px', borderRadius: 10 }}>
                  Recargar ›
                </span>
              </div>
            </Link>
          )}

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
                    {docAlerts.expired.length > 0 ? '🚫' : docCounts.rejected > 0 ? '❌' : '📎'}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: '#1f2937' }}>Mis documentos</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#4b5563' }}>
                      {docAlerts.expired.length > 0
                        ? 'Documentos vencidos — no podés conectarte'
                        : `${docCounts.approved}/${DRIVER_TOTAL_DOCS} aprobados${docCounts.pending > 0 ? ` · ${docCounts.pending} pendiente${docCounts.pending > 1 ? 's' : ''}` : ''}${docCounts.rejected > 0 ? ` · ${docCounts.rejected} rechazado${docCounts.rejected > 1 ? 's' : ''}` : ''}${docCounts.missing > 0 ? ` · ${docCounts.missing} sin subir` : ''}${docAlerts.soon.length > 0 ? ' · próximos a vencer' : ''}`
                      }
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: '1rem', color: '#6b7280', flexShrink: 0 }}>›</span>
              </div>
            </Link>
          )}

          {/* Alertas de documentos */}
          {docAlerts.expired.length > 0 && (
            <div style={{ margin: '0 0 0.75rem', padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1.5px solid #fca5a5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🚫</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#991b1b' }}>Documentos vencidos — no podés ponerte En Línea</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#b91c1c' }}>Actualizá tus documentos en Perfil → Configuración</p>
              </div>
            </div>
          )}
          {docAlerts.notApproved.length > 0 && docAlerts.expired.length === 0 && (
            <div style={{ margin: '0 0 0.75rem', padding: '10px 12px', borderRadius: 12, background: '#fef2f2', border: '1.5px solid #fca5a5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📋</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#991b1b' }}>No podés ponerte En Línea aún</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#b91c1c' }}>Tenés {docAlerts.notApproved.length} documento{docAlerts.notApproved.length !== 1 ? 's' : ''} pendiente{docAlerts.notApproved.length !== 1 ? 's' : ''} de aprobación. Revisá Configuración.</p>
              </div>
            </div>
          )}
          {docAlerts.expired.length === 0 && docAlerts.notApproved.length === 0 && docAlerts.soon.length > 0 && (
            <div style={{ margin: '0 0 0.75rem', padding: '10px 12px', borderRadius: 12, background: '#fffbeb', border: '1.5px solid #fcd34d', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#92400e' }}>Documentos próximos a vencer</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#b45309' }}>Actualizá antes de que venzan para seguir operando</p>
              </div>
            </div>
          )}

          {/* Active service types chip strip */}
          {Object.values(serviceFilters).some(v => v) && (
            <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.20)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#C8960A' }}>
                  📦 Serv. activos · 📍{pickupRangeKm} km recogida · 🚚{deliveryRangeKm} km entrega
                </span>
                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#C8960A', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Editar →
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {([
                  { key: 'moto_envios',       label: 'Moto Envíos',      icon: '🏍️' },
                  { key: 'auto_envios',       label: 'Auto Envíos',      icon: '🚗' },
                  { key: 'moto_carro_fletes', label: 'Moto Carro Fletes',icon: '🛵' },
                  { key: 'camion_fletes',     label: 'Camión Fletes',    icon: '🚛' },
                ] as { key: string; label: string; icon: string }[]).filter(s => serviceFilters[s.key]).map(s => (
                  <span key={s.key} style={{ fontSize: '0.75rem', background: 'rgba(245,197,24,0.10)', color: '#C8960A', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>
                    {s.icon} {s.label}
                  </span>
                ))}
                {!Object.values(serviceFilters).some(v => v) && (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Ningún servicio activo — abrí el filtro para activar.</span>
                )}
              </div>
            </div>
          )}

          {/* ── Requests Feed moved to overlay outside the sheet ── */}

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
            {/* Ganancias Hoy — full width, first so always visible */}
            <div className="tuki-stat-card" style={{ gridColumn: 'span 2' }}
              onClick={() => setShowEarnings(true)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setShowEarnings(true)}>
              <span className="tuki-stat-icon">💰</span>
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
              <span className="tuki-stat-icon">✅</span>
              <div className="tuki-stat-value">{deliveredCount}</div>
              <div className="tuki-stat-label">Entregados Hoy</div>
            </Link>
            <Link href="/driver/failed" className="tuki-stat-card">
              <span className="tuki-stat-icon">❌</span>
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
