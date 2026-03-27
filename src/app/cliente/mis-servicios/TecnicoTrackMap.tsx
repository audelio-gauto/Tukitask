'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function createEl(emoji: string, bg: string, size = 38) {
  const el = document.createElement('div');
  el.style.cssText = [
    `width:${size}px;height:${size}px`,
    `background:${bg}`,
    'border-radius:50%',
    'display:flex;align-items:center;justify-content:center',
    `font-size:${Math.round(size * 0.52)}px`,
    'border:2.5px solid rgba(255,255,255,0.9)',
    'box-shadow:0 2px 10px rgba(0,0,0,0.4)',
    'cursor:default',
  ].join(';');
  el.textContent = emoji;
  return el;
}

function staticMapUrl(lat: number, lng: number, zoom: number, w: number, h: number, markers = '') {
  const base = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static`;
  const ov   = markers ? `${markers}/` : '';
  return `${base}/${ov}${lng},${lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

interface Props {
  tecnicoLat: number | null;
  tecnicoLng: number | null;
  clientLat:  number | null;
  clientLng:  number | null;
  status:     string;
  tecnicoName?: string | null;
}

export default function TecnicoTrackMap({ tecnicoLat, tecnicoLng, clientLat, clientLng, status, tecnicoName }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const mapInst    = useRef<any>(null);
  const mbRef      = useRef<any>(null);
  const techMarker = useRef<any>(null);
  const homeMarker = useRef<any>(null);
  const initRef    = useRef(false);
  const loadTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [glReady,  setGlReady]  = useState(false);
  const [glFailed, setGlFailed] = useState(false);

  const hasTech   = tecnicoLat != null && tecnicoLng != null;
  const hasClient = clientLat  != null && clientLng  != null;

  // Status label
  const statusLabel: Record<string, string> = {
    en_camino:          '🚗 Técnico en camino',
    llegue:             '📍 Técnico llegó',
    en_proceso:         '🔧 Técnico trabajando',
    completion_pending: '✅ Esperando confirmación',
    accepted:           '✅ Técnico confirmado',
  };

  // GL map init
  useEffect(() => {
    if (!mapRef.current || initRef.current || glFailed || !MAPBOX_TOKEN) return;
    initRef.current = true;
    let mounted = true;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      if (!document.getElementById('mapbox-gl-css')) {
        const link  = document.createElement('link');
        link.id     = 'mapbox-gl-css';
        link.rel    = 'stylesheet';
        link.href   = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      if (!mounted || !mapRef.current) return;

      if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
        if (mounted) setGlFailed(true);
        return;
      }

      const center: [number, number] = hasTech
        ? [tecnicoLng!, tecnicoLat!]
        : hasClient ? [clientLng!, clientLat!] : [-57.5759, -25.2637];

      mbRef.current = mapboxgl;
      let map: any;
      try {
        map = new mapboxgl.Map({
          container: mapRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center,
          zoom: 14,
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

      mapInst.current = map;

      map.on('error', () => {
        if (mounted) {
          try { map.remove(); } catch {}
          mapInst.current = null;
          setGlFailed(true);
        }
      });

      loadTimer.current = setTimeout(() => {
        if (mounted && !mapInst.current?._loaded) {
          try { map.remove(); } catch {}
          mapInst.current = null;
          setGlFailed(true);
        }
      }, 6000);

      map.on('load', () => {
        if (loadTimer.current) clearTimeout(loadTimer.current);
        if (mounted) setGlReady(true);
      });
    })();

    return () => {
      mounted = false;
      if (loadTimer.current) clearTimeout(loadTimer.current);
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
      techMarker.current = null;
      homeMarker.current = null;
      initRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glFailed]);

  // Update markers and fit bounds when positions change
  useEffect(() => {
    const map  = mapInst.current;
    const mbox = mbRef.current;
    if (!map || !mbox || !glReady) return;

    // Tecnico marker (moving car)
    if (hasTech) {
      if (!techMarker.current) {
        const el = createEl('🛺', '#0ea5e9');
        techMarker.current = new mbox.Marker({ element: el })
          .setLngLat([tecnicoLng!, tecnicoLat!])
          .addTo(map);
      } else {
        techMarker.current.setLngLat([tecnicoLng!, tecnicoLat!]);
      }
    }

    // Client home marker
    if (hasClient) {
      if (!homeMarker.current) {
        const el = createEl('🏠', '#F5C518');
        homeMarker.current = new mbox.Marker({ element: el })
          .setLngLat([clientLng!, clientLat!])
          .addTo(map);
      } else {
        homeMarker.current.setLngLat([clientLng!, clientLat!]);
      }
    }

    // Draw or update route line
    const srcId  = 'track-route';
    const layerId = 'track-route-layer';
    const casingId = 'track-route-casing';

    const applyRoute = (coords: [number, number][]) => {
      const geojson: any = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
      if (map.getSource(srcId)) {
        (map.getSource(srcId) as any).setData(geojson);
      } else {
        map.addSource(srcId, { type: 'geojson', data: geojson });
        map.addLayer({ id: casingId, type: 'line', source: srcId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.4 } }, 'road-label');
        map.addLayer({ id: layerId,  type: 'line', source: srcId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0ea5e9', 'line-width': 3.5, 'line-dasharray': [2, 2] } }, 'road-label');
      }
    };

    if (hasTech && hasClient) {
      // Fetch real road route
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${tecnicoLng},${tecnicoLat};${clientLng},${clientLat}?geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`;
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
          if (coords && coords.length > 1) {
            applyRoute(coords);
          } else {
            applyRoute([[tecnicoLng!, tecnicoLat!], [clientLng!, clientLat!]]);
          }
        })
        .catch(() => {
          applyRoute([[tecnicoLng!, tecnicoLat!], [clientLng!, clientLat!]]);
        });

      // Fit bounds
      const bounds = new mbox.LngLatBounds(
        [Math.min(tecnicoLng!, clientLng!), Math.min(tecnicoLat!, clientLat!)],
        [Math.max(tecnicoLng!, clientLng!), Math.max(tecnicoLat!, clientLat!)],
      );
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 50, right: 50 }, maxZoom: 16, duration: 600 });
    } else if (hasTech) {
      map.flyTo({ center: [tecnicoLng!, tecnicoLat!], zoom: 15, duration: 600 });
    } else if (hasClient) {
      map.flyTo({ center: [clientLng!, clientLat!], zoom: 15, duration: 600 });
    }
  }, [glReady, tecnicoLat, tecnicoLng, clientLat, clientLng, hasTech, hasClient]);

  // Fallback: dark Mapbox static image
  const fallbackImg = () => {
    if (!MAPBOX_TOKEN) return null;
    if (hasTech && hasClient) {
      const markers = [
        `pin-l-home+F5C518(${clientLng},${clientLat})`,
        `pin-l-car+0ea5e9(${tecnicoLng},${tecnicoLat})`,
      ].join(',');
      const midLat = ((tecnicoLat! + clientLat!) / 2);
      const midLng = ((tecnicoLng! + clientLng!) / 2);
      return staticMapUrl(midLat, midLng, 13, 640, 320, markers);
    }
    if (hasTech)   return staticMapUrl(tecnicoLat!, tecnicoLng!, 14, 640, 320, `pin-l-car+0ea5e9(${tecnicoLng},${tecnicoLat})`);
    if (hasClient) return staticMapUrl(clientLat!,  clientLng!,  14, 640, 320, `pin-l-home+F5C518(${clientLng},${clientLat})`);
    return null;
  };

  const fbImg = fallbackImg();

  return (
    <div style={{ position: 'relative', width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', background: '#0f172a' }}>
      {/* Status chip */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 20, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(6px)', borderRadius: 20, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.08)' }}>
        {statusLabel[status] ?? '📍 En camino'}
        {tecnicoName && <span style={{ color: '#94a3b8', marginLeft: 6 }}>· {tecnicoName}</span>}
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 20, display: 'flex', gap: 8, fontSize: '0.72rem', color: '#f1f5f9' }}>
        <span style={{ background: 'rgba(15,23,42,0.8)', padding: '3px 8px', borderRadius: 10 }}>🛺 Técnico</span>
        <span style={{ background: 'rgba(15,23,42,0.8)', padding: '3px 8px', borderRadius: 10 }}>🏠 Tu casa</span>
      </div>

      {/* Pulse dot on tec marker for "live" feel */}
      {hasTech && glReady && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(15,23,42,0.8)', padding: '4px 9px', borderRadius: 20 }}>
          <span style={{ width: 7, height: 7, background: '#22c55e', borderRadius: '50%', display: 'inline-block', animation: 'livepulse 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 700 }}>EN VIVO</span>
        </div>
      )}

      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.5)} }
      `}</style>

      {/* GL Map */}
      {!glFailed && (
        <div
          ref={mapRef}
          style={{ position: 'absolute', inset: 0, opacity: glReady ? 1 : 0, transition: 'opacity 0.4s', zIndex: 5 }}
        />
      )}

      {/* Static fallback shown while GL is loading / failed */}
      {(!glReady || glFailed) && fbImg && (
        <img
          src={fbImg}
          alt="Mapa de seguimiento"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 3 }}
        />
      )}

      {/* No token fallback */}
      {!MAPBOX_TOKEN && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem', zIndex: 4 }}>
          Mapa no disponible
        </div>
      )}
    </div>
  );
}
