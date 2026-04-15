'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleInfo {
  label: string | null;    // e.g. '🏍️ Moto'
  brand: string | null;    // e.g. 'Taiga 150'
  plate: string | null;    // e.g. 'ACF 5432'
  photo: string | null;    // profile photo URL
}

const VEHICLE_LABELS: Record<string, string> = {
  moto: '🏍️ Moto', auto: '🚗 Auto', moto_carro: '🛵 Moto Carro', camion: '🚛 Camión',
};

interface OrderDetail {
  id: string;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  accepted_by: string | null;   // driver email
  driver_name: string | null;
  driver_photo: string | null;
  driver_avg_rating: number | null;
  offer: number | null;
  created_at: string;
  type: 'delivery' | 'service';
  // for tecnico jobs
  client_address?: string | null;
  client_lat?: number | null;
  client_lng?: number | null;
  tecnico_email?: string | null;
  tecnico_name?: string | null;
  tecnico_photo?: string | null;
  tecnico_rating?: number | null;
  agreed_price?: number | null;
  service_type?: string | null;
}

interface DriverLoc {
  lat: number;
  lng: number;
  updated_at: string;
}

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

const STATUS_ACTIVE = new Set([
  'accepted', 'assigned', 'picking_up', 'in_transit', 'in_progress',
  'returning', 'driver_returning',
  'en_route', 'arrived', 'completion_pending',
]);

const POLL_INTERVAL = 8_000; // 8s for client tracking (faster than admin 15s)

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtGs(n: number | null) {
  return n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '—';
}

