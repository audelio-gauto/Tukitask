'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function mkMarker(emoji: string, bg: string, border: string) {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:48px;height:48px',
    `background:${bg}`,
    'border-radius:50%',
    'display:flex;align-items:center;justify-content:center',
    'font-size:22px',
    `border:3px solid ${border}`,
    'box-shadow:0 4px 16px rgba(0,0,0,0.6)',
    'cursor:default;user-select:none',
  ].join(';');
  el.textContent = emoji;
  return el;
}

let _abortCtl: AbortController | null = null;

function drawRoute(map: any, from: [number, number], to: [number, number]) {
  if (_abortCtl) _abortCtl.abort();
  _abortCtl = new AbortController();

  const applyCoords = (coords: [number, number][]) => {
    if (!map.getSource) return;
    const geo: any = {
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    };
    if (map.getSource('tr')) {
      (map.getSource('tr') as any).setData(geo);
    } else {
      map.addSource('tr', { type: 'geojson', data: geo });
      map.addLayer({
        id: 'tr-casing', type: 'line', source: 'tr',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.18 },
      });
      map.addLayer({
        id: 'tr-line', type: 'line', source: 'tr',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 4.5, 'line-dasharray': [2, 2.2] },
      });
    }
  };

  fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`,
    { signal: _abortCtl.signal },
  )
    .then(r => r.json())
    .then(d => {
      const c = d?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
      applyCoords(c && c.length > 1 ? c : [from, to]);
    })
    .catch(() => applyCoords([from, to]));
}

function fitBounds(map: any, mb: any, a: [number, number], b: [number, number]) {
  map.fitBounds(
    new mb.LngLatBounds(
      [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    ),
    { padding: { top: 100, bottom: 310, left: 50, right: 50 }, maxZoom: 16, duration: 900 },
  );
}

interface Props {
  tecnicoLat:   number | null;
  tecnicoLng:   number | null;
  clientLat:    number | null;
  clientLng:    number | null;
  status:       string;
  tecnicoName?: string | null;
}

export default function TecnicoTrackMap({
  tecnicoLat, tecnicoLng, clientLat, clientLng, status, tecnicoName,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const mbRef        = useRef<any>(null);
  const techMkr      = useRef<any>(null);
  const homeMkr      = useRef<any>(null);
  const boundsSet    = useRef(false);
  const initDone     = useRef(false);

  const [ready, setReady] = useState(false);
  const [err,   setErr]   = useState(false);

  const hasTech   = tecnicoLat != null && tecnicoLng != null;
  const hasClient = clientLat  != null && clientLng  != null;

  /* ─── Init map once ───────────────────────────────────────────── */
  useEffect(() => {
    if (initDone.current || !containerRef.current || !MAPBOX_TOKEN) return;
    initDone.current = true;
    let alive = true;

    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;

        if (!document.getElementById('mapbox-gl-css')) {
          const link = document.createElement('link');
          link.id   = 'mapbox-gl-css';
          link.rel  = 'stylesheet';
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
          document.head.appendChild(link);
        }

        if (!alive || !containerRef.current) return;

        if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
          if (alive) setErr(true);
          return;
        }

        mbRef.current = mapboxgl;

        const center: [number, number] = hasTech
          ? [tecnicoLng!, tecnicoLat!]
          : hasClient
            ? [clientLng!, clientLat!]
            : [-57.5759, -25.2637];

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center,
          zoom: 14,
          accessToken: MAPBOX_TOKEN,
          attributionControl: false,
          logoPosition: 'bottom-right',
          failIfMajorPerformanceCaveat: false,
        });

        mapRef.current = map;

        map.on('load', () => {
          if (!alive) return;

          if (hasClient) {
            homeMkr.current = new mapboxgl.Marker({ element: mkMarker('🏠', '#F59E0B', 'rgba(255,255,255,0.9)') })
              .setLngLat([clientLng!, clientLat!])
              .addTo(map);
          }

          if (hasTech) {
            techMkr.current = new mapboxgl.Marker({ element: mkMarker('🛺', '#0EA5E9', 'rgba(255,255,255,0.9)') })
              .setLngLat([tecnicoLng!, tecnicoLat!])
              .addTo(map);
          }

          if (hasTech && hasClient) {
            drawRoute(map, [tecnicoLng!, tecnicoLat!], [clientLng!, clientLat!]);
            fitBounds(map, mapboxgl, [tecnicoLng!, tecnicoLat!], [clientLng!, clientLat!]);
            boundsSet.current = true;
          } else if (hasTech) {
            map.flyTo({ center: [tecnicoLng!, tecnicoLat!], zoom: 15 });
          } else if (hasClient) {
            map.flyTo({ center: [clientLng!, clientLat!], zoom: 15 });
          }

          setReady(true);
        });

        map.on('error', (e: any) => {
          const msg: string = e?.error?.message ?? '';
          if ((msg.toLowerCase().includes('webgl') || msg.toLowerCase().includes('gl context')) && alive) {
            try { map.remove(); } catch {}
            mapRef.current = null;
            setErr(true);
          }
        });
      } catch {
        if (alive) setErr(true);
      }
    })();

    return () => {
      alive = false;
      if (_abortCtl) { _abortCtl.abort(); _abortCtl = null; }
      if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; }
      techMkr.current = homeMkr.current = null;
      initDone.current = boundsSet.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Update tecnico marker + route on every GPS tick ────────── */
  useEffect(() => {
    const map = mapRef.current;
    const mb  = mbRef.current;
    if (!map || !mb || !ready || !hasTech) return;

    if (techMkr.current) {
      techMkr.current.setLngLat([tecnicoLng!, tecnicoLat!]);
    } else {
      techMkr.current = new mb.Marker({ element: mkMarker('🛺', '#0EA5E9', 'rgba(255,255,255,0.9)') })
        .setLngLat([tecnicoLng!, tecnicoLat!])
        .addTo(map);
    }

    if (hasClient) {
      drawRoute(map, [tecnicoLng!, tecnicoLat!], [clientLng!, clientLat!]);
      if (!boundsSet.current) {
        fitBounds(map, mb, [tecnicoLng!, tecnicoLat!], [clientLng!, clientLat!]);
        boundsSet.current = true;
      }
    }
  }, [tecnicoLat, tecnicoLng, ready, hasTech, hasClient, clientLat, clientLng]);

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0b1220' }}>
      {/* Interactive GL map */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Loading spinner */}
      {!ready && !err && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 48, height: 48,
            border: '4px solid #1e293b', borderTop: '4px solid #38bdf8',
            borderRadius: '50%', animation: 'mapspin .75s linear infinite',
          }} />
          <span style={{ color: '#475569', fontSize: '0.82rem' }}>Cargando mapa…</span>
          <style>{`@keyframes mapspin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Hard WebGL error */}
      {err && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{ fontSize: '2.5rem' }}>🗺️</span>
          <span style={{ color: '#475569', fontSize: '0.82rem' }}>Mapa no disponible</span>
        </div>
      )}

      {/* EN VIVO badge */}
      {ready && hasTech && (
        <div style={{
          position: 'absolute', top: 60, right: 14, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)',
          padding: '5px 12px', borderRadius: 20,
          border: '1px solid rgba(34,197,94,0.5)',
        }}>
          <span style={{
            width: 7, height: 7, background: '#22c55e', borderRadius: '50%', display: 'inline-block',
            animation: 'livepulse 1.5s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '0.72rem', color: '#4ade80', fontWeight: 800, letterSpacing: '0.06em' }}>EN VIVO</span>
        </div>
      )}

      {/* Legend chips */}
      {ready && (
        <div style={{ position: 'absolute', bottom: 300, left: 14, zIndex: 20, display: 'flex', gap: 6 }}>
          {hasTech && (
            <span style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)' }}>
              🛺 Técnico
            </span>
          )}
          {hasClient && (
            <span style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)' }}>
              🏠 Tu casa
            </span>
          )}
        </div>
      )}

      <style>{`@keyframes livepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.7)}}`}</style>
    </div>
  );
}
