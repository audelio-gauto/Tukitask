import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

for (const role of ['cliente', 'driver', 'tecnico']) {
  test(`${role}: account shortcuts point to existing sections and pages`, async () => {
    const source = await read(`src/app/${role}/settings/page.tsx`);
    const shortcutSource = source.match(/<AccountSections selected=\{accountSection\} onSelect=\{setAccountSection\} items=\{\[([\s\S]*?)\]\} \/>/);
    assert.ok(shortcutSource, 'account navigation exists');
    const sections = [...shortcutSource[1].matchAll(/section: '([^']+)'/g)].map(match => match[1]);
    assert.ok(sections.length >= 3);
    for (const id of sections) assert.ok(source.includes(`id="${id}"`), `missing section ${id}`);
    for (const [, href] of shortcutSource[1].matchAll(/href: '([^']+)'/g)) {
      assert.match(href, new RegExp(`^/${role}/`));
      await read(`src/app${href}/page.tsx`);
    }
    assert.match(shortcutSource[1], /section: 'cuenta-documentos', onActivate:/);
  });
}

test('support opens the requested Paraguay WhatsApp number without account data', async () => {
  const source = await read('src/components/AccountSections.tsx');
  const file = ts.createSourceFile('AccountSections.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let url;
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(file) === 'SUPPORT_WHATSAPP_URL' && declaration.initializer && ts.isStringLiteral(declaration.initializer)) {
        url = declaration.initializer.text;
      }
    }
  }
  assert.equal(url, 'https://wa.me/595961188628');
  assert.match(source, /href=\{SUPPORT_WHATSAPP_URL\} target="_blank" rel="noopener noreferrer"/);
  assert.match(source, /Contactar con soporte/);
});

test('account navigation opens a detail, activates documents and returns to the menu', async () => {
  const source = await read('src/components/AccountSections.tsx');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const require = createRequire(import.meta.url);
  const exports = {};
  const scrolls = [];
  vm.runInNewContext(compiled, {
    exports,
    require: name => {
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (name === '@/components/Icon') return { Icon: () => null };
      if (name.endsWith('.css')) return { __esModule: true, default: {} };
      return require(name);
    },
    window: { scrollTo: options => scrolls.push(options) },
  });
  const AccountSections = exports.default;
  const selections = [];
  let activated = 0;
  const items = [
    { label: 'Mi perfil', description: 'Perfil', icon: 'user', section: 'cuenta-perfil' },
    { label: 'Mis documentos', description: 'Documentos', icon: 'document', section: 'cuenta-documentos', onActivate: () => { activated++; } },
    { label: 'Mi billetera', description: 'Saldo', icon: 'credit-card', href: '/driver/billetera' },
  ];
  const onSelect = section => selections.push(section);
  const menu = AccountSections({ items, selected: null, onSelect });
  const markup = renderToStaticMarkup(menu);
  assert.match(markup, /Mi perfil/);
  assert.match(markup, /Mis documentos/);
  assert.match(markup, /href="\/driver\/billetera"/);
  assert.match(markup, /href="https:\/\/wa\.me\/595961188628"/);
  const buttons = menu.props.children[2].props.children[0];
  buttons[1].props.onClick();
  assert.equal(activated, 1);
  assert.deepEqual(selections, ['cuenta-documentos']);
  assert.equal(scrolls.length, 1);
  const detail = AccountSections({ items, selected: 'cuenta-documentos', onSelect });
  const detailMarkup = renderToStaticMarkup(detail);
  assert.match(detailMarkup, /Mis documentos/);
  assert.doesNotMatch(detailMarkup, /Mi perfil|Mi billetera|Contactar con soporte/);
  detail.props.children[0].props.onClick();
  assert.deepEqual(selections, ['cuenta-documentos', null]);
});

for (const role of ['cliente', 'driver', 'tecnico']) {
  test(`${role}: each account section is isolated without unmounting its form`, async () => {
    const source = await read(`src/app/${role}/settings/page.tsx`);
    const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const navigation = source.match(/<AccountSections selected=\{accountSection\} onSelect=\{setAccountSection\} items=\{\[([\s\S]*?)\]\} \/>/);
    const sections = [...navigation[1].matchAll(/section: '([^']+)'/g)].map(match => match[1]);
    const elements = new Map();
    function visit(node) {
      if (ts.isJsxOpeningElement(node)) {
        const id = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(file) === 'id');
        if (id?.initializer && ts.isStringLiteral(id.initializer) && sections.includes(id.initializer.text)) {
          elements.set(id.initializer.text, node.parent);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    for (const id of sections) {
      const element = elements.get(id);
      assert.ok(element, `missing element for ${id}`);
      for (const selected of [null, ...sections]) {
        let hidden = false;
        for (let node = element; node; node = node.parent) {
          if (!ts.isJsxElement(node)) continue;
          const attr = node.openingElement.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(file) === 'hidden');
          if (attr && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
            const expression = attr.initializer.expression.getText(file);
            hidden ||= Boolean(vm.runInNewContext(expression, { accountSection: selected }));
          }
        }
        assert.equal(hidden, selected !== id, `${id} visibility when selected=${selected}`);
      }
    }
    assert.match(source, /useState<string \| null>\(null\)/);
    assert.match(source, /<form onSubmit=\{handleSave(?:All)?\}/);
  });
}

test('the existing technician document deep link opens the documents section', async () => {
  const source = await read('src/app/tecnico/settings/page.tsx');
  assert.match(source, /searchParams\.get\('scroll'\) === 'docs'[\s\S]*?setDocsOpen\(true\);[\s\S]*?setAccountSection\('cuenta-documentos'\)/);
  assert.match(source, /expanded=\{docsOpen\} onExpandedChange=\{setDocsOpen\}/);
  assert.match(source, /<form onSubmit=\{handleSave\} noValidate/);
  for (const field of ['gender', 'firstName', 'lastName']) {
    assert.match(source, new RegExp(`if \\(!${field}(?:\\.trim\\(\\))?\\) \\{ setAccountSection\\('cuenta-perfil'\\); setError\\(`));
  }
});
