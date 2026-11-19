import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadRoute(tables, { role, authenticated = true } = {}) {
  if (role) tables.users = { role };
  const db = {
    from(table) {
      const rows = tables[table];
      const filters = [];
      const apply = () => {
        const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
        return list.filter(row => filters.every(filter => filter(row)));
      };
      const builder = {
        select() { return builder; },
        eq(column, value) {
          filters.push(row => row[column] === value);
          return builder;
        },
        in(column, values) {
          filters.push(row => values.includes(row[column]));
          return builder;
        },
        not(column, operator, expression) {
          if (operator === 'in') {
            const values = expression
              .replace(/[()]/g, '')
              .split(',')
              .map(value => value.trim().replace(/^'|'$/g, ''));
            filters.push(row => !values.includes(row[column]));
          }
          return builder;
        },
        or(expression) {
          const match = /service_gender\.in\.\(([^)]+)\)/.exec(expression);
          if (match) {
            const values = match[1].split(',').map(value => value.trim());
            filters.push(row => values.includes(row.service_gender) || row.service_gender == null);
          }
          return builder;
        },
        order() { return builder; },
        limit() { return builder; },
        async maybeSingle() {
          return { data: apply()[0] ?? null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: apply(), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }),
      },
    },
    '@/lib/apiAuth': {
      getAuthUser: async () => authenticated ? { email: 'tecnico@example.test' } : null,
      sbAdmin: () => db,
      unauthorized: () => ({ status: 401 }),
      forbidden: () => ({ status: 403 }),
    },
    '@/lib/apiError': { serverError: () => ({ status: 500 }) },
  };
  const exports = {};
  const source = await read('src/app/api/tecnico/background-requests/route.ts');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    console,
    require: name => mocks[name],
    process: { env: { DRIVER_MIN_WALLET_BALANCE: '1000' } },
  });
  return { get: exports.GET };
}

const baseTables = () => ({
  users: { email: 'tecnico@example.test', role: 'tecnico' },
  driver_wallets: { driver_email: 'tecnico@example.test', balance: 25000 },
  tecnico_settings: {
    email: 'tecnico@example.test',
    gender: 'mujer',
    accepted_services: { limpieza: true, plomeria: false },
    verified: false,
    pickup_range: 10,
  },
  driver_locations: { driver_email: 'tecnico@example.test', lat: -25.3, lng: -57.6 },
  tecnico_jobs: [],
  tecnico_job_offers: [],
});

const request = () => new Request('https://tuki.test/api/tecnico/background-requests', {
  headers: { Authorization: 'Bearer token' },
});

const now = Date.now();
const job = (overrides = {}) => ({
  id: 'job',
  service_type: 'limpieza',
  address: 'Asunción',
  lat: -25.31,
  lng: -57.61,
  created_at: new Date(now - 60_000).toISOString(),
  scheduled_at: null,
  client_initial_price: 50000,
  service_gender: 'mujer',
  require_verified_tecnico: false,
  status: 'pending',
  ...overrides,
});

test('el endpoint exige técnico autenticado y con rol válido', async () => {
  const ok = await loadRoute(baseTables());
  assert.equal((await ok.get(request())).status, 200);

  const anonymous = await loadRoute(baseTables(), { authenticated: false });
  assert.equal((await anonymous.get(request())).status, 401);

  const driver = await loadRoute(baseTables(), { role: 'driver' });
  assert.equal((await driver.get(request())).status, 403);
});

test('sin saldo o con servicio activo no se avisa', async () => {
  const poor = baseTables();
  poor.driver_wallets.balance = 0;
  const blocked = (await (await loadRoute(poor)).get(request())).body;
  assert.deepEqual(JSON.parse(JSON.stringify(blocked.jobs)), []);
  assert.equal(blocked.wallet_blocked, true);

  const busy = baseTables();
  busy.tecnico_jobs = [job({ id: 'running', status: 'accepted', tecnico_email: 'tecnico@example.test' })];
  const result = (await (await loadRoute(busy)).get(request())).body;
  assert.deepEqual(JSON.parse(JSON.stringify(result.jobs)), []);
  assert.equal(result.busy, true);
});

test('filtra por perfil, distancia, ofertas previas y antigüedad', async () => {
  const tables = baseTables();
  tables.tecnico_jobs = [
    job({ id: 'ok' }),
    job({ id: 'disabled', service_type: 'plomeria' }),
    job({ id: 'wrong-gender', service_gender: 'hombre' }),
    job({ id: 'needs-verified', require_verified_tecnico: true }),
    job({ id: 'already-offered' }),
    job({ id: 'old', created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString() }),
    job({
      id: 'scheduled-soon',
      created_at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      scheduled_at: new Date(now + 10 * 60 * 1000).toISOString(),
    }),
    job({ id: 'far-away', lat: -25.9, lng: -57.6 }),
  ];
  tables.tecnico_job_offers = [{ tecnico_email: 'tecnico@example.test', job_id: 'already-offered' }];

  const response = await (await loadRoute(tables)).get(request());
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(
    response.body.jobs.map(item => item.id).sort(),
    ['ok', 'scheduled-soon'],
  );
  assert.equal(response.body.jobs.find(item => item.id === 'ok').service_type, 'limpieza');
});

test('el APK comparte el servicio de segundo plano entre conductor y técnico', async () => {
  const service = await read('android/app/src/main/java/com/tukitask/app/DriverBackgroundService.java');
  assert.match(service, /\/api\/tecnico\/background-requests/);
  assert.match(service, /KEY_ROLE/);
  assert.match(service, /ROLE_TECNICO/);
  assert.match(service, /isTecnico\(/);

  const plugin = await read('android/app/src/main/java/com/tukitask/app/DriverModePlugin.java');
  assert.match(plugin, /ROLE_TECNICO/);
  assert.match(plugin, /KEY_ROLE/);

  const layout = await read('src/app/tecnico/layout.tsx');
  assert.match(layout, /saveDriverSession\(/);
  assert.match(layout, /role: 'tecnico'/);
  assert.match(layout, /setDriverBubble\(true\)/);
  assert.match(layout, /updateDriverNativeLocation\(/);

  const availability = await read('src/lib/tecnicoAvailability.ts');
  assert.match(availability, /tecnico_available/);
});
