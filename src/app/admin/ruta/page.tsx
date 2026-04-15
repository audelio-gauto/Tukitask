'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER: [number, number] = [-57.5759, -25.2637]; // Asunción
const REFRESH_INTERVAL = 15_000; // 15 s

// ─── Types ───────────────────────────────────────────────────────────────────

interface LiveUser {
  id: string;
  email: string;
  role: 'driver' | 'tecnico';
  name: string;
  transport_mode: string | null;
  profile_photo: string | null;
  verified: boolean;
  lat: number | null;
  lng: number | null;
  updated_at: string | null;
  online: boolean;
  en_route: boolean;
  pickup: { lat: number; lng: number; address: string } | null;
  delivery: { lat: number; lng: number; address: string } | null;
  job_dest: { lat: number; lng: number; address: string } | null;
  banned: boolean;
  banned_until: string | null;
  suspended: boolean;
}

type ActionType = 'suspend' | 'block' | 'reactivate';

interface ConfirmDialog {
  user: LiveUser;
  action: ActionType;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleBadge(role: string) {
  return role === 'driver'
    ? { label: 'Conductor', bg: '#22c55e22', color: '#4ade80', border: '#4ade8044' }
    : { label: 'Técnico', bg: '#3b82f622', color: '#60a5fa', border: '#60a5fa44' };
}

function statusBadge(u: LiveUser) {
  if (u.banned) return { label: 'Bloqueado', color: '#ef4444', bg: '#ef444422' };
  if (u.suspended) return { label: 'Suspendido', color: '#f59e0b', bg: '#f59e0b22' };
  if (!u.online) return { label: 'Offline', color: '#6b7280', bg: '#6b728022' };
  if (u.en_route) return { label: 'En Ruta', color: '#22c55e', bg: '#22c55e22' };
  return { label: 'Libre', color: '#60a5fa', bg: '#60a5fa22' };
}

function markerColor(u: LiveUser): string {
  if (u.banned || u.suspended) return '#ef4444';
  if (u.en_route) return '#22c55e';
  if (u.online) return '#60a5fa';
  return '#6b7280';
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

// ─── Map Marker element ───────────────────────────────────────────────────────

function makeMarkerEl(u: LiveUser): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    width:36px;height:36px;border-radius:50%;
    background:${markerColor(u)};color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:12px;
    border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.4);
    cursor:pointer;transition:transform .15s;
  `;
  el.title = u.name;
  el.textContent = initials(u.name) || (u.role === 'driver' ? '🚗' : '🔧');
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

function makePinEl(color: string, label: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    position:relative;display:flex;flex-direction:column;align-items:center;
  `;
  el.innerHTML = `
    <div style="
      background:${color};color:#fff;font-size:10px;font-weight:700;
      padding:2px 6px;border-radius:8px;white-space:nowrap;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
    ">${label}</div>
    <div style="
      width:0;height:0;border-left:5px solid transparent;
      border-right:5px solid transparent;border-top:8px solid ${color};
    "></div>
  `;
  return el;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RutaPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routeLinesRef = useRef<Map<string, any>>(new Map());
  const pinMarkersRef = useRef<any[]>([]);
  const mbRef = useRef<any>(null);
  const initRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [users, setUsers] = useState<LiveUser[]>([]);
  const [filtered, setFiltered] = useState<LiveUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver' | 'tecnico'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'en_route'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<LiveUser | null>(null);
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const [actioning, setActioning] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [stats, setStats] = useState({ total: 0, online: 0, en_route: 0, free: 0 });

