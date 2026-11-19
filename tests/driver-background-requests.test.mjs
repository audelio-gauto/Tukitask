import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadRoute(tables, { role, authenticated = true } = {}) {
  if (role) tables.users = { role };
  const calls = [];
  const db = {
    from(table) {
      let recentSince = null;
      const filters = [];
      const applyFilters = rows => rows.filter(row => filters.every(test => test(row)));
      const rows = tables[table];
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        in(column, values) {
          if (column === 'id' && Array.isArray(values)) {
            filters.push(row => values.includes(row.id));
          } else if (column === 'status' && Array.isArray(values)) {
            filters.push(row => values.includes(row.status));
          }
          return builder;
        },
        order() { return builder; },
        limit() { return builder; },
        or(expression) {
          const match = /created_at\.gte\.([^,)]+)/.exec(expression);
          if (match) recentSince = match[1];
          return builder;
        },
        async maybeSingle() {
          calls.push(table);
          const data = Array.isArray(rows) ? applyFilters(rows)[0] ?? null : rows ?? null;
          return { data, error: null };
        },
        then(resolve, reject) {
          calls.push(table);
          let data = applyFilters(rows ?? []);
          // Reproduce la condición SQL del endpoint: reciente o programado.
          if (table === 'orders' && recentSince) {
            data = data.filter(order =>
              (order.created_at && order.created_at >= recentSince) || order.date_scheduled != null);
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/apiAuth': {
      getAuthUser: async () => authenticated ? { email: 'driver@example.test' } : null,
      sbAdmin: () => db,
      unauthorized: () => ({ status: 401 }),
      forbidden: () => ({ status: 403 }),
    },
    '@/lib/apiError': { serverError: () => ({ status: 500 }) },
  };
  const exports = {};
  const source = await read('src/app/api/driver/background-requests/route.ts');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, {
    exports, console,
    require: name => mocks[name],
    process: { env: { DRIVER_MIN_WALLET_BALANCE: '1000' } },
  });
  return { get: exports.GET, calls };
}

const baseTables = () => ({
  users: { role: 'driver' },
  driver_profiles: { accepting_orders: true },
  driver_wallets: { balance: 25000 },
  orders: [],
  driver_feed: [{ order_id: 'a' }],
});

const request = () => new Request('https://tuki.test/api/driver/background-requests', {
  headers: { Authorization: 'Bearer token' },
});

test('el endpoint exige un conductor autenticado y con rol válido', async () => {
  const ok = await loadRoute(baseTables());
  assert.equal((await ok.get(request())).status, 200);

  const anonymous = await loadRoute(baseTables(), { authenticated: false });
  assert.equal((await anonymous.get(request())).status, 401);

  const client = await loadRoute(baseTables(), { role: 'cliente' });
  assert.equal((await client.get(request())).status, 403);

  const admin = await loadRoute(baseTables(), { role: 'admin' });
  assert.equal((await admin.get(request())).status, 200);
});

test('sin disponibilidad, con billetera baja o con viaje activo no se avisa', async () => {
  const offline = baseTables();
  offline.driver_profiles.accepting_orders = false;
  assert.deepEqual(JSON.parse(JSON.stringify((await (await loadRoute(offline)).get(request())).body)), { orders: [] });

  const poor = baseTables();
  poor.driver_wallets.balance = 0;
  const blocked = (await (await loadRoute(poor)).get(request())).body;
  assert.equal(blocked.orders.length, 0);
  assert.equal(blocked.wallet_blocked, true);

  const busy = baseTables();
  busy.orders = [{ id: 'running', status: 'accepted' }];
  const result = (await (await loadRoute(busy)).get(request())).body;
  assert.equal(result.orders.length, 0);
  assert.equal(result.busy, true);
});

test('solo devuelve pedidos recientes del feed y no almacena la respuesta', async () => {
  const now = Date.now();
  const tables = baseTables();
  tables.driver_feed = [
    { order_id: 'fresh' }, { order_id: 'fresh' }, { order_id: 'old' },
    { order_id: 'soon' }, { order_id: 'later' },
  ];
  tables.orders = [
    { id: 'fresh', pickup_address: 'Origen', delivery_address: 'Destino', offer: '12000', suggested_price: null,
      vehicle_type: 'moto', order_type: 'envio', created_at: new Date(now - 60000).toISOString(), status: 'pending', date_scheduled: null },
    { id: 'old', pickup_address: 'Viejo', delivery_address: 'Destino', offer: null, suggested_price: 100,
      vehicle_type: 'auto', order_type: 'envio', created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(), status: 'pending', date_scheduled: null },
    { id: 'soon', pickup_address: 'Pronto', delivery_address: 'Destino', offer: null, suggested_price: 100,
      vehicle_type: 'moto', order_type: 'viaje', created_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(), status: 'pending',
      date_scheduled: new Date(now + 10 * 60 * 1000).toISOString() },
    { id: 'later', pickup_address: 'Lejos', delivery_address: 'Destino', offer: null, suggested_price: 100,
      vehicle_type: 'moto', order_type: 'viaje', created_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(), status: 'pending',
      date_scheduled: new Date(now + 3 * 60 * 60 * 1000).toISOString() },
  ];
  const response = await (await loadRoute(tables)).get(request());
  assert.deepEqual(response.body.orders.map(order => order.id), ['fresh', 'soon']);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.body.orders[0].pickup_address, 'Origen');
});

