import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('technician history uses the same theme-aware card surfaces as driver history', async () => {
  const [technician, driver, styles, tokens] = await Promise.all([
    read('src/app/tecnico/historial/page.tsx'),
    read('src/app/driver/delivered/page.tsx'),
    read('src/app/driver/driver.css'),
    read('src/app/globals.css'),
  ]);
  for (const source of [technician, driver]) {
    for (const name of ['tuki-trip-card', 'tuki-trip-top', 'tuki-trip-meta', 'tuki-trip-status', 'tuki-trip-body']) {
      assert.ok(source.includes(`className="${name}"`), `missing ${name}`);
    }
  }
  assert.match(styles, /\.tuki-trip-card\s*\{[^}]*background:\s*var\(--surface-1\)/);
  assert.match(styles, /\.tuki-trip-top\s*\{[^}]*border-bottom:\s*1px solid var\(--border-subtle\)/);
  assert.match(tokens, /--surface-1:\s*#1C1C2E/i);
  assert.match(tokens, /\[data-theme="light"\]\s*\{[^}]*--surface-1:\s*#ffffff/i);
  assert.doesNotMatch(technician, /className="tuki-address-box"/);
  const details = technician.slice(technician.indexOf('{/* Address */}'), technician.indexOf('{/* Rate button'));
  assert.match(details, /style=\{\{ background: 'transparent' \}\}/);
  assert.doesNotMatch(details.replace("background: 'transparent'", ''), /background:/);
  for (const value of ['job.address', 'job.description', 'job.agreed_price', 'job.extra_items', 'job.extra_charge', 'job.warranty_days', 'Chat con el cliente']) {
    assert.ok(details.includes(value), `missing ${value}`);
  }
  assert.match(technician, /setChatModal\(/);
  assert.match(technician, /setRatingJobId\(/);
  assert.match(technician, /setReportModal\(/);
});
