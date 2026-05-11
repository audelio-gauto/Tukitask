'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface RoutePreviewMapProps {
  pickup: { lat: number; lng: number };
  stops: Array<{ lat: number; lng: number }>;
  routeCoords?: Array<{ lat: number; lng: number }>;
}

function useDarkMode() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') !== 'light'
      : true,
  );
  useEffect(() => {
    const read = () => document.documentElement.getAttribute('data-theme') !== 'light';
    setDark(read());
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export default function RoutePreviewMap({ pickup, stops, routeCoords = [] }: RoutePreviewMapProps) {
  const dark = useDarkMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mbRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const initRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || initRef.current || !MAPBOX_TOKEN) {
      if (!MAPBOX_TOKEN) setFailed(true);
      return;
    }
    initRef.current = true;
    let mounted = true;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      // Inject CSS once
      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }
      if (!mounted || !containerRef.current) return;
      if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
        if (mounted) setFailed(true);
        return;
      }

      mbRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const style = dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';

      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style,
        center: [pickup.lng, pickup.lat],
        zoom: 13,
        interactive: false, // no drag/zoom — prevents mobile scroll hijacking
        attributionControl: false,
        logoPosition: 'bottom-left',
      });

      mapRef.current = map;

      map.on('load', () => {
        if (!mounted) return;
        setReady(true);
      });

      map.on('error', () => {
        if (mounted) setFailed(true);
      });
    })();

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update map style when dark/light mode changes ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
    map.setStyle(style);
  }, [dark, ready]);

  // ── Draw markers + polyline whenever coords or readiness change ───────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl || !ready) return;

    // Remove previous markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    // Helper: create a styled pin element
    const makePin = (color: string, label: string) => {
      const el = document.createElement('div');
      el.style.cssText = [
        `width:28px`,
        `height:28px`,
        `background:${color}`,
        `color:#fff`,
        `border-radius:50% 50% 50% 0`,
        `transform:rotate(-45deg)`,
        `border:2px solid #fff`,
        `box-shadow:0 2px 8px rgba(0,0,0,0.4)`,
        `display:flex`,
        `align-items:center`,
        `justify-content:center`,
        `font-weight:800`,
        `font-size:11px`,
        `cursor:default`,
      ].join(';');
      const inner = document.createElement('div');
      inner.style.cssText = `transform:rotate(45deg);line-height:1;`;
      inner.textContent = label;
      el.appendChild(inner);
      return el;
    };

    // Pickup marker (green)
    const pickupMarker = new mapboxgl.Marker({ element: makePin('#22c55e', 'A'), anchor: 'bottom' })
      .setLngLat([pickup.lng, pickup.lat])
      .addTo(map);
    markersRef.current.push(pickupMarker);

    // Stop markers (red, numbered)
    const validStops = stops.filter(s => isFinite(s.lat) && isFinite(s.lng));
    validStops.forEach((stop, i) => {
      const label = validStops.length === 1 ? 'B' : String(i + 1);
      const m = new mapboxgl.Marker({ element: makePin('#ef4444', label), anchor: 'bottom' })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      markersRef.current.push(m);
    });

    // Draw or update route polyline
    const SOURCE_ID = 'route-preview';
    const LAYER_ID = 'route-preview-line';

    const geojson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoords.length >= 2
          ? routeCoords.map(c => [c.lng, c.lat])
          : [
              [pickup.lng, pickup.lat],
              ...validStops.map(s => [s.lng, s.lat]),
            ],
      },
    };

    if (map.getSource(SOURCE_ID)) {
      (map.getSource(SOURCE_ID) as any).setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
      // Shadow (casing) for readability on light maps
      map.addLayer({
        id: `${LAYER_ID}-casing`,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-dasharray': [0, 0] },
      });
    }

    // Fit all points in view with padding
    const allCoords: [number, number][] = [
      [pickup.lng, pickup.lat],
      ...validStops.map(s => [s.lng, s.lat] as [number, number]),
    ];
    if (allCoords.length >= 2) {
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(allCoords[0], allCoords[0]),
      );
      map.fitBounds(bounds, {
        padding: { top: 40, bottom: 40, left: 40, right: 40 },
        maxZoom: 16,
        duration: 600,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pickup.lat, pickup.lng, stops, routeCoords]);

  // ── Re-add layers after style change ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.once('styledata', () => {
      // After style reload, mark as ready again to re-draw
      setReady(r => { if (r) { /* force re-run of draw effect */ } return r; });
    });
  }, [dark]);

  // ── Fallback: static image when GL not supported ───────────────────────────
  if (failed) {
    const allPts = [pickup, ...stops.filter(s => isFinite(s.lat) && isFinite(s.lng))];
    const centerLat = allPts.reduce((a, p) => a + p.lat, 0) / allPts.length;
    const centerLng = allPts.reduce((a, p) => a + p.lng, 0) / allPts.length;
    const style = dark ? 'dark-v11' : 'streets-v12';
    const markers = [
      `pin-s-a+22c55e(${pickup.lng},${pickup.lat})`,
      ...stops.filter(s => isFinite(s.lat) && isFinite(s.lng))
        .map((s, i) => `pin-s-${String.fromCharCode(98 + i)}+ef4444(${s.lng},${s.lat})`),
    ].join(',');
    const imgUrl = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${markers}/${centerLng},${centerLat},12,0/600x220@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
    return (
      <div className="enviar-map-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgUrl} alt="Vista previa de la ruta" className="enviar-map-preview-static" />
      </div>
    );
  }

  return (
    <div className="enviar-map-preview">
      {!ready && (
        <div className="enviar-map-preview-skeleton">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="enviar-map-preview-skeleton-icon">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </div>
      )}
      <div
        ref={containerRef}
        className="enviar-map-preview-canvas"
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.4s ease' }}
      />
    </div>
  );
}
