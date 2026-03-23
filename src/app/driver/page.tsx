'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from './context';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Mapbox GL must be loaded client-side only (no SSR)
const DriverMap = dynamic(() => import('./components/DriverMap'), { ssr: false });

// Web Audio API: play delivery alert sound (like plugin)
function playDeliveryAlert() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    function beep(startTime: number, frequency: number, duration: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
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

export default function DriverDashboard() {
  const { openDrawer, serviceFilters, toggleFilter } = useDriverContext();
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);
  const locateFnRef = useRef<(() => void) | null>(null);

  // Filter modal open state
  const [filterOpen, setFilterOpen] = useState(false);

  // New request popup
  const [showPopup, setShowPopup] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [newestOrder, setNewestOrder] = useState<any>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const prevCountRef = useRef(0);

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

  useEffect(() => {
    const check = () => {
      fetch('/api/orders')
        .then(r => r.json())
        .then((data: any[]) => {
          if (!Array.isArray(data)) return;
          const count = data.length;
          if (count > prevCountRef.current) {
            setPendingCount(count);
            setNewestOrder(data[0] ?? null);
            setShowPopup(true);
            playDeliveryAlert();
          }
          prevCountRef.current = count;
        })
        .catch(() => {});
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

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
    { label: 'Envíos', value: 0, href: '/driver/deliveries', icon: '📦' },
    { label: 'Pedidos', value: 0, href: '/driver/assigned', icon: '📋' },
    { label: 'En Ruta', value: 0, href: '/driver/en-ruta', icon: '🚚' },
    { label: 'Entregados', value: 0, href: '/driver/delivered', icon: '✅' },
    { label: 'Fallidos', value: 0, href: '/driver/failed', icon: '❌' },
  ];

  return (
    <>
      {/* Mapbox Map */}
      <div className="tuki-map">
        <DriverMap onLocate={(fn) => { locateFnRef.current = fn; }} />
      </div>

      {/* Floating menu button */}
      <button className="tuki-float-btn menu" onClick={openDrawer} aria-label="Menú">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

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
                onClick={() => setShowPopup(false)}
                style={{ padding: '0.85rem 1rem', border: '1px solid #333', borderRadius: 14, cursor: 'pointer', background: 'transparent', color: '#9ca3af', fontWeight: 600, fontSize: '0.9rem' }}>
                Ahora no
              </button>
            </div>
          </div>
        );
      })()}

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
              <input type="checkbox" checked={available} onChange={() => setAvailable(!available)} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Stats Grid */}
          <div className="tuki-stats-grid">
            {stats.map((s) => (
              <Link key={s.label} href={s.href} className="tuki-stat-card">
                <span className="tuki-stat-icon">{s.icon}</span>
                <div className="tuki-stat-value">{s.value}</div>
                <div className="tuki-stat-label">{s.label}</div>
              </Link>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tuki-text-main)', marginBottom: '0.75rem' }}>Acciones Rápidas</h2>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
              <button className="tuki-btn tuki-btn-primary" onClick={playDeliveryAlert}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Escanear QR
              </button>
              <Link href="/driver/assigned" className="tuki-btn tuki-btn-success">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Ver Pedidos
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
