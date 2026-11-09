import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function endpoint({ role = 'driver', authenticated = true, error = null } = {}) {
  const writes = [];
  const db = {
    from(table) {
      if (table === 'users') return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: { role }, error: null }; },
      };
      return { async upsert(row) { writes.push(row); return { error }; } };
    },
  };
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/apiAuth': {
      getAuthUser: async () => authenticated ? { email: 'driver@example.test' } : null,
      sbAdmin: () => db,
      unauthorized: () => ({ status: 401 }),
      forbidden: () => ({ status: 403 }),
    },
    '@/lib/apiError': { serverError: () => ({ status: 500 }) },
  };
  const exports = {};
  const source = await read('src/app/api/driver-availability/route.ts');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: name => mocks[name] });
  return { post: exports.POST, writes };
}

test('solo el driver autenticado puede cambiar su estado; errores no se confirman', async () => {
  const body = value => ({ json: async () => value });
  const valid = await endpoint();
  assert.equal((await valid.post(body({ available: false, email: 'other@example.test' }))).status, 200);
  assert.equal(valid.writes[0].email, 'driver@example.test');
  assert.equal(valid.writes[0].accepting_orders, false);
  assert.equal((await valid.post(body({ available: 'false' }))).status, 400);
  assert.equal((await (await endpoint({ role: 'cliente' })).post(body({ available: true }))).status, 403);
  assert.equal((await (await endpoint({ authenticated: false })).post(body({ available: true }))).status, 401);
  assert.equal((await (await endpoint({ error: new Error('failed') })).post(body({ available: false }))).status, 500);
});

test('el ciclo de sonidos se detiene desconectado y se reinicia al reconectar', async () => {
  const source = await read('src/components/RequestsFeed.tsx');
  const file = ts.createSourceFile('RequestsFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' &&
        node.arguments[0]?.getText(file).includes('const visibleLive = items.filter')) effect = node.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(effect);
  let sounds = 0;
  const timers = new Map();
  let id = 0;
  const context = {
    available: true, items: [{ id: 'one', createdAt: new Date().toISOString() }], dismissed: new Set(),
    prevIdsRef: { current: new Set() }, soundIvRef: { current: null }, sendingIdRef: { current: null },
    itemsRef: { current: [{ id: 'one', createdAt: new Date().toISOString() }] }, dismissedRef: { current: new Set() },
    playRideRequest: () => { sounds++; },
    setInterval: fn => { timers.set(++id, fn); return id; },
    clearInterval: timer => timers.delete(timer),
    getRemaining: () => 10,
  };
  const javascript = ts.transpileModule(`(${effect})();`, { compilerOptions: { module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(javascript, context);
  assert.equal(sounds, 1);
  assert.equal(timers.size, 1);
  context.available = false;
  vm.runInNewContext(javascript, context);
  assert.equal(timers.size, 0);
  assert.equal(sounds, 1);
  context.available = true;
  vm.runInNewContext(javascript, context);
  assert.equal(sounds, 2);
});

test('las dos funciones del feed respetan la desconexión sin alterar seguimiento', async () => {
  const migration = await read('sql/migrations/123_driver_availability.sql');
  assert.match(migration, /COALESCE\(dp\.accepting_orders, true\)/);
  assert.match(migration, /NOT v_available/);
  assert.doesNotMatch(migration, /DELETE FROM (?:public\.)?driver_locations/i);
  const page = await read('src/app/cliente/enviar/page.tsx');
  assert.match(page, /driver-availability-changes/);
  assert.match(page, /setInterval\(load, 4000\)/);
});
