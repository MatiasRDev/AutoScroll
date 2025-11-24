import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

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

const computeHash = (value) => createHash('sha256').update(value).digest('hex');
let bundleCache = null;

async function getBundleCode() {
  if (bundleCache) return bundleCache;
  const code = await readFile(new URL('../dist/autoscroll.bundle.js', import.meta.url), 'utf8');
  bundleCache = { code, hash: computeHash(code) };
  return bundleCache;
}

function ensureMethod(obj, key, fallback) {
  if (typeof obj[key] !== 'function') {
    obj[key] = fallback;
  }
}

async function bootstrapBundle({ gmValues = {}, windowOverrides = {}, preamble = '' } = {}) {
  const { code, hash } = await getBundleCode();
  const JSDOM = await loadJSDOM();

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const vmContext = dom.getInternalVMContext?.() ?? dom.window ?? dom;
  const windowObj = vmContext.window ?? vmContext;
  const called = new Map();
  const gmStorage = new Map(Object.entries(gmValues));
  const mark = (name) => {
    const total = called.get(name) ?? 0;
    called.set(name, total + 1);
  };

  const gmStubs = {
    GM_getValue: (key, fallback) => {
      mark('GM_getValue');
      return gmStorage.has(key) ? gmStorage.get(key) : fallback;
    },
    GM_setValue: (key, value) => {
      mark('GM_setValue');
      gmStorage.set(key, value);
    },
    GM_addStyle: () => {
      mark('GM_addStyle');
    },
    GM_registerMenuCommand: () => {
      mark('GM_registerMenuCommand');
    },
  };

  Object.assign(windowObj, gmStubs, windowOverrides);
  Object.assign(vmContext, gmStubs, windowOverrides);

  windowObj.alert = windowOverrides.alert ?? (() => {});
  windowObj.confirm = windowOverrides.confirm ?? (() => false);
  windowObj.prompt = windowOverrides.prompt ?? (() => null);
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
  ensureMethod(windowObj, 'scrollBy', () => {});
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
    const sampleEl = windowObj.document.createElement('div');
    if (sampleEl && typeof sampleEl.append !== 'function') {
      const proto = Object.getPrototypeOf(sampleEl);
      proto.append = function appendPolyfill(...nodes) {
        nodes.forEach((node) => {
          if (node && typeof node.nodeType === 'number') {
            this.appendChild(node);
            return;
          }
          this.appendChild(windowObj.document.createTextNode(String(node ?? '')));
        });
      };
    }
  }

  const context = vm.createContext(vmContext);
  const codeToRun = preamble ? `${preamble}\n${code}` : code;
  vm.runInContext(codeToRun, context, { filename: 'autoscroll.bundle.js' });

  const triggerDomReady = () => {
    const doc = windowObj.document;
    if (doc && typeof doc.dispatchEvent === 'function' && typeof windowObj.Event === 'function') {
      doc.dispatchEvent(new windowObj.Event('DOMContentLoaded'));
    }
  };

  const clickToggle = () => {
    const toggleButton = windowObj.document?.querySelector('#tmToggle');
    if (toggleButton && typeof toggleButton.dispatchEvent === 'function' && typeof windowObj.Event === 'function') {
      toggleButton.dispatchEvent(new windowObj.Event('click', { bubbles: true }));
    }
  };

  const cleanup = () => {
    if (typeof dom?.window?.close === 'function') {
      dom.window.close();
    }
  };

  return { code, bundleHash: hash, called, gmStorage, windowObj, triggerDomReady, clickToggle, cleanup };
}

test('el bundle invoca las APIs GM al inicializar', async () => {
  const { code, bundleHash, called, triggerDomReady, clickToggle, cleanup } = await bootstrapBundle();

  try {
    expect(computeHash(code)).toBe(bundleHash);

    triggerDomReady();
    clickToggle();

    const gmMethods = ['GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_registerMenuCommand'];
    for (const name of gmMethods) {
      const calls = called.get(name) ?? 0;
      expect(calls, `Se esperaba que ${name} fuese invocado al menos una vez`).toBeGreaterThan(0);
    }
  } finally {
    cleanup();
  }
});

