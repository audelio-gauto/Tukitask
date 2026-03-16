'use client';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function ClientMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const defaultLat = -25.2637;
    const defaultLng = -57.5759;

    const map = L.map(mapRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const selfIcon = L.divIcon({
      className: 'client-map-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const marker = L.marker([defaultLat, defaultLng], { icon: selfIcon }).addTo(map);
    markerRef.current = marker;
    mapInstance.current = map;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 16, { animate: true });
          marker.setLatLng([latitude, longitude]);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );

      navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          marker.setLatLng([latitude, longitude]);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000 }
      );
    }

    setTimeout(() => {
      map.invalidateSize();
      setReady(true);
    }, 300);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }}
    />
  );
}
