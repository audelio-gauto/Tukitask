'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authFetch } from '@/lib/authFetch';
import { haversineKm } from '@/lib/geo';
import { useWorkerContext } from '../../context';
import ActiveOrders from '../../components/ActiveOrders';
import RatingModal from '@/components/RatingModal';
import { routePinHtml, PIN_A_COLOR, PIN_B_COLOR, PIN_W, PIN_H } from '@/lib/mapPins';
import { themeTile, createVehicleMarker, vehicleKindFrom } from '@/lib/mapVehicle';
import { playArrivingAlert } from '@/lib/audio';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LatLng { lat: number; lng: number }

const NAV_STATUSES = ['accepted', 'picking_up', 'at_pickup', 'in_transit'];

function toLL(lat: unknown, lng: unknown): LatLng | null {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? { lat: a, lng: b } : null;
}

function openExternal(navApp: string, p: LatLng) {
  const url = navApp === 'waze'
    ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
  window.open(url, '_blank');
}

/**
 * Pantalla de navegación del conductor estilo Bolt/Uber.
 * Se abre sola cuando el cliente acepta la oferta. Los pasos con PIN, foto o cobro
 * siguen en /driver/activo para no duplicar esa lógica.
 */
export default function DriverNavegarPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const { email, navApp, driverPos } = useWorkerContext();

  const [order, setOrder] = useState<any>(null);
  const [rateOrder, setRateOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<{ distKm: number; etaMin: number } | null>(null);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const meMarker = useRef<any>(null);
  const targetMarker = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const lastRouteKey = useRef('');
  const arrivingRef = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [mapFull, setMapFull] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!email) return;
    try {
      const res = await authFetch(`/api/orders?driver_email=${encodeURIComponent(email)}`);
      if (!res.ok) return;
      const data = await res.json();
      const found = Array.isArray(data) ? data.find((o: any) => o.id === id) : null;
      if (found && !['cancelled', 'driver_cancelled', 'delivered', 'failed', 'returned'].includes(found.status)) {
        setOrder(found);
        return;
      }
      // Terminó: si fue entregado y aún no calificó al cliente, se pide la calificación antes de volver
      const one = await authFetch(`/api/orders?id=${encodeURIComponent(id)}`);
      const done = one.ok ? await one.json() : null;
      if (done && ['delivered', 'commission_charged', 'client_confirmed'].includes(done.status) && done.client_rating == null) {
        setRateOrder(done);
        return;
      }
      router.replace('/driver');
    } catch { /* se reintenta */ } finally {
      setLoading(false);
    }
  }, [email, id, router]);

  useEffect(() => {
    fetchOrder();
    const t = setInterval(() => { if (!rateOrder) fetchOrder(); }, 5000);
    return () => clearInterval(t);
  }, [fetchOrder, rateOrder]);

  // Mapa Leaflet (sin WebGL), igual que el seguimiento del cliente
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const L = (await import('leaflet')).default;
      if (cancelled || !mapDivRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapDivRef.current, { center: [-25.2637, -57.5759], zoom: 14, zoomControl: false, attributionControl: false });
      L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);
      const zc = L.control.zoom({ position: 'topright' }).addTo(map);
      const zcEl = zc.getContainer();
      if (zcEl) zcEl.style.marginTop = 'calc(env(safe-area-inset-top, 0px) + 84px)';
      const base = themeTile();
      L.tileLayer(base.url, { attribution: base.attr, maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      map.on('dragstart', () => { followRef.current = false; setFollowing(false); });
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapDivRef.current);
      setMapReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const status: string = order?.status ?? '';
  const toPickup = status === 'accepted' || status === 'picking_up';

  // Destino actual: recogida primero; luego la próxima parada pendiente o el destino final
  const pendingStop = (order?.order_stops || [])
    .filter((s: any) => s.status === 'pending')
    .sort((a: any, b: any) => a.sequence - b.sequence)[0];
  const targetLat = toPickup ? order?.pickup_lat : (pendingStop?.lat ?? order?.delivery_lat);
  const targetLng = toPickup ? order?.pickup_lng : (pendingStop?.lng ?? order?.delivery_lng);
  const target = order ? toLL(targetLat, targetLng) : null;
  const targetKey = target ? `${target.lat},${target.lng}` : '';

  // Marcadores y ruta
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;

    if (driverPos) {
      const kind = vehicleKindFrom(order?.vehicle_type);
      if (!meMarker.current) meMarker.current = createVehicleMarker(L, map, driverPos.lat, driverPos.lng, kind);
      else {
        meMarker.current.setKind(kind);
        meMarker.current.move(driverPos.lat, driverPos.lng);
      }
      // Modo seguimiento (como Bolt/inDrive): el mapa va con el vehículo hasta que el conductor lo mueva con el dedo
      if (followRef.current) {
        map.setView([driverPos.lat, driverPos.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 1 });
      }
    }
    const tgt = targetKey ? { lat: Number(targetKey.split(',')[0]), lng: Number(targetKey.split(',')[1]) } : null;
    if (tgt) {
      const icon = L.divIcon({
        className: '',
        html: routePinHtml(toPickup ? 'A' : 'B', toPickup ? PIN_A_COLOR : PIN_B_COLOR),
        iconSize: [PIN_W, PIN_H], iconAnchor: [PIN_W / 2, PIN_H],
      });
      if (!targetMarker.current) targetMarker.current = L.marker([tgt.lat, tgt.lng], { icon }).addTo(map);
      else { targetMarker.current.setLatLng([tgt.lat, tgt.lng]); targetMarker.current.setIcon(icon); }
    }

    if (!driverPos || !tgt) return;
    // Solo recalcula la ruta si cambió el destino o el conductor se movió ~100 m
    const key = `${targetKey}|${driverPos.lat.toFixed(3)},${driverPos.lng.toFixed(3)}`;
    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;

    (async () => {
      let coords: [number, number][] = [[driverPos.lat, driverPos.lng], [tgt.lat, tgt.lng]];
      let ok = false;
      try {
        const r = await authFetch('/api/maps/directions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: driverPos, to: tgt }),
        });
        if (r.ok) {
          const json = await r.json();
          if (json?.coords?.length > 1) {
            coords = json.coords.map((c: LatLng) => [Number(c.lat), Number(c.lng)] as [number, number]);
            ok = true;
            setRoute({
              distKm: Number(json.distance_meters || 0) / 1000 || haversineKm(driverPos.lat, driverPos.lng, tgt.lat, tgt.lng),
              etaMin: Math.max(1, Math.round(Number(json.duration_seconds || 0) / 60)),
            });
          }
        }
      } catch { /* línea recta */ }
      if (!ok) {
        const d = haversineKm(driverPos.lat, driverPos.lng, tgt.lat, tgt.lng);
        setRoute({ distKm: d, etaMin: Math.max(1, Math.round(d * 2.5)) });
      }
      if (lineRef.current) map.removeLayer(lineRef.current);
      lineRef.current = L.layerGroup([
        L.polyline(coords, { color: '#fff', weight: ok ? 9 : 5, opacity: ok ? 0.95 : 0.6, lineJoin: 'round', lineCap: 'round' }),
        L.polyline(coords, { color: '#1C1C2E', weight: ok ? 5 : 3, opacity: 1, dashArray: ok ? undefined : '8 6', lineJoin: 'round', lineCap: 'round' }),
      ]).addTo(map);
      if (!fittedRef.current) {
        fittedRef.current = true;
      }
    })();
  }, [mapReady, driverPos, targetKey, toPickup]);

  // Al cambiar de tramo (recogida → entrega) se vuelve a encuadrar
  useEffect(() => { fittedRef.current = false; lastRouteKey.current = ''; arrivingRef.current = ''; }, [toPickup]);

  // Aviso sonoro al llegar a ~80 m del punto de recogida / entrega (una vez por destino)
  useEffect(() => {
    if (!driverPos || !targetKey) return;
    const [tLat, tLng] = targetKey.split(',').map(Number);
    const meters = haversineKm(driverPos.lat, driverPos.lng, tLat, tLng) * 1000;
    if (meters <= 80 && arrivingRef.current !== targetKey) {
      arrivingRef.current = targetKey;
      playArrivingAlert();
    }
  }, [driverPos, targetKey]);

  const recenter = () => {
    const map = mapRef.current;
    followRef.current = true;
    setFollowing(true);
    if (map && driverPos) map.setView([driverPos.lat, driverPos.lng], Math.max(map.getZoom(), 17), { animate: true });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--background)', zIndex: 50 }}>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />

        <button
          onClick={recenter}
          aria-label="Centrar en mi ubicación"
          style={{ position: 'absolute', right: 12, bottom: 28, zIndex: 1001, width: 44, height: 44, borderRadius: '50%', border: following ? '2px solid #F5C518' : 'none', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: '1.2rem' }}
        >🎯</button>

        <button
          onClick={() => setMapFull(v => !v)}
          aria-label={mapFull ? 'Mostrar panel' : 'Mapa en pantalla completa'}
          style={{ position: 'absolute', right: 12, bottom: 82, zIndex: 1001, width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#fff', color: '#111827', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {mapFull ? (
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
          ) : (
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          )}
        </button>

        {!driverPos && mapReady && (
          <div style={{ position: 'absolute', bottom: 28, left: 12, zIndex: 1001, background: 'rgba(0,0,0,0.75)', color: '#f59e0b', borderRadius: 12, padding: '8px 14px', fontSize: '0.75rem', fontWeight: 600 }}>
            Esperando señal GPS…
          </div>
        )}
      </div>

      <div style={{ display: mapFull ? 'none' : undefined, flexShrink: 0, background: 'var(--sheet-bg, #fff)', borderRadius: '22px 22px 0 0', marginTop: -18, position: 'relative', zIndex: 1002, boxShadow: '0 -6px 20px rgba(0,0,0,0.25)', maxHeight: '60dvh', overflowY: 'auto', padding: '8px 14px calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border-strong, #d1d5db)', margin: '0 auto 12px' }} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>Cargando…</div>
        ) : !order ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>Pedido no disponible</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                {route ? `${route.etaMin} min · ${route.distKm < 1 ? `${Math.round(route.distKm * 1000)} m` : `${route.distKm.toFixed(1)} km`}` : 'Calculando ruta…'}
              </div>
              {target && (
                <button
                  onClick={() => openExternal(navApp, target)}
                  style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border-strong, #e5e7eb)', background: 'var(--glass-card, #f3f4f6)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  🧭 {navApp === 'waze' ? 'Waze' : 'Google Maps'}
                </button>
              )}
            </div>

            <Suspense fallback={null}>
              <ActiveOrders mode="nav" orderId={id} />
            </Suspense>
          </>
        )}
      </div>

      {rateOrder && (
        <RatingModal
          title="Calificá al cliente"
          subtitle={rateOrder.client_name || rateOrder.client_email?.split('@')[0] || 'Cliente'}
          avatarUrl={rateOrder.client_photo || undefined}
          avatarName={rateOrder.client_name || rateOrder.client_email?.split('@')[0]}
          onSubmit={async (rating, note) => {
            const res = await authFetch('/api/orders/rate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: rateOrder.id, rated_by: 'driver', rating, note }),
            });
            if (!res.ok && res.status !== 409) throw new Error('rate');
            router.replace('/driver');
          }}
          onClose={() => router.replace('/driver')}
        />
      )}
    </div>
  );
}
