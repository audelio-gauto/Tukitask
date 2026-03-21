'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER: [number, number] = [-57.5759, -25.2637]; // Asunción [lng, lat]

interface LocationPickerProps {
  mode: 'pickup' | 'delivery';
  initialCenter?: { lat: number; lng: number } | null;
  onConfirm: (address: string, lat: number, lng: number) => void;
  onClose: () => void;
}

export default function LocationPicker({ mode, initialCenter, onConfirm, onClose }: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const [address, setAddress] = useState('Moviendo el mapa...');
  const [loading, setLoading] = useState(false);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Reverse geocode via our API proxy
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const res = await fetch('/api/maps/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reverse: true, lat, lng }),
      });
      const data = await res.json();
      if (mountedRef.current) {
        setAddress(data?.name || data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch {
      if (mountedRef.current) setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Center on user location
  const centerOnUser = useCallback(() => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 800 });
        userMarkerRef.current?.setLngLat([lng, lat]);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;
    mountedRef.current = true;
    let map: any;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      if (!mountedRef.current || !mapContainerRef.current) return;

      const center: [number, number] = initialCenter
        ? [initialCenter.lng, initialCenter.lat]
        : DEFAULT_CENTER;

      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom: 16,
        accessToken: MAPBOX_TOKEN,
        attributionControl: false,
      });
      mapRef.current = map;

      // Blue dot for user location
      const userEl = document.createElement('div');
      userEl.style.cssText = 'width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(66,133,244,0.5);';
      userMarkerRef.current = new mapboxgl.Marker({ element: userEl })
        .setLngLat(center)
        .addTo(map);

      // Get user location to show blue dot
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            userMarkerRef.current?.setLngLat([lng, lat]);
            if (!initialCenter) {
              map.flyTo({ center: [lng, lat], zoom: 17, duration: 800 });
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 },
        );
      }

      // Reverse geocode on initial center
      map.on('load', () => {
        const c = map.getCenter();
        reverseGeocode(c.lat, c.lng);
      });

      // On map move end, reverse geocode the center
      map.on('moveend', () => {
        if (!mountedRef.current) return;
        const c = map.getCenter();
        if (reverseTimer.current) clearTimeout(reverseTimer.current);
        reverseTimer.current = setTimeout(() => {
          reverseGeocode(c.lat, c.lng);
        }, 300);
      });

      // While moving, show loading text
      map.on('move', () => {
        if (mountedRef.current) {
          setAddress('Moviendo el mapa...');
          setLoading(true);
        }
      });
    })();

    return () => {
      mountedRef.current = false;
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      if (map) { map.remove(); mapRef.current = null; }
    };
  }, [initialCenter, reverseGeocode]);

  const handleConfirm = () => {
    if (!mapRef.current) return;
    const c = mapRef.current.getCenter();
    onConfirm(address, c.lat, c.lng);
  };

  const pinColor = mode === 'pickup' ? '#10b981' : '#ef4444';

  return (
    <div className="lp-overlay">
      {/* Top bar with address */}
      <div className="lp-top-bar">
        <button type="button" className="lp-back-btn" onClick={onClose}>
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="lp-address-box">
          <span className={`enviar-dot ${mode === 'pickup' ? 'green' : 'red'}`} />
          <div className="lp-address-text">
            <span className="lp-address-label">{mode === 'pickup' ? 'Punto de recogida' : 'Destino de entrega'}</span>
            <span className={`lp-address-value ${loading ? 'lp-loading' : ''}`}>
              {loading ? 'Buscando dirección...' : address}
            </span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} className="lp-map" />

      {/* Fixed center pin */}
      <div className="lp-pin" style={{ color: pinColor }}>
        <svg width="40" height="52" viewBox="0 0 24 32" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0zm0 16c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"/>
        </svg>
        {/* Pin shadow on the ground */}
        <div className="lp-pin-shadow" />
      </div>

      {/* My location button */}
      <button type="button" className="lp-my-location" onClick={centerOnUser} aria-label="Mi ubicación">
        <svg width="22" height="22" fill="none" stroke="#4285F4" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" fill="#4285F4" stroke="none"/>
          <path d="M12 2v3m0 14v3m10-10h-3M5 12H2"/>
          <circle cx="12" cy="12" r="8" strokeDasharray="2 2" opacity="0.4"/>
        </svg>
      </button>

      {/* Confirm button */}
      <div className="lp-bottom">
        <button type="button" className="lp-confirm-btn" onClick={handleConfirm} disabled={loading}>
          {loading ? 'Buscando...' : 'Confirmar ubicación'}
        </button>
      </div>
    </div>
  );
}
