'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDriverContext } from '../driver/context';
import { authFetch } from '@/lib/authFetch';
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
  // Auto-countdown: when online on dashboard, 20s to disconnect or auto-redirect to offers
  const [onlineCountdown, setOnlineCountdown] = useState(20);
  const onlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopOnlineCountdown = useCallback(() => {
    if (onlineTimerRef.current) { clearInterval(onlineTimerRef.current); onlineTimerRef.current = null; }
    setOnlineCountdown(20);
  }, []);

  useEffect(() => {
    if (!available) { stopOnlineCountdown(); return; }
    setOnlineCountdown(20);
    onlineTimerRef.current = setInterval(() => {
      setOnlineCountdown(prev => {
        if (prev <= 1) {
          stopOnlineCountdown();
          router.push('/tecnico/ofertas');
          return 20;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { stopOnlineCountdown(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);
  const [sheetState, setSheetState] = useState<'collapsed' | 'half' | 'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Document expiry alerts ────────────────────────────────────────────────
  const [docAlerts, setDocAlerts] = useState<{ expired: string[]; soon: string[]; notApproved: string[] }>({ expired: [], soon: [], notApproved: [] });
  const [docCounts, setDocCounts] = useState<{ approved: number; pending: number; rejected: number; missing: number }>({ approved: 0, pending: 0, rejected: 0, missing: 0 });
  useEffect(() => {
    if (!email) return;
    const criticalKeys = ['cedula_frente', 'antecedentes'];
    authFetch(`/api/upload-driver-doc?email=${encodeURIComponent(email)}`)
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
        setDocCounts({ approved: cApproved, pending: cPending, rejected: cRejected, missing: Math.max(0, 4 - docs.length) });
        setDocAlerts({ expired, soon, notApproved });
        if (expired.length > 0 || notApproved.length > 0) {
          // Force offline while docs are not fully approved
          setAvailable(false);
          try {
            localStorage.setItem('tecnico_available', 'false');
            localStorage.setItem('tecnico_doc_blocked', 'true');
          } catch {}
        } else {
          // All docs approved — if the system previously forced them offline, auto-restore connection
          try {
            const wasDocBlocked = localStorage.getItem('tecnico_doc_blocked') === 'true';
            if (wasDocBlocked) {
              setAvailable(true);
              localStorage.setItem('tecnico_available', 'true');
              localStorage.removeItem('tecnico_doc_blocked');
            }
          } catch {}
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
      authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&stats=true`)
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

      {/* Online countdown banner — visible while connected on dashboard */}
      {available && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9990, background: '#1C1C2E',
          border: '2px solid #F5C518', borderRadius: 18,
          padding: '0.7rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: `conic-gradient(#F5C518 ${(onlineCountdown / 20) * 360}deg, rgba(0,0,0,0.12) 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1C1C2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontWeight: 900, fontSize: '0.85rem', color: '#F5C518' }}>{onlineCountdown}</span>
            </div>
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>
            Ir a Solicitudes en <strong style={{ color: '#F5C518' }}>{onlineCountdown}s</strong> · Desconectá el toggle para quedarte
          </span>
        </div>
      )}

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
                if (!available) {
                  setAvailable(true);
                  try { localStorage.setItem('tecnico_available', 'true'); } catch {}
                  router.push('/tecnico/ofertas');
                } else {
                  // Going offline → stop countdown and stay on dashboard
                  stopOnlineCountdown();
                  setAvailable(false);
                  try { localStorage.setItem('tecnico_available', 'false'); } catch {}
                }
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* Mis documentos status card */}
          {(docCounts.approved < 4 || docAlerts.expired.length > 0 || docAlerts.soon.length > 0 || docAlerts.notApproved.length > 0) && (
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
                        : `${docCounts.approved}/4 aprobados${docCounts.pending > 0 ? ` · ${docCounts.pending} pendiente${docCounts.pending > 1 ? 's' : ''}` : ''}${docCounts.rejected > 0 ? ` · ${docCounts.rejected} rechazado${docCounts.rejected > 1 ? 's' : ''}` : ''}${docCounts.missing > 0 ? ` · ${docCounts.missing} sin subir` : ''}${docAlerts.soon.length > 0 ? ' · próximos a vencer' : ''}`
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

    </>
  );
}
