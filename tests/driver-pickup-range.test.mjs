import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function functionBody(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\([^)]*\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`));
  assert.ok(match, `missing ${name}`);
  return match[1].trim();
}

test('migration changes only the default range in both matching functions', async () => {
  const migration = await read('sql/migrations/122_driver_pickup_default_50km.sql');
  const originalRefresh = await read('sql/migrations/050_fix_feed_functions.sql');
  const originalMatch = await read('sql/migrations/121_feed_match_location_tolerance.sql');
  assert.match(migration, /ALTER COLUMN pickup_range SET DEFAULT 50/);
  assert.doesNotMatch(migration, /\bUPDATE\s+(?:public\.)?driver_profiles\b/i);
  for (const [name, original] of [['refresh_driver_feed', originalRefresh], ['fn_match_driver_feed', originalMatch]]) {
    const body = functionBody(migration, name);
    assert.equal(body, functionBody(original, name).replace('COALESCE(dp.pickup_range, 10)', 'COALESCE(dp.pickup_range, 50)'));
    assert.match(migration, new RegExp(`FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?SET search_path = public\\s+AS`));
  }
});

test('the driver interface uses the new default but restores saved preferences', async () => {
  const context = await read('src/app/driver/context.tsx');
  const layout = await read('src/app/driver/layout.tsx');
  const page = await read('src/app/driver/page.tsx');
  assert.match(context, /DEFAULT_PICKUP_RANGE_KM = 50/);
  assert.match(context, /pickupRangeKm: DEFAULT_PICKUP_RANGE_KM/);
  assert.match(layout, /useState\(DEFAULT_PICKUP_RANGE_KM\)/);
  assert.match(layout, /profJson\.profile\?\.pickup_range\)\s+setPickupRangeKm\(Number\(profJson\.profile\.pickup_range\)\)/);
  assert.match(page, /type="range" min=\{1\} max=\{50\}/);
  assert.match(page, /if \(distPickup > pickupRangeKm\) return false/);
  assert.match(page, /if \(!response\.ok\) throw new Error/);
  assert.match(page, /role="alert"/);
  assert.match(page, /pickup_range: pickupRangeKm/);
});

test('distances below and above 50 km respect the selected pickup range', async () => {
  const source = await read('src/lib/geo.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const { haversineKm } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  const distance = km => haversineKm(0, 0, km / 6371 * 180 / Math.PI, 0);
  assert.ok(distance(9) <= 10);
  assert.ok(distance(11) > 10);
  assert.ok(distance(11) <= 50);
  assert.ok(distance(49.9) <= 50);
  assert.ok(distance(50.1) > 50);
});
