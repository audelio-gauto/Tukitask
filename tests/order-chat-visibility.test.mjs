import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/orderChat.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { isOrderChatClosed, canShowOrderChat } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('completed and cancelled trips do not contribute unread chat', () => {
  for (const status of ['delivered', 'commission_charged', 'client_confirmed', 'cancelled', 'driver_cancelled', 'returned', 'incident_closed']) {
    assert.equal(isOrderChatClosed(status), true, status);
    assert.equal(canShowOrderChat({ status, client_email: 'client', accepted_by: 'driver' }, 'client'), false);
    assert.equal(canShowOrderChat({ status, client_email: 'client', accepted_by: 'driver' }, 'driver'), false);
  }
});

test('active and unresolved trips remain available only to current participants', () => {
  for (const status of ['accepted', 'picking_up', 'at_pickup', 'in_transit', 'failed', 'returning', 'return_rejected', 'driver_returning', 'return_delivered']) {
    const order = { status, client_email: 'CLIENT', accepted_by: 'DRIVER' };
    assert.equal(canShowOrderChat(order, 'client'), true, status);
    assert.equal(canShowOrderChat(order, 'driver'), true, status);
    assert.equal(canShowOrderChat(order, 'other'), false, status);
  }
  assert.equal(canShowOrderChat({ status: 'pending', client_email: 'client', accepted_by: null }, 'driver'), false);
});

test('job threads remain independent and completed trip buttons are absent from history', async () => {
  const [threads, counts, driverHistory, clientHistory, badge] = await Promise.all([
    readFile(new URL('../src/app/api/chat/threads/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/chat/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/driver/delivered/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/cliente/historial/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ChatBadge.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(threads, /!row\.order_id \|\| visibleOrderIds\.has\(row\.order_id\)/);
  assert.match(counts, /isOrderChatClosed\(order\.status\).*unread: 0/);
  assert.match(driverHistory, /chatAvailable = !isOrderChatClosed\(order\.status\)/);
  assert.match(clientHistory, /!isOrderChatClosed\(item\.data\.status\)/);
  assert.match(clientHistory, /Chat con el Tasker/);
  assert.match(badge, /table: 'orders', filter: `client_email=eq\.\$\{email\}`/);
  assert.match(badge, /table: 'orders', filter: `accepted_by=eq\.\$\{email\}`/);
});

test('threads endpoint counts active trips and technical jobs but not finished trips', async () => {
  const rows = [
    { order_id: 'active', job_id: null, unread_count: 2 },
    { order_id: 'finished', job_id: null, unread_count: 5 },
    { order_id: 'reassigned', job_id: null, unread_count: 7 },
    { order_id: null, job_id: 'job', unread_count: 3 },
  ];
  const orders = [
    { id: 'active', status: 'in_transit', client_email: 'client', accepted_by: 'driver' },
    { id: 'finished', status: 'delivered', client_email: 'client', accepted_by: 'driver' },
    { id: 'reassigned', status: 'accepted', client_email: 'other', accepted_by: 'newdriver' },
  ];
  globalThis.__chatTest = {
    canShowOrderChat,
    sbAdmin: () => ({
      from(table) {
        const query = {
          select() { return this; },
          eq() { return this; },
          gt() { return this; },
          in() { return this; },
          then(resolve) { return Promise.resolve({ data: table === 'orders' ? orders : rows, error: null }).then(resolve); },
        };
        return query;
      },
    }),
    getAuthUser: async () => ({ email: 'driver' }),
    unauthorized: () => ({ status: 401 }),
    serverError: error => ({ status: 500, error }),
    NextResponse: { json: value => value },
  };
  try {
    let api = await readFile(new URL('../src/app/api/chat/threads/route.ts', import.meta.url), 'utf8');
    api = api.replace(/^import .*;\s*$/gm, '');
    api = `const { canShowOrderChat, sbAdmin, getAuthUser, unauthorized, serverError, NextResponse } = globalThis.__chatTest;\n${api}`;
    const compiled = ts.transpileModule(api, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
    const { GET } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);
    assert.deepEqual(await GET({ url: 'https://example.test/api/chat/threads?count=1' }), { total_unread: 5 });
    const visible = await GET({ url: 'https://example.test/api/chat/threads' });
    assert.deepEqual(visible.map(row => row.order_id || row.job_id), ['active', 'job']);
  } finally {
    delete globalThis.__chatTest;
  }
});
