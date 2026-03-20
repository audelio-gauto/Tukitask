'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function createMarkerEl(label: string, color: string, size = 28) {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);`;
  el.textContent = label;
  return el;
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('webgl2') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

/** Build a Mapbox Static Images URL */
function staticMapUrl(
  center: { lat: number; lng: number },
  zoom: number,
  width: number,
  height: number,
  markers?: { lat: number; lng: number; label: string; color: string }[],
) {
  const pins = (markers || [])
    .map(m => `pin-s-${m.label.toLowerCase()}+${m.color.replace('#', '')}(${m.lng},${m.lat})`)
    .join(',');
  const overlay = pins ? `${pins}/` : '';
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}${center.lng},${center.lat},${zoom},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

export default function ClientMap({
  pickup,
  delivery,
  routeCoords,
}: {
  pickup?: { lat: number; lng: number } | null;
  delivery?: { lat: number; lng: number } | null;
  routeCoords?: Array<{ lat: number; lng: number }> | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [useStatic, setUseStatic] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const selfMarker = useRef<any>(null);
  const pickupMarker = useRef<any>(null);
  const deliveryMarker = useRef<any>(null);
  const mbRef = useRef<any>(null);

  // Get user location for static fallback
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  }, []);

  // Initialise GL map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    if (!MAPBOX_TOKEN) { setUseStatic(true); return; }
    if (!supportsWebGL()) { setUseStatic(true); return; }

    let mounted = true;
    let watchId: number | null = null;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }
      if (!mounted || !mapRef.current) return;
      mbRef.current = mapboxgl;

      const defaultLng = -57.5759;
      const defaultLat = -25.2637;

      let map: any;
      try {
        map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [defaultLng, defaultLat],
          zoom: 15,
          accessToken: MAPBOX_TOKEN,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        if (mounted) setUseStatic(true);
        return;
      }

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      const selfEl = document.createElement('div');
      selfEl.className = 'client-map-marker';
      selfMarker.current = new mapboxgl.Marker({ element: selfEl }).setLngLat([defaultLng, defaultLat]).addTo(map);
      mapInstance.current = map;

      map.on('error', (e: any) => {
        if (e?.error?.message?.includes('WebGL') && mounted) setUseStatic(true);
      });

      map.on('load', () => { if (mounted) setReady(true); });

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mounted || !mapInstance.current) return;
            map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
            selfMarker.current?.setLngLat([pos.coords.longitude, pos.coords.latitude]);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 },
        );
        watchId = navigator.geolocation.watchPosition(
          (pos) => { if (mounted) selfMarker.current?.setLngLat([pos.coords.longitude, pos.coords.latitude]); },
          () => {},
          { enableHighAccuracy: true, maximumAge: 15000 },
        );
      }
    })();

    return () => {
      mounted = false;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, []);

  // Update GL markers and route
  useEffect(() => {
    const map = mapInstance.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl) return;

    if (pickup && isFinite(pickup.lat) && isFinite(pickup.lng)) {
      if (!pickupMarker.current) {
        pickupMarker.current = new mapboxgl.Marker({ element: createMarkerEl('A', '#10b981') }).setLngLat([pickup.lng, pickup.lat]).addTo(map);
      } else { pickupMarker.current.setLngLat([pickup.lng, pickup.lat]); }
    } else { pickupMarker.current?.remove(); pickupMarker.current = null; }

    if (delivery && isFinite(delivery.lat) && isFinite(delivery.lng)) {
      if (!deliveryMarker.current) {
        deliveryMarker.current = new mapboxgl.Marker({ element: createMarkerEl('B', '#ef4444') }).setLngLat([delivery.lng, delivery.lat]).addTo(map);
      } else { deliveryMarker.current.setLngLat([delivery.lng, delivery.lat]); }
    } else { deliveryMarker.current?.remove(); deliveryMarker.current = null; }

    const routeSourceId = 'route-line';
    const hasRoute = routeCoords && routeCoords.length > 0;
    const hasStraight = !hasRoute && pickup && delivery && isFinite(pickup.lat) && isFinite(pickup.lng) && isFinite(delivery.lat) && isFinite(delivery.lng);
    const coords: [number, number][] = hasRoute
      ? routeCoords!.map(p => [p.lng, p.lat])
      : hasStraight ? [[pickup!.lng, pickup!.lat], [delivery!.lng, delivery!.lat]] : [];

    if (map.getSource(routeSourceId)) {
      map.getSource(routeSourceId).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
    } else if (coords.length > 0 && map.isStyleLoaded()) {
      map.addSource(routeSourceId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
      map.addLayer({ id: 'route-line-layer', type: 'line', source: routeSourceId, paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    }

    if (coords.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach((c: [number, number]) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 500 });
    }
  }, [pickup, delivery, routeCoords]);

  // --- Static image fallback (no WebGL needed) ---
  if (useStatic) {
    const center = pickup && isFinite(pickup.lat) ? pickup
      : delivery && isFinite(delivery!.lat) ? delivery!
      : userPos || { lat: -25.2637, lng: -57.5759 };
    const zoom = (pickup && delivery && isFinite(pickup.lat) && isFinite(delivery.lat)) ? 13 : 15;
    const markers: { lat: number; lng: number; label: string; color: string }[] = [];
    if (pickup && isFinite(pickup.lat)) markers.push({ ...pickup, label: 'A', color: '#10b981' });
    if (delivery && isFinite(delivery!.lat)) markers.push({ ...delivery!, label: 'B', color: '#ef4444' });
    const url = staticMapUrl(center, zoom, 600, 600, markers);

    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', background: '#e5e7eb' }}>
        {MAPBOX_TOKEN ? (
          <img
            src={url}
            alt="Mapa"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Mapa no disponible</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }}
    />
  );
}
