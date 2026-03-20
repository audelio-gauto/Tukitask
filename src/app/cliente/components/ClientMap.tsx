'use client';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function ClientMap({
  pickup,
  delivery,
  routeCoords,
}: {
  pickup?: { lat: number; lng: number } | null;
  delivery?: { lat: number; lng: number } | null;
  routeCoords?: Array<{ lat: number; lng: number }> | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const pickupMarker = useRef<L.Marker | null>(null);
  const deliveryMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    let mounted = true;
    const watchIdRef: { current: number | null } = { current: null };

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
          if (!mounted || !mapInstance.current) return;
          try {
            const { latitude, longitude } = pos.coords;
            if ((map as any)._container) map.setView([latitude, longitude], 16, { animate: true });
            marker.setLatLng([latitude, longitude]);
          } catch (err) {
            console.warn('ClientMap getCurrentPosition error', err);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!mounted || !mapInstance.current) return;
          try {
            const { latitude, longitude } = pos.coords;
            marker.setLatLng([latitude, longitude]);
          } catch (err) {
            console.warn('ClientMap watchPosition error', err);
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000 }
      );
    }

    setTimeout(() => {
      try {
        if (mounted && mapInstance.current && (map as any)._container) {
          map.invalidateSize();
          setReady(true);
        }
      } catch (err) {
        console.warn('ClientMap invalidateSize error', err);
      }
    }, 300);

    return () => {
      mounted = false;
      try {
        if (watchIdRef.current !== null && navigator.geolocation && (navigator.geolocation as any).clearWatch) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      } catch (err) {
        // ignore
      }
      try {
        map.remove();
      } catch (err) {
        // ignore
      }
      mapInstance.current = null;
    };
  }, []);

  // Update pickup/delivery markers and route
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // helper to create label icon
    const createLabelIcon = (label: string, color = '#10b981') => {
      return L.divIcon({
        className: 'custom-label-icon',
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700">${label}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    };

    // pickup
    if (pickup && isFinite(pickup.lat) && isFinite(pickup.lng)) {
      if (!pickupMarker.current) {
        pickupMarker.current = L.marker([pickup.lat, pickup.lng], { icon: createLabelIcon('A', '#10b981') }).addTo(map);
      } else {
        pickupMarker.current.setLatLng([pickup.lat, pickup.lng]);
      }
    } else {
      if (pickupMarker.current) {
        map.removeLayer(pickupMarker.current);
        pickupMarker.current = null;
      }
    }

    // delivery
    if (delivery && isFinite(delivery.lat) && isFinite(delivery.lng)) {
      if (!deliveryMarker.current) {
        deliveryMarker.current = L.marker([delivery.lat, delivery.lng], { icon: createLabelIcon('B', '#ef4444') }).addTo(map);
      } else {
        deliveryMarker.current.setLatLng([delivery.lat, delivery.lng]);
      }
    } else {
      if (deliveryMarker.current) {
        map.removeLayer(deliveryMarker.current);
        deliveryMarker.current = null;
      }
    }

    // route polyline: use provided routeCoords (routed along streets) if available,
    // otherwise fallback to straight line between pickup and delivery
    if (routeCoords && Array.isArray(routeCoords) && routeCoords.length > 0) {
      const points = routeCoords.map(p => [p.lat, p.lng] as L.LatLngExpression);
      if (!routeLine.current) {
        routeLine.current = L.polyline(points, { color: '#2563eb', weight: 3, opacity: 0.9 }).addTo(map);
      } else {
        routeLine.current.setLatLngs(points as any);
      }
      const bounds = L.latLngBounds(points as any);
      map.fitBounds(bounds.pad(0.25), { animate: true });
    } else if (pickup && delivery && isFinite(pickup.lat) && isFinite(pickup.lng) && isFinite(delivery.lat) && isFinite(delivery.lng)) {
      const points: L.LatLngExpression[] = [[pickup.lat, pickup.lng], [delivery.lat, delivery.lng]];
      if (!routeLine.current) {
        routeLine.current = L.polyline(points, { color: '#2563eb', weight: 3, opacity: 0.9 }).addTo(map);
      } else {
        routeLine.current.setLatLngs(points);
      }
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds.pad(0.25), { animate: true });
    } else {
      if (routeLine.current) {
        map.removeLayer(routeLine.current);
        routeLine.current = null;
      }
    }

  }, [pickup, delivery]);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%', opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }}
    />
  );
}
