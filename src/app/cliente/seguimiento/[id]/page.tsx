'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { haversineKm } from '@/lib/geo';
import { Icon, type IconName } from '@/components/Icon';
import { getStatusTone } from '@/lib/statusPalette';
import ChatModal from '@/components/ChatModal';
import { playMessageAlert } from '@/lib/audio';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleInfo {
  label: string | null;    // e.g. 'Moto'
  brand: string | null;    // e.g. 'Taiga 150'
  plate: string | null;    // e.g. 'ACF 5432'
  photo: string | null;    // profile photo URL
}

const VEHICLE_LABELS: Record<string, string> = {
  moto: 'Moto', auto: 'Auto', moto_carro: 'Moto Carro', camion: 'Camion',
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
  extra_charge?: number | null;
  extra_reason?: string | null;
  // multi-stop
  order_stops?: Array<{ sequence: number; address: string; lat?: number | null; lng?: number | null; status?: string; delivery_pin?: string | null }> | null;
  // anti-fraud PINs (envio orders only)
  order_type?: string | null;
  pickup_code?: string | null;
  delivery_pin?: string | null;
  client_email?: string | null;
  is_multi_stop?: boolean | null;
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
  'accepted', 'assigned', 'picking_up', 'at_pickup', 'in_transit', 'in_progress',
  'returning', 'driver_returning',
  'en_route', 'arrived', 'completion_pending',
]);

const POLL_INTERVAL = 8_000; // 8s for client tracking (faster than admin 15s)

function fmtGs(n: number | null) {
  return n != null ? `${Number(n).toLocaleString('es-PY')} Gs` : '—';
}