test('inserta el panel y el toggle actualiza el estado', async () => {
  const { gmStorage, windowObj, triggerDomReady, clickToggle, cleanup } = await bootstrapBundle();

  try {
    triggerDomReady();

    const panel = windowObj.document.querySelector('.tm-as-panel');
    expect(panel).toBeTruthy();

    const toggleButton = windowObj.document.querySelector('#tmToggle');
    expect(toggleButton?.textContent).toMatch(/Iniciar/i);

    clickToggle();
    expect(gmStorage.get('running')).toBe(true);
    expect(toggleButton?.textContent).toMatch(/Detener/i);

    clickToggle();
    expect(gmStorage.get('running')).toBe(false);
    expect(toggleButton?.textContent).toMatch(/Iniciar/i);
  } finally {
    cleanup();
  }
});

test('el autostart respeta las reglas allow/deny', async () => {
  const allowRules = { rules: [{ type: 'allow', pattern: 'https://example.com/*' }], rulesAutoStart: false };
  const blockRules = {
    rules: [
      { type: 'block', pattern: 'https://example.com/*' },
      { type: 'allow', pattern: 'https://example.com/*' },
    ],
    rulesAutoStart: false,
  };

  const rafOverrides = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };

  const allowContext = await bootstrapBundle({ gmValues: allowRules, windowOverrides: rafOverrides });
  try {
    allowContext.triggerDomReady();

    const autoStartToggle = allowContext.windowObj.document.querySelector('#tmRulesAutoStart');
    autoStartToggle.checked = true;
    autoStartToggle.dispatchEvent(new allowContext.windowObj.Event('change', { bubbles: true }));

    allowContext.windowObj.history.pushState({}, '', allowContext.windowObj.location.href);
    expect(allowContext.gmStorage.get('running')).toBe(true);

    allowContext.windowObj.document
      ?.querySelector('#tmToggle')
      ?.dispatchEvent(new allowContext.windowObj.Event('click', { bubbles: true }));
  } finally {
    allowContext.cleanup();
  }

  const blockContext = await bootstrapBundle({ gmValues: blockRules, windowOverrides: rafOverrides });
  try {
    blockContext.triggerDomReady();

    const autoStartToggle = blockContext.windowObj.document.querySelector('#tmRulesAutoStart');
    autoStartToggle.checked = true;
    autoStartToggle.dispatchEvent(new blockContext.windowObj.Event('change', { bubbles: true }));

    blockContext.windowObj.history.pushState({}, '', blockContext.windowObj.location.href);
    expect(blockContext.gmStorage.get('running')).not.toBe(true);
  } finally {
    blockContext.cleanup();
  }
});

test('importar configuración aplica clamps a valores inválidos', async () => {
  const invalidConfig = {
    globals: {
      quickStepAddPx: 5000,
      edgeWidthPx: 1,
      edgeHoverWidthPx: 0,
      edgeAutoHideSec: 30,
      ui: { panelWidthPx: 1200, shadowAlpha: -5 },
    },
  };

  const promptMock = vi.fn(() => JSON.stringify(invalidConfig));
  const { gmStorage, windowObj, triggerDomReady, cleanup } = await bootstrapBundle({ windowOverrides: { prompt: promptMock } });

  try {
    triggerDomReady();

    const importButton = windowObj.document.querySelector('#tmImport');
    expect(importButton).toBeTruthy();

    importButton?.dispatchEvent(new windowObj.Event('click', { bubbles: true }));

    expect(promptMock).toHaveBeenCalled();
    expect(gmStorage.get('quickStepAddPx')).toBe(1000);
    expect(gmStorage.get('edgeWidthPx')).toBe(2);
    expect(gmStorage.get('edgeHoverWidthPx')).toBe(2);
    expect(gmStorage.get('edgeAutoHideSec')).toBe(10);
    expect(gmStorage.get('panelWidthPx')).toBe(520);
    expect(gmStorage.get('shadowAlpha')).toBe(0);
  } finally {
    cleanup();
  }
});
