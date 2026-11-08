import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const notification = {
  id: 'one', type: 'new_offer', title: 'Oferta recibida',
  body: 'Primera línea\n' + 'mensaje largo '.repeat(100),
  priority: 'urgent', read: false, created_at: '2025-01-01T12:00:00Z',
};

async function load(path, mocks = {}, globals = {}) {
  const source = await readFile(new URL(path, root), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, ...globals,
    require: name => name in mocks ? mocks[name] : require(name),
  });
  return exports;
}

function hooks() {
  const slots = [];
  let index = 0;
  let effects = [];
  return {
    start() { index = 0; effects = []; },
    runEffects() { for (const effect of effects) effect(); },
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn) { index++; return fn(); },
    useCallback(fn, deps) {
      const i = index++;
      const old = slots[i];
      if (!old || deps.some((dep, n) => dep !== old.deps[n])) slots[i] = { deps, fn };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = index++;
      const old = slots[i];
      if (!old || deps.some((dep, n) => dep !== old.deps[n])) {
        effects.push(() => {
          old?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
    setSlot(i, value) { slots[i] = value; },
  };
}

function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test('el detalle presenta el mensaje completo, con saltos, scroll y cierre', async () => {
  const { NotificationDetail } = await load('src/components/NotificationDetail.tsx');
  const html = renderToStaticMarkup(React.createElement(NotificationDetail, {
    notification, error: 'Error al guardar', onClose() {}, fallbackFocusRef: { current: null },
  }));
  assert.ok(html.includes(notification.title));
  assert.ok(html.includes(notification.body));
  assert.match(html, /role="dialog"/);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /overflow-y:auto/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Cerrar notificación/);
});

test('el detalle recibe el foco, contiene Tab y cierra con Escape', async () => {
  const h = hooks();
  let handler;
  let closed = 0;
  class Element {
    isConnected = true;
    focus() { document.activeElement = this; }
  }
  const previous = new Element();
  const first = new Element();
  const last = new Element();
  const dialog = {
    querySelectorAll: () => [first, last],
    contains: element => element === first || element === last,
  };
  first.closest = () => dialog;
  const document = {
    activeElement: previous,
    body: new Element(),
    addEventListener: (_, fn) => { handler = fn; },
    removeEventListener() {},
  };
  const { NotificationDetail } = await load('src/components/NotificationDetail.tsx', { react: h }, { document, HTMLElement: Element });
  h.start();
  const tree = NotificationDetail({
    notification, error: null, onClose: () => { closed++; }, fallbackFocusRef: { current: previous },
  });
  find(tree, e => e.props?.['aria-label'] === 'Cerrar notificación').props.ref.current = first;
  h.runEffects();
  assert.equal(document.activeElement, first);
  let prevented = false;
  handler({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, last);
  handler({ key: 'Escape' });
  assert.equal(closed, 1);
});

test('el popup se puede abrir o cerrar y reemplaza el temporizador al llegar otro aviso', async () => {
  const h = hooks();
  const timers = new Map();
  let timerId = 0;
  let opened;
  let dismissed = 0;
  const { UrgentNotificationPopup } = await load('src/components/UrgentNotificationPopup.tsx', {
    react: h, '@/components/Icon': { Icon: () => null },
  }, {
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  });
  const dismiss = () => { dismissed++; };
  const open = n => { opened = n; };
  const render = n => {
    h.start();
    const result = UrgentNotificationPopup({ notification: n, onDismiss: dismiss, onOpen: open, soundEnabled: false });
    h.runEffects();
    return result;
  };
  render(notification);
  assert.equal([...timers.values()][0].delay, 10000);
  let tree = render(notification);
  assert.ok(find(tree, e => e.props?.['aria-label'] === 'Leer notificación: Oferta recibida'));
  const next = { ...notification, id: 'two', priority: 'high', title: 'Otro aviso' };
  render(next);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 8000);
  tree = render(next);
  find(tree, e => e.props?.['aria-label'] === 'Leer notificación: Otro aviso').props.onClick();
  assert.equal(opened, next);
  assert.equal(dismissed, 1);
  assert.equal(timers.size, 0);
});

test('solo ofrece rutas identificables para cada rol', async () => {
  const { notificationUrl } = await load('src/components/NotificationBell.tsx', {
    'next/navigation': {}, '@/lib/useNotifications': {}, '@/components/UrgentNotificationPopup': {},
    '@/components/NotificationDetail': {}, '@/components/Icon': {},
  });
  const route = (type, pathname, extra = {}) => notificationUrl({ ...notification, type, ...extra }, pathname);
  assert.equal(route('new_job_offer', '/cliente'), '/cliente/mis-servicios');
  assert.equal(route('new_offer', '/cliente'), '/cliente/mis-envios');
  assert.equal(route('status_change', '/cliente', { group_key: 'market_order_ready_1' }), '/tienda/mis-pedidos');
  assert.equal(route('status_change', '/cliente'), null);
  assert.equal(route('chat_message', '/tienda'), null);
  assert.equal(route('status_change', '/tienda', { group_key: 'market_order_ready_1' }), '/tienda/mis-pedidos');
  assert.equal(route('offer_accepted', '/driver'), '/driver/activo');
  assert.equal(route('job_accepted', '/tecnico'), '/tecnico/citas');
  assert.equal(route('new_market_order', '/vendedor', { data: { order_id: 'a/b' } }), '/vendedor/pedidos?order_id=a%2Fb');
  assert.equal(route('new_offer', '/vendedor'), null);
});

test('la bandeja permite leer sin navegar, conserva el historial y muestra errores', async () => {
  const h = hooks();
  const pushes = [];
  const item = { ...notification };
  let unreadCount = 1;
  const api = {
    notifications: [item],
    get unreadCount() { return unreadCount; },
    markRead: async () => { throw new Error('failed'); },
    markAllRead: async () => { throw new Error('failed'); },
    latestUrgent: null,
    dismissUrgent() {},
  };
  const Detail = () => null;
  const { NotificationBell } = await load('src/components/NotificationBell.tsx', {
    react: h,
    'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }), usePathname: () => '/cliente' },
    '@/lib/useNotifications': { useNotifications: () => api },
    '@/components/UrgentNotificationPopup': { UrgentNotificationPopup: () => null },
    '@/components/NotificationDetail': { NotificationDetail: Detail },
    '@/components/Icon': { Icon: () => null },
  }, { console: { error() {} } });
  const render = () => { h.start(); return NotificationBell({ userEmail: 'user@example.test' }); };
  let tree = render();
  find(tree, e => e.props?.['aria-label'] === 'Notificaciones').props.onClick();
  tree = render();
  find(tree, e => e.type === 'button' && e.props.children === 'Marcar todo leído').props.onClick();
  await Promise.resolve();
  tree = render();
  assert.ok(find(tree, e => e.props?.role === 'alert'));
  const row = find(tree, e => e.type === 'button' && find(e, child => child.props?.children === item.title));
  row.props.onClick();
  await Promise.resolve();
  tree = render();
  const detail = find(tree, e => e.type === Detail);
  assert.equal(detail.props.notification, item);
  assert.match(detail.props.error, /No se pudo marcar/);
  assert.deepEqual(pushes, []);
  detail.props.onClose();
  item.read = true;
  unreadCount = 0;
  tree = render();
  find(tree, e => e.props?.['aria-label'] === 'Notificaciones').props.onClick();
  tree = render();
  assert.ok(find(tree, e => e.props?.children === item.title));
});

test('los errores no marcan leído y marcar todo no modifica avisos nuevos durante la petición', async () => {
  const h = hooks();
  let response = { ok: false };
  let resolve;
  const { useNotifications: notificationsHook } = await load('src/lib/useNotifications.ts', {
    react: h,
    '@/lib/supabaseClient': { supabase: {} },
    '@/lib/authFetch': { authFetch: () => response instanceof Promise ? response : Promise.resolve(response) },
  });
  const render = () => { h.start(); return notificationsHook(undefined); };
  render();
  h.setSlot(0, [notification]);
  let current = render();
  assert.equal(current.unreadCount, 1);
  await assert.rejects(current.markRead(['one']));
  assert.equal(render().unreadCount, 1);
  await assert.rejects(current.markAllRead());
  assert.equal(render().unreadCount, 1);
  response = new Promise(r => { resolve = r; });
  current = render();
  const pending = current.markAllRead();
  const newer = { ...notification, id: 'two' };
  h.setSlot(0, [newer, notification]);
  resolve({ ok: true });
  await pending;
  current = render();
  assert.equal(current.unreadCount, 1);
  assert.equal(current.notifications[0].read, false);
  assert.equal(current.notifications[1].read, true);
});