function statusLabel(status: string) {
  const map: Record<string, { text: string; icon: IconName }> = {
    accepted: { text: 'Conductor asignado', icon: 'check' },
    picking_up: { text: 'Conductor en camino', icon: 'truck' },
    in_transit: { text: 'En transito', icon: 'truck' },
    in_progress: { text: 'En curso', icon: 'tool' },
    returning: { text: 'Devolviendo paquete', icon: 'refresh' },
    driver_returning: { text: 'Conductor regresando', icon: 'refresh' },
    en_route: { text: 'Tecnico en camino', icon: 'tool' },
    arrived: { text: 'Tecnico llego', icon: 'map-pin' },
    completion_pending: { text: 'Completando servicio', icon: 'clock' },
    delivered: { text: 'Entregado', icon: 'package' },
    completado: { text: 'Servicio completado', icon: 'check' },
    commission_charged: { text: 'Completado', icon: 'check' },
    cancelled: { text: 'Cancelado', icon: 'x' },
  };
  const tone = getStatusTone(status);
  const entry = map[status] ?? { text: status, icon: 'exclamation' };
  return { ...entry, color: tone.color };
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
  const stopMarkersRef  = useRef<any[]>([]);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const broadcastChRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedDriverRef = useRef<string>('');
  const lastRouteKey      = useRef<string>('');
  const etaFromApiRef     = useRef<boolean>(false);
  const vehicleFetchedRef = useRef<boolean>(false);
  const fetchVehicleRef   = useRef<((email: string) => void) | null>(null);
  const vehicleRef        = useRef<VehicleInfo | null>(null);

  const [order,    setOrder]    = useState<OrderDetail | null>(null);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [vehicle,  setVehicle]  = useState<VehicleInfo | null>(null);
  const [driverLoc, setDriverLoc] = useState<DriverLoc | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('Map');
  const [loading,  setLoading]  = useState(true);
  const [eta,      setEta]      = useState<{ distKm: number; etaMin: number; fromApi: boolean } | null>(null);
  const [routeTotals, setRouteTotals] = useState<{ distKm: number; etaMin: number; stops: number } | null>(null);
  const [error,    setError]    = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [myEmail,  setMyEmail]  = useState('');
  const [pinsOpen, setPinsOpen] = useState(false);
  const [myName,   setMyName]   = useState<string | null>(null);
  const [chatToast, setChatToast] = useState<{ text: string; from: string | null } | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Read type + chat from query param, get session ────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('type') === 'service') setType('service');
      if (q.get('chat') === '1') setChatOpen(true);
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setMyEmail(session.user.email ?? '');
        setMyName(session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null);
      }
    });
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
      vehicleRef.current = {
        label: VEHICLE_LABELS[vmode] || vmode || null,
        brand: brand || null,
        plate: p.license_plate || null,
        photo: p.profile_photo || null,
      };
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
          extra_charge: job.extra_charge ?? null,
          extra_reason: job.extra_reason ?? null,
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

    try {

    const destLat = order.delivery_lat ?? order.client_lat ?? null;
    const destLng = order.delivery_lng ?? order.client_lng ?? null;

    // ── Destination marker (B) ──
    if (destLat != null && destLng != null) {
      const pinB = L.divIcon({
        className: '',
        html: `<div style="background:#ef4444;color:#fff;font-size:12px;font-weight:800;padding:4px 9px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:nowrap;">B</div>`,
        iconSize: [36, 28], iconAnchor: [18, 28],
      });
      if (destMarkerRef.current) { map.removeLayer(destMarkerRef.current); }
      destMarkerRef.current = L.marker([destLat, destLng], { icon: pinB }).addTo(map);
    }

    // ── Pickup marker (A) ──
    if (order.pickup_lat != null && order.pickup_lng != null) {
      const pinA = L.divIcon({
        className: '',
        html: `<div style="background:#f59e0b;color:#fff;font-size:12px;font-weight:800;padding:4px 9px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">A</div>`,
        iconSize: [36, 28], iconAnchor: [18, 28],
      });
      if (pickupMarkerRef.current) { map.removeLayer(pickupMarkerRef.current); }
      pickupMarkerRef.current = L.marker([order.pickup_lat, order.pickup_lng], { icon: pinA }).addTo(map);
    }

    // ── Stop markers (P1, P2 ...) ──
    stopMarkersRef.current.forEach(m => { try { map.removeLayer(m); } catch { /* ignore */ } });
    stopMarkersRef.current = [];
    if (order.order_stops && order.order_stops.length > 0) {
      const colors = ['#f59e0b','#fb923c','#facc15','#a3e635','#34d399','#22d3ee','#818cf8','#e879f9'];
      const sorted = [...order.order_stops].sort((a, b) => a.sequence - b.sequence);
      sorted.forEach((s, i) => {
        if (s.lat != null && s.lng != null) {
          const isDone = s.status === 'delivered';
          const isFailed = s.status === 'failed';
          const bg = isDone ? '#22c55e' : isFailed ? '#ef4444' : (colors[i % colors.length]);
          const icon = isDone ? '✓' : isFailed ? '✗' : `${s.sequence}`;
          const pinP = L.divIcon({
            className: '',
            html: `<div style="background:${bg};color:#111;font-size:11px;font-weight:900;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.6);">${icon}</div>`,
            iconSize: [26, 26], iconAnchor: [13, 26],
          });
          const marker = L.marker([Number(s.lat), Number(s.lng)], { icon: pinP })
            .addTo(map)
            .bindPopup(`<b>Parada ${s.sequence}</b><br/>${s.address}`);
          stopMarkersRef.current.push(marker);
        }
      });
    }

    // ── Driver marker (moving) ──
    if (driverLoc) {
      const dLat = Number(driverLoc.lat);
      const dLng = Number(driverLoc.lng);
      const name = order.driver_name ?? (type === 'service' ? 'Técnico' : 'Conductor');
      const inits = name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('');
      const color = type === 'service' ? '#8b5cf6' : '#22c55e';
      const photo = vehicleRef.current?.photo ?? order.driver_photo ?? null;

      const innerHtml = photo
        ? `<img src="${photo}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />`
        : `<div style="width:42px;height:42px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;">${inits || (type === 'service' ? 'T' : 'D')}</div>`;

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
        driverMarkerRef.current.setLatLng([dLat, dLng]);
        driverMarkerRef.current.setIcon(driverIcon);
      } else {
        driverMarkerRef.current = L.marker([dLat, dLng], { icon: driverIcon })
          .addTo(map)
          .bindPopup(`<b>${name}</b>`);
      }

      // ── Route: optimized multi-stop via /api/maps/directions segments ──
      if (destLat != null && destLng != null) {
        const nDestLat = Number(destLat);
        const nDestLng = Number(destLng);

        // Build ordered waypoints for route drawing:
        // Multi-stop: driver → pending stops only (skip delivered & failed — no dest duplication)
        // Single-stop (no order_stops): driver → delivery destination
        const pendingStops = order.order_stops
          ? [...order.order_stops]
              .filter(s => s.status === 'pending' && s.lat != null && s.lng != null)
              .sort((a, b) => a.sequence - b.sequence)
          : [];

        const hasOrderStops = (order.order_stops?.length ?? 0) > 0;
        const waypoints: Array<{ lat: number; lng: number }> = [
          { lat: dLat, lng: dLng },
          ...pendingStops.map(s => ({ lat: Number(s.lat), lng: Number(s.lng) })),
          // Single-stop legacy: append delivery dest (it is NOT already covered by order_stops)
          ...(hasOrderStops ? [] : [{ lat: nDestLat, lng: nDestLng }]),
        ];

        // Route key: driver position (low-res) + stop statuses + dest
        const routeKey = waypoints.map(w => `${w.lat.toFixed(3)},${w.lng.toFixed(3)}`).join('|');
        if (routeKey !== lastRouteKey.current) {
          lastRouteKey.current = routeKey;

        getToken().then(async token => {
            // Fetch each segment in sequence, collect all coord arrays
            const segmentCoords: Array<[number, number]> = [];
            let totalDurationSec = 0;
            let totalDistanceM = 0;
            let firstSegDurationSec = 0;
            let firstSegDistanceM = 0;
            let apiSuccess = false;

            for (let i = 0; i < waypoints.length - 1; i++) {
              try {
                const r = await fetch('/api/maps/directions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ from: waypoints[i], to: waypoints[i + 1] }),
                });
                if (!r.ok) throw new Error('segment failed');
                const json = await r.json();
                if (json?.coords?.length > 1) {
                  // Avoid duplicating the junction point between segments
                  const pts: Array<[number, number]> = json.coords.map((c: { lat: number; lng: number }) => [Number(c.lat), Number(c.lng)] as [number, number]);
                  if (segmentCoords.length > 0) pts.shift(); // remove overlap
                  segmentCoords.push(...pts);
                  const segDur = Number(json.duration_seconds || 0);
                  const segDist = Number(json.distance_meters || 0);
                  if (segDur) totalDurationSec += segDur;
                  if (segDist) totalDistanceM += segDist;
                  if (i === 0) { firstSegDurationSec = segDur; firstSegDistanceM = segDist; }
                  apiSuccess = true;
                } else {
                  // Straight line segment fallback
                  if (segmentCoords.length > 0) {
                    segmentCoords.push([waypoints[i + 1].lat, waypoints[i + 1].lng]);
                  } else {
                    segmentCoords.push([waypoints[i].lat, waypoints[i].lng]);
                    segmentCoords.push([waypoints[i + 1].lat, waypoints[i + 1].lng]);
                  }
                }
              } catch {
                // Straight line segment on error
                if (segmentCoords.length > 0) {
                  segmentCoords.push([waypoints[i + 1].lat, waypoints[i + 1].lng]);
                } else {
                  segmentCoords.push([waypoints[i].lat, waypoints[i].lng]);
                  segmentCoords.push([waypoints[i + 1].lat, waypoints[i + 1].lng]);
                }
              }
            }

            // Draw combined polyline
            if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
            if (segmentCoords.length > 1) {
              routeLineRef.current = L.polyline(segmentCoords, {
                color, weight: apiSuccess ? 4 : 2.5,
                opacity: apiSuccess ? 0.88 : 0.7,
                dashArray: apiSuccess ? undefined : '8 5',
                lineJoin: 'round', lineCap: 'round',
              }).addTo(map);
            }

            // ETA = first segment only (driver → next pending stop / final dest)
            // This matches what the home card shows: "time until driver arrives at you"
            if (apiSuccess) {
              // Per-segment durations and distances tracked per-fetch — use segment 0 result
              // We re-fetch segment 0 result already resolved when i=0 above.
              // Best approach: track first-segment stats separately.
            }

            // Collect first-segment result and total separately
            // Re-fetch segment 0 for ETA, we already have totals.
            // Actually: segments were fetched in order; firstSegDuration set below.
            // NOTE: We set ETA from the first segment fetch result inline — see firstSegDuration tracking.

            // ETA badge = first segment (driver → next stop)
            if (firstSegDurationSec > 0) {
              const etaMin = Math.max(1, Math.round(firstSegDurationSec / 60));
              // waypoints[1] may not exist when all stops are resolved — fall back to dest coords
              const distKm = firstSegDistanceM > 0 ? firstSegDistanceM / 1000 : haversineKm(dLat, dLng, waypoints[1]?.lat ?? nDestLat, waypoints[1]?.lng ?? nDestLng);
              etaFromApiRef.current = true;
              setEta({ distKm, etaMin, fromApi: true });
            } else if (!etaFromApiRef.current && waypoints.length >= 2) {
              const distKm = haversineKm(dLat, dLng, waypoints[1].lat, waypoints[1].lng);
              setEta({ distKm, etaMin: Math.max(1, Math.round(distKm * 2)), fromApi: false });
            }

            // Total route stats (multi-stop summary)
            if (apiSuccess && totalDurationSec > 0 && waypoints.length > 2) {
              setRouteTotals({
                distKm: totalDistanceM > 0 ? totalDistanceM / 1000 : haversineKm(dLat, dLng, nDestLat, nDestLng),
                etaMin: Math.max(1, Math.round(totalDurationSec / 60)),
                stops: pendingStops.length,
              });
            } else {
              setRouteTotals(null);
            }
          }).catch(() => {
            if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
            routeLineRef.current = L.polyline(
              waypoints.map(w => [w.lat, w.lng] as [number, number]),
              { color, weight: 2.5, dashArray: '8 5', opacity: 0.75 }
            ).addTo(map);
            if (!etaFromApiRef.current) {
              const distKm = haversineKm(dLat, dLng, nDestLat, nDestLng);
              setEta({ distKm, etaMin: Math.max(1, Math.round(distKm * 2)), fromApi: false });
            }
          });
        }
      }

      // ── Fit bounds ──
      const points: [number, number][] = [[dLat, dLng]];
      if (destLat != null && destLng != null) points.push([Number(destLat), Number(destLng)]);
      if (order.pickup_lat != null && order.pickup_lng != null) points.push([Number(order.pickup_lat), Number(order.pickup_lng)]);
      // include stop coords in bounds
      if (order.order_stops) {
        order.order_stops.forEach(s => { if (s.lat != null && s.lng != null) points.push([Number(s.lat), Number(s.lng)]); });
      }
      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
      } else {
        map.setView([dLat, dLng], 15);
      }
    }
    } catch (err) {
      console.error('[tracking] map effect error:', err);
    }

  }, [order, driverLoc, mapReady, type, getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Haversine ETA (separate from map, no loop risk) ─────────────────────
  useEffect(() => {
    if (!driverLoc || etaFromApiRef.current) return;
    const order_ = order;
    if (!order_) return;
    const destLat = Number(order_.delivery_lat ?? order_.client_lat ?? 0);
    const destLng = Number(order_.delivery_lng ?? order_.client_lng ?? 0);
    if (!destLat || !destLng) return;
    const dLat = Number(driverLoc.lat);
    const dLng = Number(driverLoc.lng);
    const distKm = haversineKm(dLat, dLng, destLat, destLng);
    setEta({ distKm, etaMin: Math.max(1, Math.round(distKm * 2)), fromApi: false });
  }, [driverLoc, order]); // eslint-disable-line react-hooks/exhaustive-deps
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

    // Only refresh order STATUS — also poll driver location as fallback for broadcast failures
    intervalRef.current = setInterval(() => {
      fetchOrder();
      fetchDriverLoc();
    }, POLL_INTERVAL);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [mapReady, order, fetchOrder, fetchDriverLoc]);

  // ── Supabase Broadcast subscription for real-time driver location ─────────
  // Listens to the channel `loc:driver:<email>` that the driver app broadcasts to.
  // Zero DB reads — pure websocket. Falls back to DB on first load via fetchDriverLoc.
  useEffect(() => {
    const driverEmail = order?.accepted_by;
    if (!driverEmail) return;
    if (!STATUS_ACTIVE.has(order?.status ?? '')) return;
    // Only subscribe once per driver
    if (subscribedDriverRef.current === driverEmail) return;
    subscribedDriverRef.current = driverEmail;

    // Clean up any previous channel
    if (broadcastChRef.current) {
      supabase.removeChannel(broadcastChRef.current);
      broadcastChRef.current = null;
    }

    const ch = supabase.channel(`loc:driver:${driverEmail}`, {
      config: { broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'location' }, ({ payload }) => {
      if (payload?.lat != null && payload?.lng != null) {
        setDriverLoc({ lat: Number(payload.lat), lng: Number(payload.lng), updated_at: new Date().toISOString() });
      }
    }).subscribe((status) => {
      // Fetch location immediately when subscription is established
      if (status === 'SUBSCRIBED') {
        fetchDriverLoc();
      }
    });

    broadcastChRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      broadcastChRef.current = null;
      subscribedDriverRef.current = '';
    };
  }, [order?.accepted_by, order?.status, fetchDriverLoc]);

  // ── Realtime: incoming chat messages → show toast + unread badge ────────────
  useEffect(() => {
    if (!myEmail || !id || !STATUS_ACTIVE.has(order?.status ?? '')) return;
    const filter = type === 'service' ? `job_id=eq.${id}` : `order_id=eq.${id}`;
    const ch = supabase
      .channel(`seguimiento-chat-${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages', filter,
      } as never, (payload: { new: { sender_email: string; sender_name: string | null; content: string } }) => {
        const msg = payload.new;
        if (msg.sender_email?.toLowerCase() === myEmail.toLowerCase()) return;
        if (chatOpen) return; // modal is open, messages load there
        setChatUnread(prev => prev + 1);
        playMessageAlert();
        if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
        setChatToast({ from: msg.sender_name, text: msg.content.slice(0, 70) });
        chatToastTimerRef.current = setTimeout(() => setChatToast(null), 6000);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail, id, type, order?.status]);
  const workerName   = order?.driver_name ?? (type === 'service' ? 'Técnico' : 'Conductor');
  const workerPhoto  = vehicle?.photo ?? order?.driver_photo ?? null;
  const workerRating = order?.driver_avg_rating ?? null;
  const st           = order ? statusLabel(order.status) : null;
  const isActive     = order ? STATUS_ACTIVE.has(order.status) : false;
  const PICKUP_VALIDATED_STATUSES = ['in_transit', 'delivered', 'failed', 'returning', 'returned', 'driver_returning', 'return_delivered', 'return_rejected', 'driver_cancelled', 'client_confirmed'];
  const pickupValidated  = !!(order?.pickup_code  && PICKUP_VALIDATED_STATUSES.includes(order.status));
  const deliveryValidated = !!(order?.delivery_pin && ['delivered', 'client_confirmed'].includes(order.status));
  const priceVal     = order?.offer ?? order?.agreed_price ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--background)', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--header-bg)', borderBottom: '1px solid var(--header-border)' }}>
        <button
          onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--ghost-btn)', color: 'var(--ghost-btn-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.95rem' }}>
            {type === 'service' ? 'Seguimiento del técnico' : 'Seguimiento del envío'}
          </div>
          {order && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 1 }}>
              #{id.slice(0, 8).toUpperCase()}
            </div>
          )}
        </div>
        {st && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '4px 10px', flexShrink: 0 }}>
            <Icon name={st.icon} size={12} color={st.color} />
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

        {/* ETA badge — bottom-left (Bolt/Uber style) */}
        {eta && isActive && (
          <div style={{
            position: 'absolute', bottom: 16, left: 12,
            zIndex: 1000, background: 'rgba(15,15,20,0.88)', backdropFilter: 'blur(10px)',
            borderRadius: 14, padding: '7px 12px',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ textAlign: 'center', lineHeight: 1 }}>
              <div style={{ color: '#22c55e', fontWeight: 900, fontSize: '1.05rem', lineHeight: 1 }}>{eta.etaMin}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.55rem', marginTop: 2, letterSpacing: '0.05em' }}>MIN</div>
            </div>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.13)' }} />
            <div style={{ textAlign: 'center', lineHeight: 1 }}>
              <div style={{ color: '#38bdf8', fontWeight: 900, fontSize: '1.05rem', lineHeight: 1 }}>
                {Number(eta.distKm) < 1 ? `${Math.round(Number(eta.distKm) * 1000)}m` : `${Number(eta.distKm).toFixed(1)}km`}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.55rem', marginTop: 2, letterSpacing: '0.05em' }}>
                {routeTotals ? 'PRÓX.' : 'DIST.'}
              </div>
            </div>
            {routeTotals && (
              <>
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.13)' }} />
                <div style={{ textAlign: 'center', lineHeight: 1 }}>
                  <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: '1.05rem', lineHeight: 1 }}>{routeTotals.etaMin}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.55rem', marginTop: 2, letterSpacing: '0.05em' }}>TOTAL</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Spinner */}
        {!mapReady && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', zIndex: 999 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(34,197,94,0.2)', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* No GPS signal */}
        {mapReady && !driverLoc && isActive && !loading && (
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '8px 16px', border: '1px solid rgba(245,158,11,0.3)' }}>
            <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>Esperando senal GPS…</span>
          </div>
        )}
      </div>

      {/* ── Bottom info card ── */}
      {loading ? (
        <div style={{ flexShrink: 0, background: 'var(--sheet-bg)', borderTop: '1px solid var(--border-subtle)', padding: '14px 14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="tuki-skeleton" style={{ width: 80, height: 24, borderRadius: 20 }} />
            <div style={{ marginLeft: 'auto' }}>
              <div className="tuki-skeleton" style={{ width: 70, height: 22, borderRadius: 8 }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div className="tuki-skeleton" style={{ width: 50, height: 50, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="tuki-skeleton" style={{ width: '55%', height: 16, borderRadius: 6 }} />
              <div className="tuki-skeleton" style={{ width: '35%', height: 12, borderRadius: 6 }} />
            </div>
          </div>
          <div className="tuki-skeleton" style={{ width: '100%', height: 38, borderRadius: 10 }} />
        </div>
      ) : error ? (
        <div style={{ flexShrink: 0, padding: 16, background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.15)', textAlign: 'center', color: '#f87171', fontSize: '0.85rem' }}>
          {error} — <Link href="/cliente" style={{ color: '#0ea5e9' }}>Volver al inicio</Link>
        </div>
      ) : order ? (
        <div style={{ flexShrink: 0, background: 'var(--sheet-bg)', borderTop: '1px solid var(--border-subtle)', padding: '14px 14px 18px' }}>

          {/* ── Status pill + price row ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            {st && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${st.color}18`, border: `1px solid ${st.color}50`, borderRadius: 20, padding: '4px 12px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, display: 'inline-block', boxShadow: `0 0 6px ${st.color}` }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: st.color }}>{st.text}</span>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#22c55e', fontWeight: 900, fontSize: '1.15rem', lineHeight: 1 }}>{fmtGs(priceVal)}</div>
              {order.type === 'service' && order.extra_charge != null && order.extra_charge > 0 && (
                <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.78rem', marginTop: 2 }}>+ {fmtGs(order.extra_charge)}</div>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem', marginTop: 1 }}>acordado</div>
            </div>
          </div>

          {/* ── Driver row ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            {/* Avatar */}
            <div style={{ flexShrink: 0, position: 'relative' }}>
              {workerPhoto ? (
                <Image src={workerPhoto} alt={workerName} width={50} height={50} unoptimized
                  style={{ borderRadius: '50%', objectFit: 'cover', border: `2.5px solid ${type === 'service' ? '#8b5cf6' : '#22c55e'}`, boxShadow: `0 0 0 3px ${type === 'service' ? 'rgba(139,92,246,0.2)' : 'rgba(34,197,94,0.2)'}` }}
                />
              ) : (
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: type === 'service' ? 'rgba(139,92,246,0.15)' : 'rgba(34,197,94,0.15)', border: `2.5px solid ${type === 'service' ? '#8b5cf6' : '#22c55e'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={type === 'service' ? 'tool' : 'car'} size={18} color={type === 'service' ? '#8b5cf6' : '#22c55e'} />
                </div>
              )}
              {/* Live dot */}
              {isActive && <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid var(--sheet-bg)' }} />}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workerName}</div>
              {workerRating != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  {'★★★★★'.split('').map((_, i) => (
                    <span key={i} style={{ color: i < Math.round(Number(workerRating)) ? '#F5C518' : 'rgba(156,163,175,0.3)', fontSize: '0.75rem' }}>★</span>
                  ))}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 2 }}>{Number(workerRating).toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Vehicle chips */}
            {vehicle && (vehicle.label || vehicle.brand || vehicle.plate) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                {vehicle.label && (
                  <span style={{ background: 'var(--glass-card)', borderRadius: 99, padding: '2px 9px', fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{vehicle.label}</span>
                )}
                {vehicle.plate && (
                  <span style={{ background: 'rgba(59,130,246,0.13)', borderRadius: 99, padding: '2px 9px', fontSize: '0.68rem', color: '#93c5fd', fontWeight: 800, border: '1px solid rgba(59,130,246,0.25)', letterSpacing: '0.04em' }}>{vehicle.plate}</span>
                )}
                {vehicle.brand && !vehicle.plate && (
                  <span style={{ background: 'var(--glass-card)', borderRadius: 99, padding: '2px 9px', fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{vehicle.brand}</span>
                )}
              </div>
            )}
          </div>



          {/* Address row A → stops → B (delivery only) */}
          {type === 'delivery' && (order.pickup_address || order.delivery_address) && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {order.pickup_address && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                  <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 5, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>A</span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.pickup_address}</span>
                </div>
              )}
              {order.order_stops && order.order_stops.length > 0 && (
                <div style={{ borderRadius: 9, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setStopsOpen(v => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', padding: '5px 9px', cursor: 'pointer', border: 'none' }}
                  >
                    <span style={{ display: 'inline-flex', color: '#fbbf24' }}>
                      <Icon name="package" size={12} color="#fbbf24" />
                    </span>
                    <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', textAlign: 'left' }}>
                      {order.order_stops.length} parada{order.order_stops.length !== 1 ? 's' : ''} de entrega
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700 }}>{stopsOpen ? '▲ cerrar' : '▼ ver todas'}</span>
                  </button>
                  {stopsOpen && (
                    <div style={{ maxHeight: 180, overflowY: 'auto', padding: '5px 9px 7px', display: 'flex', flexDirection: 'column', gap: 5, background: 'rgba(245,158,11,0.04)', WebkitOverflowScrolling: 'touch' as never }}>
                      {[...order.order_stops].sort((a, b) => a.sequence - b.sequence).map((s, i) => {
                        const isDone = s.status === 'delivered';
                        const isFailed = s.status === 'failed';
                        return (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: isDone ? 'rgba(34,197,94,0.2)' : isFailed ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', border: `1px solid ${isDone ? '#22c55e' : isFailed ? '#ef4444' : 'rgba(245,158,11,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 900, color: isDone ? '#22c55e' : isFailed ? '#ef4444' : '#fbbf24', marginTop: 1 }}>
                              {isDone ? '✓' : isFailed ? '✗' : s.sequence}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '0.72rem', color: isDone ? '#4ade80' : isFailed ? '#f87171' : '#fde68a', lineHeight: 1.4, wordBreak: 'break-word' }}>{s.address}</span>
                              {isDone && <span style={{ fontSize: '0.6rem', color: '#4ade80', marginLeft: 4, fontWeight: 700 }}>Entregado</span>}
                              {isFailed && <span style={{ fontSize: '0.6rem', color: '#f87171', marginLeft: 4, fontWeight: 700 }}>Fallido</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {order.delivery_address && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem' }}>
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: 5, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>B</span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.delivery_address}</span>
                </div>
              )}
            </div>
          )}

          {/* ── PIN Codes (envio sender only) ── */}
          {order.order_type === 'envio' && myEmail && order.client_email?.toLowerCase() === myEmail.toLowerCase() && (order.pickup_code || order.delivery_pin) && (
            <div style={{ marginTop: 10, borderRadius: 12, border: '1.5px solid rgba(245,197,24,0.3)', overflow: 'hidden' }}>
              {/* Header row – always visible */}
              <button
                onClick={() => setPinsOpen(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(245,197,24,0.07)', border: 'none', cursor: 'pointer', gap: 8 }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F5C518', letterSpacing: '0.04em' }}>🔐 CÓDIGOS DE SEGURIDAD</span>
                <span style={{ fontSize: '0.7rem', color: '#F5C518' }}>{pinsOpen ? '▲' : '▼'}</span>
              </button>

              {/* Collapsed preview – always visible */}
              {!pinsOpen && (
                <div style={{ display: 'flex', gap: 6, padding: '6px 12px 8px', background: 'rgba(245,197,24,0.04)' }}>
                  {order.pickup_code && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: pickupValidated ? 'rgba(16,185,129,0.12)' : 'rgba(245,197,24,0.1)', border: `1px solid ${pickupValidated ? 'rgba(16,185,129,0.4)' : 'rgba(245,197,24,0.3)'}`, borderRadius: 8, padding: '4px 10px' }}>
                      <span style={{ fontSize: '0.62rem' }}>{pickupValidated ? '✅' : '🔑'}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: pickupValidated ? '#4ade80' : '#F5C518', letterSpacing: '0.25em', fontVariantNumeric: 'tabular-nums' }}>{order.pickup_code}</span>
                    </div>
                  )}
                  {!order.is_multi_stop && order.delivery_pin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: deliveryValidated ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)', border: `1px solid ${deliveryValidated ? 'rgba(16,185,129,0.5)' : 'rgba(16,185,129,0.25)'}`, borderRadius: 8, padding: '4px 10px' }}>
                      <span style={{ fontSize: '0.62rem' }}>{deliveryValidated ? '✅' : '📦'}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#4ade80', letterSpacing: '0.25em', fontVariantNumeric: 'tabular-nums' }}>{order.delivery_pin}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded detail */}
              {pinsOpen && (
                <div style={{ padding: '10px 12px 12px', background: 'rgba(245,197,24,0.04)' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {order.pickup_code && (
                      <div style={{ flex: 1, minWidth: 110, background: pickupValidated ? 'rgba(16,185,129,0.12)' : 'rgba(245,197,24,0.1)', border: `1px solid ${pickupValidated ? 'rgba(16,185,129,0.45)' : 'rgba(245,197,24,0.35)'}`, borderRadius: 10, padding: '8px 10px' }}>
                        <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginBottom: 3 }}>🔑 Código de Retiro</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: pickupValidated ? '#4ade80' : '#F5C518', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}>{order.pickup_code}</div>
                          {pickupValidated && <span style={{ fontSize: '1rem' }}>✅</span>}
                        </div>
                        <div style={{ fontSize: '0.58rem', color: pickupValidated ? '#4ade80' : '#94a3b8', marginTop: 2 }}>{pickupValidated ? '✓ Código validado por el conductor' : 'Mostrá esto al conductor al retirar'}</div>
                      </div>
                    )}
                    {!order.is_multi_stop && order.delivery_pin && (
                      <div style={{ flex: 1, minWidth: 110, background: deliveryValidated ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)', border: `1px solid ${deliveryValidated ? 'rgba(16,185,129,0.5)' : 'rgba(16,185,129,0.3)'}`, borderRadius: 10, padding: '8px 10px' }}>
                        <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginBottom: 3 }}>📦 Código de Entrega</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#4ade80', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}>{order.delivery_pin}</div>
                          {deliveryValidated && <span style={{ fontSize: '1rem' }}>✅</span>}
                        </div>
                        <div style={{ fontSize: '0.58rem', color: deliveryValidated ? '#4ade80' : '#94a3b8', marginTop: 2 }}>{deliveryValidated ? '✓ Entregado y confirmado' : 'Compartí con el receptor'}</div>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Tu código de entrega TukiTask: ${order.delivery_pin}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-block', marginTop: 5, fontSize: '0.63rem', fontWeight: 700, color: '#25d366', textDecoration: 'none', background: 'rgba(37,211,102,0.1)', borderRadius: 6, padding: '2px 7px' }}
                        >
                          📲 Enviar por WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                  {/* Multi-stop per-stop PINs */}
                  {order.is_multi_stop && order.order_stops && order.order_stops.some(s => s.delivery_pin) && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {order.order_stops.filter(s => s.delivery_pin).sort((a, b) => a.sequence - b.sequence).map((s, i) => (
                        <div key={i} style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: 1 }}>📦 Parada {s.sequence}</div>
                            <div style={{ fontSize: '0.65rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#4ade80', letterSpacing: '0.3em' }}>{s.delivery_pin}</div>
                          </div>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(`Tu código de entrega TukiTask (Parada ${s.sequence}): ${s.delivery_pin}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.63rem', fontWeight: 700, color: '#25d366', textDecoration: 'none', background: 'rgba(37,211,102,0.1)', borderRadius: 6, padding: '4px 7px', flexShrink: 0 }}
                          >
                            📲 WA
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Chat + Back row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
            {isActive && (
              <button
                onClick={() => { setChatOpen(true); setChatUnread(0); }}
                style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}
              >
                <Icon name="chat" size={16} color="#fff" /> Chat
                {chatUnread > 0 && (
                  <span style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', borderRadius: '50%', minWidth: 18, height: 18, fontSize: '0.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{chatUnread}</span>
                )}
              </button>
            )}
            <Link
              href="/cliente"
              style={{ flex: 1, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', textDecoration: 'none' }}
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── Chat toast popup ── */}
      {chatToast && (
        <div
          onClick={() => {
            if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
            setChatToast(null);
            setChatUnread(0);
            setChatOpen(true);
          }}
          style={{
            position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, width: 'calc(100% - 28px)', maxWidth: 400,
            background: '#0f2920', border: '1.5px solid rgba(34,197,94,0.55)',
            borderRadius: 18, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.75)',
            cursor: 'pointer',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '0.72rem', marginBottom: 2 }}>NUEVO MENSAJE · {type === 'service' ? 'TÉCNICO' : 'CONDUCTOR'}</div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chatToast.from ? `${chatToast.from}: ` : ''}{chatToast.text}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current); setChatToast(null); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: 28, height: 28, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
        </div>
      )}

      {/* ── Chat Modal ── */}
      {chatOpen && myEmail && (
        <ChatModal
          open={chatOpen}
          onClose={() => { setChatOpen(false); setChatUnread(0); }}
          orderId={type === 'delivery' ? id : undefined}
          jobId={type === 'service' ? id : undefined}
          myEmail={myEmail}
          myName={myName}
          otherName={workerName}
          otherPhoto={workerPhoto}
        />
      )}
    </div>
  );
}
