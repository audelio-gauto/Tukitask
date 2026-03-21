'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER = { lat: -25.2637, lng: -57.5759 };

function createMarkerEl(label: string, color: string, size = 28) {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);`;
  el.textContent = label;
  return el;
}

function staticMapUrl(
  center: { lat: number; lng: number },
  zoom: number,
  w: number,
  h: number,
  markers?: { lat: number; lng: number; label: string; color: string }[],
) {
  const pins = (markers || [])
    .map(m => `pin-s-${m.label.toLowerCase()}+${m.color.replace('#', '')}(${m.lng},${m.lat})`)
    .join(',');
  const overlay = pins ? `${pins}/` : '';
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}${center.lng},${center.lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
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
  const initRef = useRef(false);
  const [glReady, setGlReady] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const selfMarker = useRef<any>(null);
  const pickupMarker = useRef<any>(null);
  const deliveryMarker = useRef<any>(null);
  const mbRef = useRef<any>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GL map init
  useEffect(() => {
    if (!mapRef.current || initRef.current || glFailed) return;
    if (!MAPBOX_TOKEN) { setGlFailed(true); return; }

    initRef.current = true;
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

      if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
        if (mounted) setGlFailed(true);
        return;
      }

      mbRef.current = mapboxgl;

      let map: any;
      try {
        map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
          zoom: 15,
          accessToken: MAPBOX_TOKEN,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        if (mounted) setGlFailed(true);
        return;
      }

      if (!map.painter?.context?.gl) {
        try { map.remove(); } catch {}
        if (mounted) setGlFailed(true);
        return;
      }

      mapInstance.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      const selfEl = document.createElement('div');
      selfEl.className = 'client-map-marker';
      selfMarker.current = new mapboxgl.Marker({ element: selfEl })
        .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
        .addTo(map);

      map.on('error', (e: any) => {
        if (e?.error?.message?.includes('WebGL') && mounted) {
          try { map.remove(); } catch {}
          mapInstance.current = null;
          setGlFailed(true);
        }
      });

      loadTimerRef.current = setTimeout(() => {
        if (mounted && !mapInstance.current?._loaded) {
          try { map.remove(); } catch {}
          mapInstance.current = null;
          setGlFailed(true);
        }
      }, 6000);

      map.on('load', () => {
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
        if (mounted) setGlReady(true);
      });

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
          (pos) => {
            if (mounted) selfMarker.current?.setLngLat([pos.coords.longitude, pos.coords.latitude]);
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 15000 },
        );
      }
    })();

    return () => {
      mounted = false;
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
      initRef.current = false;
    };
  }, [glFailed]);

  // Update GL markers and route
  useEffect(() => {
    const map = mapInstance.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl) return;

    if (pickup && isFinite(pickup.lat) && isFinite(pickup.lng)) {
      if (!pickupMarker.current) {
        pickupMarker.current = new mapboxgl.Marker({ element: createMarkerEl('A', '#10b981') })
          .setLngLat([pickup.lng, pickup.lat]).addTo(map);
      } else {
        pickupMarker.current.setLngLat([pickup.lng, pickup.lat]);
      }
    } else {
      pickupMarker.current?.remove();
      pickupMarker.current = null;
    }

    if (delivery && isFinite(delivery.lat) && isFinite(delivery.lng)) {
      if (!deliveryMarker.current) {
        deliveryMarker.current = new mapboxgl.Marker({ element: createMarkerEl('B', '#ef4444') })
          .setLngLat([delivery.lng, delivery.lat]).addTo(map);
      } else {
        deliveryMarker.current.setLngLat([delivery.lng, delivery.lat]);
      }
    } else {
      deliveryMarker.current?.remove();
      deliveryMarker.current = null;
    }

    const routeSourceId = 'route-line';
    const hasRoute = routeCoords && routeCoords.length > 0;
    const hasStraight = !hasRoute && pickup && delivery
      && isFinite(pickup.lat) && isFinite(pickup.lng)
      && isFinite(delivery.lat) && isFinite(delivery.lng);
    const coords: [number, number][] = hasRoute
      ? routeCoords!.map(p => [p.lng, p.lat])
      : hasStraight ? [[pickup!.lng, pickup!.lat], [delivery!.lng, delivery!.lat]] : [];

    if (map.getSource(routeSourceId)) {
      map.getSource(routeSourceId).setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      });
    } else if (coords.length > 0 && map.isStyleLoaded()) {
      map.addSource(routeSourceId, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: 'route-line-layer', type: 'line', source: routeSourceId,
        paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    if (coords.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach((c: [number, number]) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 500 });
    }
  }, [pickup, delivery, routeCoords]);

  // Compute static map props
  const center = pickup && isFinite(pickup.lat) ? pickup
    : delivery && isFinite(delivery!.lat) ? delivery!
    : DEFAULT_CENTER;
  const zoom = (pickup && delivery && isFinite(pickup.lat) && isFinite(delivery.lat)) ? 13 : 15;
  const staticMarkers: { lat: number; lng: number; label: string; color: string }[] = [];
  if (pickup && isFinite(pickup.lat)) staticMarkers.push({ ...pickup, label: 'A', color: '#10b981' });
  if (delivery && isFinite(delivery!.lat)) staticMarkers.push({ ...delivery!, label: 'B', color: '#ef4444' });

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#e5e7eb' }}>
      {/* Static image — always visible as base layer until GL loads */}
      {!glReady && MAPBOX_TOKEN && (
        <img
          src={staticMapUrl(center, zoom, 600, 600, staticMarkers)}
          alt="Mapa"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {/* GL map — overlays static when ready */}
      {!glFailed && (
        <div
          ref={mapRef}
          style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: glReady ? 1 : 0, transition: 'opacity 0.3s' }}
        />
      )}
      {/* No token */}
      {!MAPBOX_TOKEN && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Mapa no disponible</p>
        </div>
      )}
    </div>
  );
}
