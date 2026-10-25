import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

test('vendedor pedidos support bulk selection and status updates', async () => {
  const source = await readText('src/app/vendedor/pedidos/page.tsx');

  assert.match(source, /selectedIds|toggleOrderSelection|toggleSelectVisible/i);
  assert.match(source, /bulkStatus|applyBulkStatus/i);
  assert.match(source, /Seleccionar visibles|Cambiar estado|Aplicar/i);
});

test('completed market orders count as delivered in vendor menu', async () => {
  const source = await readText('src/app/vendedor/pedidos/page.tsx');

  assert.match(source, /commission_charged/i);
  assert.match(source, /DELIVERED_STATUSES|\['delivered',\s*'commission_charged'\]|\[\s*'delivered',\s*'commission_charged'\s*\]/i);
});
