/**
 * Haversine distance between two coordinates in kilometres.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Nearest-neighbor heuristic for multi-stop route optimization.
 * Returns a reordered copy of `stops` so each successive stop is the
 * closest unvisited one to the current position, starting from `origin`.
 *
 * Stops without valid coordinates are appended unchanged at the end.
 *
 * Complexity: O(n²) — suitable for n ≤ 20 stops (platform limit).
 */
export function nearestNeighborSort<T>(
  origin: { lat: number; lng: number },
  stops: T[],
  getLat: (s: T) => number | string | null | undefined = (s: unknown) => (s as Record<string, unknown>).lat as number,
  getLng: (s: T) => number | string | null | undefined = (s: unknown) => (s as Record<string, unknown>).lng as number,
): T[] {
  const withCoords: { item: T; lat: number; lng: number }[] = [];
  const noCoords: T[] = [];

  for (const s of stops) {
    const lat = parseFloat(String(getLat(s) ?? ''));
    const lng = parseFloat(String(getLng(s) ?? ''));
    if (isFinite(lat) && isFinite(lng)) {
      withCoords.push({ item: s, lat, lng });
    } else {
      noCoords.push(s);
    }
  }

  const result: T[] = [];
  let current = origin;
  const remaining = [...withCoords];

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = haversineKm(current.lat, current.lng, remaining[0].lat, remaining[0].lng);
    for (let i = 1; i < remaining.length; i++) {
      const d = haversineKm(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const chosen = remaining.splice(nearestIdx, 1)[0];
    result.push(chosen.item);
    current = { lat: chosen.lat, lng: chosen.lng };
  }

  return [...result, ...noCoords];
}
