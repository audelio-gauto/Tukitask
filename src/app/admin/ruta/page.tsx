'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import { Icon } from '@/components/Icon';

// Leaflet — no WebGL required, works in all browsers
const DEFAULT_CENTER: [number, number] = [-25.2637, -57.5759]; // [lat, lng] Asunción
const DEFAULT_ZOOM = 11;
const REFRESH_INTERVAL = 15_000;

type MapStyle = 'Map' | 'Satelite' | 'Noche';

const TILES: Record<MapStyle, { url: string; attr: string }> = {
  Map: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap',
  },
  Satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri',
  },
  Noche: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© CARTO',
  },
};

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
  is_multi_stop: boolean;
  stop_count: number | null;
  order_stops: { sequence: number; address: string; lat: number; lng: number; status: string }[] | null;
  banned: boolean;
  banned_until: string | null;
  suspended: boolean;
}

type ActionType = 'suspend' | 'block' | 'reactivate';

interface ConfirmDialog { user: LiveUser; action: ActionType; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function markerColor(u: LiveUser) {
  if (u.banned || u.suspended) return '#ef4444';
  if (u.en_route) return '#22c55e';
  if (u.online) return '#0ea5e9';
  return '#94a3b8';
}

function statusLabel(u: LiveUser) {
  if (u.banned) return { text: 'Bloqueado', color: '#ef4444' };
  if (u.suspended) return { text: 'Suspendido', color: '#f59e0b' };
  if (!u.online) return { text: 'Offline', color: '#94a3b8' };
  if (u.en_route) return { text: 'En Ruta', color: '#22c55e' };
  return { text: 'Libre', color: '#0ea5e9' };
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function isStale(u: LiveUser): boolean {
  if (!u.updated_at || !u.online) return false;
  return (Date.now() - new Date(u.updated_at).getTime()) > 10 * 60 * 1000;
}

function effectiveColor(u: LiveUser): string {
  if (isStale(u)) return '#6b7280';
  return markerColor(u);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RutaPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const linesRef = useRef<any[]>([]);
  const initRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leafletRef = useRef<any>(null);

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
  const [mapStyle, setMapStyle] = useState<MapStyle>('Map');
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

  // ── Map init (Leaflet — no WebGL) ───────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || initRef.current) return;
    initRef.current = true;
    let mounted = true;

    (async () => {
      // Load Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const L = (await import('leaflet')).default;
      leafletRef.current = L;

      // Fix default icon paths broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mounted || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);
      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

      const tile = L.tileLayer(TILES['Map'].url, { attribution: TILES['Map'].attr, maxZoom: 19 });
      tile.addTo(map);
      tileLayerRef.current = tile;

      mapInst.current = map;

      // Resize on container size change
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapRef.current);

      if (mounted) setMapReady(true);
    })();

    return () => { mounted = false; };
  }, []);

  // ── Switch tile layer when mapStyle changes ─────────────────────────────────

  useEffect(() => {
    const map = mapInst.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); }
    const tile = L.tileLayer(TILES[mapStyle].url, { attribution: TILES[mapStyle].attr, maxZoom: 19 });
    tile.addTo(map);
    tileLayerRef.current = tile;
  }, [mapStyle]);

  // ── Update map markers ──────────────────────────────────────────────────────

  const updateMapMarkers = useCallback((data: LiveUser[]) => {
    const map = mapInst.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    // Clear route lines
    linesRef.current.forEach(l => map.removeLayer(l));
    linesRef.current = [];

    const seen = new Set<string>();

    data.forEach(u => {
      if (u.lat == null || u.lng == null) return;
      seen.add(u.id);
      const color = effectiveColor(u);
      const stale = isStale(u);
      const inits = initials(u.name) || (u.role === 'driver' ? 'D' : 'T');

      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:38px;">
          <div style="
            width:38px;height:38px;border-radius:50%;
            background:${color};color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-weight:800;font-size:13px;
            border:3px solid ${stale ? '#f59e0b' : '#fff'};
            box-shadow:0 3px 12px rgba(0,0,0,0.35);
            cursor:pointer;
            opacity:${stale ? '0.7' : '1'};
          ">${inits}</div>
          ${stale ? '<div style="position:absolute;top:-3px;right:-3px;width:11px;height:11px;background:#f59e0b;border-radius:50%;border:2px solid #fff;"></div>' : ''}
          <div style="
            width:0;height:0;border-left:5px solid transparent;
            border-right:5px solid transparent;border-top:8px solid ${color};
            margin-left:14px;
          "></div>
        </div>`,
        iconSize: [38, 50],
        iconAnchor: [19, 50],
      });

      const st = statusLabel(u);
      const popupHtml = `<div style="min-width:165px;font-family:system-ui,sans-serif;line-height:1.4;">
        <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${u.name}</div>
        <div style="font-size:11px;color:#666;margin-bottom:6px;">${u.email}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:${stale ? '5px' : '0'};">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
          <span style="font-size:11px;font-weight:600;color:${stale ? '#6b7280' : st.color};">${stale ? 'Sin señal' : st.text}</span>
          <span style="font-size:10px;color:#999;">· ${u.role === 'driver' ? 'Conductor' : 'Técnico'}</span>
        </div>
        ${stale ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;">Sin GPS +10 min · ultima: ${timeAgo(u.updated_at)}</div>` : ''}
      </div>`;

      if (markersRef.current.has(u.id)) {
        const m = markersRef.current.get(u.id);
        m.setLatLng([u.lat, u.lng]);
        m.setIcon(icon);
        m.unbindPopup();
        m.bindPopup(popupHtml, { maxWidth: 230 });
      } else {
        const m = L.marker([u.lat, u.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 230 })
          .on('click', () => setSelected(u));
        markersRef.current.set(u.id, m);
      }

      // Route line A → stops → B
      if (u.en_route) {
        const dest = u.delivery || u.job_dest;
        if (dest) {
          // Pin A (origin)
          if (u.pickup) {
            const pinA = L.divIcon({
              className: '',
              html: `<div style="background:#f59e0b;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">A</div>`,
              iconSize: [24, 24], iconAnchor: [12, 24],
            });
            linesRef.current.push(L.marker([u.pickup.lat, u.pickup.lng], { icon: pinA }).addTo(map));
          }

          // Intermediate stops P1..Pn (multi-stop orders)
          const pendingStops = (u.order_stops || [])
            .filter((s) => s.status === 'pending')
            .sort((a, b) => a.sequence - b.sequence);
          pendingStops.forEach((s, idx) => {
            const pinP = L.divIcon({
              className: '',
              html: `<div style="background:#8b5cf6;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">P${idx + 1}</div>`,
              iconSize: [28, 20], iconAnchor: [14, 20],
            });
            linesRef.current.push(L.marker([s.lat, s.lng], { icon: pinP }).addTo(map));
          });

          // Pin B (destination)
          const pinB = L.divIcon({
            className: '',
            html: `<div style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">B</div>`,
            iconSize: [24, 24], iconAnchor: [12, 24],
          });
          linesRef.current.push(L.marker([dest.lat, dest.lng], { icon: pinB }).addTo(map));

          // Real road route: driver → pending stops → destination
          const routeWaypoints: Array<{ lat: number; lng: number }> = [
            { lat: u.lat, lng: u.lng },
            ...pendingStops.map(s => ({ lat: s.lat, lng: s.lng })),
            { lat: dest.lat, lng: dest.lng },
          ];

          // Fetch real road segments asynchronously (same pattern as client tracking)
          ;(async () => {
            try {
              const token = await getToken();
              const segmentCoords: Array<[number, number]> = [];
              let apiSuccess = false;

              for (let i = 0; i < routeWaypoints.length - 1; i++) {
                try {
                  const r = await fetch('/api/maps/directions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ from: routeWaypoints[i], to: routeWaypoints[i + 1] }),
                  });
                  if (!r.ok) throw new Error('segment failed');
                  const json = await r.json();
                  if (json?.coords?.length > 1) {
                    const pts: Array<[number, number]> = json.coords.map((c: { lat: number; lng: number }) => [c.lat, c.lng] as [number, number]);
                    if (segmentCoords.length > 0) pts.shift(); // avoid duplicate junction point
                    segmentCoords.push(...pts);
                    apiSuccess = true;
                  } else {
                    if (segmentCoords.length === 0) segmentCoords.push([routeWaypoints[i].lat, routeWaypoints[i].lng]);
                    segmentCoords.push([routeWaypoints[i + 1].lat, routeWaypoints[i + 1].lng]);
                  }
                } catch {
                  if (segmentCoords.length === 0) segmentCoords.push([routeWaypoints[i].lat, routeWaypoints[i].lng]);
                  segmentCoords.push([routeWaypoints[i + 1].lat, routeWaypoints[i + 1].lng]);
                }
              }

              if (segmentCoords.length > 1 && mapInst.current) {
                const polyline = L.polyline(segmentCoords, {
                  color,
                  weight: apiSuccess ? 4 : 2,
                  opacity: apiSuccess ? 0.85 : 0.7,
                  dashArray: apiSuccess ? undefined : '6 4',
                  lineJoin: 'round',
                  lineCap: 'round',
                }).addTo(mapInst.current);
                linesRef.current.push(polyline);
              }
            } catch {
              // Fallback: straight dashed line if fetch fails
              if (mapInst.current) {
                const fallback = L.polyline(
                  routeWaypoints.map(w => [w.lat, w.lng] as [number, number]),
                  { color, weight: 2, dashArray: '6 4', opacity: 0.7 }
                ).addTo(mapInst.current);
                linesRef.current.push(fallback);
              }
            }
          })();
        }
      }
    });

    // Remove stale markers
    markersRef.current.forEach((m, id) => {
      if (!seen.has(id)) { map.removeLayer(m); markersRef.current.delete(id); }
    });
  }, [getToken]);

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

  useEffect(() => {
    if (mapReady && users.length) updateMapMarkers(users);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, mapReady]);

  // ── Filter ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
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
    if (mapInst.current && u.lat != null && u.lng != null) {
      mapInst.current.flyTo([u.lat, u.lng], 15, { duration: 0.8 });
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
      setActionSuccess(`${u.name}: ${action === 'suspend' ? 'Suspendido' : action === 'block' ? 'Bloqueado' : 'Reactivado'}`);
      setTimeout(() => setActionSuccess(''), 3000);
      const data = await fetchLive();
      if (data && mapReady) updateMapMarkers(data);
      if (selected?.id === u.id) setSelected(data?.find(d => d.id === u.id) ?? null);
    } catch (err: any) {
      alert('Error: ' + String(err?.message || err));
    } finally {
      setActioning(false);
      setConfirm(null);
    }
  }, [getToken, fetchLive, mapReady, updateMapMarkers, selected]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-[#1d2327] -m-6 p-6 rounded-2xl" style={{ height: 'calc(100vh - 88px)' }}>

      {/* ── Page title ── */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </span>
            Ruta en Vivo
          </h1>
          <p className="text-white/35 text-xs mt-0.5">Monitoreo en tiempo real</p>
        </div>
        <button
          onClick={() => fetchLive().then(d => { if (d && mapReady) updateMapMarkers(d); })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Actualizando…' : 'Actualizar'}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 gap-4 min-h-0">

        {/* ── Map column ── */}
        <div className="flex-1 flex flex-col min-h-0 gap-3">

          {/* Map container */}
          <div className="relative flex-1 rounded-2xl overflow-hidden shadow-2xl border border-white/10" style={{ minHeight: 0 }}>
            <div ref={mapRef} className="absolute inset-0" />

            {/* Map style switcher — top right inside map */}
            <div className="absolute top-3 right-3 z-[1000] flex rounded-xl overflow-hidden shadow-lg border border-white/20 backdrop-blur-md">
              {(['Map', 'Satelite', 'Noche'] as MapStyle[]).map(s => (
                <button
                  key={s}
                  onClick={() => setMapStyle(s)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mapStyle === s
                      ? 'bg-white text-gray-900'
                      : 'bg-black/50 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Centrar todos — top left inside map */}
            <button
              onClick={() => {
                const pts = users.filter(u => u.lat != null && u.lng != null);
                if (pts.length && mapInst.current && leafletRef.current) {
                  const L = leafletRef.current;
                  mapInst.current.fitBounds(
                    L.latLngBounds(pts.map((u: LiveUser) => [u.lat!, u.lng!])),
                    { padding: [50, 50] }
                  );
                }
              }}
              title="Centrar todos los conductores"
              className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/60 text-white/80 hover:bg-black/80 border border-white/20 backdrop-blur-md shadow-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
              Centrar
            </button>

            {/* Stats overlay — bottom center inside map */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
              <div className="flex items-center gap-6 bg-white/90 backdrop-blur-md rounded-2xl px-8 py-3 shadow-xl border border-white/50">
                {[
                  { value: stats.total, label: 'TOTAL', color: '#6366f1' },
                  { value: stats.en_route, label: 'EN RUTA', color: '#22c55e' },
                  { value: stats.free, label: 'LIBRES', color: '#0ea5e9' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="text-2xl font-black leading-none" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] font-bold text-gray-400 tracking-widest mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Spinner */}
            {!mapReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-[999]">
                <div className="w-8 h-8 border-3 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="w-72 flex flex-col min-h-0">

          {/* Search + filters */}
          <div className="flex-shrink-0 space-y-2 mb-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por correo…"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'driver', 'tecnico'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    roleFilter === r
                      ? 'bg-white/15 text-white'
                      : 'bg-white/4 text-white/40 hover:bg-white/8'
                  }`}
                >
                  {r === 'all' ? 'Todos' : r === 'driver' ? 'Conductor' : 'Técnico'}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {(['all', 'online', 'en_route', 'offline'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors ${
                    statusFilter === s
                      ? 'bg-white/15 text-white'
                      : 'bg-white/4 text-white/40 hover:bg-white/8'
                  }`}
                >
                  {s === 'all' ? 'Todos' : s === 'online' ? 'Online' : s === 'en_route' ? 'En Ruta' : 'Offline'}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="text-white/25 text-xs">{filtered.length} conductor{filtered.length !== 1 ? 'es' : ''}</span>
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En vivo
              </span>
            </div>
          </div>

          {/* Driver cards list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400">{error}</div>
            )}
            {loading && !users.length && Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}

            {filtered.map(u => {
              const st = statusLabel(u);
              const stale = isStale(u);
              const isSelected = selected?.id === u.id;
              return (
                <div
                  key={u.id}
                  onClick={() => focusUser(u)}
                  className={`rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-400/40 bg-emerald-400/5 shadow-lg'
                      : 'border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {u.profile_photo ? (
                        <Image
                          src={u.profile_photo}
                          alt={u.name}
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-full object-cover"
                          style={{ border: `2px solid ${effectiveColor(u)}` }}
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                          style={{ background: effectiveColor(u) + '33', border: `2px solid ${effectiveColor(u)}` }}
                        >
                          {initials(u.name) || (u.role === 'driver' ? 'D' : 'T')}
                        </div>
                      )}
                      {/* Online dot */}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1d2327]"
                        style={{ background: u.online ? '#22c55e' : '#6b7280' }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-white text-sm font-semibold truncate">{u.name}</span>
                        <span className="text-white/25 text-[10px] flex-shrink-0">{timeAgo(u.updated_at)}</span>
                      </div>
                      <p className="text-white/35 text-[11px] truncate">{u.email}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold"
                          style={{ color: stale ? '#f59e0b' : st.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: stale ? '#f59e0b' : st.color }} />
                          {stale ? 'Sin señal' : st.text}
                        </span>
                        <span className="text-white/20 text-[10px]">·</span>
                        <span className="text-white/35 text-[10px]">
                          {u.role === 'driver' ? 'Conductor' : 'Técnico'}
                          {u.transport_mode ? ` · ${u.transport_mode}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Toggle (visual indicator) */}
                    <div className="flex-shrink-0">
                      <div
                        className="w-9 h-5 rounded-full relative transition-colors"
                        style={{ background: u.online ? '#22c55e' : '#374151' }}
                      >
                        <div
                          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                          style={{ left: u.online ? '18px' : '2px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded: route + action buttons */}
                  {isSelected && (
                    <div className="px-3 pb-3 border-t border-white/8 mt-0 pt-3">
                      {/* Route A→B */}
                      {u.en_route && (
                        <div className="space-y-1.5 mb-3">
                          {u.pickup && (
                            <div className="flex items-start gap-2 text-xs">
                              <span className="w-5 h-5 rounded-md bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">A</span>
                              <span className="text-white/45 leading-tight truncate">{u.pickup.address || `${u.pickup.lat.toFixed(4)}, ${u.pickup.lng.toFixed(4)}`}</span>
                            </div>
                          )}
                          {(u.delivery || u.job_dest) && (
                            <div className="flex items-start gap-2 text-xs">
                              <span className="w-5 h-5 rounded-md bg-red-500/20 text-red-400 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">B</span>
                              <span className="text-white/45 leading-tight truncate">
                                {(u.delivery || u.job_dest)?.address || `${(u.delivery || u.job_dest)?.lat.toFixed(4)}, ${(u.delivery || u.job_dest)?.lng.toFixed(4)}`}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {!u.banned && !u.suspended ? (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); setConfirm({ user: u, action: 'suspend' }); }}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors"
                            >
                              Suspender
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setConfirm({ user: u, action: 'block' }); }}
                              className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                            >
                              Bloquear
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setConfirm({ user: u, action: 'reactivate' }); }}
                            className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && !filtered.length && !error && (
              <div className="flex flex-col items-center py-10 text-white/25">
                <svg className="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <p className="text-xs">Sin conductores</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Success toast ── */}
      {actionSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-5 py-3 rounded-xl text-sm shadow-xl backdrop-blur-sm">
          <span className="inline-flex items-center gap-2">
            <Icon name="check" size={14} />
            {actionSuccess}
          </span>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !actioning && setConfirm(null)}
        >
          <div
            className="bg-[#1e1e2e] border border-white/10 rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4 text-2xl
                ${confirm.action === 'block' ? 'bg-red-500/15' : confirm.action === 'suspend' ? 'bg-yellow-500/15' : 'bg-emerald-500/15'}`}>
                <Icon name={confirm.action === 'block' ? 'x' : confirm.action === 'suspend' ? 'clock' : 'check'} size={22} />
              </div>
              <h3 className="text-white font-bold text-base">
                {confirm.action === 'block' ? 'Bloquear usuario' : confirm.action === 'suspend' ? 'Suspender 30 días' : 'Reactivar usuario'}
              </h3>
              <p className="text-white/50 text-xs mt-1 leading-relaxed">
                {confirm.action === 'block' ? 'Bloqueo permanente. No podrá ingresar.' :
                  confirm.action === 'suspend' ? 'El usuario no podrá operar por 30 días.' :
                    'Se levantarán todas las restricciones.'}
              </p>
              <p className="text-white/70 text-sm mt-3 font-semibold">{confirm.user.name}</p>
              <p className="text-white/35 text-xs">{confirm.user.email}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                disabled={actioning}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeAction(confirm.user, confirm.action)}
                disabled={actioning}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-60
                  ${confirm.action === 'block' ? 'bg-red-600 hover:bg-red-500' :
                    confirm.action === 'suspend' ? 'bg-yellow-600 hover:bg-yellow-500' :
                      'bg-emerald-600 hover:bg-emerald-500'}`}
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
