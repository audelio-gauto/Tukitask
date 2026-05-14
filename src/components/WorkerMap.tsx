'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER = { lat: -25.2637, lng: -57.5759 };

function useDarkMode() {
  const [dark, setDark] = useState(true); // app defaults to dark
  useEffect(() => {
    const read = () => document.documentElement.getAttribute('data-theme') !== 'light';
    setDark(read());
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function mapStyle(dark: boolean) {
  return dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
}

function staticMapUrl(center: { lat: number; lng: number }, zoom: number, w: number, h: number, dark: boolean) {
  const style = dark ? 'dark-v11' : 'streets-v12';
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${center.lng},${center.lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

function createMarkerEl(label: string, color: string, badge?: string | null) {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:30px;height:30px;cursor:default;';
  const circle = document.createElement('div');
  circle.style.cssText = `width:30px;height:30px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);`;
  circle.textContent = label;
  el.appendChild(circle);
  if (badge) {
    const b = document.createElement('div');
    b.style.cssText = `position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);background:rgba(8,8,18,0.88);color:#fff;border-radius:7px;padding:3px 8px;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,0.55);pointer-events:none;line-height:1.3;`;
    b.textContent = badge;
    el.appendChild(b);
  }
  return el;
}

export default function WorkerMap({
  onLocate,
  pickup,
  delivery,
  pickupBadge,
  deliveryBadge,
}: {
  onLocate?: (fn: () => void) => void;
  pickup?: { lat: number; lng: number } | null;
  delivery?: { lat: number; lng: number } | null;
  pickupBadge?: string | null;
  deliveryBadge?: string | null;
}) {
  const dark = useDarkMode();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const mbRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const deliveryMarkerRef = useRef<any>(null);
  const initRef = useRef(false);
  const [glReady, setGlReady] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
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
          style: mapStyle(dark),
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
      selfEl.className = 'tuki-driver-self-marker';
      const marker = new mapboxgl.Marker({ element: selfEl })
        .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
        .addTo(map);
      markerRef.current = marker;

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
            if (!mounted) return;
            map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
            marker.setLngLat([pos.coords.longitude, pos.coords.latitude]);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 },
        );
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (mounted) marker.setLngLat([pos.coords.longitude, pos.coords.latitude]);
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

  // Switch map style when dark mode changes or map finishes loading
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !glReady) return;
    map.setStyle(mapStyle(dark));
  }, [dark, glReady]);

  // Expose locate function to parent
  useEffect(() => {
    if (onLocate) {
      onLocate(() => {
        if (!mapInstance.current || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
          mapInstance.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
          markerRef.current?.setLngLat([pos.coords.longitude, pos.coords.latitude]);
        });
      });
    }
  }, [onLocate]);

  // Update A/B markers and real road route when pickup/delivery change
  useEffect(() => {
    const map = mapInstance.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl || !glReady) return;

    // Recreate A/B markers (badge may have changed)
    pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null;
    deliveryMarkerRef.current?.remove(); deliveryMarkerRef.current = null;

    // Pickup marker A
    if (pickup && isFinite(pickup.lat) && isFinite(pickup.lng)) {
      pickupMarkerRef.current = new mapboxgl.Marker({ element: createMarkerEl('A', '#10b981', pickupBadge) })
        .setLngLat([pickup.lng, pickup.lat]).addTo(map);
    }

    // Delivery marker B
    if (delivery && isFinite(delivery.lat) && isFinite(delivery.lng)) {
      deliveryMarkerRef.current = new mapboxgl.Marker({ element: createMarkerEl('B', '#ef4444', deliveryBadge) })
        .setLngLat([delivery.lng, delivery.lat]).addTo(map);
    }

    const srcId = 'driver-route';
    const layerId = 'driver-route-layer';
    const casingId = 'driver-route-casing';

    function applyRoute(coords: [number, number][]) {
      const geojson: any = {
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      };
      if (map.getSource(srcId)) {
        (map.getSource(srcId) as any).setData(geojson);
      } else if (map.isStyleLoaded()) {
        map.addSource(srcId, { type: 'geojson', data: geojson });
        // White casing for contrast on any map style
        map.addLayer({ id: casingId, type: 'line', source: srcId,
          paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.5 },
          layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id: layerId, type: 'line', source: srcId,
          paint: { 'line-color': '#facc15', 'line-width': 4.5, 'line-opacity': 1 },
          layout: { 'line-cap': 'round', 'line-join': 'round' } });
      }

      if (coords.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds();
        coords.forEach((c: [number, number]) => bounds.extend(c));
        map.fitBounds(bounds, { padding: { top: 80, bottom: 320, left: 40, right: 40 }, maxZoom: 15, duration: 700 });
      }
    }

    if (pickup && delivery && isFinite(pickup.lat) && isFinite(delivery.lat)) {
      // Fetch real road route from Mapbox Directions API
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${delivery.lng},${delivery.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const routeCoords: [number, number][] = data?.routes?.[0]?.geometry?.coordinates ?? [];
          if (routeCoords.length > 0) {
            applyRoute(routeCoords);
          } else {
            // Fallback to straight line if API fails
            applyRoute([[pickup.lng, pickup.lat], [delivery.lng, delivery.lat]]);
          }
        })
        .catch(() => {
          applyRoute([[pickup.lng, pickup.lat], [delivery.lng, delivery.lat]]);
        });
    } else {
      // Clear route if no coords
      if (map.getSource(srcId)) {
        (map.getSource(srcId) as any).setData({
          type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] },
        });
      }
    }
  }, [pickup, delivery, pickupBadge, deliveryBadge, glReady]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#e5e7eb' }}>
      {!glReady && MAPBOX_TOKEN && (
        <img src={staticMapUrl(DEFAULT_CENTER, 15, 600, 600, dark)} alt="Mapa"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      {!glFailed && (
        <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: glReady ? 1 : 0, transition: 'opacity 0.3s' }} />
      )}
      {!MAPBOX_TOKEN && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Mapa no disponible</p>
        </div>
      )}
    </div>
  );
}

