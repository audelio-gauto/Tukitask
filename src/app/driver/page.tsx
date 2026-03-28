'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from './context';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { authFetch } from '@/lib/authFetch';

// Mapbox GL must be loaded client-side only (no SSR)
const DriverMap = dynamic(() => import('./components/DriverMap'), { ssr: false });

// Web Audio API: play delivery alert sound (like plugin)
let _driverAC: AudioContext | null = null;
function getDriverAC() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!_driverAC || _driverAC.state === 'closed') _driverAC = new AudioCtx();
  if (_driverAC.state === 'suspended') _driverAC.resume();
  return _driverAC;
}
if (typeof window !== 'undefined') {
  const _unlock = () => { getDriverAC(); window.removeEventListener('touchstart', _unlock); window.removeEventListener('click', _unlock); };
  window.addEventListener('touchstart', _unlock, { once: true });
  window.addEventListener('click', _unlock, { once: true });
}
function playDeliveryAlert() {
  try {
    const ctx = getDriverAC();
    if (!ctx) return;

    function beep(startTime: number, frequency: number, duration: number) {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.type = 'square';
      osc.frequency.value = frequency;
      gain.gain.value = 1.0;
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    // 6 rounds of 3-beep ascending sequence
    for (let r = 0; r < 6; r++) {
      const t = ctx.currentTime + r * 0.6;
      beep(t, 880, 0.12);
      beep(t + 0.15, 1100, 0.12);
      beep(t + 0.3, 1320, 0.15);
    }
  } catch {
    // Silently fail
  }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function DriverDashboard() {
  const { openDrawer, email, serviceFilters, toggleFilter, pickupRangeKm, setPickupRangeKm, deliveryRangeKm, setDeliveryRangeKm, profilePhoto, displayName, avgRating, totalRatings } = useDriverContext();
  const router = useRouter();
  // Persist online/offline across page navigations
  const [available, setAvailable] = useState(() => {
    try { return localStorage.getItem('driver_available') === 'true'; } catch { return false; }
  });

  // Stats state
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [earningsData, setEarningsData] = useState({ dia: 0, semana: 0, mes: 0, año: 0 });
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalShipments, setTotalShipments] = useState(0);
  const [showEarnings, setShowEarnings] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState<'dia' | 'semana' | 'mes' | 'año'>('dia');
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

  // New request popup
  const [showPopup, setShowPopup] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [newestOrder, setNewestOrder] = useState<any>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const prevCountRef = useRef(0);
  // IDs of orders dismissed with "Ahora no" — persisted to localStorage across page loads
  const dismissedRef = useRef<Set<string>>((() => {
    try {
      const saved = typeof window !== 'undefined' && localStorage.getItem('driver_dismissed_orders');
      return new Set<string>(saved ? JSON.parse(saved) : []);
    } catch { return new Set<string>(); }
  })());

  // Track driver position for distance calc
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

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
          if (!Array.isArray(data)) return;

          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const startOfYear = new Date(now.getFullYear(), 0, 1);

          const isToday = (o: any) => new Date(o.created_at) >= startOfDay;

          const DELIVERED_STATUSES = ['delivered', 'commission_charged', 'client_confirmed'];
          const delivered = data.filter(o => DELIVERED_STATUSES.includes(o.status));
          const failed = data.filter(o => ['failed', 'cancelled', 'return_rejected'].includes(o.status));
          // Cards: only today
          const deliveredToday = delivered.filter(isToday);
          const failedToday    = failed.filter(isToday);
          const totalToday     = data.filter(isToday);

          // For earnings: include delivered + commission_charged + client_confirmed + returned
          const earnable = data.filter(o => [...DELIVERED_STATUSES, 'returned'].includes(o.status));
          setDeliveredCount(deliveredToday.length);
          setFailedCount(failedToday.length);
          setTotalShipments(totalToday.length);
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
        })
        .catch(() => {});
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

  useEffect(() => {
    const check = () => {
      if (!available) return;
      fetch(`/api/orders?_t=${Date.now()}`, { cache: 'no-store' })
        .then(r => r.json())
        .then((data: any[]) => {
          if (!Array.isArray(data)) return;
          const visible = data.filter((o: any) => !dismissedRef.current.has(o.id));
          const count = visible.length;
          if (count > prevCountRef.current) {
            setPendingCount(count);
            setNewestOrder(visible[0] ?? null);
            setShowPopup(true);
            playDeliveryAlert();
          }
          prevCountRef.current = count;
        })
        .catch(() => {});
    };
    check();
    const iv = setInterval(check, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [available]);

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

  // Stats (placeholder — would come from Supabase)
  const stats = [
    { label: 'Envíos Hoy', value: totalShipments, href: '/driver/deliveries', icon: '📦', onClick: undefined as (() => void) | undefined },
    { label: 'Tasa de Aceptación', value: acceptanceRate !== null ? `${acceptanceRate}%` : '—%', href: '#', icon: '📊', onClick: undefined as (() => void) | undefined },
  ];

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
            <img src={profilePhoto} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {displayName?.[0]?.toUpperCase() || '👤'}
            </div>
          )}
          {avgRating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(37,99,235,0.18)', borderRadius: 6, padding: '1px 6px' }}>
              <span style={{ color: '#2563EB', fontSize: '0.65rem' }}>★</span>
              <span style={{ color: '#2563EB', fontSize: '0.65rem', fontWeight: 800 }}>{avgRating.toFixed(1)}</span>
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
      <Link href="/driver/billetera" className="tuki-wallet-pill" aria-label="Mi billetera">
        <span className="tuki-wallet-pill-amount">
          {walletBalance !== null
            ? `${Number(walletBalance).toLocaleString('es-PY')} ₲`
            : '₲ ...'}
        </span>
        <span className="tuki-wallet-pill-label">Billetera</span>
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

            <button className="driver-filter-done" onClick={() => setFilterOpen(false)}>
              Aplicar filtros
            </button>
          </div>
        </>
      )}

      {/* New Request Popup */}
      {showPopup && (() => {
        const o = newestOrder;
        // Haversine distance in km
        function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }
        const kmPickup = (driverPos && o?.pickup_lat)
          ? haversine(driverPos.lat, driverPos.lng, o.pickup_lat, o.pickup_lng).toFixed(1)
          : null;
        const kmDelivery = (o?.pickup_lat && o?.delivery_lat)
          ? haversine(o.pickup_lat, o.pickup_lng, o.delivery_lat, o.delivery_lng).toFixed(1)
          : null;
        const clientName = o?.client_name || o?.client_email?.split('@')[0] || 'Cliente';
        const clientPhoto = o?.client_photo || null;
        const clientPrice = o ? Number(o.offer || o.suggested_price || 0) : 0;
        return (
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999, background: '#1a1a2e',
            borderRadius: 22, width: 'min(360px, 92vw)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            border: '2px solid #c8ff00',
            overflow: 'hidden',
            animation: 'popupIn 0.3s cubic-bezier(0.32,0.72,0,1)',
          }}>
            <style>{`@keyframes popupIn{from{opacity:0;transform:translate(-50%,-58%)}to{opacity:1;transform:translate(-50%,-50%)}}`}</style>

            {/* Header */}
            <div style={{ background: 'rgba(200,255,0,0.08)', borderBottom: '1px solid rgba(200,255,0,0.15)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#c8ff00', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 0.3 }}>📦 Nueva solicitud</span>
              {pendingCount > 1 && (
                <span style={{ background: '#c8ff00', color: '#111', borderRadius: 99, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 800 }}>
                  +{pendingCount - 1} más
                </span>
              )}
              <button onClick={() => setShowPopup(false)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: 0 }}
                aria-label="Cerrar">✕</button>
            </div>

            {/* Client info */}
            <div style={{ padding: '1rem 1rem 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              {clientPhoto ? (
                <img src={clientPhoto} alt="" style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: '2px solid #333', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#2d2d2d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>👤</div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{clientName}</div>
                <div style={{ color: '#facc15', fontSize: '0.8rem', marginTop: 2 }}>⭐ 5.0</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#c8ff00', lineHeight: 1 }}>{clientPrice.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Gs</div>
              </div>
            </div>

            {/* Distances */}
            <div style={{ padding: '0.85rem 1rem 0', display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, background: 'rgba(16,185,129,0.12)', borderRadius: 12, padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#6ee7b7', fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0 }}>A</span>
                  Recogida
                </div>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem' }}>{kmPickup ? `${kmPickup} km` : '— km'}</div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 1, lineHeight: 1.3 }}>{o?.pickup_address?.split(',')[0] || '—'}</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#fca5a5', fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0 }}>B</span>
                  Entrega
                </div>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem' }}>{kmDelivery ? `${kmDelivery} km` : '— km'}</div>
                <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 1, lineHeight: 1.3 }}>{o?.delivery_address?.split(',')[0] || '—'}</div>
              </div>
            </div>

            {/* CTA */}
            <div style={{ padding: '0.85rem 1rem 1.1rem', display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowPopup(false); router.push('/driver/deliveries'); }}
                style={{ flex: 1, padding: '0.85rem', border: 'none', borderRadius: 14, cursor: 'pointer', background: '#c8ff00', color: '#111', fontWeight: 800, fontSize: '1rem' }}>
                Ver solicitud
              </button>
              <button
                onClick={() => {
                  if (newestOrder?.id) {
                    dismissedRef.current.add(newestOrder.id);
                    try { localStorage.setItem('driver_dismissed_orders', JSON.stringify([...dismissedRef.current])); } catch {}
                  }
                  setShowPopup(false);
                }}
                style={{ padding: '0.85rem 1rem', border: '1px solid #333', borderRadius: 14, cursor: 'pointer', background: 'transparent', color: '#9ca3af', fontWeight: 600, fontSize: '0.9rem' }}>
                Ahora no
              </button>
            </div>
          </div>
        );
      })()}

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

      {/* Bottom Sheet */}
      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`}>
        <div className="tuki-sheet-handle">
          <span className="tuki-sheet-bar" />
        </div>
        <div className="tuki-sheet-content">
          {/* Availability Toggle */}
          <div className="tuki-availability">
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--tuki-text-main)' }}>Estado</h3>
              <span className={`tuki-status-badge ${available ? 'tuki-status-online' : 'tuki-status-offline'}`}>
                {available ? '● EN LÍNEA' : '● DESCONECTADO'}
              </span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available} onChange={() => {
                const next = !available;
                setAvailable(next);
                try { localStorage.setItem('driver_available', String(next)); } catch {}
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Stats Grid */}
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

        </div>
      </div>
    </>
  );
}
