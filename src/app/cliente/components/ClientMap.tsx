'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function createMarkerEl(label: string, color: string, size = 28) {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);`;
  el.textContent = label;
  return el;
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
  const [mapError, setMapError] = useState<string | null>(null);
  const selfMarker = useRef<any>(null);
  const pickupMarker = useRef<any>(null);
  const deliveryMarker = useRef<any>(null);
  const mbRef = useRef<any>(null); // mapboxgl module

  // Initialise map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current || !MAPBOX_TOKEN) return;

    let mounted = true;
    let watchId: number | null = null;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      // Inject Mapbox CSS once
      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }
      if (!mounted || !mapRef.current) return;
      mbRef.current = mapboxgl;

      const defaultLat = -25.2637;
      const defaultLng = -57.5759;

      let map: any;
      try {
        map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [defaultLng, defaultLat],
          zoom: 15,
          accessToken: MAPBOX_TOKEN,
          attributionControl: false,
        });
      } catch (err) {
        console.warn('Mapbox GL init failed:', err);
        if (mounted) setMapError('Tu dispositivo no soporta mapas WebGL. Activá la aceleración por hardware en tu navegador.');
        return;
      }

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      const selfEl = document.createElement('div');
      selfEl.className = 'client-map-marker';
      selfMarker.current = new mapboxgl.Marker({ element: selfEl }).setLngLat([defaultLng, defaultLat]).addTo(map);

      mapInstance.current = map;

      map.on('error', (e: any) => {
        if (e?.error?.message?.includes('WebGL')) {
          if (mounted) setMapError('Tu dispositivo no soporta mapas WebGL.');
        }
      });

      map.on('load', () => {
        if (mounted) setReady(true);
      });

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mounted || !mapInstance.current) return;
            const { latitude, longitude } = pos.coords;
            map.flyTo({ center: [longitude, latitude], zoom: 16 });
            selfMarker.current?.setLngLat([longitude, latitude]);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 },
        );

        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (!mounted) return;
            selfMarker.current?.setLngLat([pos.coords.longitude, pos.coords.latitude]);
          },
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

  // Update pickup / delivery markers and route
  useEffect(() => {
    const map = mapInstance.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl) return;

    // Pickup marker
    if (pickup && isFinite(pickup.lat) && isFinite(pickup.lng)) {
      if (!pickupMarker.current) {
        pickupMarker.current = new mapboxgl.Marker({ element: createMarkerEl('A', '#10b981') })
          .setLngLat([pickup.lng, pickup.lat])
          .addTo(map);
      } else {
        pickupMarker.current.setLngLat([pickup.lng, pickup.lat]);
      }
    } else {
      pickupMarker.current?.remove();
      pickupMarker.current = null;
    }

    // Delivery marker
    if (delivery && isFinite(delivery.lat) && isFinite(delivery.lng)) {
      if (!deliveryMarker.current) {
        deliveryMarker.current = new mapboxgl.Marker({ element: createMarkerEl('B', '#ef4444') })
          .setLngLat([delivery.lng, delivery.lat])
          .addTo(map);
      } else {
        deliveryMarker.current.setLngLat([delivery.lng, delivery.lat]);
      }
    } else {
      deliveryMarker.current?.remove();
      deliveryMarker.current = null;
    }

    // Route line
    const routeSourceId = 'route-line';
    const hasRoute = routeCoords && routeCoords.length > 0;
    const hasStraight = !hasRoute && pickup && delivery && isFinite(pickup.lat) && isFinite(pickup.lng) && isFinite(delivery.lat) && isFinite(delivery.lng);

    const coords: [number, number][] = hasRoute
      ? routeCoords!.map(p => [p.lng, p.lat])
      : hasStraight
        ? [[pickup!.lng, pickup!.lat], [delivery!.lng, delivery!.lat]]
        : [];

    if (map.getSource(routeSourceId)) {
      map.getSource(routeSourceId).setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      });
    } else if (coords.length > 0 && map.isStyleLoaded()) {
      map.addSource(routeSourceId, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: 'route-line-layer',
        type: 'line',
        source: routeSourceId,
        paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    // Fit bounds
    if (coords.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach((c: [number, number]) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 500 });
    }
  }, [pickup, delivery, routeCoords]);

  if (mapError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 24, textAlign: 'center' }}>
        <div>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>{mapError}</p>
        </div>
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
