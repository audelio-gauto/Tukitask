'use client';
import { useEffect, useRef, useState } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function staticMapUrl(center: { lat: number; lng: number }, zoom: number, w: number, h: number) {
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${center.lng},${center.lat},${zoom},0/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
}

export default function DriverMap({ onLocate }: { onLocate?: (fn: () => void) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const initRef = useRef(false); // guard against StrictMode double-init
  const [ready, setReady] = useState(false);
  const [useStatic, setUseStatic] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get user location for static fallback
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!mapRef.current || initRef.current) return;
    if (!MAPBOX_TOKEN) { setUseStatic(true); return; }

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

      // Use Mapbox's own browser check (checks specific WebGL extensions)
      if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
        if (mounted) setUseStatic(true);
        return;
      }

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

      // WebGL error fires as internal event during constructor.
      // Check that painter AND its GL context actually exist.
      if (!map.painter?.context?.gl) {
        try { map.remove(); } catch {}
        if (mounted) setUseStatic(true);
        return;
      }

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      const selfEl = document.createElement('div');
      selfEl.className = 'tuki-driver-self-marker';
      const marker = new mapboxgl.Marker({ element: selfEl })
        .setLngLat([defaultLng, defaultLat])
        .addTo(map);
      markerRef.current = marker;
      mapInstance.current = map;

      map.on('error', (e: any) => {
        if (e?.error?.message?.includes('WebGL') && mounted) {
          try { map.remove(); } catch {}
          mapInstance.current = null;
          setUseStatic(true);
        }
      });

      // Safety timeout: if map doesn't fire 'load' within 6s, fall back
      loadTimerRef.current = setTimeout(() => {
        if (mounted && !mapInstance.current?._loaded) {
          try { map.remove(); } catch {}
          mapInstance.current = null;
          setUseStatic(true);
        }
      }, 6000);

      map.on('load', () => {
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
        if (mounted) setReady(true);
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
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      initRef.current = false;
    };
  }, []);

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

  // --- Static image fallback ---
  if (useStatic) {
    const center = userPos || { lat: -25.2637, lng: -57.5759 };
    const url = staticMapUrl(center, 15, 600, 600);
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#e5e7eb' }}>
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
      style={{
        position: 'absolute',
        inset: 0,
        minHeight: 300,
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.3s',
      }}
    />
  );
}
