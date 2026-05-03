'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface DriverLoc {
  driver_email: string;
  lat: number;
  lng: number;
  updated_at: string;
  status?: string;
}

function isRecent(updatedAt: string, minutesAgo = 10) {
  return Date.now() - new Date(updatedAt).getTime() < minutesAgo * 60 * 1000;
}

function statusColor(loc: DriverLoc): string {
  if (!isRecent(loc.updated_at)) return '#9ca3af'; // gray = offline
  if (loc.status === 'on_order' || loc.status === 'busy') return '#ef4444'; // red = busy
  return '#22c55e'; // green = available
}

export default function DriverMapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const [locations, setLocations] = useState<DriverLoc[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('driver_locations')
      .select('driver_email, lat, lng, updated_at, status')
      .order('updated_at', { ascending: false });
    const rows = (data || []) as DriverLoc[];
    setLocations(rows);
    setLastUpdated(new Date());
    setLoading(false);
    return rows;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateMarkers = (map: any, locs: DriverLoc[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    const seen = new Set<string>();
    for (const loc of locs) {
      seen.add(loc.driver_email);
      const color = statusColor(loc);
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const popupContent = `
        <div style="font-size:12px;min-width:160px;">
          <strong>${loc.driver_email}</strong><br/>
          Estado: <b>${loc.status ?? 'desconocido'}</b><br/>
          Última pos: ${new Date(loc.updated_at).toLocaleTimeString('es-PY')}
        </div>`;

      if (markersRef.current.has(loc.driver_email)) {
        const m = markersRef.current.get(loc.driver_email);
        m.setLatLng([loc.lat, loc.lng]);
        m.setIcon(icon);
        m.bindPopup(popupContent);
      } else {
        const m = L.marker([loc.lat, loc.lng], { icon }).addTo(map).bindPopup(popupContent);
        markersRef.current.set(loc.driver_email, m);
      }
    }

    // Remove markers for drivers no longer in list
    for (const [email, marker] of Array.from(markersRef.current.entries())) {
      if (!seen.has(email)) {
        marker.remove();
        markersRef.current.delete(email);
      }
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const initMap = async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [-25.2867, -57.647],
        zoom: 13,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      leafletMapRef.current = map;

      const locs = await fetchLocations();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).L = L;
      updateMarkers(map, locs);

      interval = setInterval(async () => {
        const updated = await fetchLocations();
        updateMarkers(map, updated);
      }, 20000);
    };

    initMap();

    return () => {
      clearInterval(interval);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onlineCount  = locations.filter(l => isRecent(l.updated_at) && (l.status !== 'on_order' && l.status !== 'busy')).length;
  const busyCount    = locations.filter(l => isRecent(l.updated_at) && (l.status === 'on_order' || l.status === 'busy')).length;
  const offlineCount = locations.filter(l => !isRecent(l.updated_at)).length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Mapa de Conductores</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Posiciones en tiempo real · actualiza cada 20 s
            {lastUpdated && <span className="ml-2 text-gray-400">— últ. actualización {lastUpdated.toLocaleTimeString('es-PY')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Disponible ({onlineCount})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />En pedido ({busyCount})</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />Sin señal ({offlineCount})</span>
        </div>
      </div>

      {/* Map */}
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: 560 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
            <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
