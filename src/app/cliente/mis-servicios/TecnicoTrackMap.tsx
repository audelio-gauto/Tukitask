'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER = { lat: -25.2637, lng: -57.5759 };

function mkMarkerEl(emoji: string, bg: string) {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:46px;height:46px',
    `background:${bg}`,
    'border-radius:50%',
    'display:flex;align-items:center;justify-content:center',
    'font-size:22px',
    'border:3px solid rgba(255,255,255,0.9)',
    'box-shadow:0 4px 14px rgba(0,0,0,0.55)',
    'user-select:none',
  ].join(';');
  el.textContent = emoji;
  return el;
}

function staticUrl(lat: number, lng: number, zoom: number, markers: string) {
  const ov = markers ? `${markers}/` : '';
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${ov}${lng},${lat},${zoom},0/640x480@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

interface Props {
  tecnicoLat:   number | null;
  tecnicoLng:   number | null;
  clientLat:    number | null;
  clientLng:    number | null;
  status:       string;
  tecnicoName?: string | null;
}

export default function TecnicoTrackMap({ tecnicoLat, tecnicoLng, clientLat, clientLng, tecnicoName }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null);
  const mapInst     = useRef<any>(null);
  const mbRef       = useRef<any>(null);
  const techMkr     = useRef<any>(null);
  const homeMkr     = useRef<any>(null);
  const initRef     = useRef(false);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const [glReady,  setGlReady]  = useState(false);
  const [glFailed, setGlFailed] = useState(false);

  const hasTech   = tecnicoLat != null && tecnicoLng != null;
  const hasClient = clientLat  != null && clientLng  != null;
  const centerLat = hasTech ? tecnicoLat! : hasClient ? clientLat! : DEFAULT_CENTER.lat;
  const centerLng = hasTech ? tecnicoLng! : hasClient ? clientLng! : DEFAULT_CENTER.lng;

  // ─── Init GL map — same pattern as ClientMap ─────────────────────────────
  useEffect(() => {
    if (initRef.current || !mapRef.current || glFailed) return;
    if (!MAPBOX_TOKEN) { setGlFailed(true); return; }
    initRef.current = true;
    let mounted = true;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id   = 'mapbox-gl-css';
        link.rel  = 'stylesheet';
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
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [centerLng, centerLat],
          zoom: 14,
          accessToken: MAPBOX_TOKEN,
          attributionControl: false,
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        if (mounted) setGlFailed(true);
        return;
      }

      // Same check as ClientMap — fall back to static if GL context fails
      if (!map.painter?.context?.gl) {
        try { map.remove(); } catch {}
        if (mounted) setGlFailed(true);
        return;
      }

      mapInst.current = map;

      map.on('error', (e: any) => {
        const msg: string = e?.error?.message ?? '';
        if (msg.includes('WebGL') && mounted) {
          try { map.remove(); } catch {}
          mapInst.current = null;
          setGlFailed(true);
        }
      });

      timerRef.current = setTimeout(() => {
        if (mounted && !mapInst.current?._loaded) {
          try { map.remove(); } catch {}
          mapInst.current = null;
          setGlFailed(true);
        }
      }, 7000);

      map.on('load', () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!mounted) return;

        if (hasClient) {
          homeMkr.current = new mapboxgl.Marker({ element: mkMarkerEl('🏠', '#F59E0B') })
            .setLngLat([clientLng!, clientLat!]).addTo(map);
        }
        if (hasTech) {
          techMkr.current = new mapboxgl.Marker({ element: mkMarkerEl('🛺', '#0EA5E9') })
            .setLngLat([tecnicoLng!, tecnicoLat!]).addTo(map);
        }

        if (hasTech && hasClient) {
          fitBoth(map, mapboxgl, tecnicoLng!, tecnicoLat!, clientLng!, clientLat!);
          fetchRoute(map, tecnicoLng!, tecnicoLat!, clientLng!, clientLat!);
        } else if (hasClient) {
          map.flyTo({ center: [clientLng!, clientLat!], zoom: 15 });
        }

        setGlReady(true);
      });
    })();

    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (mapInst.current) { try { mapInst.current.remove(); } catch {} mapInst.current = null; }
      techMkr.current = homeMkr.current = null;
      initRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glFailed]);

  // ─── Update tecnico marker & route on GPS tick ────────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    const mb  = mbRef.current;
    if (!map || !mb || !glReady || !hasTech) return;

    if (techMkr.current) {
      techMkr.current.setLngLat([tecnicoLng!, tecnicoLat!]);
    } else {
      techMkr.current = new mb.Marker({ element: mkMarkerEl('🛺', '#0EA5E9') })
        .setLngLat([tecnicoLng!, tecnicoLat!]).addTo(map);
    }
    if (hasClient) fetchRoute(map, tecnicoLng!, tecnicoLat!, clientLng!, clientLat!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecnicoLat, tecnicoLng, glReady]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function fitBoth(map: any, mb: any, tLng: number, tLat: number, cLng: number, cLat: number) {
    map.fitBounds(
      new mb.LngLatBounds([Math.min(tLng, cLng), Math.min(tLat, cLat)], [Math.max(tLng, cLng), Math.max(tLat, cLat)]),
      { padding: { top: 80, bottom: 280, left: 50, right: 50 }, maxZoom: 16, duration: 700 },
    );
  }

  function fetchRoute(map: any, tLng: number, tLat: number, cLng: number, cLat: number) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const apply = (coords: [number, number][]) => {
      const geo: any = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
      if (map.getSource('route')) {
        (map.getSource('route') as any).setData(geo);
      } else {
        map.addSource('route', { type: 'geojson', data: geo });
        map.addLayer({ id: 'r-c', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.12 } });
        map.addLayer({ id: 'r-l', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-dasharray': [2, 2] } });
      }
    };
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${tLng},${tLat};${cLng},${cLat}?geometries=geojson&overview=simplified&access_token=${MAPBOX_TOKEN}`,
      { signal: abortRef.current.signal },
    )
      .then(r => r.json())
      .then(d => {
        const c = d?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        apply(c && c.length > 1 ? c : [[tLng, tLat], [cLng, cLat]]);
      })
      .catch(() => apply([[tLng, tLat], [cLng, cLat]]));
  }

  // ─── Static image (shown while GL loads, or if GL fails) ─────────────────
  const staticImg = (() => {
    if (!MAPBOX_TOKEN) return null;
    const pins: string[] = [];
    if (hasClient) pins.push(`pin-l-home+F59E0B(${clientLng},${clientLat})`);
    if (hasTech)   pins.push(`pin-l-car+0EA5E9(${tecnicoLng},${tecnicoLat})`);
    return staticUrl(centerLat, centerLng, hasTech && hasClient ? 13 : 14, pins.join(','));
  })();

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b1220' }}>

      {/* Static dark map — always visible until GL is ready (same as ClientMap) */}
      {!glReady && staticImg && (
        <img
          src={staticImg}
          alt="Mapa"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      {/* Interactive GL map */}
      {!glFailed && (
        <div
          ref={mapRef}
          style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: glReady ? 1 : 0, transition: 'opacity 0.4s' }}
        />
      )}

      {/* EN VIVO badge */}
      {hasTech && (
        <div style={{ position: 'absolute', top: 58, right: 14, zIndex: 20, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.4)' }}>
          <span style={{ width: 7, height: 7, background: '#22c55e', borderRadius: '50%', display: 'inline-block', animation: 'lp 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 800 }}>EN VIVO</span>
        </div>
      )}

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 290, left: 14, zIndex: 20, display: 'flex', gap: 6 }}>
        {hasClient && <span style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)' }}>🏠 Tu casa</span>}
        {hasTech   && <span style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.1)' }}>🛺 {tecnicoName ?? 'Técnico'}</span>}
      </div>

      <style>{`@keyframes lp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.8)}}`}</style>
    </div>
  );
}