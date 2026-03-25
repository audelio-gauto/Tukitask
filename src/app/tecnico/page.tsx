'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../driver/context';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// ── Haversine distance ──────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

let _tecnicoAC: AudioContext | null = null;
function getTecnicoAC() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!_tecnicoAC || _tecnicoAC.state === 'closed') _tecnicoAC = new AudioCtx();
  if (_tecnicoAC.state === 'suspended') _tecnicoAC.resume();
  return _tecnicoAC;
}
if (typeof window !== 'undefined') {
  const _u = () => { getTecnicoAC(); window.removeEventListener('touchstart', _u); window.removeEventListener('click', _u); };
  window.addEventListener('touchstart', _u, { once: true });
  window.addEventListener('click', _u, { once: true });
}
function playNewJobAlert() {
  try {
    const ctx = getTecnicoAC();
    if (!ctx) return;
    const beep = (t: number, f: number, d: number) => {
      const o = ctx!.createOscillator(); const g = ctx!.createGain();
      o.connect(g); g.connect(ctx!.destination);
      o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.8;
      o.start(t); o.stop(t + d);
    };
    for (let r = 0; r < 4; r++) {
      const t = ctx.currentTime + r * 0.5;
      beep(t, 660, 0.1); beep(t + 0.13, 880, 0.1); beep(t + 0.26, 1100, 0.14);
    }
  } catch { /* silent fail */ }
}

const DriverMap = dynamic(() => import('../driver/components/DriverMap'), { ssr: false });

// ── Service catalogue (must mirror servicio/page.tsx) ─────────────────────────
const SERVICES_MUJER = [
  { key: 'limpieza',         label: 'Limpieza',          icon: '🧹' },
  { key: 'niera',            label: 'Niñera',            icon: '👶' },
  { key: 'cocina',           label: 'Cocina',            icon: '🍳' },
  { key: 'eventos',          label: 'Eventos',           icon: '🎉' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'otros',            label: 'Otros',             icon: '✨' },
];
const SERVICES_HOMBRE = [
  { key: 'aire_split',       label: 'Tec Aire Split',    icon: '❄️' },
  { key: 'electrico',        label: 'Serv. Eléctrico',   icon: '⚡' },
  { key: 'plomeria',         label: 'Serv. Plomería',    icon: '🔧' },
  { key: 'cerrajeria',       label: 'Serv. Cerrajería',  icon: '🔑' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'otros',            label: 'Otros',             icon: '✨' },
];

function getCatalogueForGender(gender: string) {
  if (gender === 'mujer')  return SERVICES_MUJER;
  if (gender === 'hombre') return SERVICES_HOMBRE;
  // No gender set: show all unique services
  const seen = new Set<string>();
  return [...SERVICES_MUJER, ...SERVICES_HOMBRE].filter(s => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });
}

function buildDefaultFilters(catalogue: { key: string }[]) {
  const f: Record<string, boolean> = {};
  catalogue.forEach(s => { f[s.key] = true; });
  return f;
}

