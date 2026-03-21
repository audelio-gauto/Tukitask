'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER = { lat: -25.2637, lng: -57.5759 };

function staticMapUrl(center: { lat: number; lng: number }, zoom: number, w: number, h: number) {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${center.lng},${center.lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

export default function DriverMap({ onLocate }: { onLocate?: (fn: () => void) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
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

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#e5e7eb' }}>
      {/* Static image — always visible as base layer until GL loads */}
      {!glReady && MAPBOX_TOKEN && (
        <img
          src={staticMapUrl(DEFAULT_CENTER, 15, 600, 600)}
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
