'use client';
import { useEffect, useRef } from 'react';

// Default: Asunción, Paraguay
const DEFAULT_LAT = -25.2867;
const DEFAULT_LNG = -57.647;

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<unknown>(null);
  const markerRef      = useRef<unknown>(null);
  const onChangeRef    = useRef(onChange);
  onChangeRef.current  = onChange;

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    if (mapRef.current) return; // already initialized

    const initLat = lat ?? DEFAULT_LAT;
    const initLng = lng ?? DEFAULT_LNG;

    import('leaflet').then(({ default: L }) => {
      // Fix broken default icon paths in bundler environments
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50%;
          background:#F5C518;border:3px solid #0b1220;
          box-shadow:0 2px 10px rgba(0,0,0,0.35);
          cursor:grab;
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const map = L.map(containerRef.current!, {
        center: [initLat, initLng],
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([initLat, initLng], { draggable: true, icon }).addTo(map);

      marker.on('dragend', () => {
        const pos = (marker as L.Marker).getLatLng();
        onChangeRef.current(pos.lat, pos.lng);
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        (marker as L.Marker).setLatLng(e.latlng);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current    = map;
      markerRef.current = marker;
    });

    return () => {
      if (mapRef.current) {
        (mapRef.current as L.Map).remove();
        mapRef.current    = null;
        markerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move marker when parent passes updated coords (e.g. from geolocation)
  useEffect(() => {
    if (!markerRef.current || !mapRef.current || lat == null || lng == null) return;
    (markerRef.current as L.Marker).setLatLng([lat, lng]);
    (mapRef.current as L.Map).setView([lat, lng], 16);
  }, [lat, lng]);

  return (
    <>
      {/* Leaflet CSS — injected once */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div
        ref={containerRef}
        style={{ height: 300, borderRadius: 14, overflow: 'hidden', zIndex: 0, border: '1px solid var(--tnd-border)' }}
      />
    </>
  );
}
