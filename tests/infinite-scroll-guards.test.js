import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const noop = () => {};

function ensureMethod(obj, key, fallback) {
  if (typeof obj[key] !== 'function') {
    obj[key] = fallback;
  }
}

async function bootstrapScript({ storedValues = {}, intersectionObserver } = {}) {
  const code = await readFile(new URL('../src/autoscroll.source.js', import.meta.url), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const context = dom.getInternalVMContext?.() ?? dom.window ?? dom;
  const windowObj = context.window ?? context;
  const storage = new Map(Object.entries(storedValues));

  const gmStubs = {
    GM_getValue: (key, fallback) => (storage.has(key) ? storage.get(key) : fallback),
    GM_setValue: (key, value) => storage.set(key, value),
    GM_addStyle: noop,
    GM_registerMenuCommand: noop,
  };

  Object.assign(windowObj, gmStubs);
  Object.assign(context, gmStubs);

  windowObj.alert = noop;
  windowObj.confirm = () => false;
  windowObj.prompt = () => null;
  Object.assign(context, { alert: windowObj.alert, confirm: windowObj.confirm, prompt: windowObj.prompt });

  ensureMethod(windowObj, 'matchMedia', () => ({ matches: false, addEventListener: noop, removeEventListener: noop }));
  ensureMethod(windowObj, 'requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 16));
  ensureMethod(windowObj, 'cancelAnimationFrame', (id) => clearTimeout(id));
  ensureMethod(windowObj, 'scrollTo', noop);
  ensureMethod(windowObj, 'getSelection', () => ({ isCollapsed: true }));

  if (intersectionObserver !== undefined) {
    windowObj.IntersectionObserver = intersectionObserver;
    context.IntersectionObserver = intersectionObserver;
  } else {
    delete windowObj.IntersectionObserver;
    delete context.IntersectionObserver;
  }

  Object.assign(context, { Event: windowObj.Event, CustomEvent: windowObj.CustomEvent });

  const vmContext = vm.createContext(context);
  vm.runInContext(code, vmContext, { filename: 'autoscroll.source.js' });

  const doc = windowObj.document;
  if (doc && typeof doc.dispatchEvent === 'function' && typeof windowObj.Event === 'function') {
    doc.dispatchEvent(new windowObj.Event('DOMContentLoaded'));
  }

  return { windowObj, storage, dom };
}

describe('setupInfScroll defensivo', () => {
  test('desactiva infinite scroll si falta IntersectionObserver', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    const { windowObj, storage, dom } = await bootstrapScript({
      storedValues: { infScrollEnabled: true },
      intersectionObserver: undefined,
    });

    try {
      const doc = windowObj.document;
      const elInfEnabled = doc.querySelector('#tmInfEnabled');
      const toggleButton = doc.querySelector('#tmToggle');

      elInfEnabled.checked = true;
      elInfEnabled.dispatchEvent(new windowObj.Event('change', { bubbles: true }));

      expect(() => toggleButton?.dispatchEvent(new windowObj.Event('click', { bubbles: true }))).not.toThrow();

      expect(elInfEnabled.checked).toBe(false);
      expect(storage.get('infScrollEnabled')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      dom?.window?.close?.();
    }
  });

  test('desactiva infinite scroll si el margen del sentinel es inválido', async () => {
    class IO {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
    const { windowObj, storage, dom } = await bootstrapScript({
      storedValues: { infScrollEnabled: true, infScrollSentinelPx: Number.NaN },
      intersectionObserver: IO,
    });

    try {
      const doc = windowObj.document;
      const elInfEnabled = doc.querySelector('#tmInfEnabled');
      const toggleButton = doc.querySelector('#tmToggle');

      expect(elInfEnabled.checked).toBe(true);
      expect(() => toggleButton?.dispatchEvent(new windowObj.Event('click', { bubbles: true }))).not.toThrow();

      expect(elInfEnabled.checked).toBe(false);
      expect(storage.get('infScrollEnabled')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      dom?.window?.close?.();
    }
  });
});
