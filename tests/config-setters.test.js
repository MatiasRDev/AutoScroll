import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { expect, test } from 'vitest';
import { JSDOM } from 'jsdom';

function ensureMethod(obj, key, fallback) {
  if (typeof obj[key] !== 'function') {
    obj[key] = fallback;
  }
}

async function bootstrapScript() {
  const code = await readFile(new URL('../src/autoscroll.source.js', import.meta.url), 'utf8');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const context = dom.getInternalVMContext?.() ?? dom.window ?? dom;
  const windowObj = context.window ?? context;
  const storage = new Map();
  const gmStubs = {
    GM_getValue: (key, fallback) => (storage.has(key) ? storage.get(key) : fallback),
    GM_setValue: (key, value) => {
      storage.set(key, value);
    },
    GM_addStyle: () => {},
    GM_registerMenuCommand: () => {},
  };

  Object.assign(windowObj, gmStubs);
  Object.assign(context, gmStubs);

  windowObj.alert = () => {};
  windowObj.confirm = () => false;
  windowObj.prompt = () => null;
  Object.assign(context, { alert: windowObj.alert, confirm: windowObj.confirm, prompt: windowObj.prompt });
  ensureMethod(windowObj, 'matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  ensureMethod(windowObj, 'requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 16));
  ensureMethod(windowObj, 'cancelAnimationFrame', (id) => clearTimeout(id));
  ensureMethod(windowObj, 'scrollTo', () => {});
  ensureMethod(windowObj, 'getSelection', () => ({ isCollapsed: true }));
  ensureMethod(windowObj, 'IntersectionObserver', class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  });

  Object.assign(context, { Event: windowObj.Event, CustomEvent: windowObj.CustomEvent });

  const vmContext = vm.createContext(context);
  vm.runInContext(code, vmContext, { filename: 'autoscroll.source.js' });

  const doc = windowObj.document;
  if (doc && typeof doc.dispatchEvent === 'function' && typeof windowObj.Event === 'function') {
    doc.dispatchEvent(new windowObj.Event('DOMContentLoaded'));
  }

  return { windowObj, storage, dom };
}

function importViaPrompt(windowObj, jsonString) {
  const originalPrompt = windowObj.prompt;
  windowObj.prompt = () => jsonString;
  const btnImport = windowObj.document?.querySelector('#tmImport');
  expect(btnImport, 'El botón de importación debe existir').toBeTruthy();
  btnImport?.dispatchEvent(new windowObj.Event('click', { bubbles: true }));
  windowObj.prompt = originalPrompt;
}

function stubPanelRect(panel, { width = 320, height = 360 } = {}) {
  const getWidth = () => parseInt(panel.style.getPropertyValue('--tm-width')) || width;
  const getHeight = () => parseInt(panel.style.height) || height;
  panel.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: getWidth(),
    bottom: getHeight(),
    width: getWidth(),
    height: getHeight(),
  });

  let scrollHeightVal = getHeight();
  Object.defineProperty(panel, 'scrollHeight', { configurable: true, get: () => scrollHeightVal });

  return {
    setScrollHeight(value) {
      scrollHeightVal = value;
    },
    getHeight,
  };
}

test('ignora entradas no numéricas y conserva los defaults', async () => {
  const { windowObj, storage, dom } = await bootstrapScript();
  try {
    importViaPrompt(
      windowObj,
      JSON.stringify({
        globals: {
          infScrollSentinelPx: 'abc',
          infScrollTimeoutMs: 'nan',
          smart: { smartResumeMs: 'oops' },
          curves: { rampStartMs: 'bad' },
          ui: { panelOpacity: 'wrong', fontScalePct: 'xx', borderRadiusPx: null, shadowAlpha: 'nan' },
        },
      })
    );

    const infPx = windowObj.document.querySelector('#tmInfPx');
    const smartResume = windowObj.document.querySelector('#tmSPResume');
    const panel = windowObj.document.querySelector('.tm-as-panel');

    expect(infPx?.value).toBe('1200');
    expect(smartResume?.value).toBe('3000');
    expect(panel?.style.opacity).toBe('0.85');
    expect(storage.get('infScrollSentinelPx')).toBe(1200);
    expect(storage.get('smartResumeMs')).toBe(3000);
    expect(storage.get('panelOpacity')).toBe(0.85);
    expect(storage.get('borderRadiusPx')).toBe(12);
    expect(storage.get('shadowAlpha')).toBe(0.33);
  } finally {
    dom?.window?.close?.();
  }
});

