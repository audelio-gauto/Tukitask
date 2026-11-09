import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const geoExports = {};
vm.runInNewContext(transpile(await read('src/lib/geo.ts')), { exports: geoExports, Math });

function database(tables, errors = {}) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])];
      let start = 0;
      let end = Infinity;
      const builder = {
        select() { return builder; },
        gte(key, value) { rows = rows.filter(row => row[key] >= value); return builder; },
        lte(key, value) { rows = rows.filter(row => row[key] <= value); return builder; },
        eq(key, value) { rows = rows.filter(row => row[key] === value); return builder; },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return builder; },
        order(key) { rows.sort((a, b) => a[key].localeCompare(b[key])); return builder; },
        range(first, last) { start = first; end = last + 1; return builder; },
        then(resolve) { return Promise.resolve({ data: rows.slice(start, end), error: errors[table] ?? null }).then(resolve); },
      };
      return builder;
    },
  };
}

async function loadRoute(db) {
  const exports = {};
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/apiAuth': { sbAdmin: () => db, getAuthUser: async () => ({ email: 'client@example.test' }), unauthorized() {} },
    '@/lib/apiError': { serverError: () => ({ body: { error: 'Internal server error' }, status: 500 }) },
    '@/lib/geo': geoExports,
  };
  vm.runInNewContext(transpile(await read('src/app/api/nearby-drivers/route.ts')), {
    exports, URL, Math, Date, Number, isFinite, parseFloat, console,
    require: name => mocks[name] ?? require(name),
  });
  return exports.GET;
}

function makeDriver(id, km, { range = 50, mode = 'moto', enabled = true } = {}) {
  return {
    location: { driver_email: id, lat: km / 6371 * 180 / Math.PI, lng: 0, updated_at: new Date().toISOString() },
    user: { email: id, role: 'driver' },
    profile: { email: id, pickup_range: range, transport_mode: mode, service_filters: { moto_envios: enabled } },
  };
}

function tables(drivers) {
  return {
    driver_locations: drivers.map(d => d.location),
    users: drivers.map(d => d.user),
    driver_profiles: drivers.map(d => d.profile),
  };
}

const request = suffix => ({ url: `https://example.test/api/nearby-drivers?lat=0&lng=0${suffix}` });

test('50 km busca por distancia real, prioriza cercanos y respeta rango y filtro del driver', async () => {
  const drivers = [
    makeDriver('far', 40),
    makeDriver('near', 3),
    makeDriver('outside', 50.1),
    makeDriver('short-range', 20, { range: 10 }),
    makeDriver('disabled', 4, { enabled: false }),
  ];
  const get = await loadRoute(database(tables(drivers)));
  const result = await get(request('&radius_km=50&respect_range=1'));
  assert.equal(result.status, 200);
  assert.equal(result.body.drivers.length, 2);
  assert.ok(result.body.drivers[0].lat < result.body.drivers[1].lat);
  assert.equal(result.body.drivers[1].lat, Math.round(drivers[0].location.lat * 1000) / 1000);
  assert.equal((await get(request(''))).body.drivers.length, 2);
});

test('el conductor desconectado no aparece aunque su ubicación sea reciente', async () => {
  const driver = makeDriver('one', 5);
  driver.profile.accepting_orders = false;
  const get = await loadRoute(database(tables([driver])));
  assert.equal((await get(request('&radius_km=50&respect_range=1'))).body.drivers.length, 0);
  driver.profile.accepting_orders = true;
  assert.equal((await get(request('&radius_km=50&respect_range=1'))).body.drivers.length, 1);
});

test('la paginación y el límite no ocultan categorías más alejadas', async () => {
  const drivers = Array.from({ length: 205 }, (_, i) => makeDriver(`moto-${String(i).padStart(3, '0')}`, 1 + i / 100));
  drivers.push(makeDriver('z-auto', 40, { mode: 'auto' }));
  const get = await loadRoute(database(tables(drivers)));
  const result = await get(request('&radius_km=50&respect_range=1'));
  assert.equal(result.body.drivers.length, 40);
  assert.equal(result.body.drivers[0].vehicle_type, 'moto');
  assert.equal(result.body.drivers.at(-1).vehicle_type, 'auto');
});

test('el límite de 50 km es inclusivo y los rangos guardados se respetan', async () => {
  const drivers = [
    makeDriver('edge', 50),
    makeDriver('beyond', 50.01),
    makeDriver('custom-edge', 10, { range: 10 }),
    makeDriver('custom-beyond', 10.01, { range: 10 }),
    makeDriver('unset', 49, { range: null }),
  ];
  const get = await loadRoute(database(tables(drivers)));
  const result = await get(request('&radius_km=50&respect_range=1'));
  assert.equal(result.body.drivers.length, 3);
});

test('fallos de base de datos no se interpretan como ausencia de conductores', async () => {
  const driver = makeDriver('one', 5);
  for (const table of ['driver_locations', 'users', 'driver_profiles']) {
    const get = await loadRoute(database(tables([driver]), { [table]: new Error('failed') }));
    assert.equal((await get(request('&radius_km=50&respect_range=1'))).status, 500);
  }
});

test('la búsqueda cruza el antimeridiano y conserva el uso del mapa sin cambiar su radio', async () => {
  const driver = makeDriver('one', 0);
  driver.location.lng = -179.9;
  const get = await loadRoute(database(tables([driver])));
  const result = await get({ url: 'https://example.test/api/nearby-drivers?lat=0&lng=179.9&radius_km=50&respect_range=1' });
  assert.equal(result.body.drivers.length, 1);
  const page = await read('src/app/cliente/enviar/page.tsx');
  assert.match(page, /radius_km=50&respect_range=1/);
});
