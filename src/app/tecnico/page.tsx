'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../driver/context';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { playNewJobAlert } from '@/lib/audio';
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

const DriverMap = dynamic(() => import('../driver/components/DriverMap'), { ssr: false });

// ── Service catalogue (must mirror servicio/page.tsx) ─────────────────────────
const SERVICES_MUJER = [
  { key: 'limpieza',         label: 'Limpieza',          icon: '🧹' },
  { key: 'niera',            label: 'Niñera',            icon: '👶' },
  { key: 'cocina',           label: 'Cocina',            icon: '🍳' },
  { key: 'eventos',          label: 'Eventos',           icon: '🎉' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'gestor',           label: 'Gestor',            icon: '📋' },
  { key: 'otros',            label: 'Otros',             icon: '✨' },
];
const SERVICES_HOMBRE = [
  { key: 'aire_split',       label: 'Tec Aire Split',    icon: '❄️' },
  { key: 'electrico',        label: 'Serv. Eléctrico',   icon: '⚡' },
  { key: 'plomeria',         label: 'Serv. Plomería',    icon: '🔧' },
  { key: 'cerrajeria',       label: 'Serv. Cerrajería',  icon: '🔑' },
  { key: 'limpieza',         label: 'Limpieza',          icon: '🧹' },
  { key: 'cuidado_adultos',  label: 'Cuidado adultos',   icon: '👴' },
  { key: 'cuidado_mascotas', label: 'Cuidado Mascotas',  icon: '🐾' },
  { key: 'gestor',           label: 'Gestor',            icon: '📋' },
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

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return 'Buen día';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function TecnicoDashboard() {
  const router = useRouter();
  const { openDrawer, email, profilePhoto, displayName, avgRating } = useDriverContext();

  // ── Availability – persisted ───────────────────────────────────────────────
  const [available, setAvailable] = useState(false);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Document expiry alerts ────────────────────────────────────────────────
  const [docAlerts, setDocAlerts] = useState<{ expired: string[]; soon: string[]; notApproved: string[] }>({ expired: [], soon: [], notApproved: [] });
  const [docCounts, setDocCounts] = useState<{ approved: number; pending: number; rejected: number; missing: number }>({ approved: 0, pending: 0, rejected: 0, missing: 0 });
  useEffect(() => {
    if (!email) return;
    const criticalKeys = ['cedula_frente', 'antecedentes'];
    fetch(`/api/upload-driver-doc?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(j => {
        const expired: string[] = [];
        const soon: string[] = [];
        const notApproved: string[] = [];
        const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;
        const docs = j.docs || [];
        let cApproved = 0, cPending = 0, cRejected = 0;
        for (const d of docs) {
          if (d.status === 'approved') cApproved++;
          else if (d.status === 'pending') cPending++;
          else if (d.status === 'rejected') cRejected++;
          if (d.status !== 'approved') notApproved.push(d.doc_type);
          if (!criticalKeys.includes(d.doc_type)) continue;
          if (!d.expires_at) continue;
          const ms = new Date(d.expires_at).getTime() - Date.now();
          if (ms <= 0) expired.push(d.doc_type);
          else if (ms <= TEN_DAYS) soon.push(d.doc_type);
        }
        setDocCounts({ approved: cApproved, pending: cPending, rejected: cRejected, missing: 5 - docs.length });
        setDocAlerts({ expired, soon, notApproved });
        if (expired.length > 0 || notApproved.length > 0) {
          setAvailable(false);
          try { localStorage.setItem('tecnico_available', 'false'); } catch {}
        }
      })
      .catch(() => {});
  }, [email]);

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

  // ── Wallet balance ────────────────────────────────────────────────────────
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!email) return;
    authFetch('/api/wallet')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setWalletBalance(Number(d.balance)); })
      .catch(() => {});
  }, [email]);

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
      authFetch('/api/tecnico/settings', {
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
        const res  = await authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&offers=true`);
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
        setPopupCountdown(100);
        playNewJobAlert();
        // Countdown timer
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setPopupCountdown(prev => {
            if (prev <= 1) { dismissPopup(); return 100; }
            return prev - 1;
          });
        }, 1000);
      } catch { /* ignore */ }
    };
    check();
    // Fallback polling at 8s — primary signal is realtime INSERT on tecnico_jobs
    const iv = setInterval(check, 8_000);

    // Re-check immediately when tecnico returns to app (notification tap)
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    // Realtime: new pending jobs for this técnico
    const ch = supabase.channel(`tecnico-dash-jobs-${email}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tecnico_jobs',
      } as never, () => check())
      .subscribe();

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      supabase.removeChannel(ch);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [available, email, dismissPopup]);

  const sendPopupOffer = async () => {
    if (!pendingPopup || !email || popupSending) return;
    if (!popupOfferPrice || popupOfferPrice <= 0) return;
    setPopupSending(true);
    try {
      const pos = tecnicoPosRef.current;
      const distKm = (pos && pendingPopup.lat != null && pendingPopup.lng != null)
        ? haversineKm(pos.lat, pos.lng, Number(pendingPopup.lat), Number(pendingPopup.lng))
        : null;
      await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_offer',
          jobId: pendingPopup.id,
          tecnicoEmail: email,
          tecnicoName: displayName || null,
          tecnicoPhoto: profilePhoto || null,
          tecnicoRating: avgRating > 0 ? avgRating : null,
          proposedPrice: popupOfferPrice,
          distanceKm: distKm,
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
      label: 'Pedidos',
      value: statsLoading ? '…' : statsData.ofertasActivas + statsData.citasConfirmadas,
      href: '/tecnico/ofertas',
      icon: '📋',
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
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{displayName?.split(' ')[0] || 'Técnico'}</div>
        </div>
      </div>

      {/* ── Menú ── — top right */}
      <button className="tuki-float-btn menu" aria-label="Menú" onClick={openDrawer}>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Wallet balance pill — centrada top */}
      <Link href="/tecnico/billetera" className="tuki-wallet-pill" aria-label="Mi billetera">
        <span className="tuki-wallet-pill-amount">
          {walletBalance !== null
            ? `${Number(walletBalance).toLocaleString('es-PY')} ₲`
            : '₲ ...'}
        </span>
        <span className="tuki-wallet-pill-label">Billetera</span>
      </Link>

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
                if (!available && (docAlerts.expired.length > 0 || docAlerts.notApproved.length > 0)) return;
                const next = !available;
                setAvailable(next);
                try { localStorage.setItem('tecnico_available', String(next)); } catch {}
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Mis documentos status card */}
          {(docCounts.approved < 5 || docAlerts.expired.length > 0 || docAlerts.soon.length > 0) && (
            <Link href="/tecnico/settings?scroll=docs" style={{ display: 'block', textDecoration: 'none', marginBottom: '0.75rem' }}>
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
                        : `${docCounts.approved}/5 aprobados${docCounts.pending > 0 ? ` · ${docCounts.pending} pendiente${docCounts.pending > 1 ? 's' : ''}` : ''}${docCounts.rejected > 0 ? ` · ${docCounts.rejected} rechazado${docCounts.rejected > 1 ? 's' : ''}` : ''}${docCounts.missing > 0 ? ` · ${docCounts.missing} sin subir` : ''}${docAlerts.soon.length > 0 ? ' · próximos a vencer' : ''}`
                      }
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: '1rem', color: '#6b7280', flexShrink: 0 }}>›</span>
              </div>
            </Link>
          )}

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
