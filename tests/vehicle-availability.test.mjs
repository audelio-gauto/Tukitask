import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/app/cliente/enviar/vehicleAvailability.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { vehicleAvailability } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('vehicles become selectable only when a nearby driver is known', () => {
  assert.deepEqual(vehicleAvailability('ready', 3), { available: true, label: '3 min' });
  for (const eta of [null, undefined, 0, NaN]) {
    assert.deepEqual(vehicleAvailability('ready', eta), { available: false, label: 'Sin conductores cerca' });
  }
});

test('loading and lookup errors do not claim a driver is available', () => {
  assert.deepEqual(vehicleAvailability('loading', 3), { available: false, label: 'Buscando conductores…' });
  assert.deepEqual(vehicleAvailability('error', 3), { available: false, label: 'No se pudo comprobar disponibilidad' });
});
