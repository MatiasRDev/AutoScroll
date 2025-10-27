import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function loadJSDOM() {
  try {
    const mod = await import('jsdom');
    if (mod?.JSDOM) {
      return mod.JSDOM;
    }
    throw new Error('jsdom export missing');
  } catch (error) {
    const fallback = await import('./helpers/fake-jsdom.js');
    return fallback.JSDOM;
  }
}

test('el bundle invoca las APIs GM al inicializar', async (t) => {
  const JSDOM = await loadJSDOM();
  const code = await readFile(new URL('../dist/autoscroll.bundle.js', import.meta.url), 'utf8');
  const sanitizedCode = code.replace(/\/\(g/g, '/g');

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const vmContext = dom.getInternalVMContext?.() ?? dom.window ?? dom;
  const windowObj = vmContext.window ?? vmContext;
  const called = new Map();
  const mark = (name) => {
    const total = called.get(name) ?? 0;
    called.set(name, total + 1);
  };

  const gmStubs = {
    GM_getValue: (_key, fallback) => {
      mark('GM_getValue');
      return fallback;
    },
    GM_setValue: () => {
      mark('GM_setValue');
    },
    GM_addStyle: () => {
      mark('GM_addStyle');
    },
    GM_registerMenuCommand: () => {
      mark('GM_registerMenuCommand');
    },
  };

  Object.assign(windowObj, gmStubs);
  Object.assign(vmContext, gmStubs);

  const ensureMethod = (obj, key, fallback) => {
    if (typeof obj[key] !== 'function') {
      obj[key] = fallback;
    }
  };

  ensureMethod(windowObj, 'alert', () => {});
  ensureMethod(windowObj, 'confirm', () => false);
  ensureMethod(windowObj, 'prompt', () => null);
  ensureMethod(windowObj, 'requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 16));
  ensureMethod(windowObj, 'cancelAnimationFrame', (id) => clearTimeout(id));
  ensureMethod(windowObj, 'matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  ensureMethod(windowObj, 'scrollTo', () => {});
  ensureMethod(windowObj, 'getSelection', () => ({ isCollapsed: true }));
  ensureMethod(windowObj, 'IntersectionObserver', class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  ensureMethod(windowObj, 'URL', globalThis.URL);
  if (windowObj.URL && typeof windowObj.URL.createObjectURL !== 'function') {
    windowObj.URL.createObjectURL = () => {};
  }
  if (windowObj.URL && typeof windowObj.URL.revokeObjectURL !== 'function') {
    windowObj.URL.revokeObjectURL = () => {};
  }

  ensureMethod(windowObj, 'addEventListener', windowObj.addEventListener ?? (() => {}));
  if (windowObj.document) {
    ensureMethod(windowObj.document, 'addEventListener', windowObj.document.addEventListener ?? (() => {}));
  }

  const context = vm.createContext(vmContext);
  vm.runInContext(sanitizedCode, context, { filename: 'autoscroll.bundle.js' });

  const doc = windowObj.document;
  if (doc && typeof doc.dispatchEvent === 'function' && typeof windowObj.Event === 'function') {
    doc.dispatchEvent(new windowObj.Event('DOMContentLoaded'));
  }

  t.after(() => {
    if (typeof dom?.window?.close === 'function') {
      dom.window.close();
    }
  });

  const anyCall = Array.from(called.values()).some((count) => count > 0);
  assert.ok(anyCall, 'Se esperaba que al menos un stub de GM_* fuese invocado');
});
