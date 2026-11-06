import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/arrivalAlert.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { nextArrivalAlert } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('arrival alert starts at 80 metres during pickup and not before', () => {
  for (const status of ['accepted', 'assigned', 'picking_up']) {
    assert.equal(nextArrivalAlert(null, 'order:driver', status, 80), 'order:driver');
    assert.equal(nextArrivalAlert(null, 'order:driver', status, 80.01), null);
    assert.equal(nextArrivalAlert(null, 'order:driver', status, null), null);
    assert.equal(nextArrivalAlert(null, 'order:driver', status, NaN), null);
  }
});

test('arrival alert stays active despite GPS fluctuations until confirmation', () => {
  assert.equal(nextArrivalAlert('order:driver', 'order:driver', 'picking_up', 250), 'order:driver');
  assert.equal(nextArrivalAlert('order:driver', 'order:driver', 'picking_up', null), 'order:driver');
  for (const status of ['at_pickup', 'in_transit', 'cancelled']) {
    assert.equal(nextArrivalAlert('order:driver', 'order:driver', status, 0), null);
    assert.equal(nextArrivalAlert(null, 'order:driver', status, 0), null);
  }
});

test('arrival alert does not carry over to another driver or order', () => {
  assert.equal(nextArrivalAlert('order:driver1', 'order:driver2', 'picking_up', 100), null);
  assert.equal(nextArrivalAlert('order:driver1', 'other:driver1', 'accepted', 100), null);
  assert.equal(nextArrivalAlert('order:driver1', null, 'accepted', 0), null);
});
