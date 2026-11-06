import { useEffect, useRef, type RefObject } from 'react';
import type mapboxgl from 'mapbox-gl';
import { vehicleIconHtml, vehicleKindFrom } from '@/lib/mapVehicle';

export interface NearbyDriverPin {
  vehicle_type: string;
  lat: number;
  lng: number;
}

export function useNearbyDriverMarkers(
  mapRef: RefObject<mapboxgl.Map | null>,
  mapboxRef: RefObject<typeof mapboxgl | null>,
  ready: boolean,
  drivers: NearbyDriverPin[],
) {
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = mapboxRef.current;
    if (!map || !mapbox || !ready) return;
    const markers = markersRef.current;
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    for (const driver of drivers) {
      if (!Number.isFinite(driver.lat) || !Number.isFinite(driver.lng)) continue;
      const kind = vehicleKindFrom(driver.vehicle_type);
      const position = `${kind}:${driver.lat}:${driver.lng}`;
      const count = counts.get(position) ?? 0;
      counts.set(position, count + 1);
      const key = `${position}:${count}`;
      seen.add(key);
      if (markers.has(key)) continue;
      const el = document.createElement('div');
      el.className = 'client-nearby-vehicle';
      el.innerHTML = `<div class="client-nearby-vehicle-icon">${vehicleIconHtml(kind)}</div>`;
      markers.set(key, new mapbox.Marker({ element: el }).setLngLat([driver.lng, driver.lat]).addTo(map));
    }
    for (const [key, marker] of markers) {
      if (!seen.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
  }, [mapRef, mapboxRef, ready, drivers]);

  useEffect(() => {
    if (!ready) return;
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, [ready]);
}
