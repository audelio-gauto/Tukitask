// Marcador de vehículo para mapas Leaflet (seguimiento del cliente y navegación del driver).
// Icono vista cenital sin fondo, rota hacia la dirección de avance y se desliza de forma continua.

export const CLEAN_TILE = {
  url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  attr: '© OpenStreetMap © CARTO',
};

export type VehicleKind = 'car' | 'moto';

export function vehicleKindFrom(type?: string | null): VehicleKind {
  return /moto/i.test(type || '') && !/carro/i.test(type || '') ? 'moto' : 'car';
}

const SIZE = 46;

const CAR_SVG = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 48 48" fill="none">
  <ellipse cx="24" cy="26" rx="12" ry="19" fill="rgba(0,0,0,.22)"/>
  <rect x="12" y="5" width="24" height="38" rx="9" fill="#F5C518" stroke="#1C1C2E" stroke-width="2"/>
  <path d="M15.5 16.5c0-1.6 1-2.7 2.6-3h11.8c1.6.3 2.6 1.4 2.6 3l-1 4.5H16.5z" fill="#1C1C2E"/>
  <rect x="16" y="23" width="16" height="9" rx="2.5" fill="#E6A800" stroke="#1C1C2E" stroke-width="1.2"/>
  <path d="M16.5 35.5h15l.6 3.2c-.2 1-1 1.6-2 1.6H17.9c-1 0-1.8-.6-2-1.6z" fill="#1C1C2E"/>
  <rect x="14" y="6.5" width="4" height="2.5" rx="1.2" fill="#fff"/>
  <rect x="30" y="6.5" width="4" height="2.5" rx="1.2" fill="#fff"/>
</svg>`;

const MOTO_SVG = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 48 48" fill="none">
  <ellipse cx="24" cy="26" rx="8" ry="19" fill="rgba(0,0,0,.22)"/>
  <rect x="21.5" y="3" width="5" height="11" rx="2.5" fill="#1C1C2E"/>
  <rect x="21.5" y="34" width="5" height="11" rx="2.5" fill="#1C1C2E"/>
  <path d="M10 14h28" stroke="#1C1C2E" stroke-width="3" stroke-linecap="round"/>
  <rect x="17" y="13" width="14" height="22" rx="7" fill="#F5C518" stroke="#1C1C2E" stroke-width="2"/>
  <rect x="19.5" y="22" width="9" height="9" rx="3" fill="#1C1C2E"/>
  <circle cx="24" cy="18" r="3" fill="#E6A800" stroke="#1C1C2E" stroke-width="1.2"/>
</svg>`;

export function vehicleIconHtml(kind: VehicleKind): string {
  return `<div style="position:relative;width:${SIZE}px;height:${SIZE}px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));">
    <div class="tuki-veh-rot" style="width:${SIZE}px;height:${SIZE}px;transform:rotate(0deg);transition:transform .7s ease-out;will-change:transform;">${kind === 'moto' ? MOTO_SVG : CAR_SVG}</div>
  </div>`;
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

export interface VehicleMarkerCtl {
  marker: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  move: (lat: number, lng: number) => void;
  setKind: (kind: VehicleKind) => void;
  remove: () => void;
}

const GLIDE_MS = 1400;
const MIN_TURN_METERS = 3;
const MAX_GLIDE_METERS = 5000;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createVehicleMarker(L: any, map: any, lat: number, lng: number, initialKind: VehicleKind = 'car'): VehicleMarkerCtl {
  let kind = initialKind;
  let angle = 0;
  let raf = 0;

  const makeIcon = (k: VehicleKind) => L.divIcon({
    className: '',
    html: vehicleIconHtml(k),
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
  });

  const marker = L.marker([lat, lng], { icon: makeIcon(kind), zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(map);

  const applyAngle = () => {
    const el = marker.getElement()?.querySelector('.tuki-veh-rot') as HTMLElement | null;
    if (el) el.style.transform = `rotate(${angle}deg)`;
  };

  const move = (toLat: number, toLng: number) => {
    const from = marker.getLatLng();
    const meters = metersBetween(from.lat, from.lng, toLat, toLng);
    if (raf) cancelAnimationFrame(raf);

    if (meters >= MIN_TURN_METERS) {
      const target = bearingDeg(from.lat, from.lng, toLat, toLng);
      const delta = ((target - angle + 540) % 360) - 180;
      angle += delta;
      applyAngle();
    }

    if (meters < 0.5 || meters > MAX_GLIDE_METERS) {
      marker.setLatLng([toLat, toLng]);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / GLIDE_MS);
      marker.setLatLng([from.lat + (toLat - from.lat) * k, from.lng + (toLng - from.lng) * k]);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  const setKind = (next: VehicleKind) => {
    if (next === kind) return;
    kind = next;
    marker.setIcon(makeIcon(kind));
    applyAngle();
  };

  const remove = () => {
    if (raf) cancelAnimationFrame(raf);
    map.removeLayer(marker);
  };

  return { marker, move, setKind, remove };
}
