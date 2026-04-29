'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type React from 'react';
import { useWorkerContext } from '../driver/context';
import { authFetch } from '@/lib/authFetch';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { haversineKm } from '@/lib/geo';
import { getGreeting } from '@/lib/greeting';
import RequestsFeed, { type FeedItem } from '@/components/RequestsFeed';
import { Icon } from '@/components/Icon';

const WorkerMap = dynamic(() => import('@/components/WorkerMap'), { ssr: false });

// ── Service catalogue (loaded dynamically from DB) ────────────────────────────
interface ServiceCategory {
  service_type: string;
  label: string;
  emoji: string;
  gender: string;
  suggested_price: number | null;
  sort_order: number;
}

const SERVICE_ICON_MAP: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  limpieza: 'tool',
  niera: 'user',
  cocina: 'clipboard',
  eventos: 'calendar',
  cuidado_mascotas: 'tag',
  cuidado_adultos: 'user',
  gestor: 'clipboard',
  aire_split: 'refresh',
  electrico: 'bolt',
  plomeria: 'tool',
  cerrajeria: 'lock',
  otros: 'settings',
};

function toUI(c: ServiceCategory): { key: string; label: string; icon: React.ComponentProps<typeof Icon>['name'] } {
  return { key: c.service_type, label: c.label, icon: SERVICE_ICON_MAP[c.service_type] || 'tool' };
}

function filterCatsByGender(cats: ServiceCategory[], gender: string) {
  if (gender === 'mujer')  return cats.filter(c => c.gender === 'mujer' || c.gender === 'ambos');
  if (gender === 'hombre') return cats.filter(c => c.gender === 'hombre' || c.gender === 'ambos');
  return cats;
}

function buildDefaultFilters(catalogue: { key: string }[]) {
  const f: Record<string, boolean> = {};
  catalogue.forEach(s => { f[s.key] = true; });
  return f;
}