test('clamp aplica límites y evita valores fuera de rango', async () => {
  const { windowObj, storage, dom } = await bootstrapScript();
  try {
    importViaPrompt(
      windowObj,
      JSON.stringify({
        globals: {
          quickStepAddPx: -10,
          edgeHeightPx: 1000,
          edgeTopPct: -5,
          edgeWidthPx: 100,
          edgeHoverWidthPx: 1,
          edgeHoverRangePx: 400,
          edgeAutoHideSec: 50,
          infScrollSentinelPx: 50,
          infScrollTimeoutMs: 25000,
          smart: { smartResumeMs: 10 },
          curves: { rampStartMs: -10, rampStopMs: 99999, boostShiftMul: 0.2, boostCtrlMul: 50 },
          ui: {
            panelOpacity: 5,
            fontScalePct: 10,
            panelScalePct: 9999,
            borderRadiusPx: 99,
            panelWidthPx: 10,
            shadowAlpha: 2,
          },
        },
      })
    );

    const doc = windowObj.document;
    const panel = doc.querySelector('.tm-as-panel');

    expect(doc.querySelector('#tmQuickStep')?.value).toBe('1');
    expect(doc.querySelector('#tmEdgeHeight')?.value).toBe('400');
    expect(doc.querySelector('#tmEdgeTop')?.value).toBe('0');
    expect(doc.querySelector('#tmEdgeWidth')?.value).toBe('40');
    expect(doc.querySelector('#tmEdgeHoverWidth')?.value).toBe('40');
    expect(doc.querySelector('#tmEdgeRange')?.value).toBe('80');
    expect(doc.querySelector('#tmEdgeAutoHide')?.value).toBe('10');
    expect(doc.querySelector('#tmInfPx')?.value).toBe('200');
    expect(doc.querySelector('#tmInfTimeout')?.value).toBe('15000');
    const resumeVal = doc.querySelector('#tmSPResume')?.value;
    expect(Number(resumeVal)).toBeGreaterThanOrEqual(500);
    expect(doc.querySelector('#tmRampStart')?.value).toBe('0');
    const rampStopVal = Number(doc.querySelector('#tmRampStop')?.value);
    expect(rampStopVal).toBeGreaterThanOrEqual(0);
    expect(rampStopVal).toBeLessThanOrEqual(3000);
    const boostShiftVal = Number(doc.querySelector('#tmBoostShift')?.value);
    expect(boostShiftVal).toBeGreaterThanOrEqual(1);
    expect(boostShiftVal).toBeLessThanOrEqual(5);
    const boostCtrlVal = Number(doc.querySelector('#tmBoostCtrl')?.value);
    expect(boostCtrlVal).toBeGreaterThanOrEqual(1);
    expect(boostCtrlVal).toBeLessThanOrEqual(5);
    const opacityVal = Number(doc.querySelector('#tmOpacity')?.value);
    expect(opacityVal).toBeLessThanOrEqual(1);
    expect(opacityVal).toBeGreaterThanOrEqual(0.7);
    const fontScaleVal = Number(doc.querySelector('#tmFontScale')?.value);
    expect(fontScaleVal).toBeGreaterThanOrEqual(80);
    expect(fontScaleVal).toBeLessThanOrEqual(130);
    expect(doc.querySelector('#tmScale')?.value).toBe('250');
    const radiusVal = Number(doc.querySelector('#tmRadius')?.value);
    expect(radiusVal).toBeGreaterThanOrEqual(8);
    expect(radiusVal).toBeLessThanOrEqual(24);
    const widthPxVal = Number(doc.querySelector('#tmWidthPx')?.value);
    expect(widthPxVal).toBeGreaterThanOrEqual(260);
    expect(widthPxVal).toBeLessThanOrEqual(520);
    const shadowVal = Number(doc.querySelector('#tmShadow')?.value);
    expect(shadowVal).toBeGreaterThanOrEqual(0);
    expect(shadowVal).toBeLessThanOrEqual(0.6);

    expect(storage.get('quickStepAddPx')).toBe(1);
    expect(storage.get('edgeHeightPx')).toBe(400);
    expect(storage.get('edgeHoverWidthPx')).toBe(40);
    expect(storage.get('infScrollTimeoutMs')).toBe(15000);
    expect(storage.get('panelScalePct')).toBe(250);
    expect(storage.get('panelWidthPx')).toBe(260);
    expect(storage.get('smartResumeMs')).toBe(500);
    expect(storage.get('rampStopMs')).toBe(3000);
    expect(storage.get('boostShiftMul')).toBe(1);
    expect(storage.get('boostCtrlMul')).toBe(5);
    expect(storage.get('fontScalePct')).toBe(80);
    expect(storage.get('borderRadiusPx')).toBe(24);
    expect(storage.get('panelOpacity')).toBe(1);
    expect(storage.get('shadowAlpha')).toBe(0.6);
    expect(panel?.style.opacity).toBe('1');
    expect(panel?.style.getPropertyValue('--tm-shadow-a')).toBe('0.6');
    expect(panel?.style.getPropertyValue('--tm-width')).toBe('260px');
  } finally {
    dom?.window?.close?.();
  }
});