export default function TecnicoDashboard() {
  const router = useRouter();
  const { openDrawer, email } = useDriverContext();

  // ── Availability – persisted ───────────────────────────────────────────────
  const [available, setAvailable] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Gender loaded from profile ─────────────────────────────────────────────
  const [gender, setGender] = useState<'hombre' | 'mujer' | ''>('');

  // ── Dashboard stats ───────────────────────────────────────────────────────
  const [statsData, setStatsData] = useState({
    ofertasActivas:   0,
    citasConfirmadas: 0,
    tasaAceptacion:   null as number | null,
    gananciasHoy:     0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen]     = useState(false);
  const [serviceFilters, setServiceFilters] = useState<Record<string, boolean>>({});
  const [rangoKm, setRangoKm]           = useState(20);

  // ── New-job popup ──────────────────────────────────────────────────────────
  interface PendingJob { id: string; service_type: string; client_name: string | null; client_photo?: string | null; client_rating?: number | null; client_initial_price?: number | null; description?: string | null; address?: string | null; lat?: number | null; lng?: number | null; }
  const [pendingPopup, setPendingPopup] = useState<PendingJob | null>(null);
  const [popupOfferPrice, setPopupOfferPrice] = useState(0);
  const [popupShowInput, setPopupShowInput]   = useState(false);
  const [popupSending, setPopupSending]       = useState(false);
  const [popupCountdown, setPopupCountdown]   = useState(60);
  const seenJobsRef     = useRef<Set<string>>(new Set());
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const tecnicoPosRef   = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const wid = navigator.geolocation.watchPosition(
      pos => { tecnicoPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  // Touch drag state
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startTranslate = useRef(0);

  const isDesktop = useCallback(() => window.matchMedia('(min-width: 768px)').matches, []);

  const getTranslateY = useCallback(() => {
    if (!sheetRef.current) return 0;
    const st = window.getComputedStyle(sheetRef.current);
    const matrix = new DOMMatrix(st.transform);
    return matrix.m42;
  }, []);

  const setSheet = useCallback((state: 'collapsed' | 'half' | 'full') => {
    if (isDesktop()) return;
    setSheetState(state);
  }, [isDesktop]);

  // Attach drag handlers to the sheet
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

  // Bootstrap from localStorage + API on mount
  useEffect(() => {
    if (!isDesktop()) setSheetState('half');

    try {
      const savedAvail   = localStorage.getItem('tecnico_available');
      const savedRango   = localStorage.getItem('tecnico_rango_km');
      const savedFilters = localStorage.getItem('tecnico_service_filters');
      if (savedAvail !== null)    setAvailable(savedAvail === 'true');
      if (savedRango)             setRangoKm(Number(savedRango));
      if (savedFilters)           setServiceFilters(JSON.parse(savedFilters));
    } catch {}

    if (!email) return;
    fetch(`/api/tecnico/settings?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(json => {
        const g = (json?.settings?.gender || '') as 'hombre' | 'mujer' | '';
        setGender(g);
        // If no filters saved yet, build defaults from profile gender
        try {
          if (!localStorage.getItem('tecnico_service_filters')) {
            setServiceFilters(buildDefaultFilters(getCatalogueForGender(g)));
          }
        } catch {}
        // Merge server-saved filters (overwrite local if they exist on server)
        if (json?.settings?.accepted_services) {
          setServiceFilters(prev => ({ ...prev, ...json.settings.accepted_services }));
        }
        if (json?.settings?.pickup_range) setRangoKm(Number(json.settings.pickup_range));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // When gender resolves, ensure filter keys exist for the new catalogue
  useEffect(() => {
    if (!gender) return;
    const catalogue = getCatalogueForGender(gender);
    setServiceFilters(prev => {
      const defaults = buildDefaultFilters(catalogue);
      Object.keys(defaults).forEach(k => { if (prev[k] !== undefined) defaults[k] = prev[k]; });
      return defaults;
    });
  }, [gender]);

  const toggleFilter = (key: string) => {
    setServiceFilters(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('tecnico_service_filters', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const applyFilters = () => {
    try {
      localStorage.setItem('tecnico_service_filters', JSON.stringify(serviceFilters));
      localStorage.setItem('tecnico_rango_km', String(rangoKm));
    } catch {}
    if (email) {
      fetch('/api/tecnico/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accepted_services: serviceFilters, pickup_range: rangoKm }),
      }).catch(() => {});
    }
    setFilterOpen(false);
  };

  // Load dashboard stats from API (re-fetch every 30 s when available)
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const load = () => {
      fetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&stats=true`)
        .then(r => r.json())
        .then(json => {
          if (cancelled) return;
          if (json?.stats) setStatsData(json.stats);
          setStatsLoading(false);
        })
        .catch(() => { if (!cancelled) setStatsLoading(false); });
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [email]);

  // ── Poll for new pending jobs when available ─────────────────────────────
  const dismissPopup = useCallback(() => {
    setPendingPopup(null);
    setPopupShowInput(false);
    setPopupOfferPrice(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  useEffect(() => {
    if (!available || !email) return;
    const check = async () => {
      try {
        const res  = await fetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&offers=true`);
        const jobs = await res.json();
        if (!Array.isArray(jobs)) return;
        // Only show jobs not yet seen and where no offer was sent
        const fresh = jobs.filter((j: any) => !seenJobsRef.current.has(j.id) && !j.my_offer);
        if (fresh.length === 0) return;
        const newest = fresh[0];
        seenJobsRef.current.add(newest.id);
        setPendingPopup(newest);
        setPopupOfferPrice(Number(newest.client_initial_price ?? 0));
        setPopupShowInput(false);
        setPopupCountdown(60);
        playNewJobAlert();
        // Countdown timer
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setPopupCountdown(prev => {
            if (prev <= 1) { dismissPopup(); return 60; }
            return prev - 1;
          });
        }, 1000);
      } catch { /* ignore */ }
    };
    check();
    const iv = setInterval(check, 15_000);
    return () => { clearInterval(iv); if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [available, email, dismissPopup]);

  const sendPopupOffer = async () => {
    if (!pendingPopup || !email || popupSending) return;
    setPopupSending(true);
    try {
      await fetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_offer',
          jobId: pendingPopup.id,
          tecnicoEmail: email,
          proposedPrice: popupOfferPrice,
        }),
      });
    } catch { /* ignore */ }
    setPopupSending(false);
    dismissPopup();
  };

  const catalogue      = getCatalogueForGender(gender);
  const hasActiveFilter = Object.values(serviceFilters).some(v => !v);
  const enabledCount   = catalogue.filter(s => serviceFilters[s.key]).length;

  const fmtGs = (n: number) =>
    n === 0 ? '0 Gs.' : `${n.toLocaleString('es-PY')} Gs.`;

  const stats = [
    {
      label: 'Ofertas Activas',
      value: statsLoading ? '…' : statsData.ofertasActivas,
      href: '/tecnico/ofertas',
      icon: '🎁',
    },
    {
      label: 'Citas Confirmadas',
      value: statsLoading ? '…' : statsData.citasConfirmadas,
      href: '/tecnico/citas',
      icon: '📅',
    },
    {
      label: 'Tasa Aceptación',
      value: statsLoading ? '…' : (statsData.tasaAceptacion !== null ? `${statsData.tasaAceptacion}%` : '—'),
      href: '/tecnico/aceptacion',
      icon: '🏆',
    },
    {
      label: 'Ganancias Hoy',
      value: statsLoading ? '…' : fmtGs(statsData.gananciasHoy),
      href: '/tecnico/ganancias',
      icon: '💰',
    },
  ];

  return (
    <>
      <div className="tuki-map">
        <DriverMap onLocate={() => {}} />
      </div>

      {/* ── Menú ── */}
      <button className="tuki-float-btn menu" aria-label="Menú" onClick={openDrawer}>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* ── Filtro button ── */}
      <button
        className={`tuki-float-btn filter${hasActiveFilter ? ' has-filter' : ''}`}
        aria-label="Filtrar servicios"
        onClick={() => setFilterOpen(true)}
        style={{ bottom: 'calc(50vh + 16px)' }}
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        {hasActiveFilter && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 8, height: 8, borderRadius: '50%',
            background: '#f59e0b', border: '1.5px solid #fff',
          }} />
        )}
      </button>

      {/* ── Filter Modal ── */}
      {filterOpen && (
        <>
          <div className="driver-filter-overlay" onClick={() => setFilterOpen(false)} />
          <div className="driver-filter-modal">
            <div className="driver-filter-header">
              <h3>Servicios que acepto</h3>
              <button className="driver-filter-close" onClick={() => setFilterOpen(false)} aria-label="Cerrar">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Gender indicator */}
            {gender && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 12px', borderBottom: '1px solid #f1f5f9', marginBottom: 8 }}>
                <span style={{ fontSize: '1.2rem' }}>{gender === 'hombre' ? '👨' : '👩'}</span>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                  Perfil: <strong style={{ color: '#F5C518' }}>{gender === 'hombre' ? 'Hombre' : 'Mujer'}</strong>
                  {' · '}{enabledCount}/{catalogue.length} activos
                </span>
              </div>
            )}

            <p className="driver-filter-subtitle">Activá o desactivá los servicios que querés recibir</p>

            <div className="driver-filter-list">
              {catalogue.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={`driver-filter-item${serviceFilters[item.key] ? ' active' : ''}`}
                  onClick={() => toggleFilter(item.key)}
                >
                  <span className="driver-filter-item-icon">{item.icon}</span>
                  <div className="driver-filter-item-info">
                    <span className="driver-filter-item-label">{item.label}</span>
                  </div>
                  <span className={`driver-filter-toggle${serviceFilters[item.key] ? ' on' : ''}`}>
                    <span className="driver-filter-toggle-knob" />
                  </span>
                </button>
              ))}
            </div>

            {/* Rango de trabajo slider */}
            <div style={{ padding: '12px 4px 4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tuki-text-main)' }}>
                  📍 Rango de trabajo
                </label>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#F5C518' }}>{rangoKm} km</span>
              </div>
              <input
                type="range" min={1} max={100} step={1} value={rangoKm}
                onChange={e => setRangoKm(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#F5C518' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>
                <span>1 km</span><span>100 km</span>
              </div>
            </div>

            <button className="driver-filter-done" onClick={applyFilters}>
              Aplicar filtros
            </button>
          </div>
        </>
      )}

      {/* ── Bottom sheet ── */}
      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`}>
        <div className="tuki-sheet-handle"><span className="tuki-sheet-bar" /></div>
        <div className="tuki-sheet-content">

          {/* Availability toggle */}
          <div className="tuki-availability">
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--tuki-text-main)' }}>Estado</h3>
              <span className={`tuki-status-badge ${available ? 'tuki-status-online' : 'tuki-status-offline'}`}>
                {available ? '● CONECTADO' : '● DESCONECTADO'}
              </span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available} onChange={() => {
                const next = !available;
                setAvailable(next);
                try { localStorage.setItem('tecnico_available', String(next)); } catch {}
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Active services summary chip strip */}
          {catalogue.length > 0 && (
            <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.20)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#C8960A' }}>
                  🛠 Serv. activos · {rangoKm} km
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
                {catalogue.filter(s => serviceFilters[s.key]).map(s => (
                  <span key={s.key} style={{ fontSize: '0.75rem', background: 'rgba(245,197,24,0.10)', color: '#C8960A', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>
                    {s.icon} {s.label}
                  </span>
                ))}
                {enabledCount === 0 && (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Ningún servicio activo — abrí el filtro para activar.</span>
                )}
              </div>
            </div>
          )}

          <div className="tuki-stats-grid">
            {stats.map((s) => (
              <Link key={s.label} href={s.href} className="tuki-stat-card">
                <span className="tuki-stat-icon">{s.icon}</span>
                <div className="tuki-stat-value">{s.value}</div>
                <div className="tuki-stat-label">{s.label}</div>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tuki-text-main)', marginBottom: '0.75rem' }}>Acciones Rápidas</h2>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
              <button className="tuki-btn tuki-btn-primary" onClick={() => setFilterOpen(true)}>🛠 Mis Servicios</button>
              <Link href="/tecnico/ofertas" className="tuki-btn tuki-btn-success">Ver Ofertas</Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── New Job Popup ── */}
      {pendingPopup && (
        <>
          <div onClick={dismissPopup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 9999, width: 'min(92vw, 360px)',
            background: '#fff', borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
            padding: '20px 18px 18px',
            animation: 'popupIn 0.28s cubic-bezier(0.32,0.72,0,1)',
          }}>
            <style>{`@keyframes popupIn{from{opacity:0;transform:translate(-50%,-58%)}to{opacity:1;transform:translate(-50%,-50%)}}`}</style>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.3rem' }}>🔔</span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>Nueva Solicitud</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', background: '#fee2e2', color: '#ef4444', borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>
                  {popupCountdown}s
                </span>
                <button onClick={dismissPopup} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, color: '#94a3b8' }}>✕</button>
              </div>
            </div>

            {/* Client info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              {pendingPopup.client_photo ? (
                <img src={pendingPopup.client_photo} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement)?.style && ((e.currentTarget.nextSibling as HTMLElement).style.display = 'flex'); }} />
              ) : null}
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(245,197,24,0.15)', display: pendingPopup.client_photo ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>👤</div>
              <div>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{pendingPopup.client_name ?? 'Cliente'}</div>
                {pendingPopup.client_rating != null && (
                  <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>{'★'.repeat(Math.round(pendingPopup.client_rating))} {pendingPopup.client_rating.toFixed(1)}</div>
                )}
              </div>
            </div>

            {/* Service + price */}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: '#F5C518', fontSize: '0.9rem', marginBottom: 4 }}>
                🛠 {pendingPopup.service_type}
              </div>
              {pendingPopup.description && (
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 4 }}>{pendingPopup.description}</div>
              )}
              {pendingPopup.address && (
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>📍 {pendingPopup.address}</div>
              )}
              {(() => {
                const pos = tecnicoPosRef.current;
                const jLat = pendingPopup.lat; const jLng = pendingPopup.lng;
                if (pos && jLat != null && jLng != null) {
                  const km = haversineKm(pos.lat, pos.lng, Number(jLat), Number(jLng));
                  return <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F5C518', marginTop: 2 }}>📏 Distancia: {km.toFixed(1)} km</div>;
                }
                return null;
              })()}
              {pendingPopup.client_initial_price != null && (
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#059669', marginTop: 4 }}>
                  💰 Ofrece: {Number(pendingPopup.client_initial_price).toLocaleString('es-PY')} Gs.
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { dismissPopup(); router.push('/tecnico/ofertas'); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#F5C518', color: '#1C1C2E', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}
              >
                👁 Ver solicitud
              </button>
              <button
                onClick={dismissPopup}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
              >
                Ahora no
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