function statusLabel(status: string) {
  const map: Record<string, { text: string; color: string; emoji: string }> = {
    accepted:            { text: 'Conductor asignado',        color: '#0ea5e9', emoji: '🔵' },
    picking_up:          { text: 'Conductor en camino',       color: '#0ea5e9', emoji: '🏃' },
    in_transit:          { text: 'En tránsito',               color: '#22c55e', emoji: '🚀' },
    in_progress:         { text: 'En curso',                  color: '#22c55e', emoji: '⚙️' },
    returning:           { text: 'Devolviendo paquete',       color: '#f59e0b', emoji: '↩️' },
    driver_returning:    { text: 'Conductor regresando',      color: '#f59e0b', emoji: '↩️' },
    en_route:            { text: 'Técnico en camino',         color: '#0ea5e9', emoji: '🔧' },
    arrived:             { text: 'Técnico llegó',             color: '#22c55e', emoji: '📍' },
    completion_pending:  { text: 'Completando servicio',      color: '#a78bfa', emoji: '✅' },
    delivered:           { text: '¡Entregado!',               color: '#22c55e', emoji: '📦' },
    completado:          { text: '¡Servicio completado!',     color: '#22c55e', emoji: '✅' },
    commission_charged:  { text: 'Completado',                color: '#22c55e', emoji: '✅' },
    cancelled:           { text: 'Cancelado',                 color: '#6b7280', emoji: '🚫' },
  };
  return map[status] ?? { text: status, color: '#6b7280', emoji: '❓' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeguimientoPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  // Detect type from URL query ?type=service or default delivery
  const [type, setType] = useState<'delivery' | 'service'>('delivery');

  const mapRef   = useRef<HTMLDivElement>(null);
  const mapInst  = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const initRef  = useRef(false);
  const tileRef  = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef   = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const routeLineRef    = useRef<any>(null);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRouteKey      = useRef<string>('');
  const etaFromApiRef     = useRef<boolean>(false);
  const vehicleFetchedRef = useRef<boolean>(false);
  const fetchVehicleRef   = useRef<((email: string) => void) | null>(null);

  const [order,    setOrder]    = useState<OrderDetail | null>(null);
  const [vehicle,  setVehicle]  = useState<VehicleInfo | null>(null);
  const [driverLoc, setDriverLoc] = useState<DriverLoc | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('Map');
  const [loading,  setLoading]  = useState(true);
  const [eta,      setEta]      = useState<{ distKm: number; etaMin: number; fromApi: boolean } | null>(null);
  const [error,    setError]    = useState('');

  // ── Read type from query param ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('type') === 'service') setType('service');
    }
  }, []);

  // ── Auth token ────────────────────────────────────────────────────────────
  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }, []);

  // ── Fetch driver/tecnico vehicle info + photo (called once) ────────────────
  const fetchVehicle = useCallback(async (driverEmail: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/driver-profile?email=${encodeURIComponent(driverEmail)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const p = json?.profile;
      if (!p) return;
      const vmode = p.transport_mode || '';
      let brand = '';
      try { const vd = JSON.parse(p.vehicle_type || '{}'); brand = vd[vmode]?.marca || ''; } catch { brand = p.vehicle_type || ''; }
      setVehicle({
        label: VEHICLE_LABELS[vmode] || vmode || null,
        brand: brand || null,
        plate: p.license_plate || null,
        photo: p.profile_photo || null,
      });
    } catch { /* silent */ }
  }, [getToken]);

  // keep ref in sync so fetchOrder can call it without being a dep
  useEffect(() => { fetchVehicleRef.current = fetchVehicle; }, [fetchVehicle]);

  // ── Fetch order details ───────────────────────────────────────────────────
  const fetchOrder = useCallback(async () => {
    try {
      const token = await getToken();
      if (type === 'service') {
        const res = await fetch(`/api/tecnico/jobs?job_id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        const job = json.data?.[0] ?? json;
        if (!job?.id) { setError('Trabajo no encontrado'); return; }
        const mapped: OrderDetail = {
          id: job.id,
          status: job.status,
          pickup_address: null,
          delivery_address: null,
          pickup_lat: null,
          pickup_lng: null,
          delivery_lat: job.client_lat ?? null,
          delivery_lng: job.client_lng ?? null,
          accepted_by: job.tecnico_email ?? null,
          driver_name: job.tecnico_name ?? null,
          driver_photo: job.tecnico_photo ?? null,
          driver_avg_rating: job.tecnico_rating ?? null,
          offer: job.agreed_price ?? null,
          created_at: job.created_at,
          type: 'service',
          client_address: job.client_address,
          tecnico_email: job.tecnico_email,
          service_type: job.service_type,
        };
        setOrder(mapped);
        if (mapped.accepted_by && !vehicleFetchedRef.current) {
          vehicleFetchedRef.current = true;
          fetchVehicleRef.current?.(mapped.accepted_by);
        }
      } else {
        const res = await fetch(`/api/orders?id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setError('Pedido no encontrado'); return; }
        const ord = await res.json();
        if (!ord?.id) { setError('Pedido no encontrado'); return; }
        const mapped: OrderDetail = { ...ord, type: 'delivery' };
        setOrder(mapped);
        if (mapped.accepted_by && !vehicleFetchedRef.current) {
          vehicleFetchedRef.current = true;
          fetchVehicleRef.current?.(mapped.accepted_by);
        }
      }
    } catch {
      setError('Error cargando el pedido');
    } finally {
      setLoading(false);
    }
  }, [id, type, getToken]);

  // ── Fetch driver location ─────────────────────────────────────────────────
  const fetchDriverLoc = useCallback(async () => {
    try {
      const token = await getToken();
      const query = type === 'service' ? `job_id=${id}` : `order_id=${id}`;
      const res = await fetch(`/api/driver-location?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const loc = await res.json();
      if (loc?.lat != null) {
        setDriverLoc(loc);
        return loc;
      }
    } catch { /* silent */ }
    return null;
  }, [id, type, getToken]);

  // ── Map init (Leaflet, no WebGL) ──────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || initRef.current) return;
    initRef.current = true;
    let mounted = true;

    (async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const L = (await import('leaflet')).default;
      leafletRef.current = L;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mounted || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [-25.2637, -57.5759],
        zoom: 13,
        zoomControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const tile = L.tileLayer(TILES['Map'].url, { attribution: TILES['Map'].attr, maxZoom: 19 });
      tile.addTo(map);
      tileRef.current = tile;
      mapInst.current = map;

      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapRef.current!);

      if (mounted) setMapReady(true);
    })();

    return () => { mounted = false; };
  }, []);

  // ── Swap tile layer ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const tile = L.tileLayer(TILES[mapStyle].url, { attribution: TILES[mapStyle].attr, maxZoom: 19 });
    tile.addTo(map); tileRef.current = tile;
  }, [mapStyle]);

  // ── Update map when order + location change ───────────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    const L   = leafletRef.current;
    if (!map || !L || !order) return;

    const destLat = order.delivery_lat ?? order.client_lat ?? null;
    const destLng = order.delivery_lng ?? order.client_lng ?? null;

    // ── Destination marker (B) ──
    if (destLat != null && destLng != null) {
      const pinB = L.divIcon({
        className: '',
        html: `<div style="background:#ef4444;color:#fff;font-size:12px;font-weight:800;padding:4px 9px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:nowrap;">📍 B</div>`,
        iconSize: [36, 28], iconAnchor: [18, 28],
      });
      if (destMarkerRef.current) { map.removeLayer(destMarkerRef.current); }
      destMarkerRef.current = L.marker([destLat, destLng], { icon: pinB }).addTo(map);
    }

    // ── Pickup marker (A) ──
    if (order.pickup_lat != null && order.pickup_lng != null) {
      const pinA = L.divIcon({
        className: '',
        html: `<div style="background:#f59e0b;color:#fff;font-size:12px;font-weight:800;padding:4px 9px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">📦 A</div>`,
        iconSize: [36, 28], iconAnchor: [18, 28],
      });
      if (pickupMarkerRef.current) { map.removeLayer(pickupMarkerRef.current); }
      pickupMarkerRef.current = L.marker([order.pickup_lat, order.pickup_lng], { icon: pinA }).addTo(map);
    }

    // ── Driver marker (moving) ──
    if (driverLoc) {
      const name = order.driver_name ?? (type === 'service' ? 'Técnico' : 'Conductor');
      const inits = name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
      const color = type === 'service' ? '#8b5cf6' : '#22c55e';
      const photo = vehicle?.photo ?? order.driver_photo ?? null;

      const innerHtml = photo
        ? `<img src="${photo}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />`
        : `<div style="width:42px;height:42px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;">${inits || (type === 'service' ? '🔧' : '🚗')}</div>`;

      const driverIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:42px;">
          <div style="width:42px;height:42px;border-radius:50%;border:3px solid ${color};box-shadow:0 3px 14px rgba(0,0,0,0.4);overflow:hidden;">${innerHtml}</div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;
            border-top:9px solid ${color};margin-left:16px;"></div>
        </div>`,
        iconSize: [42, 54],
        iconAnchor: [21, 54],
      });

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLoc.lat, driverLoc.lng]);
        driverMarkerRef.current.setIcon(driverIcon);
      } else {
        driverMarkerRef.current = L.marker([driverLoc.lat, driverLoc.lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup(`<b>${name}</b>`);
      }

      // ── Route: real roads via /api/maps/directions, fallback straight line ──
      if (destLat != null && destLng != null) {
        const routeKey = `${driverLoc.lat.toFixed(4)},${driverLoc.lng.toFixed(4)}->${destLat.toFixed(4)},${destLng.toFixed(4)}`;
        if (routeKey !== lastRouteKey.current) {
          lastRouteKey.current = routeKey;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getToken().then(token => fetch('/api/maps/directions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ from: { lat: driverLoc.lat, lng: driverLoc.lng }, to: { lat: destLat, lng: destLng } }),
          })).then(r => r.ok ? r.json() : null).then((json: any) => {
            if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
            if (json?.coords?.length > 1) {
              routeLineRef.current = L.polyline(
                json.coords.map((c: { lat: number; lng: number }) => [c.lat, c.lng] as [number, number]),
                { color, weight: 4, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }
              ).addTo(map);
              if (json.duration_seconds) {
                const etaMin = Math.max(1, Math.round(json.duration_seconds / 60));
                const distKm = json.distance_meters ? json.distance_meters / 1000 : haversineKm(driverLoc.lat, driverLoc.lng, destLat, destLng);
                etaFromApiRef.current = true;
                setEta({ distKm, etaMin, fromApi: true });
              }
            } else {
              // Fallback: straight dashed line
              routeLineRef.current = L.polyline(
                [[driverLoc.lat, driverLoc.lng], [destLat, destLng]],
                { color, weight: 2.5, dashArray: '8 5', opacity: 0.75 }
              ).addTo(map);
              if (!etaFromApiRef.current) {
                const distKm = haversineKm(driverLoc.lat, driverLoc.lng, destLat, destLng);
                setEta({ distKm, etaMin: Math.max(1, Math.round(distKm * 3)), fromApi: false });
              }
            }
          }).catch(() => {
            // Fallback on any error
            if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
            routeLineRef.current = L.polyline(
              [[driverLoc.lat, driverLoc.lng], [destLat, destLng]],
              { color, weight: 2.5, dashArray: '8 5', opacity: 0.75 }
            ).addTo(map);
            if (!etaFromApiRef.current) {
              const distKm = haversineKm(driverLoc.lat, driverLoc.lng, destLat, destLng);
              setEta({ distKm, etaMin: Math.max(1, Math.round(distKm * 3)), fromApi: false });
            }
          });
        }

        // Live haversine ETA while waiting for real route (only if no API eta yet)
        if (!etaFromApiRef.current) {
          const distKm = haversineKm(driverLoc.lat, driverLoc.lng, destLat, destLng);
          setEta({ distKm, etaMin: Math.max(1, Math.round(distKm * 3)), fromApi: false });
        }
      }

      // ── Fit bounds to show driver + destination ──
      const points: [number, number][] = [[driverLoc.lat, driverLoc.lng]];
      if (destLat != null && destLng != null) points.push([destLat, destLng]);
      if (order.pickup_lat != null && order.pickup_lng != null) points.push([order.pickup_lat, order.pickup_lng]);
      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
      } else {
        map.setView([driverLoc.lat, driverLoc.lng], 15);
      }
    }
  }, [order, driverLoc, vehicle, mapReady, type, getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (id) {
      fetchOrder();
      fetchDriverLoc();
    }
  }, [id, fetchOrder, fetchDriverLoc]);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !order) return;
    const isActive = STATUS_ACTIVE.has(order.status);
    if (!isActive) return;

    intervalRef.current = setInterval(() => {
      fetchDriverLoc();
      fetchOrder(); // also refresh order status
    }, POLL_INTERVAL);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [mapReady, order, fetchDriverLoc, fetchOrder]);

  const workerName   = order?.driver_name ?? (type === 'service' ? 'Técnico' : 'Conductor');
  const workerPhoto  = vehicle?.photo ?? order?.driver_photo ?? null;
  const workerRating = order?.driver_avg_rating ?? null;
  const st           = order ? statusLabel(order.status) : null;
  const isActive     = order ? STATUS_ACTIVE.has(order.status) : false;
  const priceVal     = order?.offer ?? order?.agreed_price ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0f0f1a', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>
            {type === 'service' ? 'Seguimiento del técnico' : 'Seguimiento del envío'}
          </div>
          {order && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: 1 }}>
              #{id.slice(0, 8).toUpperCase()}
            </div>
          )}
        </div>
        {st && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 10px', flexShrink: 0 }}>
            <span style={{ fontSize: '0.8rem' }}>{st.emoji}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: st.color }}>{st.text}</span>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />

        {/* style switcher */}
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, display: 'flex', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)' }}>
          {(['Map', 'Satelite', 'Noche'] as MapStyle[]).map(s => (
            <button key={s} onClick={() => setMapStyle(s)} style={{
              padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700,
              background: mapStyle === s ? '#fff' : 'rgba(0,0,0,0.65)',
              color: mapStyle === s ? '#111' : 'rgba(255,255,255,0.7)',
              transition: 'background 0.15s',
            }}>{s}</button>
          ))}
        </div>

        {/* ETA badge — center top */}
        {eta && isActive && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
            borderRadius: 14, padding: '8px 18px', display: 'flex', gap: 18, alignItems: 'center',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#22c55e', fontWeight: 900, fontSize: '1.2rem', lineHeight: 1 }}>{eta.etaMin}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', marginTop: 2 }}>MIN</div>
            </div>
            <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#0ea5e9', fontWeight: 900, fontSize: '1.2rem', lineHeight: 1 }}>
                {eta.distKm < 1 ? `${Math.round(eta.distKm * 1000)}m` : `${eta.distKm.toFixed(1)}km`}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', marginTop: 2 }}>DISTANCIA</div>
            </div>
          </div>
        )}

        {/* Spinner */}
        {!mapReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a', zIndex: 999 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(34,197,94,0.2)', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* No GPS signal */}
        {mapReady && !driverLoc && isActive && !loading && (
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '8px 16px', border: '1px solid rgba(245,158,11,0.3)' }}>
            <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>📡 Esperando señal GPS…</span>
          </div>
        )}
      </div>

      {/* ── Bottom info card ── */}
      {loading ? (
        <div style={{ flexShrink: 0, height: 130, background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>Cargando…</div>
        </div>
      ) : error ? (
        <div style={{ flexShrink: 0, padding: 16, background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.15)', textAlign: 'center', color: '#f87171', fontSize: '0.85rem' }}>
          {error} — <Link href="/cliente" style={{ color: '#0ea5e9' }}>Volver al inicio</Link>
        </div>
      ) : order ? (
        <div style={{ flexShrink: 0, background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            {/* Worker avatar */}
            <div style={{ flexShrink: 0 }}>
              {workerPhoto ? (
                <Image
                  src={workerPhoto}
                  alt={workerName}
                  width={52}
                  height={52}
                  unoptimized
                  style={{ borderRadius: '50%', objectFit: 'cover', border: `3px solid ${type === 'service' ? '#8b5cf6' : '#22c55e'}` }}
                />
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', background: type === 'service' ? 'rgba(139,92,246,0.15)' : 'rgba(34,197,94,0.15)',
                  border: `3px solid ${type === 'service' ? '#8b5cf6' : '#22c55e'}`,
                }}>
                  {type === 'service' ? '🔧' : '🚗'}
                </div>
              )}
            </div>

            {/* Worker info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {workerName}
              </div>
              {workerRating != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                  {'★★★★★'.split('').map((_, i) => (
                    <span key={i} style={{ color: i < Math.round(Number(workerRating)) ? '#F5C518' : 'rgba(255,255,255,0.2)', fontSize: '0.82rem' }}>★</span>
                  ))}
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginLeft: 3 }}>{Number(workerRating).toFixed(1)}</span>
                </div>
              )}
              {/* Address */}
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {type === 'service'
                  ? (order.client_address ?? order.delivery_address ?? '—')
                  : (order.delivery_address ?? '—')}
              </div>
            </div>

            {/* Price */}
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ color: '#22c55e', fontWeight: 900, fontSize: '1.1rem' }}>
                {fmtGs(priceVal)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', marginTop: 2 }}>acordado</div>
            </div>
          </div>

          {/* Vehicle chips */}
          {vehicle && (vehicle.label || vehicle.brand || vehicle.plate) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {vehicle.label && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, padding: '4px 10px', fontSize: '0.73rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                  {vehicle.label}
                </span>
              )}
              {vehicle.brand && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, padding: '4px 10px', fontSize: '0.73rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                  🏷️ {vehicle.brand}
                </span>
              )}
              {vehicle.plate && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(59,130,246,0.15)', borderRadius: 99, padding: '4px 12px', fontSize: '0.73rem', color: '#93c5fd', fontWeight: 800, border: '1px solid rgba(59,130,246,0.3)', letterSpacing: '0.04em' }}>
                  🪪 {vehicle.plate}
                </span>
              )}
            </div>
          )}

          {/* Address row A → B (delivery only) */}
          {type === 'delivery' && order.pickup_address && order.delivery_address && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 5, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>A</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.pickup_address}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 5, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>B</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.delivery_address}</span>
              </div>
            </div>
          )}

          {/* Back link */}
          <Link
            href="/cliente"
            style={{ display: 'block', marginTop: 14, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textDecoration: 'none' }}
          >
            ← Volver al inicio
          </Link>
        </div>
      ) : null}
    </div>
  );
}
