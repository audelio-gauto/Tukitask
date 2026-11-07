import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function createGestureHarness() {
  const source = await readFile(new URL('../src/app/tecnico/page.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' &&
        node.arguments[0]?.getText(file).includes("sheet.addEventListener('touchstart', onStart")) {
      effect = node.arguments[0].getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(effect, 'sheet gesture effect exists');

  const listeners = new Map();
  const sheet = {
    style: { transition: '', transform: '' },
    addEventListener: (name, handler) => listeners.set(`sheet:${name}`, handler),
    removeEventListener: name => listeners.delete(`sheet:${name}`),
  };
  class Element {
    constructor(interactive = false) { this.interactive = interactive; }
    closest(selector) {
      assert.equal(selector, 'button, input, textarea, select, a, label');
      return this.interactive ? this : null;
    }
  }
  const state = [];
  const context = {
    Element,
    sheetRef: { current: sheet },
    isDragging: { current: false },
    moved: { current: false },
    startY: { current: 0 },
    startTranslate: { current: 0 },
    isDesktop: () => false,
    getTranslateY: () => sheet.style.transform
      ? Number(sheet.style.transform.match(/translateY\(([-\d.]+)px\)/)[1])
      : 350,
    setSheet: value => state.push(value),
    document: {
      addEventListener: (name, handler) => listeners.set(`document:${name}`, handler),
      removeEventListener: name => listeners.delete(`document:${name}`),
    },
    window: { innerHeight: 844, addEventListener() {}, removeEventListener() {} },
  };
  const compiled = ts.transpileModule(`(${effect})()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const cleanup = vm.runInNewContext(compiled, context);
  return { listeners, sheet, state, Element, cleanup };
}

for (const input of ['touch', 'mouse']) {
  test(`${input}: tap and minor movement do not move the technician sheet`, async () => {
    const h = await createGestureHarness();
    const start = h.listeners.get(`sheet:${input === 'touch' ? 'touchstart' : 'mousedown'}`);
    const move = h.listeners.get(`document:${input === 'touch' ? 'touchmove' : 'mousemove'}`);
    const end = h.listeners.get(`document:${input === 'touch' ? 'touchend' : 'mouseup'}`);
    const event = y => input === 'touch'
      ? { target: new h.Element(), touches: [{ clientY: y }] }
      : { target: new h.Element(), clientY: y };

    start(event(100));
    move(event(105));
    end();
    assert.deepEqual(h.state, []);
    assert.equal(h.sheet.style.transform, '');
    assert.equal(h.sheet.style.transition, '');

    start(event(400));
    move(event(150));
    assert.equal(h.sheet.style.transform, 'translateY(100px)');
    end();
    assert.deepEqual(h.state, ['full']);
    h.cleanup();
  });

  test(`${input}: controls and their nested icons never start dragging`, async () => {
    const h = await createGestureHarness();
    const start = h.listeners.get(`sheet:${input === 'touch' ? 'touchstart' : 'mousedown'}`);
    const move = h.listeners.get(`document:${input === 'touch' ? 'touchmove' : 'mousemove'}`);
    const end = h.listeners.get(`document:${input === 'touch' ? 'touchend' : 'mouseup'}`);
    const event = y => input === 'touch'
      ? { target: new h.Element(true), touches: [{ clientY: y }] }
      : { target: new h.Element(true), clientY: y };
    start(event(400));
    move(event(150));
    end();
    assert.deepEqual(h.state, []);
    assert.equal(h.sheet.style.transform, '');
    assert.equal(h.sheet.style.transition, '');
    h.cleanup();
  });
}
