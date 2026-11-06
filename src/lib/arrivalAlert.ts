const BEFORE_PICKUP = new Set(['accepted', 'assigned', 'picking_up']);

export function nextArrivalAlert(
  currentKey: string | null,
  orderKey: string | null,
  status: string | null,
  distanceMeters: number | null,
): string | null {
  if (!orderKey || !status || !BEFORE_PICKUP.has(status)) return null;
  if (currentKey === orderKey) return currentKey;
  return distanceMeters !== null && Number.isFinite(distanceMeters) && distanceMeters <= 80
    ? orderKey
    : null;
}
