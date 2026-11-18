import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const source = await read('src/app/admin/components/adminNavigation.ts');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { adminNavigation, activeAdminLink } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const links = adminNavigation.flatMap(section => section.links);

const NOT_READY = [
  '/admin/hotels',
  '/admin/finanzas/retiros',
  '/admin/vendors/productos/stock',
  '/admin/vendors/productos/reportados',
  '/admin/vendors/negociaciones/fraude',
  '/admin/vendors/pedidos/reembolsos',
  '/admin/documentos/aprobados',
  '/admin/documentos/rechazados',
];

test('admin navigation has distinct sections and existing, nonduplicated destinations', async () => {
  assert.deepEqual(adminNavigation.map(section => section.id), [
    'operaciones', 'personas', 'marketplace', 'finanzas', 'configuracion',
  ]);
  assert.equal(new Set(links.map(link => link.href)).size, links.length);
  for (const link of links) {
    assert.ok(!NOT_READY.includes(link.href), `nav must not expose ${link.href}`);
    await access(new URL(`../src/app${link.href}/page.tsx`, import.meta.url));
    assert.ok(link.label);
  }
  assert.equal(links.length, 29);
});

test('role management, critical queues and existing financial controls remain reachable', () => {
  for (const href of [
    '/admin/users', '/admin/clients', '/admin/drivers/driver', '/admin/services/tecnico',
    '/admin/vendors/lista', '/admin/documentos',
    '/admin/vendors/productos', '/admin/vendors/productos/aprobar',
    '/admin/reports', '/admin/vendors/pedidos/disputas', '/admin/finanzas/pagos-pendientes',
    '/admin/wallets', '/admin/billetera/historial', '/admin/billetera/vendedores',
    '/admin/drivers/commission', '/admin/services/commission',
    '/admin/vendors/configuracion/comisiones',
    '/admin/vendors/configuracion/metodos-pago',
    '/admin/vendors/configuracion/limites-negociacion',
    '/admin/control-ai', '/admin/apikeys', '/admin/metrics', '/admin/audit',
  ]) {
    const inNav = links.some(link => link.href === href || (link.matchPaths ?? []).some(path => href === path || href.startsWith(`${path}/`)));
    assert.ok(inNav, `missing ${href}`);
  }
});

test('active navigation picks the most specific route and supports detail pages', () => {
  for (const [path, sectionId, href] of [
    ['/admin/vendors/productos/aprobar', 'marketplace', '/admin/vendors/productos'],
    ['/admin/vendors/productos/marcas', 'marketplace', '/admin/vendors/productos/categorias'],
    ['/admin/vendors/configuracion/comisiones', 'marketplace', '/admin/vendors/configuracion/comisiones'],
    ['/admin/vendors/lista', 'personas', '/admin/vendors/lista'],
    ['/admin/drivers/pricing', 'configuracion', '/admin/drivers/pricing'],
    ['/admin/drivers/123', 'personas', '/admin/drivers/driver'],
    ['/admin/services/commission', 'configuracion', '/admin/drivers/pricing'],
    ['/admin/clients/123', 'personas', '/admin/clients'],
    ['/admin/orders/suspicious', 'operaciones', '/admin/orders/suspicious'],
    ['/admin/documentos/aprobados', 'personas', '/admin/documentos'],
    ['/admin/vendors/pedidos/disputas', 'operaciones', '/admin/reports'],
    ['/admin/billetera/historial', 'finanzas', '/admin/wallets'],
    ['/admin/vendors/negociaciones/historial', 'marketplace', '/admin/vendors/negociaciones/historial'],
    ['/admin/vendors/negociaciones/limites', 'marketplace', '/admin/vendors/negociaciones/historial'],
  ]) {
    const active = activeAdminLink(path);
    assert.equal(active?.sectionId, sectionId, path);
    assert.equal(active?.href, href, path);
  }
  assert.equal(activeAdminLink('/admin'), null);
  assert.equal(activeAdminLink('/admin/hotels'), null);
});

test('legacy routes, wallet tabs and document redirects remain available', async () => {
  const wallets = await read('src/app/admin/wallets/page.tsx');
  for (const tab of ['pending', 'ajuste', 'movimientos']) assert.match(wallets, new RegExp(`'${tab}'`));
  for (const page of ['comisiones', 'metodos-pago', 'limites-negociacion']) {
    const legacy = await read(`src/app/admin/configuracion/${page}/page.tsx`);
    assert.match(legacy, new RegExp(`redirect\\('/admin/vendors/configuracion/${page}'\\)`));
  }
  for (const [page, tab] of [['aprobados', 'aprobados'], ['rechazados', 'rechazados']]) {
    const doc = await read(`src/app/admin/documentos/${page}/page.tsx`);
    assert.match(doc, new RegExp(`redirect\\('/admin/documentos\\?tab=${tab}'\\)`));
  }
});

test('unfinished views do not imply that actual alert counts are zero', async () => {
  for (const page of ['stock', 'reportados']) {
    const content = await read(`src/app/admin/vendors/productos/${page}/page.tsx`);
    assert.match(content, /no está conectada/);
    assert.doesNotMatch(content, /No hay (alertas de stock|productos reportados)/);
  }
  const fraud = await read('src/app/admin/vendors/negociaciones/fraude/page.tsx');
  assert.match(fraud, /no está conectada a señales de fraude/);
  const verification = await read('src/app/admin/vendors/verificaciones/page.tsx');
  assert.match(verification, /no indica una verificación de identidad/);
  assert.doesNotMatch(verification, /label: 'Aprobados'/);
});

test('sidebar renders flat links, search results and critical counts', async () => {
  const sidebar = await read('src/app/admin/components/AdminSidebar.tsx');
  const code = ts.transpileModule(sidebar, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const require = createRequire(import.meta.url);
  const render = (state, mobileOpen = false) => {
    let index = 0;
    const exports = {};
    vm.runInNewContext(code, {
      exports,
      require: name => {
        if (name === 'react') return { useEffect: () => {}, useState: () => [state[index++], () => {}] };
        if (name === 'next/navigation') return { usePathname: () => '/admin' };
        if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
        if (name === '@/components/Icon') return { Icon: () => null };
        if (name === '@/lib/supabaseClient') return { supabase: {} };
        if (name === './adminNavigation') return { activeAdminLink, adminNavigation };
        return require(name);
      },
    });
    return renderToStaticMarkup(exports.default({ mobileOpen, onClose: () => {} }));
  };
  const counts = { '/admin/vendors/productos': 3 };
  const menu = render(['marketplace', '', counts, false], true);
  assert.match(menu, /adm-sidebar-open/);
  assert.match(menu, /Productos/);
  assert.match(menu, /3 pendientes/);
  assert.doesNotMatch(menu, /Rutas en vivo/);
  const search = render([null, 'negociacion', {}, false]);
  assert.match(search, /Negociaciones/);
  assert.doesNotMatch(search, /Rutas en vivo/);
  const error = render([null, '', {}, true]);
  assert.match(error, /indicadores no están disponibles/);
});