  // ── Auth token ──────────────────────────────────────────────────────────────

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }, []);

  // ── Fetch live data ─────────────────────────────────────────────────────────

  const fetchLive = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/ruta/live', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error');
      const data: LiveUser[] = json.data || [];
      setUsers(data);
      setStats({
        total: data.length,
        online: data.filter(u => u.online).length,
        en_route: data.filter(u => u.en_route).length,
        free: data.filter(u => u.online && !u.en_route).length,
      });
      setError('');
      return data;
    } catch (err: any) {
      setError(String(err?.message || err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || initRef.current) return;
    if (!MAPBOX_TOKEN) { setMapError(true); return; }
    initRef.current = true;

    let mounted = true;
    let loadTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      let mapboxgl: any;
      try {
        mapboxgl = (await import('mapbox-gl')).default;
      } catch {
        if (mounted) setMapError(true);
        return;
      }

      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      if (!mounted || !mapRef.current) return;

      if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
        if (mounted) setMapError(true);
        return;
      }

      let map: any;
      try {
        map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: DEFAULT_CENTER,
          zoom: 11,
          accessToken: MAPBOX_TOKEN,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        if (mounted) setMapError(true);
        return;
      }

      mbRef.current = mapboxgl;
      mapInstance.current = map;

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

      // Timeout fallback — if map doesn't load in 8s, show error
      loadTimer = setTimeout(() => {
        if (mounted && !map._loaded) {
          try { map.remove(); } catch {}
          mapInstance.current = null;
          setMapError(true);
        }
      }, 8000);

      map.on('error', (e: any) => {
        if (e?.error?.message?.toLowerCase().includes('webgl') && mounted) {
          try { map.remove(); } catch {}
          mapInstance.current = null;
          setMapError(true);
        }
      });

      map.on('load', () => {
        if (loadTimer) clearTimeout(loadTimer);
        if (!mounted) return;
        // resize ensures map fills its container after flex layout resolves
        map.resize();
        setMapReady(true);
      });

      // ResizeObserver keeps map sized correctly on layout changes
      const ro = new ResizeObserver(() => {
        if (mapInstance.current) mapInstance.current.resize();
      });
      if (mapRef.current) ro.observe(mapRef.current);

    })();

    return () => {
      mounted = false;
      if (loadTimer) clearTimeout(loadTimer);
    };
  }, []);

  // ── Update map markers when data changes ────────────────────────────────────

  const updateMapMarkers = useCallback((data: LiveUser[]) => {
    const map = mapInstance.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl) return;

    const seen = new Set<string>();

    // Clear prior route lines + pin markers
    routeLinesRef.current.forEach((_, id) => {
      if (map.getLayer(`route-${id}`)) map.removeLayer(`route-${id}`);
      if (map.getSource(`route-${id}`)) map.removeSource(`route-${id}`);
    });
    routeLinesRef.current.clear();
    pinMarkersRef.current.forEach(m => m.remove());
    pinMarkersRef.current = [];

    data.forEach(u => {
      if (u.lat == null || u.lng == null) return;
      seen.add(u.id);

      const color = markerColor(u);

      if (markersRef.current.has(u.id)) {
        // Update position
        markersRef.current.get(u.id).setLngLat([u.lng, u.lat]);
      } else {
        const el = makeMarkerEl(u);
        el.addEventListener('click', () => setSelected(u));
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([u.lng, u.lat])
          .addTo(map);
        markersRef.current.set(u.id, marker);
      }

      // Draw route line if driver is en_route
      if (u.en_route) {
        const dest = u.delivery || u.job_dest;
        const origin = u.pickup || (u.lat != null ? { lat: u.lat, lng: u.lng, address: '' } : null);

        if (dest) {
          // Pin A (pickup or current loc)
          if (u.pickup) {
            const pinA = makePinEl('#f59e0b', 'A');
            const mA = new mapboxgl.Marker({ element: pinA, anchor: 'bottom' })
              .setLngLat([u.pickup.lng, u.pickup.lat])
              .addTo(map);
            pinMarkersRef.current.push(mA);
          }
          // Pin B (delivery)
          const pinB = makePinEl('#ef4444', 'B');
          const mB = new mapboxgl.Marker({ element: pinB, anchor: 'bottom' })
            .setLngLat([dest.lng, dest.lat])
            .addTo(map);
          pinMarkersRef.current.push(mB);

          // Straight dashed line A → B
          const coords: [number, number][] = [];
          if (origin) coords.push([origin.lng, origin.lat]);
          coords.push([dest.lng, dest.lat]);

          const srcId = `route-${u.id}`;
          if (!map.getSource(srcId)) {
            map.addSource(srcId, {
              type: 'geojson',
              data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
            });
            map.addLayer({
              id: `route-${u.id}`,
              type: 'line',
              source: srcId,
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [3, 2] },
            });
            routeLinesRef.current.set(u.id, true);
          }
        }
      }
    });

    // Remove markers for users no longer in data
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
  }, []);

  // ── Polling ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const run = async () => {
      const data = await fetchLive();
      if (data && mapReady) updateMapMarkers(data);
    };
    run();
    intervalRef.current = setInterval(run, REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // Update map when data changes without re-running polling
  useEffect(() => {
    if (mapReady && users.length) updateMapMarkers(users);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, mapReady]);

  // ── Filter ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== 'all') list = list.filter(u => u.role === roleFilter);
    if (statusFilter === 'online') list = list.filter(u => u.online);
    if (statusFilter === 'offline') list = list.filter(u => !u.online);
    if (statusFilter === 'en_route') list = list.filter(u => u.en_route);
    setFiltered(list);
  }, [users, search, roleFilter, statusFilter]);

  // ── Focus user on map ───────────────────────────────────────────────────────

  const focusUser = useCallback((u: LiveUser) => {
    setSelected(u);
    if (mapInstance.current && u.lat != null && u.lng != null) {
      mapInstance.current.flyTo({ center: [u.lng, u.lat], zoom: 15, duration: 800 });
    }
  }, []);

  // ── Action ───────────────────────────────────────────────────────────────────

  const executeAction = useCallback(async (u: LiveUser, action: ActionType) => {
    setActioning(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/ruta/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: u.id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error');
      setActionSuccess(`${u.name}: ${action === 'suspend' ? 'Suspendido' : action === 'block' ? 'Bloqueado' : 'Reactivado'} correctamente`);
      setTimeout(() => setActionSuccess(''), 3500);
      // Refresh data
      const data = await fetchLive();
      if (data && mapReady) updateMapMarkers(data);
      // Update selected state
      if (selected?.id === u.id) {
        const updated = data?.find(d => d.id === u.id);
        if (updated) setSelected(updated);
      }
    } catch (err: any) {
      alert('Error: ' + String(err?.message || err));
    } finally {
      setActioning(false);
      setConfirm(null);
    }
  }, [getToken, fetchLive, mapReady, updateMapMarkers, selected]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const totalPages = 1; // all shown (no pagination in live view)

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/20">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </span>
              Ruta en Vivo
            </h1>
            <p className="text-white/40 text-sm mt-0.5">Monitoreo en tiempo real de conductores y técnicos</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
              ${loading ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
              {loading ? 'Actualizando…' : 'En vivo'}
            </span>
            <button
              onClick={() => fetchLive().then(d => { if (d && mapReady) updateMapMarkers(d); })}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Actualizar ahora"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: 'TOTAL', value: stats.total, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
            { label: 'EN LÍNEA', value: stats.online, color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
            { label: 'EN RUTA', value: stats.en_route, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
            { label: 'LIBRES', value: stats.free, color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-white/8 p-3 text-center"
              style={{ background: s.bg }}>
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-white/40 font-semibold tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 gap-4 min-h-0">

        {/* ── Map ── */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ minHeight: 0 }}>
          {/* absolute inset-0 guarantees the map fills the container in production builds */}
          <div ref={mapRef} className="absolute inset-0" />
          {mapError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f1117] gap-3">
              <svg className="w-10 h-10 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-white/40 text-sm">{!MAPBOX_TOKEN ? 'Token de Mapbox no configurado.' : 'El mapa no pudo cargarse (WebGL no disponible).'}</p>
            </div>
          )}
          {/* Map legend */}
          <div className="absolute bottom-10 left-2 bg-black/70 backdrop-blur-sm rounded-xl p-3 text-xs border border-white/10">
            {[
              { color: '#22c55e', label: 'En Ruta' },
              { color: '#60a5fa', label: 'Libre / Online' },
              { color: '#6b7280', label: 'Offline' },
              { color: '#ef4444', label: 'Bloq. / Susp.' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2 mb-1 last:mb-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
                <span className="text-white/70">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="w-80 flex flex-col min-h-0">

          {/* Filters */}
          <div className="flex-shrink-0 space-y-2 mb-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por correo o nombre…"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as any)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
              >
                <option value="all">Todos los roles</option>
                <option value="driver">Conductores</option>
                <option value="tecnico">Técnicos</option>
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25"
              >
                <option value="all">Todos</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="en_route">En Ruta</option>
              </select>
            </div>
            <p className="text-white/30 text-xs pl-1">{filtered.length} encontrados</p>
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 custom-scroll">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
            {loading && !users.length && (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
              ))
            )}
            {filtered.map(u => {
              const sb = statusBadge(u);
              const rb = roleBadge(u.role);
              const isSelected = selected?.id === u.id;
              return (
                <div
                  key={u.id}
                  onClick={() => focusUser(u)}
                  className={`rounded-xl border p-3 cursor-pointer transition-all
                    ${isSelected
                      ? 'border-green-400/40 bg-green-400/5'
                      : 'border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/15'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {u.profile_photo ? (
                        <Image
                          src={u.profile_photo}
                          alt={u.name}
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-full object-cover border-2"
                          style={{ borderColor: markerColor(u) }}
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white border-2"
                          style={{ background: markerColor(u) + '33', borderColor: markerColor(u) }}
                        >
                          {initials(u.name) || (u.role === 'driver' ? '🚗' : '🔧')}
                        </div>
                      )}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1a1a2e]"
                        style={{ background: u.online ? '#22c55e' : '#6b7280' }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-white font-semibold text-sm truncate">{u.name}</span>
                      </div>
                      <p className="text-white/40 text-xs truncate mb-1.5">{u.email}</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: rb.bg, color: rb.color, border: `1px solid ${rb.border}` }}>
                          {rb.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: sb.bg, color: sb.color }}>
                          {sb.label}
                        </span>
                        {u.transport_mode && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-white/5 text-white/50">
                            {u.transport_mode}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Time */}
                    <span className="text-white/30 text-xs flex-shrink-0">{timeAgo(u.updated_at)}</span>
                  </div>

                  {/* Action buttons */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-white/8 flex gap-2">
                      {!u.banned && !u.suspended ? (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirm({ user: u, action: 'suspend' }); }}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 border border-yellow-500/20 transition-colors"
                          >
                            Suspender
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirm({ user: u, action: 'block' }); }}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20 transition-colors"
                          >
                            Bloquear
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setConfirm({ user: u, action: 'reactivate' }); }}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/20 transition-colors"
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  )}

                  {/* Route detail if en_route */}
                  {isSelected && u.en_route && (
                    <div className="mt-2 space-y-1">
                      {u.pickup && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="w-4 h-4 rounded bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold flex-shrink-0">A</span>
                          <span className="text-white/50 truncate">{u.pickup.address || `${u.pickup.lat.toFixed(4)}, ${u.pickup.lng.toFixed(4)}`}</span>
                        </div>
                      )}
                      {(u.delivery || u.job_dest) && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="w-4 h-4 rounded bg-red-500/20 text-red-400 flex items-center justify-center font-bold flex-shrink-0">B</span>
                          <span className="text-white/50 truncate">
                            {(u.delivery || u.job_dest)?.address ||
                              `${(u.delivery || u.job_dest)?.lat.toFixed(4)}, ${(u.delivery || u.job_dest)?.lng.toFixed(4)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && !filtered.length && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <p className="text-sm">Sin resultados</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Success toast ── */}
      {actionSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-500/20 border border-green-500/30 text-green-300 px-5 py-3 rounded-xl text-sm shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
          ✓ {actionSuccess}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !actioning && setConfirm(null)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4 text-2xl
                ${confirm.action === 'block' ? 'bg-red-500/15' : confirm.action === 'suspend' ? 'bg-yellow-500/15' : 'bg-green-500/15'}`}>
                {confirm.action === 'block' ? '🚫' : confirm.action === 'suspend' ? '⏸️' : '✅'}
              </div>
              <h3 className="text-white font-bold text-lg">
                {confirm.action === 'block' ? 'Bloquear usuario' :
                  confirm.action === 'suspend' ? 'Suspender usuario' : 'Reactivar usuario'}
              </h3>
              <p className="text-white/50 text-sm mt-1">
                {confirm.action === 'block'
                  ? 'El usuario no podrá ingresar. Acción permanente.'
                  : confirm.action === 'suspend'
                    ? 'El usuario será suspendido 30 días.'
                    : 'Se levantarán todas las restricciones.'}
              </p>
              <p className="text-white/70 text-sm mt-3 font-semibold">{confirm.user.name}</p>
              <p className="text-white/40 text-xs">{confirm.user.email}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                disabled={actioning}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 hover:bg-white/5 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeAction(confirm.user, confirm.action)}
                disabled={actioning}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-60
                  ${confirm.action === 'block'
                    ? 'bg-red-600 hover:bg-red-500'
                    : confirm.action === 'suspend'
                      ? 'bg-yellow-600 hover:bg-yellow-500'
                      : 'bg-green-600 hover:bg-green-500'
                  }`}
              >
                {actioning ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Procesando…
                  </span>
                ) : (
                  confirm.action === 'block' ? 'Bloquear' :
                    confirm.action === 'suspend' ? 'Suspender' : 'Reactivar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
