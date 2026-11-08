import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('web installation and push are removed while native Android push remains', async () => {
  const [layout, hook, service, tokens, settings] = await Promise.all([
    read('src/app/layout.tsx'), read('src/lib/usePushNotifications.ts'),
    read('src/lib/pushService.ts'), read('src/app/api/push-tokens/route.ts'),
    read('src/app/admin/settings/page.tsx'),
  ]);
  assert.doesNotMatch(layout, /manifest:\s*|appleWebApp:|InstallPrompt/);
  assert.match(layout, /<PwaRetirement/);
  assert.doesNotMatch(hook, /serviceWorker\.register|firebase\/messaging|platform: 'web'/);
  assert.match(hook, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.match(hook, /PushNotifications\.register\(\)/);
  assert.match(service, /\.in\('platform', \['android', 'ios'\]\)/);
  assert.match(tokens, /!\['android', 'ios'\]\.includes\(platform\)/);
  assert.doesNotMatch(settings, /upload-pwa-icon|Íconos de la app \(PWA\)/);
});

test('retirement worker removes only Tukitask caches and unregisters itself', async () => {
  const source = await read('src/lib/retiredWorker.ts');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Response });
  const response = exports.retiredWorkerResponse();
  assert.match(response.headers.get('content-type'), /javascript/);
  const code = await response.text();
  const handlers = {};
  const removed = [];
  let claimed = false;
  let unregistered = false;
  let skipped = false;
  const self = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: async () => { skipped = true; },
    clients: { claim: async () => { claimed = true; } },
    registration: { unregister: async () => { unregistered = true; } },
  };
  vm.runInNewContext(code, {
    self,
    caches: {
      keys: async () => ['tuki-cache-v2', 'tuki-cache-v3', 'another-app-cache'],
      delete: async name => { removed.push(name); return true; },
    },
  });
  let pending;
  handlers.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  handlers.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.equal(skipped, true);
  assert.equal(claimed, true);
  assert.equal(unregistered, true);
  assert.deepEqual(removed, ['tuki-cache-v2', 'tuki-cache-v3']);
  assert.equal(handlers.fetch, undefined);
  assert.equal(handlers.push, undefined);
});

test('client retirement unregisters only known local workers and keeps unrelated caches', async () => {
  const source = await read('src/components/PwaRetirement.tsx');
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const require = createRequire(import.meta.url);
  const exports = {};
  const removed = [];
  const unregistered = [];
  const registration = url => ({
    active: { scriptURL: url },
    waiting: null,
    installing: null,
    unregister: async () => { unregistered.push(url); return true; },
  });
  const navigator = { serviceWorker: { getRegistrations: async () => [
    registration('https://tukitask.example/sw.js'),
    registration('https://tukitask.example/firebase-messaging-sw.js'),
    registration('https://tukitask.example/other-worker.js'),
    registration('https://other.example/sw.js'),
  ] } };
  const caches = {
    keys: async () => ['tuki-cache-v3', 'other-cache'],
    delete: async name => { removed.push(name); return true; },
  };
  vm.runInNewContext(js, {
    exports, URL, navigator, caches,
    location: { origin: 'https://tukitask.example' },
    window: { caches },
    require: name => name === '@capacitor/core' ? { Capacitor: {} } : require(name),
  });
  await exports.retireLegacyPwa();
  assert.deepEqual(unregistered, ['https://tukitask.example/sw.js', 'https://tukitask.example/firebase-messaging-sw.js']);
  assert.deepEqual(removed, ['tuki-cache-v3']);
  assert.match(source, /Capacitor\.isNativePlatform\(\)/);
  assert.match(source, /El APK solo funciona en Android/);
  assert.match(source, /\/app-update\/TukiTask\.apk/);
});

test('migration notice distinguishes native Android, Android PWA and iPhone PWA', async () => {
  const source = await read('src/components/PwaRetirement.tsx');
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const require = createRequire(import.meta.url);
  const render = (native, installed, userAgent) => {
    const exports = {};
    const media = { matches: installed };
    vm.runInNewContext(js, {
      exports, URL,
      window: { matchMedia: () => media },
      navigator: { userAgent },
      require: name => {
        if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => native } };
        if (name === 'react') return {
          useEffect: () => {},
          useState: initial => [initial, () => {}],
          useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
        };
        return require(name);
      },
    });
    return renderToStaticMarkup(exports.PwaRetirement());
  };
  assert.equal(render(true, true, 'Android'), '');
  assert.equal(render(false, false, 'Android'), '');
  assert.match(render(false, true, 'Android'), /href="\/app-update\/TukiTask\.apk"/);
  const ios = render(false, true, 'iPhone');
  assert.match(ios, /APK solo funciona en Android/);
  assert.doesNotMatch(ios, /href="\/app-update\/TukiTask\.apk"/);
});