export default function TecnicoDashboard() {
  const { openDrawer, email, profilePhoto, displayName, avgRating, driverPos } = useWorkerContext();

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTmRef.current) clearTimeout(toastTmRef.current);
    setToast(msg);
    toastTmRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // ── Availability – persisted ───────────────────────────────────────────────
  const [available, setAvailable] = useState(() => {
    try { return localStorage.getItem('tecnico_available') === 'true'; } catch { return false; }
  });
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
        // Only block if critical docs expired OR any doc explicitly rejected
        // Pending docs (awaiting review) do NOT block the tecnico from receiving work
        const hasRejected = docs.filter((d: { status: string }) => d.status === 'rejected').length > 0;
        if (expired.length > 0 || hasRejected) {
          // Force offline — expired or rejected critical docs
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

  // ── Dynamic categories from DB ─────────────────────────────────────────────
  const [allCategories, setAllCategories] = useState<ServiceCategory[]>([]);
  useEffect(() => {
    fetch('/api/service-categories')
      .then(r => r.json())
      .then((cats: ServiceCategory[]) => { if (Array.isArray(cats)) setAllCategories(cats); })
      .catch(() => {});
  }, []);
  const getCatalogueForGender = (g: string) => filterCatsByGender(allCategories, g).map(toUI);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen]     = useState(false);
  const [serviceFilters, setServiceFilters] = useState<Record<string, boolean>>({});
  const [rangoKm, setRangoKm]           = useState(20);
  const [mapPickup, setMapPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [mapDelivery, setMapDelivery] = useState<{ lat: number; lng: number } | null>(null);
  const [activeMapItem, setActiveMapItem] = useState<import('@/components/RequestsFeed').FeedItem | null>(null);

  // ── Wallet balance ────────────────────────────────────────────────────────
  const [walletBalance, setWalletBalance] = useState<number | null>(null);  const [walletBlocked, setWalletBlocked] = useState(false);  useEffect(() => {
    if (!email) return;
    authFetch('/api/wallet')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setWalletBalance(Number(d.balance)); })
      .catch(() => {});
  }, [email]);

  // ── GPS position: consumed from layout context (no duplicate watchPosition) ──
  // driverPos is set by tecnico/layout.tsx which has the authoritative watchPosition

  // Keep mapPickup in sync with driverPos — if GPS arrives after card was shown, update A point
  useEffect(() => {
    if (activeMapItem) {
      setMapPickup(driverPos ? { lat: driverPos.lat, lng: driverPos.lng } : null);
      setMapDelivery(activeMapItem.pickupLat != null && activeMapItem.pickupLng != null
        ? { lat: Number(activeMapItem.pickupLat), lng: Number(activeMapItem.pickupLng) }
        : null);
    } else {
      setMapPickup(null);
      setMapDelivery(null);
    }
  }, [driverPos, activeMapItem]);

  // ── Requests feed state ──────────────────────────────────────────────────
  const [pendingJobs, setPendingJobs] = useState<any[]>([]);
  const [sendingJobId, setSendingJobId] = useState<string | null>(null);
  const [dismissedHome, setDismissedHome] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('tecnico_dismissed_ids');
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [newJobIds, setNewJobIds] = useState<Set<string>>(new Set());
  const knownJobIdsRef = useRef<Set<string>>(new Set());
  const feedPrimedRef = useRef(false);

  const loadPendingJobs = useCallback(() => {
    if (!email) return;
    const refreshParam = feedPrimedRef.current ? '' : '&refresh=1';
    feedPrimedRef.current = true;
    authFetch(`/api/tecnico/jobs?email=${encodeURIComponent(email)}&offers=true${refreshParam}`)
      .then(async r => {
        if (r.status === 402) {
          // Saldo insuficiente — bloquear acceso al mercado
          const body = await r.json().catch(() => ({}));
          setWalletBlocked(true);
          setWalletBalance(Number(body.balance ?? 0));
          setPendingJobs([]);
          return null;
        }
        setWalletBlocked(false);
        return r.json();
      })
      .then(data => {
        if (!data) return;
        const arr = Array.isArray(data) ? data.filter((j: any) => !j.my_offer) : [];
        const incomingIds = new Set(arr.map((j: any) => String(j.id)));
        const freshIds = new Set([...incomingIds].filter(id => !knownJobIdsRef.current.has(id)));
        knownJobIdsRef.current = incomingIds;
        if (freshIds.size > 0) {
          setNewJobIds(prev => new Set([...prev, ...freshIds]));
          setSheetState(s => s === 'collapsed' ? 'half' : s);
          setTimeout(() => {
            setNewJobIds(prev => {
              const next = new Set(prev);
              freshIds.forEach(id => next.delete(id));
              return next;
            });
          }, 9_000);
        }
        setPendingJobs(arr);
        // Prune dismissed IDs that are no longer in the feed (keep sessionStorage lean)
        setDismissedHome(prev => {
          const liveIds = new Set((arr as { id: string }[]).map(j => j.id));
          const pruned = new Set([...prev].filter(id => liveIds.has(id)));
          if (pruned.size !== prev.size) {
            try { sessionStorage.setItem('tecnico_dismissed_ids', JSON.stringify([...pruned])); } catch {}
          }
          return pruned;
        });
      })
      .catch(() => {});
  }, [email]);

  useEffect(() => {
    if (!email) return;
    loadPendingJobs();
    // Realtime handles instant new-job notifications; 3 min fallback poll
    const iv = setInterval(loadPendingJobs, 180_000);
    const ch = supabase.channel(`tecnico-feed-${email}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tecnico_feed',
        filter: `tecnico_email=eq.${email}`,
      } as never, loadPendingJobs)
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [loadPendingJobs, email]);

  const sendTecnicoOffer = async (jobId: string, price: number, note: string, distanceKm: number | null = null) => {
    if (!price || !email || !!sendingJobId) return;
    if (walletBlocked) {
      showToast('⚠️ Recargá tu billetera para enviar ofertas');
      return;
    }
    setSendingJobId(jobId);
    try {
      const res = await authFetch('/api/tecnico/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_offer', jobId,
          tecnicoEmail: email,
          tecnicoName: displayName || null,
          tecnicoPhoto: profilePhoto || null,
          tecnicoRating: avgRating > 0 ? avgRating : null,
          proposedPrice: price,
          note: note || null, distanceKm,
        }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => ({}));
        setWalletBlocked(true);
        setWalletBalance(Number(body.balance ?? 0));
        setPendingJobs([]);
        showToast('⚠️ Saldo insuficiente — recargá tu billetera');
        setSendingJobId(null);
        return;
      }
      const json = await res.json();
      if (json.offer) setDismissedHome(prev => new Set([...prev, jobId]));
    } catch {
      showToast('❌ Error al enviar oferta. Intentá de nuevo.');
    }
    setSendingJobId(null);
  };


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
    if (!gender || allCategories.length === 0) return;
    const catalogue = getCatalogueForGender(gender);
    setServiceFilters(prev => {
      const defaults = buildDefaultFilters(catalogue);
      Object.keys(defaults).forEach(k => { if (prev[k] !== undefined) defaults[k] = prev[k]; });
      return defaults;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, allCategories]);

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

  // Load dashboard stats from API (re-fetch every 2 min when available)
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
    const iv = setInterval(load, 120_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [email]);

  // ── Wake Lock: prevent screen sleep while available ──────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    if (available && !walletBlocked) {
      (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock
        .request('screen')
        .then(l => { lock = l; })
        .catch(() => {});
    }
    return () => { lock?.release().catch(() => {}); };
  }, [available, walletBlocked]);

  const catalogue      = getCatalogueForGender(gender);
  const hasActiveFilter = Object.values(serviceFilters).some(v => !v);
  const enabledCount   = catalogue.filter(s => serviceFilters[s.key]).length;

  const fmtGs = (n: number) =>
    n === 0 ? '0 Gs.' : `${n.toLocaleString('es-PY')} Gs.`;

  const stats = [
    {
      label: 'Citas Confirmadas',
      value: statsLoading ? '…' : statsData.citasConfirmadas,
      href: '/tecnico/citas',
      icon: 'calendar',
    },
    {
      label: 'Tasa Aceptación',
      value: statsLoading ? '…' : (statsData.tasaAceptacion !== null ? `${statsData.tasaAceptacion}%` : '—'),
      href: '/tecnico/aceptacion',
      icon: 'trophy',
    },
  ];

  // ── Filtrar por rango de trabajo ─────────────────────────────────────────
  // Sin GPS: mostrar trabajos igual (solo se omite el filtro por distancia)
  const filteredJobs = pendingJobs.filter(j => {
    if (!driverPos) return true;
    if (j.lat == null || j.lng == null) return true;
    const dist = haversineKm(driverPos.lat, driverPos.lng, Number(j.lat), Number(j.lng));
    return dist <= rangoKm;
  });

  const gpsNeeded = !driverPos && available && !walletBlocked &&
    pendingJobs.some(j => j.lat != null);

  const feedVisible = available && !walletBlocked && filteredJobs.filter(j => !dismissedHome.has(j.id)).length > 0;

  return (
    <>
      <div className="tuki-map">
        <WorkerMap onLocate={() => {}} pickup={mapPickup} delivery={mapDelivery} />
      </div>

      {/* Radar overlay — visible only when online and no active feed */}
      {available && !walletBlocked && !feedVisible && (
        <div className="tuki-radar">
          <div className="tuki-radar-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="eye" size={14} />
            Ofertas en camino… atento
          </div>
          <div className="tuki-radar-rings">
            <div className="tuki-radar-ring" />
            <div className="tuki-radar-ring" />
            <div className="tuki-radar-ring" />
            <div className="tuki-radar-dot" />
          </div>
        </div>
      )}

      {/* Profile pill — top left */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {profilePhoto ? (
            <img src={profilePhoto} alt="" loading="lazy" decoding="async" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #F58A07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: '#1C1C2E', border: '2px solid #F5C518', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {displayName?.[0]?.toUpperCase() || <Icon name="user" size={16} />}
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
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.2 }}>{getGreeting()}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{displayName?.split(' ')[0] || 'Técnico'}</div>
        </div>
      </div>

      {/* ── Menú ── — top right */}
      <button className="tuki-float-btn menu" aria-label="Menú" onClick={openDrawer}>
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Wallet balance pill — centrada top */}
      <Link href="/tecnico/billetera" className="tuki-wallet-pill" aria-label="Mi billetera"
        style={walletBlocked ? { background: 'rgba(239,68,68,0.18)', border: '1.5px solid rgba(239,68,68,0.5)', boxShadow: '0 0 0 3px rgba(239,68,68,0.12)' } : undefined}
      >
        <span className="tuki-wallet-pill-amount" style={walletBlocked ? { color: '#f87171' } : undefined}>
          {walletBalance !== null
            ? `${Number(walletBalance).toLocaleString('es-PY')} ₲`
            : <span style={{ display: 'inline-block', width: 72, height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.15)', animation: 'pulse 1.5s ease-in-out infinite' }} />}
        </span>
        <span className="tuki-wallet-pill-label" style={walletBlocked ? { color: 'rgba(248,113,113,0.9)' } : undefined}>
          {walletBlocked ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="exclamation" size={12} />
              Recargar
            </span>
          ) : 'Billetera'}
        </span>
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



      {/* Toast */}
      {toast && <div className="tuki-toast">{toast}</div>}

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
                <span style={{ display: 'inline-flex', color: '#F5C518' }}>
                  <Icon name="user" size={16} />
                </span>
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
                  <span className="driver-filter-item-icon">
                    <Icon name={item.icon as import('@/components/Icon').IconName} size={14} />
                  </span>
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="map-pin" size={12} />
                    Rango de trabajo
                  </span>
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

      {/* ── Aviso GPS ── */}
      {gpsNeeded && (
        <div style={{ position: 'fixed', bottom: 'calc(var(--tuki-nav-h, 64px) + 12px)', left: 12, right: 12, zIndex: 9990, background: 'var(--surface-2)', border: '1px solid #f59e0b', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', color: '#f59e0b' }}>
            <Icon name="map-pin" size={16} />
          </span>
          <div>
            <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.88rem' }}>Activá el GPS para ver solicitudes</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>El rango de trabajo ({rangoKm} km) requiere tu ubicación</div>
          </div>
        </div>
      )}
      {/* ── Solicitudes overlay (floating over map) ── */}
      <RequestsFeed
        mode="tecnico"
        available={available}
        items={filteredJobs.map((j): FeedItem => ({
          id: j.id,
          title: j.service_type || 'servicio',
          location: j.address,
          price: j.client_initial_price,
          createdAt: j.created_at,
          pickupLat: j.lat,
          pickupLng: j.lng,
          clientPhoto: j.client_photo,
          clientName: j.client_name,
          clientRating: j.client_rating,
          dateScheduled: j.scheduled_at ?? null,
          instructions: j.description ?? null,
          photos: (j.photos as string[] | null) ?? null,
        }))}
        dismissed={dismissedHome}
        onAccept={sendTecnicoOffer}
        onDismiss={(id) => {
          setDismissedHome(prev => {
            const next = new Set([...prev, id]);
            try { sessionStorage.setItem('tecnico_dismissed_ids', JSON.stringify([...next])); } catch {}
            return next;
          });
          // Registrar en matching stats (fire-and-forget)
          authFetch('/api/driver-match/dismiss', { method: 'POST' }).catch(() => {});
        }}
        sendingId={sendingJobId}
        driverLat={driverPos?.lat}
        driverLng={driverPos?.lng}
        onActiveItem={(item) => setActiveMapItem(item ?? null)}
      />

      {/* ── Bottom sheet ── */}
      <div ref={sheetRef} className={`tuki-sheet ${sheetState}`} style={feedVisible ? { display: 'none' } : undefined}>
        <div
          className="tuki-sheet-handle"
          role="button"
          aria-label="Expandir panel"
          onClick={() => setSheet(sheetState === 'collapsed' ? 'half' : sheetState === 'half' ? 'full' : 'collapsed')}
        >
          <span className="tuki-sheet-bar" />
        </div>
        {/* Collapsed hint */}
        {sheetState === 'collapsed' && (
          <div
            className="tuki-sheet-hint"
            role="button"
            onClick={() => setSheet('half')}
          >
            {walletBlocked ? (
              <span className="tuki-sheet-hint-text" style={{ color: '#f87171', fontWeight: 700 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="exclamation" size={12} />
                  Recarga tu billetera para recibir solicitudes
                </span>
              </span>
            ) : available ? (
              <>
                {filteredJobs.filter(j => !dismissedHome.has(j.id)).length > 0 && (
                  <>
                    <span className="tuki-sheet-hint-text">
                      {`${filteredJobs.filter(j => !dismissedHome.has(j.id)).length} solicitudes cerca de ti`}
                    </span>
                    <span className="tuki-sheet-hint-badge">
                      {filteredJobs.filter(j => !dismissedHome.has(j.id)).length}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 600 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="refresh" size={12} />
                  Activate para recibir solicitudes
                </span>
              </span>
            )}
          </div>
        )}
        <div className="tuki-sheet-content">

          {/* Availability toggle */}
          <div className="tuki-availability">
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--tuki-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado</p>
              <span className={`tuki-status-badge ${available && !walletBlocked ? 'tuki-status-online' : 'tuki-status-offline'}`} style={{ fontSize: '1rem', padding: '0.35rem 1rem' }}>
                {available && !walletBlocked ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="money" size={12} />
                    Online
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="x" size={12} />
                    Offline
                  </span>
                )}
              </span>
            </div>
            <label className="tuki-toggle">
              <input type="checkbox" checked={available && !walletBlocked} onChange={() => {
                if (walletBlocked) { showToast('Recarga tu billetera para activarte'); return; }
                // Only block toggle if critical docs are EXPIRED or any doc REJECTED (not pending)
                if (!available && (docAlerts.expired.length > 0 || docCounts.rejected > 0)) return;
                if (!available) {
                  setAvailable(true);
                  try { localStorage.setItem('tecnico_available', 'true'); } catch {}
                  showToast('Online. Buscando solicitudes…');
                } else {
                  setAvailable(false);
                  try { localStorage.setItem('tecnico_available', 'false'); } catch {}
                  showToast('Offline. Descansando.');
                }
              }} />
              <span className="tuki-toggle-slider" />
            </label>
          </div>

          {/* ⚠️ Billetera bloqueada — banner de alta prioridad */}
          {walletBlocked && (
            <Link href="/tecnico/billetera" style={{ display: 'block', textDecoration: 'none', marginBottom: '0.75rem' }}>
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
                  <span style={{ display: 'inline-flex', color: docAlerts.expired.length > 0 || docCounts.rejected > 0 ? '#ef4444' : '#9ca3af' }}>
                    <Icon name={docAlerts.expired.length > 0 ? 'x' : docCounts.rejected > 0 ? 'x' : 'paper-clip'} size={16} />
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="tool" size={12} />
                    Serv. activos · {rangoKm} km
                  </span>
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
                    <span style={{ display: 'inline-flex', marginRight: 4 }}>
                      <Icon name={s.icon as import('@/components/Icon').IconName} size={12} />
                    </span>
                    {s.label}
                  </span>
                ))}
                {enabledCount === 0 && (
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Ningún servicio activo — abrí el filtro para activar.</span>
                )}
              </div>
            </div>
          )}

          {/* ── Requests Feed moved to overlay outside the sheet ── */}

          {statsLoading ? (
            <div className="tuki-stats-grid">
              {[0,1,2,3].map(i => (
                <div key={i} className="tuki-stat-card">
                  <div className="tuki-skeleton" style={{ width: 28, height: 28, borderRadius: '50%', marginBottom: 8 }} />
                  <div className="tuki-skeleton" style={{ width: '60%', height: 24, marginBottom: 6 }} />
                  <div className="tuki-skeleton" style={{ width: '80%', height: 14 }} />
                </div>
              ))}
            </div>
          ) : (
          <div className="tuki-stats-grid">
            {/* Ganancias Hoy — full width, premium BRAND hero card */}
            <Link href="/tecnico/ganancias" style={{
              gridColumn: 'span 2',
              background: 'linear-gradient(135deg, rgba(245,197,24,0.14) 0%, rgba(245,130,7,0.08) 100%)',
              border: '1.5px solid rgba(245,197,24,0.35)',
              borderRadius: 20,
              padding: '14px 18px',
              boxShadow: '0 4px 20px rgba(245,197,24,0.10), 0 2px 8px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              cursor: 'pointer',
              textDecoration: 'none',
              color: 'inherit',
              position: 'relative',
              overflow: 'hidden',
              transition: 'transform 0.18s, box-shadow 0.18s',
            }}>
              {/* Subtle top-left glow */}
              <div style={{ position: 'absolute', top: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(245,197,24,0.18)', filter: 'blur(20px)', pointerEvents: 'none' }} />
              <div style={{
                width: 48, height: 48, borderRadius: 15,
                background: 'linear-gradient(135deg, #F5C518, #F58A07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(245,197,24,0.4)',
                flexShrink: 0,
              }}>
                <Icon name="money" size={22} color="#1C1C2E" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#C8960A', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Ganancias Hoy</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#F5C518', lineHeight: 1, letterSpacing: '-0.5px' }}>
                  {statsData.gananciasHoy.toLocaleString('es-PY')}
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(245,197,24,0.7)', marginLeft: 6 }}>Gs</span>
                </div>
              </div>
              <div style={{ flexShrink: 0, color: 'rgba(245,197,24,0.6)', fontSize: '1.3rem' }}>›</div>
            </Link>
            {stats.map((s) => (
              <Link key={s.label} href={s.href} className="tuki-stat-card">
                <span className="tuki-stat-icon">
                  <Icon name={s.icon as import('@/components/Icon').IconName} size={16} />
                </span>
                <div className="tuki-stat-value">{s.value}</div>
                <div className="tuki-stat-label">{s.label}</div>
              </Link>
            ))}
          </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tuki-text-main)', marginBottom: '0.75rem' }}>Acciones Rápidas</h2>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr' }}>
              <button className="tuki-btn tuki-btn-primary" onClick={() => setFilterOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Icon name="tool" size={14} />
                Mis Servicios
              </button>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
