import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

for (const role of ['cliente', 'driver', 'tecnico']) {
  test(`${role}: account shortcuts point to existing sections and pages`, async () => {
    const source = await read(`src/app/${role}/settings/page.tsx`);
    const shortcutSource = source.match(/<AccountSections items=\{\[([\s\S]*?)\]\} \/>/);
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

test('the existing technician document deep link opens the documents section', async () => {
  const source = await read('src/app/tecnico/settings/page.tsx');
  assert.match(source, /searchParams\.get\('scroll'\) === 'docs'[\s\S]*?setDocsOpen\(true\)/);
  assert.match(source, /expanded=\{docsOpen\} onExpandedChange=\{setDocsOpen\}/);
});
