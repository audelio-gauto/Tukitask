'use client';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function DriverMap({ onLocate }: { onLocate?: (fn: () => void) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Default: Asunción, Paraguay
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

    // Driver self-marker (green dot)
    const selfIcon = L.divIcon({
      className: 'tuki-driver-self-marker',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const marker = L.marker([defaultLat, defaultLng], { icon: selfIcon }).addTo(map);
    markerRef.current = marker;
    mapInstance.current = map;

    // Watch geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 16, { animate: true });
          marker.setLatLng([latitude, longitude]);
        },
        () => {}, // Silently fail if denied
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

    // Fix map size after render
    setTimeout(() => {
      map.invalidateSize();
      setReady(true);
    }, 300);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Expose locate function to parent
  useEffect(() => {
    if (onLocate) {
      onLocate(() => {
        if (!mapInstance.current || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          mapInstance.current?.setView([latitude, longitude], 16, { animate: true });
          markerRef.current?.setLatLng([latitude, longitude]);
        });
      });
    }
  }, [onLocate]);

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
  );
}
