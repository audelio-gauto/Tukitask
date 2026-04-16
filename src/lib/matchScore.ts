/**
 * matchScore.ts — Algoritmo de matching inteligente para drivers/técnicos
 *
 * Puntuación compuesta [0..100] que combina:
 *   - Rating promedio      : 40 pts  (mayor rating = mayor puntaje)
 *   - Distancia al pickup  : 30 pts  (menor distancia = mayor puntaje, máx 25 km)
 *   - Tasa de aceptación   : 20 pts  (menor tasa de ignorar = mayor puntaje)
 *   - Tiempo de respuesta  : 10 pts  (responde más rápido = mayor puntaje, máx 10 min)
 */

export interface MatchInputs {
  /** Promedio de rating del driver (0..5) */
  avgRating: number | null;
  /** Distancia en km del driver al punto de recogida */
  distanceKm: number | null;
  /** Tasa de aceptación (0.0..1.0) — offers_sent / (offers_sent + orders_ignored) */
  acceptanceRate: number | null;
  /** Tiempo promedio de respuesta en segundos desde publicación hasta oferta */
  avgResponseSeconds: number | null;
}

export interface MatchResult {
  score: number;          // 0..100
  label: string;          // 'Excelente' | 'Muy bueno' | 'Bueno' | 'Regular'
  color: string;          // CSS color string
  breakdown: {
    ratingPts: number;
    distancePts: number;
    acceptancePts: number;
    responsePts: number;
  };
}

const MAX_DISTANCE_KM  = 25;   // 25 km → 0 pts distancia
const MAX_RESPONSE_SEC = 600;  // 10 min → 0 pts respuesta

export function computeMatchScore(inputs: MatchInputs): MatchResult {
  const { avgRating, distanceKm, acceptanceRate, avgResponseSeconds } = inputs;

  // Cada señal normalizada [0..1] con fallback razonable si no hay dato
  const ratingNorm     = avgRating != null
    ? Math.min(Math.max(avgRating, 0), 5) / 5
    : 0.7;   // sin datos → asumir 3.5★

  const distanceNorm   = distanceKm != null
    ? Math.max(0, 1 - Math.min(distanceKm, MAX_DISTANCE_KM) / MAX_DISTANCE_KM)
    : 0.5;   // sin datos → distancia media

  const acceptanceNorm = acceptanceRate != null
    ? Math.min(Math.max(acceptanceRate, 0), 1)
    : 1.0;   // sin datos → asumir 100% (driver nuevo, beneficio de la duda)

  const responseNorm   = avgResponseSeconds != null
    ? Math.max(0, 1 - Math.min(avgResponseSeconds, MAX_RESPONSE_SEC) / MAX_RESPONSE_SEC)
    : 0.5;   // sin datos → velocidad media

  const ratingPts     = Math.round(ratingNorm     * 40);
  const distancePts   = Math.round(distanceNorm   * 30);
  const acceptancePts = Math.round(acceptanceNorm * 20);
  const responsePts   = Math.round(responseNorm   * 10);

  const score = ratingPts + distancePts + acceptancePts + responsePts;

  return {
    score,
    label: scoreLabel(score),
    color: scoreColor(score),
    breakdown: { ratingPts, distancePts, acceptancePts, responsePts },
  };
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Excelente';
  if (score >= 70) return 'Muy bueno';
  if (score >= 55) return 'Bueno';
  return 'Regular';
}

export function scoreColor(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#c8ff00';
  if (score >= 55) return '#f59e0b';
  return '#ef4444';
}
