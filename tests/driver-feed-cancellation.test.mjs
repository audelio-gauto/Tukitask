import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/feedRefreshGate.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { FeedRefreshGate } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('a cancellation during an in-flight feed request invalidates the old response', () => {
  const gate = new FeedRefreshGate();
  const old = gate.request();
  assert.equal(gate.isRunning(), true);
  assert.equal(gate.request(true), null);
  assert.equal(gate.isCurrent(old), false);
  const retry = gate.finish();
  assert.equal(retry.force, true);
  assert.equal(gate.isCurrent(retry), true);
  assert.equal(gate.finish(), null);
  assert.equal(gate.isRunning(), false);
});

test('concurrent refreshes are combined without losing a forced refresh', () => {
  const gate = new FeedRefreshGate();
  gate.request();
  gate.request(true);
  gate.request();
  const next = gate.finish();
  assert.equal(next.force, true);
  assert.equal(gate.finish(), null);
  assert.equal(gate.request().force, false);
});

test('cleanup invalidates old results and allows a new subscriber to refresh', () => {
  const gate = new FeedRefreshGate();
  const old = gate.request();
  gate.request(true);
  gate.invalidate();
  assert.equal(gate.isCurrent(old), false);
  gate.request();
  const next = gate.finish();
  assert.equal(next.force, false);
  assert.equal(gate.isCurrent(next), true);
});

test('dashboard refreshes as fallback and removes unavailable requests on offer conflict', async () => {
  const page = await readFile(new URL('../src/app/driver/page.tsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/app/api/orders/offers/route.ts', import.meta.url), 'utf8');
  const orders = await readFile(new URL('../src/app/api/orders/route.ts', import.meta.url), 'utf8');
  assert.match(page, /if \(!gate\.isRunning\(\)\) loadPendingOrders\(\); \}, 15_000\)/);
  assert.match(page, /gate\.isCurrent\(current\)/);
  assert.match(page, /body\.code === 'order_unavailable'/);
  assert.match(page, /prev\.filter\(o => String\(o\.id\) !== String\(orderId\)\)/);
  assert.match(api, /order\.status !== 'pending' && order\.status !== 'negotiating'/);
  assert.match(api, /code: 'order_unavailable'/);
  assert.match(orders, /query\.in\('status', \['pending', 'negotiating'\]\)/);
});