test('la disponibilidad compartida apaga la burbuja si la billetera está bloqueada', async () => {
  const listeners = {};
  const store = new Map();
  const windowMock = {
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: name => { delete listeners[name]; },
    dispatchEvent: event => { listeners[event.type]?.(event); return true; },
  };
  class FakeCustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  }
  const exports = {};
  const source = await read('src/lib/driverAvailability.ts');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, window: windowMock, CustomEvent: FakeCustomEvent });

  assert.equal(exports.isDriverAvailable(), false);
  exports.setDriverAvailability(true);
  assert.equal(exports.isDriverAvailable(), true);
  assert.equal(store.get('driver_available'), 'true');

  let notified = null;
  const unsubscribe = exports.subscribeDriverAvailability(state => { notified = state; });
  exports.setDriverWalletBlocked(true);
  assert.equal(exports.isDriverAvailable(), false, 'sin billetera no hay disponibilidad efectiva');
  assert.equal(exports.getDriverAvailability().available, true, 'el interruptor sigue encendido');
  assert.equal(notified?.walletBlocked, true, 'el layout recibe el cambio al instante');
  exports.setDriverWalletBlocked(false);
  assert.equal(exports.isDriverAvailable(), true);
  unsubscribe();
  assert.equal(listeners['tuki:driver-availability'], undefined);
});

test('el puente nativo publica sesión, insignia, permisos y ubicación', async () => {
  const source = await read('src/lib/driverMode.ts');
  for (const method of [
    'setBubble({ enabled })', 'setBubbleBadge({ count })', 'setSession(payload)',
    'clearSession()', 'setNativeLocation({ lat, lng })', 'requestNotificationPermission()',
  ]) assert.ok(source.includes(method), `falta ${method}`);

  const plugin = await read('android/app/src/main/java/com/tukitask/app/DriverModePlugin.java');
  for (const method of ['setBubbleBadge', 'setSession', 'clearSession', 'setNativeLocation', 'notifyRequests', 'requestNotificationPermission']) {
    assert.ok(plugin.includes(`public void ${method}(`), `falta el método nativo ${method}`);
  }
  assert.match(plugin, /@PermissionCallback/);
  assert.match(plugin, /POST_NOTIFICATIONS/);

  const manifest = await read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:name="\.DriverBackgroundService"/);
  assert.match(manifest, /android:foregroundServiceType="dataSync"/);
  assert.match(manifest, /FOREGROUND_SERVICE_DATA_SYNC/);
});

test('el servicio consulta el endpoint y no compite con la WebView visible', async () => {
  const service = await read('android/app/src/main/java/com/tukitask/app/DriverBackgroundService.java');
  assert.match(service, /\/api\/driver\/background-requests/);
  assert.match(service, /\/api\/driver-location/);
  assert.match(service, /MainActivity\.isVisible\(\)/);
  assert.match(service, /refreshAccessToken/);
  assert.match(service, /BubbleManager\.setBadge/);
  assert.match(service, /RequestNotifier\.notifyRequest/);
  assert.match(service, /onTimeout/);

  const layout = await read('src/app/driver/layout.tsx');
  assert.match(layout, /subscribeDriverAvailability\(applyAvailability\)/);
  assert.match(layout, /saveDriverSession\(/);
  assert.match(layout, /updateDriverNativeLocation\(/);
  assert.match(layout, /ensureDriverNotificationPermission\(/);

  const page = await read('src/app/driver/page.tsx');
  assert.match(page, /setDriverBubbleBadge\(pendingOrders\.length\)/);
  assert.doesNotMatch(page, /setDriverBubble\(available/);
});

test('el aviso del conductor distingue viaje, envío y flete; el técnico conserva su popup', async () => {
  const service = await read('android/app/src/main/java/com/tukitask/app/DriverBackgroundService.java');
  assert.match(service, /driverRequestTitle\(fresh\)/);
  assert.match(service, /"Nuevo viaje solicitado"/);
  assert.match(service, /"Nuevo envío solicitado"/);
  assert.match(service, /"Nuevo flete solicitado"/);
  assert.match(service, /"Nuevo servicio"/);
  assert.match(service, /"Buscando viajes y envíos cerca de ti"/);
  assert.match(service, /"Buscando servicios cerca de ti"/);
  assert.match(service, /optString\("order_type"/);
});

test('la creación de pedidos avisa a los conductores emparejados salvo los programados', async () => {
  const orders = await read('src/app/api/orders/route.ts');
  assert.match(orders, /emitNotificationBulk/);
  assert.match(orders, /safeBody\.date_scheduled/);
  assert.match(orders, /from\('driver_feed'\)/);
  assert.match(orders, /groupKey: `order:\$\{order\.id\}:new`/);
  assert.match(orders, /'Nuevo viaje solicitado'/);
  assert.match(orders, /'Nuevo flete solicitado'/);
  assert.match(orders, /'Nuevo envío solicitado'/);
  const nearby = await read('src/app/api/nearby-drivers/route.ts');
  assert.match(nearby, /ONLINE_WINDOW_MS = 10 \* 60 \* 1000/);
  const readme = await read('README.md');
  assert.match(readme, /background-requests/);
});