test('importa configuraciones de panel y sincroniza el handle de resize', async () => {
  const { windowObj, storage, dom } = await bootstrapScript();
  Object.defineProperty(windowObj, 'innerHeight', { configurable: true, value: 500 });
  const panel = windowObj.document.querySelector('.tm-as-panel');
  const resizeHandle = windowObj.document.querySelector('.tm-panel-resize-handle');

  try {
    importViaPrompt(
      windowObj,
      JSON.stringify({
        globals: {
          ui: {
            panelResizable: false,
            panelWidthPx: 999,
            panelHeightPx: 50,
            lockPanelHeightOnExpand: true,
          },
        },
      })
    );

    expect(storage.get('panelResizable')).toBe(false);
    expect(storage.get('panelWidthPx')).toBe(520);
    expect(storage.get('panelHeightPx')).toBe(240);
    expect(storage.get('lockPanelHeightOnExpand')).toBe(true);
    expect(panel?.style.getPropertyValue('--tm-width')).toBe('520px');
    expect(panel?.style.height).toBe('240px');
    expect(panel?.style.overflowY).toBe('auto');
    expect(resizeHandle?.style.display).toBe('none');

    importViaPrompt(
      windowObj,
      JSON.stringify({
        globals: {
          ui: {
            panelResizable: true,
            panelWidthPx: 270,
            panelHeightPx: 900,
            lockPanelHeightOnExpand: false,
          },
        },
      })
    );

    expect(storage.get('panelResizable')).toBe(true);
    expect(storage.get('panelWidthPx')).toBe(270);
    expect(storage.get('panelHeightPx')).toBe(484);
    expect(storage.get('lockPanelHeightOnExpand')).toBe(false);
    expect(panel?.style.getPropertyValue('--tm-width')).toBe('270px');
    expect(panel?.style.height).toBe('484px');
    expect(panel?.style.overflowY).toBe('');
    expect(resizeHandle?.style.display).toBe('block');
  } finally {
    dom?.window?.close?.();
  }
});

test('bloquea la altura al expandir secciones y usa scroll interno', async () => {
  const { windowObj, dom } = await bootstrapScript();
  Object.defineProperty(windowObj, 'innerHeight', { configurable: true, value: 700 });
  const panel = windowObj.document.querySelector('.tm-as-panel');
  const { setScrollHeight, getHeight } = stubPanelRect(panel, { width: 320, height: 360 });

  try {
    importViaPrompt(
      windowObj,
      JSON.stringify({ globals: { ui: { lockPanelHeightOnExpand: true, panelHeightPx: 360 } } })
    );

    const initialHeight = getHeight();
    expect(panel?.style.height).toBe(`${initialHeight}px`);
    expect(panel?.style.overflowY).toBe('auto');

    const advancedHead = windowObj.document.querySelector('#secAdvanced .tm-sec-head');
    const appearanceHead = windowObj.document.querySelector('#secAppearance .tm-sec-head');
    advancedHead?.dispatchEvent(new windowObj.Event('click', { bubbles: true }));
    appearanceHead?.dispatchEvent(new windowObj.Event('click', { bubbles: true }));

    setScrollHeight(initialHeight + 240);

    expect(panel?.style.height).toBe(`${initialHeight}px`);
    expect(panel?.style.overflowY).toBe('auto');
    expect(panel?.scrollHeight).toBeGreaterThan(initialHeight);
  } finally {
    dom?.window?.close?.();
  }
});

test('persistir tamaño al arrastrar el handle re-clampa al viewport', async () => {
  const { windowObj, storage, dom } = await bootstrapScript();
  Object.defineProperty(windowObj, 'innerHeight', { configurable: true, value: 500 });
  const panel = windowObj.document.querySelector('.tm-as-panel');
  const handle = windowObj.document.querySelector('.tm-panel-resize-handle');
  stubPanelRect(panel, { width: 300, height: 320 });

  try {
    importViaPrompt(
      windowObj,
      JSON.stringify({ globals: { ui: { panelResizable: true, panelWidthPx: 320, panelHeightPx: 320 } } })
    );

    handle?.dispatchEvent(new windowObj.MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
    windowObj.dispatchEvent(new windowObj.MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 220 }));
    windowObj.dispatchEvent(new windowObj.MouseEvent('mouseup', { bubbles: true }));

    expect(storage.get('panelWidthPx')).toBe(380);
    expect(storage.get('panelHeightPx')).toBe(484);
    expect(panel?.style.getPropertyValue('--tm-width')).toBe('380px');
    expect(panel?.style.height).toBe('484px');
    const widthInput = windowObj.document.querySelector('#tmWidthPx');
    expect(widthInput?.value).toBe('380');
  } finally {
    dom?.window?.close?.();
  }
});
