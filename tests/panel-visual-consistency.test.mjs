import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function contrast(first, second) {
  const luminance = hex => {
    const channels = hex.match(/../g).map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('panel accents and profile text remain legible on their theme backgrounds', () => {
  for (const [text, background] of [
    ['1658a6', 'ffffff'],
    ['f5c518', '111827'],
    ['172033', 'f5c518'],
    ['172033', 'f58a07'],
    ['28354a', 'f5c518'],
    ['28354a', 'f58a07'],
    ['526174', 'ffffff'],
    ['a7b3c5', '1c1c2e'],
  ]) {
    assert.ok(contrast(text, background) >= 4.5, `#${text} on #${background}`);
  }
});

test('client and worker panels use the same theme-aware navigation accent', async () => {
  for (const path of ['src/app/cliente/cliente.css', 'src/app/driver/driver.css']) {
    const css = await read(path);
    assert.match(css, /--panel-accent:\s*#f5c518/i);
    assert.match(css, /\[data-theme="light"\][^{]+\{[^}]*--panel-accent:\s*#1658a6/is);
  }
  for (const role of ['driver', 'tecnico']) {
    const layout = await read(`src/app/${role}/layout.tsx`);
    assert.match(layout, /<BottomNav[^\r\n]+accent="var\(--panel-accent\)"/);
  }
});

test('shared headers preserve navigation and provide labeled controls', async () => {
  const client = await read('src/app/cliente/components/ClientScreenLayout.tsx');
  const worker = await read('src/app/driver/components/DriverScreenLayout.tsx');
  assert.match(client, /href="\/cliente"[^>]+aria-label="Volver"/);
  assert.match(client, /onClick=\{openDrawer\} aria-label="Menú"/);
  assert.match(worker, /href=\{backHref \?\? '\/driver'\}[^>]+aria-label="Volver"/);
  assert.match(worker, /onClick=\{openDrawer\} aria-label="Menú"/);
});

test('technician acceptance uses theme surfaces without changing its back action', async () => {
  const page = await read('src/app/tecnico/aceptacion/page.tsx');
  assert.match(page, /onClick=\{\(\) => router\.back\(\)\}/);
  assert.match(page, /background: 'var\(--content-bg\)'/);
  assert.match(page, /background: 'var\(--surface-1\)'/);
  assert.match(page, /fill="var\(--text-primary\)"/);
  assert.doesNotMatch(page, /background: '#f8fafc'/);
});

test('technician documents use theme-aware cards and inputs', async () => {
  const page = await read('src/app/tecnico/settings/page.tsx');
  assert.match(page, /background: 'var\(--doc-card-bg\)'/);
  assert.match(page, /border: '1px solid var\(--doc-card-border\)'/);
  assert.match(page, /color: 'var\(--input-text\)', background: 'var\(--input-bg\)'/);
});
