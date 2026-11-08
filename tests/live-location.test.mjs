import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

const { normalizeLiveLocation, isNewerLocation, isFreshLocation, shouldUseStoredLocation } = await load('../src/lib/liveLocation.ts');
const { createVehicleMarker } = await load('../src/lib/mapVehicle.ts');
const now = 1_800_000_000_000;

test('location validation preserves GPS metadata and rejects invalid coordinates and timestamps', () => {
  const location = normalizeLiveLocation({ lat: -25, lng: -57, capturedAt: now, accuracy: 8, speed: 5, heading: 90 }, now);
  assert.deepEqual(location, { lat: -25, lng: -57, capturedAt: now, accuracy: 8, speed: 5, heading: 90 });
  assert.equal(normalizeLiveLocation({ lat: 91, lng: 0 }, now), null);
  assert.equal(normalizeLiveLocation({ lat: null, lng: 0 }, now), null);
  assert.equal(normalizeLiveLocation({ lat: 0, lng: 0, capturedAt: now + 30_001 }, now), null);
  assert.equal(normalizeLiveLocation({ lat: 0, lng: 0, capturedAt: NaN }, now), null);
  const optional = normalizeLiveLocation({ lat: 0, lng: 0, accuracy: -1, speed: -1, heading: 360 }, now);
  assert.equal(optional.accuracy, undefined);
  assert.equal(optional.speed, undefined);
  assert.equal(optional.heading, undefined);
});

test('stored fallback cannot override recent live GPS or an older stored fix', () => {
  const live = normalizeLiveLocation({ lat: 1, lng: 2, capturedAt: now - 5_000 }, now);
  const stored = normalizeLiveLocation({ lat: 3, lng: 4, capturedAt: now - 1_000 }, now);
  assert.equal(shouldUseStoredLocation(stored, 0, live, now - 2_000, now), false);
  assert.equal(shouldUseStoredLocation(stored, 0, live, now - 21_000, now), true);
  assert.equal(shouldUseStoredLocation(live, 0, stored, now - 21_000, now), false);
  assert.equal(shouldUseStoredLocation(stored, stored.capturedAt, null, 0, now), false);
});

test('GPS fixes must be fresh and newer than the last accepted fix', () => {
  const first = normalizeLiveLocation({ lat: 1, lng: 2, capturedAt: now - 20_000 }, now);
  const older = normalizeLiveLocation({ lat: 2, lng: 2, capturedAt: now - 30_001 }, now);
  const newer = normalizeLiveLocation({ lat: 3, lng: 2, capturedAt: now }, now);
  assert.equal(isFreshLocation(first, now), true);
  assert.equal(isFreshLocation(older, now), false);
  assert.equal(isNewerLocation(older, first), false);
  assert.equal(isNewerLocation(first, first), false);
  assert.equal(isNewerLocation(newer, first), true);
  assert.equal(normalizeLiveLocation({ lat: 1, lng: 2 }, now).capturedAt, now);
});

test('vehicle uses reliable heading, shortest turn, and keeps orientation while stopped', () => {
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const element = { style: {} };
    const marker = {
      coords: { lat: 0, lng: 0 },
      addTo() { return this; },
      getLatLng() { return this.coords; },
      setLatLng([lat, lng]) { this.coords = { lat, lng }; },
      getElement() { return { querySelector: () => element }; },
      setIcon() {},
    };
    const L = { divIcon: icon => icon, marker: () => marker };
    const vehicle = createVehicleMarker(L, { removeLayer() {} }, 0, 0, 'car', { heading: 350, speed: 5, accuracy: 5 });
    assert.equal(element.style.transform, 'rotate(-10deg)');
    vehicle.move(0, 0.0001, { heading: 10, speed: 5, accuracy: 5 });
    assert.equal(element.style.transform, 'rotate(10deg)');
    vehicle.move(0.00001, 0, { heading: 180, speed: 0, accuracy: 5 });
    assert.equal(element.style.transform, 'rotate(10deg)');
    vehicle.move(0.0002, 0, { speed: 4, accuracy: 5 });
    assert.equal(element.style.transform, 'rotate(0deg)');
    vehicle.remove();
  } finally {
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});
