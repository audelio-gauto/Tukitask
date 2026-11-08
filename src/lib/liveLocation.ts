export interface LiveLocation {
  lat: number;
  lng: number;
  capturedAt: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

export function normalizeLiveLocation(input: {
  lat: unknown;
  lng: unknown;
  capturedAt?: unknown;
  accuracy?: unknown;
  speed?: unknown;
  heading?: unknown;
}, now = Date.now()): LiveLocation | null {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (input.lat == null || input.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const capturedAt = input.capturedAt == null ? now : Number(input.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt <= 0 || capturedAt > now + 30_000) return null;
  const optional = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const accuracy = optional(input.accuracy);
  const speed = optional(input.speed);
  const heading = optional(input.heading);
  return {
    lat, lng, capturedAt,
    accuracy: accuracy != null && accuracy >= 0 ? accuracy : undefined,
    speed: speed != null && speed >= 0 ? speed : undefined,
    heading: heading != null && heading >= 0 && heading < 360 ? heading : undefined,
  };
}

export function isNewerLocation(next: LiveLocation, previous: LiveLocation | null): boolean {
  return !previous || next.capturedAt > previous.capturedAt;
}

export function isFreshLocation(location: LiveLocation, now = Date.now()): boolean {
  return now - location.capturedAt <= 30_000;
}

export function shouldUseStoredLocation(
  location: LiveLocation,
  lastStoredAt: number,
  lastLive: LiveLocation | null,
  lastLiveReceivedAt: number,
  now = Date.now(),
): boolean {
  return location.capturedAt > lastStoredAt &&
    now - lastLiveReceivedAt > 20_000 &&
    (!lastLive || location.capturedAt > lastLive.capturedAt);
}
