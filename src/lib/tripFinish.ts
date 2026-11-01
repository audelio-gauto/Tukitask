// Reglas compartidas para finalizar un remis lejos del destino (solo servidor)
import { directions } from '@/lib/maps/provider.server';
export const FINISH_TOLERANCE_M = 300;
export const FINISH_MIN_PORTION = 0.5;
export const FINISH_REQUEST_TIMEOUT_MS = 180_000;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Distancia por calle (Mapbox/Google vía directions). Si falla, línea recta × 1.3 como estimación. */
export async function roadKm(aLat: number, aLng: number, bLat: number, bLng: number): Promise<number> {
  const straight = haversineKm(aLat, aLng, bLat, bLng);
  // Puntos prácticamente iguales: no hace falta consultar
  if (straight < 0.05) return straight;
  try {
    const r = await directions([aLat, aLng], [bLat, bLng]);
    if (r && Number.isFinite(r.distance_meters) && r.distance_meters > 0) return r.distance_meters / 1000;
  } catch { /* usa la estimación */ }
  return straight * 1.3;
}
