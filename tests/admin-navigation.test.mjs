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
const links = adminNavigation.flatMap(section => section.groups.flatMap(group => group.links));

test('admin navigation has distinct sections and existing, nonduplicated destinations', async () => {
  assert.deepEqual(adminNavigation.map(section => section.id), [
    'personas', 'operaciones', 'marketplace', 'finanzas', 'control', 'estadisticas', 'configuracion',
  ]);
  assert.equal(new Set(links.map(link => link.href)).size, links.length);
  for (const link of links) {
    await access(new URL(`../src/app${link.href}/page.tsx`, import.meta.url));
    assert.ok(link.label);
  }
});

test('role management, critical queues and existing financial controls remain reachable', () => {
  for (const href of [
    '/admin/users', '/admin/clients', '/admin/drivers/driver', '/admin/services/tecnico',
    '/admin/vendors/lista', '/admin/hotels', '/admin/documentos',
    '/admin/vendors/productos/aprobar', '/admin/vendors/pedidos/disputas',
    '/admin/vendors/pedidos/reembolsos', '/admin/finanzas/pagos-pendientes',
    '/admin/wallets', '/admin/billetera/historial', '/admin/billetera/vendedores', '/admin/drivers/commission',
    '/admin/services/commission', '/admin/vendors/configuracion/comisiones',
    '/admin/vendors/configuracion/metodos-pago', '/admin/vendors/configuracion/limites-negociacion',
  ]) {
    assert.ok(links.some(link => link.href === href), `missing ${href}`);
  }
});

test('active navigation picks the most specific route and supports role detail pages', () => {
  for (const [path, sectionId, href] of [
    ['/admin/vendors/productos/aprobar', 'marketplace', '/admin/vendors/productos/aprobar'],
    ['/admin/vendors/configuracion/comisiones', 'configuracion', '/admin/vendors/configuracion/comisiones'],
    ['/admin/vendors/lista', 'personas', '/admin/vendors/lista'],
    ['/admin/drivers/pricing', 'configuracion', '/admin/drivers/pricing'],
    ['/admin/drivers/123', 'personas', '/admin/drivers/driver'],
    ['/admin/services/commission', 'configuracion', '/admin/services/commission'],
    ['/admin/clients/123', 'personas', '/admin/clients'],
    ['/admin/orders/suspicious', 'operaciones', '/admin/orders/suspicious'],
    ['/admin/documentos/aprobados', 'control', '/admin/documentos/aprobados'],
  ]) {
    const active = activeAdminLink(path);
    assert.equal(active?.sectionId, sectionId, path);
    assert.equal(active?.href, href, path);
  }
  assert.equal(activeAdminLink('/admin'), null);
});

test('wallet tabs and legacy routes remain available after menu consolidation', async () => {
  const wallets = await read('src/app/admin/wallets/page.tsx');
  for (const tab of ['pending', 'ajuste', 'movimientos']) assert.match(wallets, new RegExp(`'${tab}'`));
  for (const page of ['comisiones', 'metodos-pago', 'limites-negociacion']) {
    const legacy = await read(`src/app/admin/configuracion/${page}/page.tsx`);
    assert.match(legacy, new RegExp(`redirect\\('/admin/vendors/configuracion/${page}'\\)`));
  }
});

test('unfinished views do not imply that actual alert counts are zero', async () => {
  for (const page of ['stock', 'reportados']) {
    const content = await read(`src/app/admin/vendors/productos/${page}/page.tsx`);
    assert.match(content, /no está conectada/);
    assert.doesNotMatch(content, /No hay (alertas de stock|productos reportados)/);
  }
  const verification = await read('src/app/admin/vendors/verificaciones/page.tsx');
  assert.match(verification, /no indica una verificación de identidad/);
  assert.doesNotMatch(verification, /label: 'Aprobados'/);
});

test('sidebar renders grouped links, search results and critical counts', async () => {
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
  const counts = { '/admin/vendors/productos/aprobar': 3 };
  const menu = render(['marketplace', 'marketplace:Productos', '', counts, false], true);
  assert.match(menu, /adm-sidebar-open/);
  assert.match(menu, /Aprobación de productos/);
  assert.match(menu, /3 pendientes/);
  assert.doesNotMatch(menu, /Ciudades de entrega/);
  const search = render([null, null, 'negociacion', {}, false]);
  assert.match(search, /Límites de negociación/);
  assert.match(search, /Monitoreo de ofertas/);
  assert.doesNotMatch(search, /Rutas en vivo/);
  const error = render([null, null, '', {}, true]);
  assert.match(error, /indicadores no están disponibles/);
});
