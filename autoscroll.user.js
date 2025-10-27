// ==UserScript==
// @name         AutoScroll
// @namespace    https://matias.ramirez/autoscroll
// @version      1.0.0
// @description  Auto-scroll configurable con panel avanzado
// @match        http*://*/*
// @updateURL    https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/autoscroll.user.js
// @downloadURL  https://raw.githubusercontent.com/MatiasRDev/AutoScroll/main/autoscroll.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ------------------------ Defaults ------------------------ */
  const DEFAULTS = {
    // Core
    speedPxPerSec: 240,
    hotkey: 'Shift+A',
    running: false,
    panelCollapsed: false,

    // Gesto por N clics (toggle)
    clickToggleEnabled: false,
    clickToggleCount: 2,
    clickToggleWindowMs: 500,

    // Triple-clic
    tripleClickAction: 'none', // none|top|bottom|toggleDir
    tripleClickWindowMs: 500,

    // Panel visibility
    panelToggleHotkey: 'Shift+H',
    useEdgeStrip: true,
    panelVisibility: 'visible', // visible | hidden_full | hidden_edge

    // Edge strip
    edgeSide: 'left',
    edgeHeightPx: 160,
    edgeTopPct: 40,
    edgeWidthPx: 6,
    edgeHoverWidthPx: 14,
    edgeHoverRangePx: 18,
    edgeAutoHideSec: 2,

    // Infinite Scroll (opcional)
    infScrollEnabled: false,
    infScrollSentinelPx: 1200,
    infScrollTimeoutMs: 4000,
    infScrollLoaderSel: '',

    // Pausa inteligente
    smartPauseEnabled: true,
    smartPause_wheel: true,
    smartPause_keys:  true,
    smartPause_select: true,
    smartPause_focusInput: true,
    smartResumeMs: 3000,
    smartNoResumeIfInputFocused: true,

    // Curvas & Boost
    rampStartMs: 0, // 0 = OFF (lineal por defecto)
    rampStopMs: 0,
    boostShiftMul: 1.5,
    boostCtrlMul: 2,
    boostAllowCombine: false,
    invertDirection: false,

    // Acciones rápidas (suma px/s)
    quickStepAddPx: 20, // suma/resta fija (px/s)

    // Apariencia
    a11yEnabled: true,
    theme: 'auto',
    panelOpacity: 0.85,
    fontScalePct: 100,         // 80..130
    borderRadiusPx: 12,        // 8..24
    compactUI: false,
    panelWidthPx: 300,         // 260..520
    shadowAlpha: 0.33,         // 0..0.6
    accent: 'teal',            // teal|blue|indigo|amber|pink

    // Debug overlay
    debugOverlay: false,
    debugShowFps: true,
    debugShowSpeed: true,
    debugShowDistance: true,
    debugShowState: true,

    // Secciones (UI state)
    secBasicOpen: true,
    secVisibilityOpen: true,
    secGesturesOpen: false,
    secPauseOpen: true,
    secCurvesOpen: false,
    secRulesOpen: false,
    secProfilesOpen: false,
    secAppearanceOpen: false,
    secToolsOpen: false,
    secAdvancedOpen: false,

    // Perfiles / Forzar subdominio
    useSiteProfile: false,
    forceSubdomain: false,
    forceSubdomainNoPromptHosts: {},
    forceSubdomainDefaultAction: 'ask',

    // Reglas (lista blanca/negra)
    rules: [],
    rulesAutoStart: false,

    // PSL-lite / Overrides
    usePslLite: true,
    baseDomainOverrides: {} // { host: 'bbc.co.uk', ... }
  };

  /* ------------------------ Storage helpers ------------------------ */
  const G = (k, d=DEFAULTS[k]) => GM_getValue(k, d);
  const S = (k, v) => GM_setValue(k, v);
  const getProfiles = () => GM_getValue('profiles', {});
  const setProfiles = (obj) => GM_setValue('profiles', obj);

  /* ------------------------ PSL-lite ------------------------ */
  const PSL_LITE = [
    'co.uk','ac.uk','gov.uk','org.uk','net.uk','sch.uk','ltd.uk','plc.uk',
    'com.au','net.au','org.au','edu.au','gov.au','id.au',
    'com.ar','net.ar','org.ar','gob.ar','edu.ar',
    'com.br','net.br','org.br','gov.br','edu.br',
    'com.mx','org.mx','gob.mx','edu.mx',
    'com.pe','gob.pe','edu.pe',
    'com.co','net.co','org.co','gov.co','edu.co',
    'gob.cl',
    'com.hk','edu.hk','gov.hk','org.hk',
    'com.sg','edu.sg','gov.sg','org.sg',
    'com.tr','gov.tr','edu.tr','org.tr',
    'com.sa','edu.sa','gov.sa',
    'com.eg','edu.eg','gov.eg'
  ];
  const PSL_SET = new Set(PSL_LITE);
  function longestPslSuffix(host){
    const parts = host.toLowerCase().split('.');
    for(let len=Math.min(3, parts.length); len>=1; len--){
      const suffix = parts.slice(-len).join('.');
      if(PSL_SET.has(suffix)) return suffix;
    }
    return null;
  }

  /* ------------------------ Dominio base + overrides ------------------------ */
  let usePslLite = G('usePslLite');
  let baseDomainOverrides = G('baseDomainOverrides');

  function computeBaseDomain(host){
    const ov = baseDomainOverrides?.[host];
    if(ov && typeof ov === 'string' && ov.includes('.')) return ov;

    const parts = host.split('.');
    if(parts.length <= 2) return host;

    if(usePslLite){
      const suffix = longestPslSuffix(host);
      if(suffix){
        const sufParts = suffix.split('.').length;
        if(parts.length > sufParts){
          return parts.slice(-(sufParts+1)).join('.');
        }
      }
    }

    const sldSet = new Set(['co','com','net','org','gov','ac','edu','or','mil','gob']);
    const tld = parts[parts.length-1];
    const sld = parts[parts.length-2];
    if (tld.length===2 && sldSet.has(sld) && parts.length>=3) return parts.slice(-3).join('.');
    return parts.slice(-2).join('.');
  }
  const HOST = location.hostname;
  let BASE_DOMAIN = computeBaseDomain(HOST);
  const hasSubdomain = (h) => computeBaseDomain(h) !== h;
  let HAS_SUBDOMAIN = hasSubdomain(HOST);

  /* ------------------------ State (init from storage) ------------------------ */
  let speedPxPerSec = G('speedPxPerSec');
  let hotkeyStr = G('hotkey');
  let running = G('running');
  let panelCollapsed = G('panelCollapsed');

  let clickToggleEnabled = G('clickToggleEnabled');
  let clickToggleCount = G('clickToggleCount');
  let clickToggleWindowMs = G('clickToggleWindowMs');

  let tripleClickAction = G('tripleClickAction') || 'none';
  let tripleClickWindowMs = G('tripleClickWindowMs');

  let panelToggleHotkey = G('panelToggleHotkey');
  let useEdgeStrip = G('useEdgeStrip');
  let panelVisibility = G('panelVisibility');

  let edgeSide = G('edgeSide');
  let edgeHeightPx = G('edgeHeightPx');
  let edgeTopPct = G('edgeTopPct');
  let edgeWidthPx = G('edgeWidthPx');
  let edgeHoverWidthPx = G('edgeHoverWidthPx');
  let edgeHoverRangePx = G('edgeHoverRangePx');
  let edgeAutoHideSec = G('edgeAutoHideSec');

  let infScrollEnabled = G('infScrollEnabled');
  let infScrollSentinelPx = G('infScrollSentinelPx');
  let infScrollTimeoutMs = G('infScrollTimeoutMs');
  let infScrollLoaderSel = G('infScrollLoaderSel');

  let smartPauseEnabled = G('smartPauseEnabled');
  let smartPause_wheel = G('smartPause_wheel');
  let smartPause_keys = G('smartPause_keys');
  let smartPause_select = G('smartPause_select');
  let smartPause_focusInput = G('smartPause_focusInput');
  let smartResumeMs = G('smartResumeMs');
  let smartNoResumeIfInputFocused = G('smartNoResumeIfInputFocused');

  let rampStartMs = G('rampStartMs');
  let rampStopMs = G('rampStopMs');
  let boostShiftMul = G('boostShiftMul');
  let boostCtrlMul = G('boostCtrlMul');
  let boostAllowCombine = G('boostAllowCombine');
  let invertDirection = G('invertDirection');

  // nuevo: suma fija
  let quickStepAddPx = G('quickStepAddPx');

  let a11yEnabled = G('a11yEnabled');
  let theme = G('theme');
  let panelOpacity = G('panelOpacity');
  let fontScalePct = G('fontScalePct');
  let borderRadiusPx = G('borderRadiusPx');
  let compactUI = G('compactUI');
  let panelWidthPx = G('panelWidthPx');
  let shadowAlpha = G('shadowAlpha');
  let accent = G('accent');

  let debugOverlay = G('debugOverlay');
  let debugShowFps = G('debugShowFps');
  let debugShowSpeed = G('debugShowSpeed');
  let debugShowDistance = G('debugShowDistance');
  let debugShowState = G('debugShowState');

  let secBasicOpen = G('secBasicOpen');
  let secVisibilityOpen = G('secVisibilityOpen');
  let secGesturesOpen = G('secGesturesOpen');
  let secPauseOpen = G('secPauseOpen');
  let secCurvesOpen = G('secCurvesOpen');
  let secRulesOpen = G('secRulesOpen');
  let secProfilesOpen = G('secProfilesOpen');
  let secAppearanceOpen = G('secAppearanceOpen');
  let secToolsOpen = G('secToolsOpen');
  let secAdvancedOpen = G('secAdvancedOpen');

  let useSiteProfile = G('useSiteProfile');

  let forceSubdomain = G('forceSubdomain');
  let forceSubdomainNoPromptHosts = G('forceSubdomainNoPromptHosts');
  let forceSubdomainDefaultAction = G('forceSubdomainDefaultAction');

  let rules = G('rules');
  let rulesAutoStart = G('rulesAutoStart');

  /* ------------------------ Utils ------------------------ */
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const isForm = (el)=>{const t=el?.tagName?.toLowerCase(); return t==='input'||t==='textarea'||t==='select'||el?.isContentEditable;};
  const toKeySig = (e)=>{const p=[]; if(e.ctrlKey)p.push('Ctrl'); if(e.altKey)p.push('Alt'); if(e.shiftKey)p.push('Shift'); const k=e.key.length===1?e.key.toUpperCase():e.key; if(!['Control','Shift','Alt','Meta'].includes(k)) p.push(k); return p.join('+');};
  const px = (n)=>`${n}px`;
  const on = (el,ev,fn,opt)=>el.addEventListener(ev,fn,opt);

  /* ------------------------ CSS ------------------------ */
  GM_addStyle(`
    :root { --tm-bg:#151922cc; --tm-head:#1c2230; --tm-surface:#121724aa; --tm-border:#2b2f3a; --tm-sub:#9fb1c8; --tm-text:#eaeef2; --tm-badge:#313a4d; --tm-badge-b:#3f4961; --tm-ok:#25d07a; --tm-err:#ff6b6b; --tm-accent-bg:#1b6b64; --tm-accent-br:#0e514b; --tm-shadow-a:0.33;}
    .tm-light { --tm-bg:#ffffffea; --tm-head:#f0f2f6; --tm-surface:#f5f7fb; --tm-border:#d8dee9; --tm-sub:#5b677a; --tm-text:#0e1116; --tm-badge:#e7ebf2; --tm-badge-b:#cfd7e6; --tm-ok:#0a8f4a; --tm-err:#c73d3d; --tm-accent-bg:#2d6cdf; --tm-accent-br:#1848a9; }

    .tm-as-panel{position:fixed;z-index:2147483647;right:16px;bottom:16px;font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--tm-text);background:var(--tm-bg);border:1px solid var(--tm-border);border-radius:var(--tm-radius,12px);box-shadow:0 8px 30px rgba(0,0,0,var(--tm-shadow-a));width:var(--tm-width,300px);overflow:hidden;opacity:1}
    .tm-as-panel.compact .tm-as-header{padding:6px 8px}
    .tm-as-panel.compact .tm-sec-head{padding:6px 8px}
    .tm-as-panel.compact .tm-sec-body{padding:8px}
    .tm-as-panel.compact .tm-as-btn{padding:4px 6px}

    .tm-as-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--tm-head);user-select:none}
    .tm-as-title{font-weight:600}
    .tm-as-actions{display:flex;gap:8px;align-items:center}
    .tm-as-btn{border:1px solid #394152;background:#232a3a;color:var(--tm-text);padding:5px 8px;border-radius:var(--tm-radius,12px);cursor:pointer}
    .tm-as-btn.accent{ background:var(--tm-accent-bg); border-color:var(--tm-accent-br); }
    .tm-light .tm-as-btn{background:#f6f8fa;border-color:#d1d9e6;color:#0e1116}
    .tm-as-btn:hover{filter:brightness(1.06)}
    .tm-as-btn.warn{border-color:#5b3940;background:#3a2326}
    .tm-light .tm-as-btn.warn{background:#ffe7e7;border-color:#ffc5c5;color:#5a0000}
    .tm-as-collapse{transition:transform .2s ease}
    .tm-as-collapse.collapsed{transform:rotate(-90deg)}

    .tm-state{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--tm-badge-b);background:var(--tm-badge)}
    .tm-state.on{color:var(--tm-ok)}
    .tm-state.off{color:var(--tm-err)}

    .tm-as-body{padding:10px;display:grid;gap:10px;max-height:70vh;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none;cursor:grab}
    .tm-as-body::-webkit-scrollbar{width:0;height:0}
    .tm-as-body.dragging{cursor:grabbing}

    .tm-as-row{display:grid;gap:6px}
    .tm-as-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .tm-nowrap{flex-wrap:nowrap}
    .tm-boost-num{max-width:72px}
    .tm-as-label{font-size:12px;color:var(--tm-sub)}
    .tm-as-input,.tm-as-hotkey,.tm-as-num,.tm-as-select{width:100%;padding:6px 8px;border-radius:var(--tm-radius,12px);border:1px solid #394152;background:#0f1420;color:var(--tm-text);outline:none}
    .tm-light .tm-as-input,.tm-light .tm-as-hotkey,.tm-light .tm-as-num,.tm-light .tm-as-select{background:#fff;border-color:#cfd7e6;color:#0e1116}
    .tm-as-num{max-width:120px}
    .tm-as-select{max-width:200px}
    .tm-as-range{width:100%}
    .tm-as-status{font-size:12px}
    .tm-as-badge{font-size:11px;background:var(--tm-badge);border:1px solid var(--tm-badge-b);padding:2px 6px;border-radius:999px}

    .tm-sec{border:1px solid #2b3244;border-radius:var(--tm-radius,12px);overflow:hidden;background:var(--tm-surface)}
    .tm-light .tm-sec{border-color:#d8dee9}
    .tm-sec + .tm-sec{margin-top:8px}
    .tm-sec-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--tm-head);cursor:pointer;user-select:none}
    .tm-sec-title{font-weight:600}
    .tm-sec-sub{font-size:11px;color:var(--tm-sub)}
    .tm-sec-arrow{transition:transform .18s ease}
    .tm-sec.collapsed .tm-sec-arrow{transform:rotate(-90deg)}
    .tm-sec-body{padding:10px;display:grid;gap:10px}

    /* Edge strip & sensor */
    .tm-as-edge{position:fixed;top:40%;height:160px;width:6px;background:rgba(120,140,170,.35);border-radius:8px;box-shadow:2px 0 8px rgba(0,0,0,.25);z-index:2147483646;opacity:.75;transition:all .15s ease}
    .tm-as-edge.active{opacity:.98}
    .tm-as-sensor{position:fixed;top:40%;height:160px;width:20px;z-index:2147483645;background:transparent}

    .tm-as-footer{padding:8px 10px;color:var(--tm-sub);border-top:1px dashed #2b3244;display:flex;gap:8px;align-items:center}
  `);

  /* ------------------------ Accentos ------------------------ */
  const ACCENTS = {
    teal:   {bg:'#1b6b64', br:'#0e514b'},
    blue:   {bg:'#2458a6', br:'#1a4583'},
    indigo: {bg:'#3a3fb2', br:'#2a2f86'},
    amber:  {bg:'#9c6b18', br:'#6e4a0f'},
    pink:   {bg:'#a6327a', br:'#7a2359'}
  };

  /* ------------------------ Panel DOM ------------------------ */
  const panel = document.createElement('section');
  const rootCls = (theme==='light')?'tm-light':(theme==='auto'&&matchMedia?.('(prefers-color-scheme: light)').matches?'tm-light':'');
  if (rootCls) panel.classList.add(rootCls);
  panel.classList.add('tm-as-panel');
  if (compactUI) panel.classList.add('compact');
  panel.style.opacity = String(clamp(panelOpacity,0.7,1));
  panel.style.fontSize = `${13 * clamp(fontScalePct,80,130)/100}px`;
  panel.style.setProperty('--tm-radius', `${clamp(borderRadiusPx,8,24)}px`);
  panel.style.setProperty('--tm-width', `${clamp(panelWidthPx,260,520)}px`);
  panel.style.setProperty('--tm-shadow-a', String(clamp(shadowAlpha,0,0.6)));
  setAccent(accent);
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-label','AutoScroll');

  function setAccent(name){
    const ac = ACCENTS[name] || ACCENTS.teal;
    panel.style.setProperty('--tm-accent-bg', ac.bg);
    panel.style.setProperty('--tm-accent-br', ac.br);
  }

  panel.innerHTML = `
    <div class="tm-as-header tm-as-drag">
      <div class="tm-as-title">AutoScroll</div>
      <div class="tm-as-actions">
        <span class="tm-state ${running?'on':'off'}" id="tmStatus">● ${running?'ON':'OFF'}</span>
        <button class="tm-as-btn accent" id="tmToggle">${running?'Detener':'Iniciar'}</button>
        <button class="tm-as-btn tm-as-collapse ${panelCollapsed?'collapsed':''}" id="tmCollapse" aria-expanded="${!panelCollapsed}" aria-controls="tmBody">▾</button>
      </div>
    </div>

    <div class="tm-as-body" id="tmBody" style="${panelCollapsed?'display:none':''}">
      <!-- Básico -->
      <section class="tm-sec ${G('secBasicOpen')?'':'collapsed'}" id="secBasic">
        <div class="tm-sec-head" tabindex="0" aria-controls="secBasicBody" aria-expanded="${secBasicOpen}">
          <div><div class="tm-sec-title">Básico</div><div class="tm-sec-sub">Velocidad, inicio, acciones rápidas e Infinite scroll</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secBasicBody" style="${secBasicOpen?'':'display:none'}">
          <div class="tm-as-row">
            <label class="tm-as-label">Velocidad (px/s): <b id="tmSpeedVal">${speedPxPerSec}</b></label>
            <input class="tm-as-range" id="tmSpeed" type="range" min="30" max="3000" step="10" value="${speedPxPerSec}">
          </div>
          <div class="tm-as-row">
            <label class="tm-as-label">Hotkey iniciar/detener autoscroll</label>
            <input class="tm-as-input tm-as-hotkey" id="tmHotkey" type="text" value="${hotkeyStr}" readonly>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-label">Paso rápido (px/s)</label>
            <input class="tm-as-num" id="tmQuickStep" type="number" min="1" max="1000" step="1" value="${quickStepAddPx}">
            <button class="tm-as-btn" id="tmSpeedMinus">− paso</button>
            <button class="tm-as-btn" id="tmSpeedPlus">+ paso</button>
            <button class="tm-as-btn" id="tmInvert">Invertir dirección</button>
          </div>

          <div class="tm-as-row">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmInfEnabled" ${infScrollEnabled?'checked':''}> <span class="tm-as-label">Activar Infinite scroll</span></label>
            <div class="tm-as-inline">
              <label class="tm-as-label">Umbral (px)</label>
              <input class="tm-as-num" id="tmInfPx" type="number" min="200" max="4000" step="50" value="${infScrollSentinelPx}">
              <label class="tm-as-label">Timeout (ms)</label>
              <input class="tm-as-num" id="tmInfTimeout" type="number" min="500" max="15000" step="100" value="${infScrollTimeoutMs}">
            </div>
            <div class="tm-as-inline">
              <label class="tm-as-label">Selector loader (opcional)</label>
              <input class="tm-as-input" id="tmInfLoader" type="text" placeholder=".spinner, #loading" value="${infScrollLoaderSel}">
            </div>
          </div>
        </div>
      </section>

      <!-- Visibilidad del panel -->
      <section class="tm-sec ${secVisibilityOpen?'':'collapsed'}" id="secVisibility">
        <div class="tm-sec-head" tabindex="0" aria-controls="secVisBody" aria-expanded="${secVisibilityOpen}">
          <div><div class="tm-sec-title">Visibilidad del panel</div><div class="tm-sec-sub">Ocultar completo o con tira lateral</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secVisBody" style="${secVisibilityOpen?'':'display:none'}">
          <div class="tm-as-row">
            <label class="tm-as-label">Hotkey mostrar/ocultar (ocultar completo)</label>
            <input class="tm-as-input tm-as-hotkey" id="tmPanelHotkey" type="text" value="${G('panelToggleHotkey')}" readonly>
          </div>
          <div class="tm-as-inline">
            <button class="tm-as-btn" id="tmHideFull">Ocultar completamente</button>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmUseEdgeStrip" ${useEdgeStrip?'checked':''}> <span class="tm-as-label">Usar tira lateral al ocultar</span></label>
            <button class="tm-as-btn" id="tmHideEdge">Ocultar (tira)</button>
          </div>

          <div class="tm-as-row" id="tmEdgeOptions" style="${useEdgeStrip?'':'display:none'}">
            <div class="tm-as-inline">
              <label class="tm-as-label">Lado</label>
              <select class="tm-as-select" id="tmEdgeSide">
                <option value="left" ${edgeSide==='left'?'selected':''}>Izquierda</option>
                <option value="right" ${edgeSide==='right'?'selected':''}>Derecha</option>
              </select>
              <label class="tm-as-label">Auto-ocultar (s)</label>
              <input class="tm-as-num" id="tmEdgeAutoHide" type="number" min="0" max="10" step="0.5" value="${edgeAutoHideSec}">
            </div>
            <div class="tm-as-inline">
              <label class="tm-as-label">Grosor (px)</label>
              <input class="tm-as-num" id="tmEdgeWidth" type="number" min="2" max="40" step="1" value="${edgeWidthPx}">
              <label class="tm-as-label">Al acercarse (px)</label>
              <input class="tm-as-num" id="tmEdgeHoverWidth" type="number" min="${Math.max(2,edgeWidthPx)}" max="60" step="1" value="${edgeHoverWidthPx}">
            </div>
            <div class="tm-as-inline">
              <label class="tm-as-label">Alto (px)</label>
              <input class="tm-as-num" id="tmEdgeHeight" type="number" min="60" max="400" step="10" value="${edgeHeightPx}">
              <label class="tm-as-label">Posición vertical (%)</label>
              <input class="tm-as-num" id="tmEdgeTop" type="number" min="0" max="100" step="1" value="${edgeTopPct}">
            </div>
            <div class="tm-as-inline">
              <label class="tm-as-label">Rango de detección (px)</label>
              <input class="tm-as-num" id="tmEdgeRange" type="number" min="6" max="80" step="1" value="${edgeHoverRangePx}">
            </div>
          </div>

          <small class="tm-as-label">• “Ocultar (tira)”: aparece una tira en el borde; al acercarte se expande y con clic reaparece el panel.</small>
        </div>
      </section>

      <!-- Gestos y atajos -->
      <section class="tm-sec ${secGesturesOpen?'':'collapsed'}" id="secGestures">
        <div class="tm-sec-head" tabindex="0" aria-controls="secGestBody" aria-expanded="${secGesturesOpen}">
          <div><div class="tm-sec-title">Gestos y atajos</div><div class="tm-sec-sub">Autoscroll por clics, clic medio y triple-clic</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secGestBody" style="${secGesturesOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmClickToggleEnabled" ${clickToggleEnabled?'checked':''}> <span class="tm-as-label">Activar autoscroll por clics</span></label>
            <label class="tm-as-label">Cantidad</label>
            <input class="tm-as-num" id="tmClickCount" type="number" min="1" max="6" step="1" value="${clickToggleCount}">
            <label class="tm-as-label">Ventana (ms)</label>
            <input class="tm-as-num" id="tmClickWindow" type="number" min="100" max="3000" step="50" value="${clickToggleWindowMs}">
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmMiddlePause" checked> <span class="tm-as-label">Clic medio: pausar/reanudar</span></label>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-label">Triple-clic (acción)</label>
            <select class="tm-as-select" id="tmTripleAction">
              <option value="none" ${tripleClickAction==='none'?'selected':''}>— Ninguna —</option>
              <option value="top" ${tripleClickAction==='top'?'selected':''}>Ir arriba</option>
              <option value="bottom" ${tripleClickAction==='bottom'?'selected':''}>Ir abajo</option>
              <option value="toggleDir" ${tripleClickAction==='toggleDir'?'selected':''}>Alternar dirección</option>
            </select>
            <label class="tm-as-label">Ventana triple-clic (ms)</label>
            <input class="tm-as-num" id="tmTripleWindow" type="number" min="200" max="1500" step="50" value="${tripleClickWindowMs}">
          </div>
          <small class="tm-as-label">El gesto por clics ignora inputs/links para no interferir.</small>
        </div>
      </section>

      <!-- Pausa inteligente -->
      <section class="tm-sec ${secPauseOpen?'':'collapsed'}" id="secPause">
        <div class="tm-sec-head" tabindex="0" aria-controls="secPauseBody" aria-expanded="${secPauseOpen}">
          <div><div class="tm-sec-title">Pausa inteligente</div><div class="tm-sec-sub">Pausar ante interacción y auto-reanudar</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secPauseBody" style="${secPauseOpen?'':'display:none'}">
          <div class="tm-as-row">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmSPEnabled" ${smartPauseEnabled?'checked':''}> <span class="tm-as-label">Usar pausa inteligente</span></label>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmSPWheel" ${smartPause_wheel?'checked':''} ${!smartPauseEnabled?'disabled':''}> <span class="tm-as-label">Rueda del mouse</span></label>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmSPKeys" ${smartPause_keys?'checked':''} ${!smartPauseEnabled?'disabled':''}> <span class="tm-as-label">Teclas de lectura</span></label>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmSPSelect" ${smartPause_select?'checked':''} ${!smartPauseEnabled?'disabled':''}> <span class="tm-as-label">Selección de texto/drag</span></label>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmSPFocus" ${smartPause_focusInput?'checked':''} ${!smartPauseEnabled?'disabled':''}> <span class="tm-as-label">Foco en input/textarea</span></label>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-label">Auto-reanudación (ms)</label>
            <input class="tm-as-num" id="tmSPResume" type="number" min="500" max="15000" step="100" value="${smartResumeMs}" ${!smartPauseEnabled?'disabled':''}>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmSPNoResumeInput" ${smartNoResumeIfInputFocused?'checked':''} ${!smartPauseEnabled?'disabled':''}> <span class="tm-as-label">No reanudar si el foco sigue en input/textarea</span></label>
          </div>
        </div>
      </section>

      <!-- Curvas y Boost -->
      <section class="tm-sec ${secCurvesOpen?'':'collapsed'}" id="secCurves">
        <div class="tm-sec-head" tabindex="0" aria-controls="secCurvesBody" aria-expanded="${secCurvesOpen}">
          <div><div class="tm-sec-title">Curvas y Boost</div><div class="tm-sec-sub">Lineal por defecto, rampa opcional, acelerones</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secCurvesBody" style="${secCurvesOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <label class="tm-as-label">Rampa inicio (ms, 0=OFF)</label>
            <input class="tm-as-num" id="tmRampStart" type="number" min="0" max="3000" step="50" value="${rampStartMs}">
            <label class="tm-as-label">Rampa stop (ms, 0=OFF)</label>
            <input class="tm-as-num" id="tmRampStop" type="number" min="0" max="3000" step="50" value="${rampStopMs}">
          </div>
          <div class="tm-as-inline tm-nowrap">
            <label class="tm-as-label">Shift (×)</label>
            <input class="tm-as-num tm-boost-num" id="tmBoostShift" type="number" min="1" max="5" step="0.1" value="${boostShiftMul}">
            <label class="tm-as-label">Ctrl (×)</label>
            <input class="tm-as-num tm-boost-num" id="tmBoostCtrl" type="number" min="1" max="5" step="0.1" value="${boostCtrlMul}">
            <label class="tm-as-checkbox" style="margin-left:8px"><input type="checkbox" id="tmBoostCombine" ${boostAllowCombine?'checked':''}> <span class="tm-as-label">Permitir combinación</span></label>
          </div>
        </div>
      </section>

      <!-- Reglas de activación -->
      <section class="tm-sec ${secRulesOpen?'':'collapsed'}" id="secRules">
        <div class="tm-sec-head" tabindex="0" aria-controls="secRulesBody" aria-expanded="${secRulesOpen}">
          <div><div class="tm-sec-title">Reglas de activación</div><div class="tm-sec-sub">Lista blanca/negra (comodines * aceptados)</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secRulesBody" style="${secRulesOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <label class="tm-as-label">Nueva regla</label>
            <select class="tm-as-select" id="tmRuleType"><option value="block">Bloquear</option><option value="allow">Permitir</option></select>
            <input class="tm-as-input" id="tmRulePattern" type="text" placeholder="Ej: *://*.manhwaweb.com/leer/*">
            <button class="tm-as-btn" id="tmRuleAdd">Agregar</button>
            <button class="tm-as-btn" id="tmRuleClear">Limpiar</button>
          </div>
          <div class="tm-as-row" id="tmRuleList"></div>
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmRulesAutoStart" ${rulesAutoStart?'checked':''}> <span class="tm-as-label">Auto-iniciar si coincide una “Permitir”</span></label>
            <button class="tm-as-btn" id="tmRuleTest">Probar con URL actual</button>
          </div>
          <small class="tm-as-label">Orden: primero <b>Bloquear</b>, luego <b>Permitir</b>. Si nada coincide, no se auto-inicia.</small>
        </div>
      </section>

      <!-- Apariencia -->
      <section class="tm-sec ${secAppearanceOpen?'':'collapsed'}" id="secAppearance">
        <div class="tm-sec-head" tabindex="0" aria-controls="secAppBody" aria-expanded="${secAppearanceOpen}">
          <div><div class="tm-sec-title">Apariencia</div><div class="tm-sec-sub">Tema, opacidad y layout</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secAppBody" style="${secAppearanceOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <label class="tm-as-label">Tema</label>
            <select class="tm-as-select" id="tmTheme">
              <option value="auto" ${theme==='auto'?'selected':''}>Auto (según sistema)</option>
              <option value="dark" ${theme==='dark'?'selected':''}>Oscuro</option>
              <option value="light" ${theme==='light'?'selected':''}>Claro</option>
            </select>
            <label class="tm-as-label">Opacidad panel</label>
            <input class="tm-as-num" id="tmOpacity" type="number" min="0.70" max="1" step="0.01" value="${panelOpacity}">
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-label">Tamaño de fuente (%)</label>
            <input class="tm-as-num" id="tmFontScale" type="number" min="80" max="130" step="1" value="${fontScalePct}">
            <label class="tm-as-label">Radio bordes (px)</label>
            <input class="tm-as-num" id="tmRadius" type="number" min="8" max="24" step="1" value="${borderRadiusPx}">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmCompact" ${compactUI?'checked':''}> <span class="tm-as-label">Modo compacto</span></label>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-label">Ancho panel (px)</label>
            <input class="tm-as-num" id="tmWidthPx" type="number" min="260" max="520" step="10" value="${panelWidthPx}">
            <label class="tm-as-label">Sombra (0–0.6)</label>
            <input class="tm-as-num" id="tmShadow" type="number" min="0" max="0.6" step="0.01" value="${shadowAlpha}">
            <label class="tm-as-label">Acento</label>
            <select class="tm-as-select" id="tmAccent">
              <option value="teal" ${accent==='teal'?'selected':''}>Verde azulado</option>
              <option value="blue" ${accent==='blue'?'selected':''}>Azul</option>
              <option value="indigo" ${accent==='indigo'?'selected':''}>Índigo</option>
              <option value="amber" ${accent==='amber'?'selected':''}>Ámbar</option>
              <option value="pink" ${accent==='pink'?'selected':''}>Rosa</option>
            </select>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmA11y" ${a11yEnabled?'checked':''}> <span class="tm-as-label">Accesibilidad (Alt+P, ARIA, reducir animaciones)</span></label>
          </div>
        </div>
      </section>

      <!-- Perfiles por sitio -->
      <section class="tm-sec ${secProfilesOpen?'':'collapsed'}" id="secProfiles">
        <div class="tm-sec-head" tabindex="0" aria-controls="secProfBody" aria-expanded="${secProfilesOpen}">
          <div>
            <div class="tm-sec-title">Perfiles por sitio</div>
            <div class="tm-sec-sub">Dominio: <code id="tmBaseDomain">${BASE_DOMAIN}</code> · Host actual: <code id="tmHost">${HOST}</code></div>
          </div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secProfBody" style="${secProfilesOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmUseSiteProfile" ${useSiteProfile?'checked':''}> <span class="tm-as-label">Usar perfil para este dominio/host</span></label>
            <label class="tm-as-checkbox" ${HAS_SUBDOMAIN?'':'title="No hay subdominio"'}><input type="checkbox" id="tmForceSub" ${forceSubdomain&&HAS_SUBDOMAIN?'checked':''} ${HAS_SUBDOMAIN?'':'disabled'}> <span class="tm-as-label">Forzar subdominio (sin herencia)</span></label>
          </div>

          <div class="tm-as-inline" style="margin-top:6px">
            <label class="tm-as-label">Buscar</label>
            <input class="tm-as-input" id="tmProfSearch" type="text" placeholder="Filtrar por host…">
            <label class="tm-as-label">Orden</label>
            <select class="tm-as-select" id="tmProfSort">
              <option value="alpha">A → Z</option>
              <option value="specific">Más específico primero</option>
            </select>
            <button class="tm-as-btn" id="tmProfileSave">Guardar (este host)</button>
          </div>
          <div class="tm-as-row" id="tmProfilesList"></div>

          <div class="tm-as-inline" style="margin-top:10px">
            <label class="tm-as-label">Preferencia por defecto para nuevos subdominios</label>
            <select class="tm-as-select" id="tmForceDefault">
              <option value="ask" ${forceSubdomainDefaultAction==='ask'?'selected':''}>Preguntar siempre</option>
              <option value="fromDomain" ${forceSubdomainDefaultAction==='fromDomain'?'selected':''}>Crear desde dominio</option>
              <option value="fromGlobal" ${forceSubdomainDefaultAction==='fromGlobal'?'selected':''}>Crear desde global</option>
              <option value="blank" ${forceSubdomainDefaultAction==='blank'?'selected':''}>Crear en blanco</option>
            </select>
          </div>

          <div class="tm-as-row" style="border-top:1px dashed var(--tm-border); padding-top:8px;">
            <div class="tm-as-inline">
              <label class="tm-as-checkbox"><input type="checkbox" id="tmUsePslLite" ${usePslLite?'checked':''}> <span class="tm-as-label">Usar PSL-lite (recomendado)</span></label>
            </div>
            <div class="tm-as-inline">
              <label class="tm-as-label">Dominio base manual (override)</label>
              <input class="tm-as-input" id="tmBaseOverride" type="text" placeholder="ej: bbc.co.uk" value="${BASE_DOMAIN}">
              <button class="tm-as-btn" id="tmSaveOverride">Guardar override</button>
              <button class="tm-as-btn warn" id="tmDeleteOverride">Eliminar override</button>
            </div>
            <small class="tm-as-label">Si defines override, se usará siempre para este host y no se aplicará PSL-lite/heurística.</small>
          </div>

          <div class="tm-subnote" id="tmSubPrompt" style="display:none">
            <div class="tm-as-row">
              <div class="tm-as-label"><b>Forzar subdominio activo.</b> No hay perfil para <code id="tmSubHost">${HOST}</code>. ¿Cómo quieres crearlo?</div>
            </div>
            <div class="tm-as-inline">
              <button class="tm-as-btn" id="tmCreateFromDomain">Crear desde dominio (<span id="tmDomainBtnTxt">${BASE_DOMAIN}</span>)</button>
              <button class="tm-as-btn" id="tmCreateFromGlobal">Crear desde global</button>
              <button class="tm-as-btn" id="tmCreateBlank">Crear en blanco</button>
            </div>
            <div class="tm-as-inline">
              <label class="tm-as-checkbox"><input type="checkbox" id="tmNoPromptThis"> <span class="tm-as-label">No volver a mostrar para este subdominio</span></label>
              <label class="tm-as-label">Recordar esta elección para futuros subdominios</label>
              <select class="tm-as-select" id="tmRememberAction">
                <option value="ask" selected>No recordar</option>
                <option value="fromDomain">Siempre desde dominio</option>
                <option value="fromGlobal">Siempre desde global</option>
                <option value="blank">Siempre en blanco</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- Herramientas -->
      <section class="tm-sec ${secToolsOpen?'':'collapsed'}" id="secTools">
        <div class="tm-sec-head" tabindex="0" aria-controls="secToolsBody" aria-expanded="${secToolsOpen}">
          <div><div class="tm-sec-title">Herramientas</div><div class="tm-sec-sub">Reset y exportar/importar</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secToolsBody" style="${secToolsOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <button class="tm-as-btn" id="tmExport">Exportar JSON…</button>
            <button class="tm-as-btn" id="tmImport">Importar JSON…</button>
          </div>
          <div class="tm-as-inline">
            <button class="tm-as-btn warn" id="tmResetGlobal">Restablecer valores globales</button>
            <button class="tm-as-btn warn" id="tmResetSite">Restablecer perfil del sitio</button>
          </div>
        </div>
      </section>

      <!-- Avanzado (debug) -->
      <section class="tm-sec ${secAdvancedOpen?'':'collapsed'}" id="secAdvanced">
        <div class="tm-sec-head" tabindex="0" aria-controls="secAdvBody" aria-expanded="${secAdvancedOpen}">
          <div><div class="tm-sec-title">Avanzado (debug)</div><div class="tm-sec-sub">Overlay con métricas</div></div>
          <div class="tm-sec-arrow">▾</div>
        </div>
        <div class="tm-sec-body" id="secAdvBody" style="${secAdvancedOpen?'':'display:none'}">
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmDbg" ${debugOverlay?'checked':''}> <span class="tm-as-label">Mostrar overlay</span></label>
            <button class="tm-as-btn" id="tmDbgAllOn">Activar todo</button>
            <button class="tm-as-btn" id="tmDbgAllOff">Desactivar todo</button>
          </div>
          <div class="tm-as-inline">
            <label class="tm-as-checkbox"><input type="checkbox" id="tmDbgFps" ${debugShowFps?'checked':''}> <span class="tm-as-label">FPS</span></label>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmDbgSpeed" ${debugShowSpeed?'checked':''}> <span class="tm-as-label">Velocidad</span></label>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmDbgDist" ${debugShowDistance?'checked':''}> <span class="tm-as-label">Distancia</span></label>
            <label class="tm-as-checkbox"><input type="checkbox" id="tmDbgState" ${debugShowState?'checked':''}> <span class="tm-as-label">Estado</span></label>
          </div>
        </div>
      </section>
    </div>

    <div class="tm-as-footer">Estado: <span class="tm-as-status tm-state ${running?'on':'off'}" id="tmFooter">${running?'● Desplazando…':'● Inactivo'}</span></div>
  `;
  document.documentElement.appendChild(panel);

  /* ------------------------ Edge strip + sensor ------------------------ */
  let edgeStrip=null, edgeSensor=null, edgeAutoHideTimer=null;
  function styleEdge(){
    if(!edgeStrip) return;
    edgeStrip.style.height=px(edgeHeightPx);
    edgeStrip.style.top=`${edgeTopPct}%`;
    edgeStrip.style.width=px(edgeWidthPx);
    if(edgeSide==='left'){ edgeStrip.style.left='0'; edgeStrip.style.right=''; edgeStrip.style.borderTopLeftRadius='0'; edgeStrip.style.borderBottomLeftRadius='0'; edgeStrip.style.borderTopRightRadius='8px'; edgeStrip.style.borderBottomRightRadius='8px'; edgeStrip.style.boxShadow='2px 0 8px rgba(0,0,0,.25)';}
    else { edgeStrip.style.left=''; edgeStrip.style.right='0'; edgeStrip.style.borderTopLeftRadius='8px'; edgeStrip.style.borderBottomLeftRadius='8px'; edgeStrip.style.borderTopRightRadius='0'; edgeStrip.style.borderBottomRightRadius='0'; edgeStrip.style.boxShadow='-2px 0 8px rgba(0,0,0,.25)';}
  }
  function styleSensor(){
    if(!edgeSensor) return;
    edgeSensor.style.height=px(edgeHeightPx);
    edgeSensor.style.top=`${edgeTopPct}%`;
    edgeSensor.style.width=px(edgeHoverRangePx);
    if(edgeSide==='left'){ edgeSensor.style.left='0'; edgeSensor.style.right='';}
    else { edgeSensor.style.left=''; edgeSensor.style.right='0';}
  }
  function setEdgeActive(a){
    if(!edgeStrip) return;
    edgeStrip.classList.toggle('active',!!a);
    edgeStrip.style.width=px(a?edgeHoverWidthPx:edgeWidthPx);
    if(a && edgeAutoHideSec>0){
      clearTimeout(edgeAutoHideTimer);
      edgeAutoHideTimer=setTimeout(()=>setEdgeActive(false), edgeAutoHideSec*1000);
    }
  }
  function createEdge(){
    if(edgeStrip) return edgeStrip;
    edgeStrip=document.createElement('div'); edgeStrip.className='tm-as-edge'; edgeStrip.title='Mostrar panel';
    document.documentElement.appendChild(edgeStrip);
    on(edgeStrip,'mouseenter',()=>setEdgeActive(true));
    on(edgeStrip,'mouseleave',()=>setEdgeActive(false));
    on(edgeStrip,'click',()=>{ showPanel(); });
    // Arrastre vertical
    let dragging=false,startY=0,startTopPct=0;
    on(edgeStrip,'mousedown',(e)=>{ if(e.button!==0) return; dragging=true; startY=e.clientY; startTopPct=edgeTopPct; document.body.style.userSelect='none'; e.preventDefault(); });
    on(window,'mousemove',(e)=>{ if(!dragging) return; const delta=(e.clientY-startY)/window.innerHeight*100; edgeTopPct=clamp(startTopPct+delta,0,100); styleEdge(); styleSensor(); });
    on(window,'mouseup',()=>{ if(!dragging) return; dragging=false; document.body.style.userSelect=''; S('edgeTopPct',edgeTopPct); if(useSiteProfile) saveProfilePartial({edgeTopPct}); });
    styleEdge();
    return edgeStrip;
  }
  function createSensor(){
    if(edgeSensor) return edgeSensor;
    edgeSensor=document.createElement('div'); edgeSensor.className='tm-as-sensor'; document.documentElement.appendChild(edgeSensor);
    on(edgeSensor,'mouseenter',()=>setEdgeActive(true));
    on(edgeSensor,'mouseleave',()=>setEdgeActive(false));
    on(edgeSensor,'click',()=>{ showPanel(); });
    styleSensor(); return edgeSensor;
  }
  function showEdge(){ if(!useEdgeStrip) return; createEdge().style.display='block'; createSensor().style.display='block'; styleEdge(); styleSensor(); }
  function hideEdge(){ if(edgeStrip) edgeStrip.style.display='none'; if(edgeSensor) edgeSensor.style.display='none'; }

  /* ------------------------ Panel: mover ------------------------ */
  (()=>{ const header=panel.querySelector('.tm-as-header'); let sx=0,sy=0,x=0,y=0,drag=false;
    on(header,'mousedown',e=>{ if(!e.target.classList.contains('tm-as-drag')) return; drag=true; sx=e.clientX; sy=e.clientY; const r=panel.getBoundingClientRect(); x=r.left; y=r.top; e.preventDefault(); });
    on(window,'mousemove',e=>{ if(!drag) return; const nx=x+(e.clientX-sx); const ny=y+(e.clientY-sy); panel.style.right='unset'; panel.style.bottom='unset'; panel.style.left=px(nx); panel.style.top=px(ny); });
    on(window,'mouseup',()=>drag=false);
  })();

  /* ------------------------ Refs ------------------------ */
  const elBody = panel.querySelector('#tmBody');
  const elStatus = panel.querySelector('#tmStatus');
  const elFooter = panel.querySelector('#tmFooter');
  const elToggle = panel.querySelector('#tmToggle');
  const elCollapse = panel.querySelector('#tmCollapse');

  const elSpeed = panel.querySelector('#tmSpeed');
  const elSpeedVal = panel.querySelector('#tmSpeedVal');
  const elQuickStep = panel.querySelector('#tmQuickStep');
  const btnMinus = panel.querySelector('#tmSpeedMinus');
  const btnPlus = panel.querySelector('#tmSpeedPlus');
  const btnInvert = panel.querySelector('#tmInvert');

  const elHotkey = panel.querySelector('#tmHotkey');
  const elPanelHotkey = panel.querySelector('#tmPanelHotkey');

  const btnHideFull = panel.querySelector('#tmHideFull');
  const btnHideEdge = panel.querySelector('#tmHideEdge');
  const elUseEdgeStrip = panel.querySelector('#tmUseEdgeStrip');
  const elEdgeSide = panel.querySelector('#tmEdgeSide');
  const elEdgeAutoHide = panel.querySelector('#tmEdgeAutoHide');
  const elEdgeWidth = panel.querySelector('#tmEdgeWidth');
  const elEdgeHoverWidth = panel.querySelector('#tmEdgeHoverWidth');
  const elEdgeHeight = panel.querySelector('#tmEdgeHeight');
  const elEdgeTop = panel.querySelector('#tmEdgeTop');
  const elEdgeRange = panel.querySelector('#tmEdgeRange');

  const elClickEnabled = panel.querySelector('#tmClickToggleEnabled');
  const elClickCount = panel.querySelector('#tmClickCount');
  const elClickWindow = panel.querySelector('#tmClickWindow');
  const elMiddlePause = panel.querySelector('#tmMiddlePause');
  const elTripleAction = panel.querySelector('#tmTripleAction');
  const elTripleWindow = panel.querySelector('#tmTripleWindow');

  const elSPEnabled = panel.querySelector('#tmSPEnabled');
  const elSPWheel = panel.querySelector('#tmSPWheel');
  const elSPKeys = panel.querySelector('#tmSPKeys');
  const elSPSelect = panel.querySelector('#tmSPSelect');
  const elSPFocus = panel.querySelector('#tmSPFocus');
  const elSPResume = panel.querySelector('#tmSPResume');
  const elSPNoResumeInput = panel.querySelector('#tmSPNoResumeInput');

  const elRampStart = panel.querySelector('#tmRampStart');
  const elRampStop = panel.querySelector('#tmRampStop');
  const elBoostShift = panel.querySelector('#tmBoostShift');
  const elBoostCtrl = panel.querySelector('#tmBoostCtrl');
  const elBoostCombine = panel.querySelector('#tmBoostCombine');

  const elInfEnabled = panel.querySelector('#tmInfEnabled');
  const elInfPx = panel.querySelector('#tmInfPx');
  const elInfTimeout = panel.querySelector('#tmInfTimeout');
  const elInfLoader = panel.querySelector('#tmInfLoader');

  const elTheme = panel.querySelector('#tmTheme');
  const elOpacity = panel.querySelector('#tmOpacity');
  const elA11y = panel.querySelector('#tmA11y');
  const elFontScale = panel.querySelector('#tmFontScale');
  const elRadius = panel.querySelector('#tmRadius');
  const elCompact = panel.querySelector('#tmCompact');
  const elWidthPx = panel.querySelector('#tmWidthPx');
  const elShadow = panel.querySelector('#tmShadow');
  const elAccent = panel.querySelector('#tmAccent');

  const elUseSiteProfile = panel.querySelector('#tmUseSiteProfile');
  const elForceSub = panel.querySelector('#tmForceSub');
  const elForceDefault = panel.querySelector('#tmForceDefault');
  const subPromptBox = panel.querySelector('#tmSubPrompt');
  const btnFromDomain = panel.querySelector('#tmCreateFromDomain');
  const btnFromGlobal = panel.querySelector('#tmCreateFromGlobal');
  const btnBlank = panel.querySelector('#tmCreateBlank');
  const chkNoPromptThis = panel.querySelector('#tmNoPromptThis');
  const selRememberAction = panel.querySelector('#tmRememberAction');

  const elUsePslLite = panel.querySelector('#tmUsePslLite');
  const elBaseOverride = panel.querySelector('#tmBaseOverride');
  const btnSaveOverride = panel.querySelector('#tmSaveOverride');
  const btnDeleteOverride = panel.querySelector('#tmDeleteOverride');
  const elBaseDomainTxt = panel.querySelector('#tmBaseDomain');
  const elHostTxt = panel.querySelector('#tmHost');
  const elDomainBtnTxt = panel.querySelector('#tmDomainBtnTxt');
  const elSubHostTxt = panel.querySelector('#tmSubHost');

  const elProfSearch = panel.querySelector('#tmProfSearch');
  const elProfSort = panel.querySelector('#tmProfSort');
  const elProfilesList = panel.querySelector('#tmProfilesList');
  const btnProfileSave = panel.querySelector('#tmProfileSave');

  /* ------------------------ Acordeón ------------------------ */
  for (const sec of panel.querySelectorAll('.tm-sec')) {
    const head=sec.querySelector('.tm-sec-head'), body=sec.querySelector('.tm-sec-body');
    on(head,'click',()=>toggleSection(sec,body));
    on(head,'keydown',(e)=>{ if(['Enter',' '].includes(e.key)) {e.preventDefault();toggleSection(sec,body);} });
  }
  function toggleSection(sec,body){
    const collapsed=!sec.classList.contains('collapsed'); sec.classList.toggle('collapsed',collapsed); body.style.display=collapsed?'none':'';
    const id=sec.id; const keyMap={secBasic:'secBasicOpen',secVisibility:'secVisibilityOpen',secGestures:'secGesturesOpen',secPause:'secPauseOpen',secCurves:'secCurvesOpen',secRules:'secRulesOpen',secProfiles:'secProfilesOpen',secAppearance:'secAppearanceOpen',secTools:'secToolsOpen',secAdvanced:'secAdvancedOpen'};
    const k=keyMap[id]; if(k) S(k,!collapsed);
  }

  /* ------------------------ Panel visibility API ------------------------ */
  const showPanel = ()=>{ panel.style.display='block'; hideEdge(); panelVisibility='visible'; S('panelVisibility',panelVisibility); };
  const hidePanelFull = ()=>{ panel.style.display='none'; hideEdge(); panelVisibility='hidden_full'; S('panelVisibility',panelVisibility); };
  const hidePanelEdge = ()=>{ panel.style.display='none'; showEdge(); panelVisibility='hidden_edge'; S('panelVisibility',panelVisibility); };

  if(panelVisibility==='hidden_full') panel.style.display='none';
  else if(panelVisibility==='hidden_edge'){ panel.style.display='none'; showEdge(); }

  /* ------------------------ Internal scroll (wheel/drag) ------------------------ */
  on(elBody,'wheel',(e)=>{ if(elBody.scrollHeight<=elBody.clientHeight) return; e.preventDefault(); elBody.scrollTop+=e.deltaY; },{passive:false});
  let dragScroll={active:false,startY:0,startTop:0}; const isInteractive=(el)=>!!el.closest('input,textarea,button,select,a,label,.tm-as-hotkey');
  on(elBody,'mousedown',(e)=>{ if(e.button!==0 || isInteractive(e.target) || elBody.scrollHeight<=elBody.clientHeight) return; dragScroll={active:true,startY:e.clientY,startTop:elBody.scrollTop}; elBody.classList.add('dragging'); document.body.style.userSelect='none'; e.preventDefault(); });
  on(window,'mousemove',(e)=>{ if(dragScroll.active) elBody.scrollTop=dragScroll.startTop-(e.clientY-dragScroll.startY); });
  on(window,'mouseup',()=>{ if(dragScroll.active){ dragScroll.active=false; elBody.classList.remove('dragging'); document.body.style.userSelect=''; } });

  /* ------------------------ Toggle + collapse behavior ------------------------ */
  on(elToggle,'click',()=>toggleRun());
  on(elCollapse,'click',(e)=>{
    if(panelCollapsed || elBody.style.display==='none'){ panelCollapsed=false; S('panelCollapsed',panelCollapsed); elBody.style.display=''; elCollapse.classList.remove('collapsed'); showPanel(); hideEdge(); return; }
    if(useEdgeStrip && !e.ctrlKey){ hidePanelEdge(); return; }
    panelCollapsed=true; S('panelCollapsed',panelCollapsed); elBody.style.display='none'; elCollapse.classList.add('collapsed');
  });

  /* ------------------------ Core autoscroll ------------------------ */
  let rafId=null,lastT=null, startRampT=null;
  let boostShift=false, boostCtrl=false, lastBoostKey=null;

  const atBottom=()=>window.innerHeight+window.scrollY >= document.documentElement.scrollHeight-2;
  const atTop=()=>window.scrollY<=1;

  function setStateVisual(){
    elStatus.textContent = `● ${running?'ON':'OFF'}`;
    elStatus.classList.toggle('on', running);
    elStatus.classList.toggle('off', !running);
    elFooter.textContent = `${running?'● Desplazando…':'● Inactivo'}`;
    elFooter.classList.toggle('on', running);
    elFooter.classList.toggle('off', !running);
    panel.querySelector('#tmToggle').textContent=running?'Detener':'Iniciar';
  }

  function effectiveSpeed(){
    let base = speedPxPerSec * (invertDirection?-1:1);
    if(running && rampStartMs>0 && startRampT!=null){
      const p = clamp((performance.now()-startRampT)/rampStartMs, 0, 1);
      base*=p; if(p>=1) startRampT=null;
    }
    let mul=1;
    if(boostAllowCombine){ if(boostShift) mul*=boostShiftMul; if(boostCtrl) mul*=boostCtrlMul; }
    else{
      if(lastBoostKey==='shift' && boostShift) mul=boostShiftMul;
      else if(lastBoostKey==='ctrl' && boostCtrl) mul=boostCtrlMul;
      else if(boostCtrl) {mul=boostCtrlMul;}
      else if(boostShift){mul=boostShiftMul;}
    }
    return base*mul;
  }

  function step(t){
    if(!running) return;
    if(lastT==null) lastT=t;
    const dt=(t-lastT)/1000; lastT=t;
    window.scrollBy(0, effectiveSpeed()*dt);
    if((!invertDirection && atBottom()) || (invertDirection && atTop())){ toggleRun(false); return; }
    if(infScrollEnabled && !infStop) setupInfScroll();
    rafId=requestAnimationFrame(step);
    debugTick(dt);
  }

  function toggleRun(state=!running){
    running = state; S('running',running);
    lastT=null;
    if(running){ startRampT = rampStartMs>0?performance.now():null; cancelAnimationFrame(rafId); rafId=requestAnimationFrame(step); clearTimeout(resumeTimer); waitingSentinel=false; }
    else { cancelAnimationFrame(rafId); rafId=null; startRampT=null; }
    setStateVisual();
  }
  setStateVisual(); // estado inicial

  /* ------------------------ Hotkeys globales ------------------------ */
  on(window,'keydown',(e)=>{
    if(isForm(e.target) || e.isComposing) return;
    const sig=toKeySig(e);
    if(sig===hotkeyStr){ e.preventDefault(); toggleRun(); return; }
    if(sig===panelToggleHotkey){ e.preventDefault(); if(panelVisibility==='visible') hidePanelFull(); else showPanel(); return; }
    if(e.key==='Shift'){ boostShift=true; lastBoostKey='shift'; }
    if(e.key==='Control'){ boostCtrl=true; lastBoostKey='ctrl'; }
  });
  on(window,'keyup',(e)=>{ if(e.key==='Shift') boostShift=false; if(e.key==='Control') boostCtrl=false; });

  /* ------------------------ UI wiring ------------------------ */
  // Básico
  on(elSpeed,'input',e=>{ speedPxPerSec=clamp(parseInt(e.target.value,10)||DEFAULTS.speedPxPerSec,30,3000); elSpeedVal.textContent=String(speedPxPerSec); });
  on(elSpeed,'change',()=>{ S('speedPxPerSec',speedPxPerSec); if(useSiteProfile) saveProfilePartial({speedPxPerSec}); });
  on(elHotkey,'focus',()=>elHotkey.value='Presiona combinación…');
  on(elHotkey,'blur',()=>elHotkey.value=hotkeyStr);
  on(elHotkey,'keydown',(e)=>{ e.preventDefault(); const sig=toKeySig(e); if(!sig) return; hotkeyStr=sig; elHotkey.value=hotkeyStr; S('hotkey',hotkeyStr); });
  on(elPanelHotkey,'focus',()=>elPanelHotkey.value='Presiona combinación…');
  on(elPanelHotkey,'blur',()=>elPanelHotkey.value=panelToggleHotkey);
  on(elPanelHotkey,'keydown',(e)=>{ e.preventDefault(); const sig=toKeySig(e); if(!sig) return; panelToggleHotkey=sig; elPanelHotkey.value=panelToggleHotkey; S('panelToggleHotkey',panelToggleHotkey); });

  on(elQuickStep,'change',e=>{ quickStepAddPx=clamp(parseInt(e.target.value)||20,1,1000); S('quickStepAddPx',quickStepAddPx); });
  on(btnMinus,'click',()=>{ speedPxPerSec=Math.max(1,Math.round(speedPxPerSec-quickStepAddPx)); elSpeed.value=String(speedPxPerSec); elSpeed.dispatchEvent(new Event('change')); elSpeedVal.textContent=String(speedPxPerSec); });
  on(btnPlus,'click',()=>{ speedPxPerSec=Math.min(10000,Math.round(speedPxPerSec+quickStepAddPx)); elSpeed.value=String(speedPxPerSec); elSpeed.dispatchEvent(new Event('change')); elSpeedVal.textContent=String(speedPxPerSec); });
  on(btnInvert,'click',()=>{ invertDirection=!invertDirection; S('invertDirection',invertDirection); });

  // Visibilidad
  on(btnHideFull,'click',hidePanelFull);
  on(btnHideEdge,'click',hidePanelEdge);
  on(elUseEdgeStrip,'change',e=>{ useEdgeStrip=!!e.target.checked; S('useEdgeStrip',useEdgeStrip); panelVisibility==='hidden_edge' && (useEdgeStrip?showEdge():hideEdge()); panel.querySelector('#tmEdgeOptions').style.display=useEdgeStrip?'':'none'; });
  on(elEdgeSide,'change',e=>{ edgeSide=e.target.value==='right'?'right':'left'; S('edgeSide',edgeSide); styleEdge(); styleSensor(); });
  on(elEdgeAutoHide,'change',e=>{ edgeAutoHideSec=clamp(parseFloat(e.target.value)||0,0,10); S('edgeAutoHideSec',edgeAutoHideSec); });
  on(elEdgeWidth,'change',e=>{ edgeWidthPx=clamp(parseInt(e.target.value)||edgeWidthPx,2,40); S('edgeWidthPx',edgeWidthPx); if(edgeHoverWidthPx<edgeWidthPx){ edgeHoverWidthPx=edgeWidthPx; elEdgeHoverWidth.value=String(edgeHoverWidthPx); S('edgeHoverWidthPx',edgeHoverWidthPx); } styleEdge(); });
  on(elEdgeHoverWidth,'change',e=>{ edgeHoverWidthPx=clamp(parseInt(e.target.value)||edgeHoverWidthPx,edgeWidthPx,60); S('edgeHoverWidthPx',edgeHoverWidthPx); });
  on(elEdgeHeight,'change',e=>{ edgeHeightPx=clamp(parseInt(e.target.value)||edgeHeightPx,60,400); S('edgeHeightPx',edgeHeightPx); styleEdge(); styleSensor(); });
  on(elEdgeTop,'change',e=>{ edgeTopPct=clamp(parseInt(e.target.value)||edgeTopPct,0,100); S('edgeTopPct',edgeTopPct); styleEdge(); styleSensor(); });
  on(elEdgeRange,'change',e=>{ edgeHoverRangePx=clamp(parseInt(e.target.value)||edgeHoverRangePx,6,80); S('edgeHoverRangePx',edgeHoverRangePx); styleSensor(); });

  // Gestos
  on(elClickEnabled,'change',e=>{ clickToggleEnabled=!!e.target.checked; S('clickToggleEnabled',clickToggleEnabled); });
  on(elClickCount,'change',e=>{ clickToggleCount=clamp(parseInt(e.target.value)||2,1,6); S('clickToggleCount',clickToggleCount); });
  on(elClickWindow,'change',e=>{ clickToggleWindowMs=clamp(parseInt(e.target.value)||500,100,3000); S('clickToggleWindowMs',clickToggleWindowMs); });
  let middlePause=true; on(elMiddlePause,'change',e=>{ middlePause=!!e.target.checked; });
  on(elTripleAction,'change',e=>{ tripleClickAction=e.target.value; S('tripleClickAction',tripleClickAction); });
  on(elTripleWindow,'change',e=>{ tripleClickWindowMs=clamp(parseInt(e.target.value)||500,200,1500); S('tripleClickWindowMs',tripleClickWindowMs); });

  // Pausa inteligente
  let resumeTimer=null;
  function scheduleResume(){
    clearTimeout(resumeTimer);
    if(!smartPauseEnabled || smartResumeMs<=0) return;
    resumeTimer=setTimeout(()=>{ if(smartNoResumeIfInputFocused && isForm(document.activeElement)) return; toggleRun(true); }, smartResumeMs);
  }
  on(elSPEnabled,'change',e=>{
    smartPauseEnabled=!!e.target.checked; S('smartPauseEnabled',smartPauseEnabled);
    for(const el of [elSPWheel,elSPKeys,elSPSelect,elSPFocus,elSPResume,elSPNoResumeInput]) el.disabled=!smartPauseEnabled;
  });
  on(elSPWheel,'change',e=>{ smartPause_wheel=!!e.target.checked; S('smartPause_wheel',smartPause_wheel); });
  on(elSPKeys,'change',e=>{ smartPause_keys=!!e.target.checked; S('smartPause_keys',smartPause_keys); });
  on(elSPSelect,'change',e=>{ smartPause_select=!!e.target.checked; S('smartPause_select',smartPause_select); });
  on(elSPFocus,'change',e=>{ smartPause_focusInput=!!e.target.checked; S('smartPause_focusInput',smartPause_focusInput); });
  on(elSPResume,'change',e=>{ smartResumeMs=clamp(parseInt(e.target.value)||3000,500,15000); S('smartResumeMs',smartResumeMs); });
  on(elSPNoResumeInput,'change',e=>{ smartNoResumeIfInputFocused=!!e.target.checked; S('smartNoResumeIfInputFocused',smartNoResumeIfInputFocused); });

  // Curvas/Boost
  on(elRampStart,'change',e=>{ rampStartMs=clamp(parseInt(e.target.value)||0,0,3000); S('rampStartMs',rampStartMs); });
  on(elRampStop,'change',e=>{ rampStopMs=clamp(parseInt(e.target.value)||0,0,3000); S('rampStopMs',rampStopMs); });
  on(elBoostShift,'change',e=>{ boostShiftMul=clamp(parseFloat(e.target.value)||1.5,1,5); S('boostShiftMul',boostShiftMul); });
  on(elBoostCtrl,'change',e=>{ boostCtrlMul=clamp(parseFloat(e.target.value)||2,1,5); S('boostCtrlMul',boostCtrlMul); });
  on(elBoostCombine,'change',e=>{ boostAllowCombine=!!e.target.checked; S('boostAllowCombine',boostAllowCombine); });

  // Infinite scroll (inputs)
  on(elInfEnabled,'change',e=>{ infScrollEnabled=!!e.target.checked; S('infScrollEnabled',infScrollEnabled); });
  on(elInfPx,'change',e=>{ infScrollSentinelPx=clamp(parseInt(e.target.value)||1200,200,4000); S('infScrollSentinelPx',infScrollSentinelPx); });
  on(elInfTimeout,'change',e=>{ infScrollTimeoutMs=clamp(parseInt(e.target.value)||4000,500,15000); S('infScrollTimeoutMs',infScrollTimeoutMs); });
  on(elInfLoader,'change',e=>{ infScrollLoaderSel=e.target.value||''; S('infScrollLoaderSel',infScrollLoaderSel); });

  // Apariencia/A11y
  panel.style.opacity = String(clamp(panelOpacity,0.7,1));
  on(elTheme,'change',e=>{ theme=e.target.value; S('theme',theme); panel.classList.toggle('tm-light', theme==='light' || (theme==='auto' && matchMedia?.('(prefers-color-scheme: light)').matches)); });
  on(elOpacity,'change',e=>{ panelOpacity=clamp(parseFloat(e.target.value)||0.85,0.7,1); S('panelOpacity',panelOpacity); panel.style.opacity=String(panelOpacity); });
  on(elA11y,'change',e=>{ a11yEnabled=!!e.target.checked; S('a11yEnabled',a11yEnabled); });
  on(elFontScale,'change',e=>{ fontScalePct=clamp(parseInt(e.target.value)||100,80,130); S('fontScalePct',fontScalePct); panel.style.fontSize = `${13*fontScalePct/100}px`; });
  on(elRadius,'change',e=>{ borderRadiusPx=clamp(parseInt(e.target.value)||12,8,24); S('borderRadiusPx',borderRadiusPx); panel.style.setProperty('--tm-radius', `${borderRadiusPx}px`); });
  on(elCompact,'change',e=>{ compactUI=!!e.target.checked; S('compactUI',compactUI); panel.classList.toggle('compact',compactUI); });
  on(elWidthPx,'change',e=>{ panelWidthPx=clamp(parseInt(e.target.value)||300,260,520); S('panelWidthPx',panelWidthPx); panel.style.setProperty('--tm-width', `${panelWidthPx}px`); });
  on(elShadow,'change',e=>{ shadowAlpha=clamp(parseFloat(e.target.value)||0.33,0,0.6); S('shadowAlpha',shadowAlpha); panel.style.setProperty('--tm-shadow-a', String(shadowAlpha)); });
  on(elAccent,'change',e=>{ accent=e.target.value; S('accent',accent); setAccent(accent); });

  // Perfiles
  on(elUseSiteProfile,'change',e=>{ useSiteProfile=!!e.target.checked; S('useSiteProfile',useSiteProfile); resolveProfilesOnInit(true); reflectProfileToUI(); });
  on(elForceSub,'change',e=>{ forceSubdomain=!!e.target.checked; S('forceSubdomain',forceSubdomain); resolveProfilesOnInit(true); reflectProfileToUI(); maybeShowSubPrompt(); });
  on(elForceDefault,'change',e=>{ forceSubdomainDefaultAction=e.target.value; S('forceSubdomainDefaultAction',forceSubdomainDefaultAction); maybeAutoCreateByDefaultAction(); reflectProfileToUI(); });

  // PSL-lite / overrides
  on(elUsePslLite,'change',e=>{ usePslLite=!!e.target.checked; S('usePslLite',usePslLite); recomputeBaseAndRefresh(); });
  on(btnSaveOverride,'click',()=>{
    const val=(elBaseOverride.value||'').trim();
    if(!val || !val.includes('.')){ alert('Ingresa un dominio válido (ej: bbc.co.uk)'); return; }
    baseDomainOverrides = {...(baseDomainOverrides||{}), [HOST]: val};
    S('baseDomainOverrides', baseDomainOverrides);
    recomputeBaseAndRefresh();
  });
  on(btnDeleteOverride,'click',()=>{
    if(baseDomainOverrides && baseDomainOverrides[HOST]){
      delete baseDomainOverrides[HOST]; S('baseDomainOverrides', baseDomainOverrides);
      recomputeBaseAndRefresh();
    }
  });
  function recomputeBaseAndRefresh(){
    BASE_DOMAIN = computeBaseDomain(HOST);
    HAS_SUBDOMAIN = hasSubdomain(HOST);
    elBaseDomainTxt.textContent = BASE_DOMAIN;
    elDomainBtnTxt.textContent = BASE_DOMAIN;
    elSubHostTxt.textContent = HOST;
    elForceSub.disabled = !HAS_SUBDOMAIN;
    if(!HAS_SUBDOMAIN) elForceSub.checked = false;
    S('forceSubdomain', elForceSub.checked);
    resolveProfilesOnInit(true);
    reflectProfileToUI();
    renderProfileList();
  }

  /* ------------------------ Reglas ------------------------ */
  function renderRules(){
    const el = elRuleList; el.innerHTML='';
    rules.forEach((r,i)=>{
      const row=document.createElement('div'); row.className='tm-as-inline';
      row.innerHTML=`<span class="tm-as-label">#${i+1} <b>${r.type.toUpperCase()}</b></span><code style="font-size:12px">${r.pattern}</code> <button class="tm-as-btn" data-i="${i}">Eliminar</button>`;
      on(row.querySelector('button'),'click',()=>{ rules.splice(i,1); S('rules',rules); renderRules(); });
      el.appendChild(row);
    });
  }
  const elRuleType = panel.querySelector('#tmRuleType');
  const elRulePattern = panel.querySelector('#tmRulePattern');
  const btnRuleAdd = panel.querySelector('#tmRuleAdd');
  const btnRuleClear = panel.querySelector('#tmRuleClear');
  const elRuleList = panel.querySelector('#tmRuleList');
  const elRulesAutoStart = panel.querySelector('#tmRulesAutoStart');
  const btnRuleTest = panel.querySelector('#tmRuleTest');

  renderRules();
  on(btnRuleAdd,'click',()=>{ const type=elRuleType.value; const pattern=elRulePattern.value.trim(); if(!pattern) return; rules.push({type,pattern}); S('rules',rules); elRulePattern.value=''; renderRules(); });
  on(btnRuleClear,'click',()=>{ rules=[]; S('rules',rules); renderRules(); });
  on(elRulesAutoStart,'change',e=>{ rulesAutoStart=!!e.target.checked; S('rulesAutoStart',rulesAutoStart); });
  on(btnRuleTest,'click',()=>{ const res=evaluateRules(location.href); alert(`Resultado para URL actual:\n${JSON.stringify(res,null,2)}`); });

  function wildcardToRegExp(str){ const esc=str.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*'); return new RegExp('^'+esc+'$'); }
  function evaluateRules(url){
    const blocks = rules.filter(r=>r.type==='block');
    const allows = rules.filter(r=>r.type==='allow');
    const hit = (list)=>list.find(r=>wildcardToRegExp(r.pattern).test(url));
    const blocked = !!hit(blocks);
    if(blocked) return {blocked:true, allowed:false, autoStart:false};
    const allowed = !!hit(allows);
    const autoStart = allowed && !!rulesAutoStart;
    return {blocked:false, allowed, autoStart};
  }
  const ruleEval = evaluateRules(location.href);
  if(!ruleEval.blocked && ruleEval.allowed && rulesAutoStart) toggleRun(true);
  const _pushState=history.pushState.bind(history);
  history.pushState=function(...a){ const r=_pushState(...a); onUrlChange(); return r; };
  const _replaceState=history.replaceState.bind(history);
  history.replaceState=function(...a){ const r=_replaceState(...a); onUrlChange(); return r; };
  on(window,'hashchange',onUrlChange);
  function onUrlChange(){ const r=evaluateRules(location.href); if(!r.blocked && r.allowed && rulesAutoStart) toggleRun(true); }

  /* ------------------------ Infinite scroll (rework) ------------------------ */
  let sentinel=null, io=null, waitingSentinel=false;
  let infFailuresCount=0, infStop=false; // corta después de 2 timeouts seguidos

  function setupInfScroll(){
    if(!infScrollEnabled || infStop) return;
    if(!sentinel){
      sentinel=document.createElement('div');
      sentinel.id='tm-as-sentinel';
      sentinel.style.cssText='width:1px;height:1px';
      document.body.appendChild(sentinel);
    }
    if(!io){
      io=new IntersectionObserver(onSentinel, {
        root:null,
        rootMargin:`0px 0px ${infScrollSentinelPx}px 0px`,
        threshold:0
      });
      io.observe(sentinel);
    }
  }

  function onSentinel(entries){
    if(!infScrollEnabled || infStop) return;
    const en=entries[0];
    if(!en.isIntersecting || waitingSentinel) return;

    // Pausa y espera contenido
    const initialH=document.documentElement.scrollHeight;
    toggleRun(false);
    waitingSentinel=true;
    const start=performance.now();

    const tick=setInterval(()=>{
      const grown = document.documentElement.scrollHeight > initialH + 50;
      const loader = infScrollLoaderSel ? document.querySelector(infScrollLoaderSel) : null;
      const loaderGone = infScrollLoaderSel ? !loader : null;
      const timeout = performance.now() - start > infScrollTimeoutMs;

      if(grown){
        clearInterval(tick);
        waitingSentinel=false;
        infFailuresCount = 0;          // éxito → reset
        toggleRun(true);
      } else if (loaderGone === true){
        clearInterval(tick);
        waitingSentinel=false;
        infFailuresCount = 0;          // loader terminó → intentar reanudar
        toggleRun(true);
      } else if (timeout){
        clearInterval(tick);
        waitingSentinel=false;
        infFailuresCount++;
        if(infFailuresCount >= 2){
          infStop = true;              // cortar para esta sesión
          console.warn('[AutoScroll] Infinite scroll detenido por timeout repetido.');
        }
        // si aún no cortamos, reanudar para permitir seguir leyendo lo que haya
        toggleRun(true);
      }
    }, 200);
  }

  /* ------------------------ Debug overlay ------------------------ */
  let dbg=null, fpsAcc=0, fpsFrames=0, fpsVal=0;
  function debugTick(dt){
    if(!debugOverlay) return;
    fpsAcc+=dt; fpsFrames++; if(fpsAcc>=1){ fpsVal=fpsFrames; fpsFrames=0; fpsAcc=0; }
    if(!dbg){
      dbg=document.createElement('div'); dbg.style.cssText='position:fixed;left:10px;bottom:10px;z-index:2147483647;background:#0009;color:#fff;padding:6px 8px;border-radius:8px;font:12px system-ui,Segoe UI,Roboto,Arial';
      document.documentElement.appendChild(dbg);
    }
    const dist = (!invertDirection? (document.documentElement.scrollHeight - (window.scrollY+window.innerHeight)) : window.scrollY);
    const state = waitingSentinel?'esperando contenido':(running?'corriendo':'inactivo');
    const parts=[];
    if(debugShowFps) parts.push(`FPS:${fpsVal}`);
    if(debugShowSpeed) parts.push(`v:${Math.round(Math.abs(effectiveSpeed()))} px/s`);
    if(debugShowDistance) parts.push(`d:${Math.max(0,Math.round(dist))} px`);
    if(debugShowState) parts.push(`estado:${state}`);
    dbg.textContent=parts.join(' · ');
  }
  function removeDbg(){ if(dbg){ dbg.remove(); dbg=null; } }
  on(panel.querySelector('#tmDbg'),'change',e=>{ debugOverlay=!!e.target.checked; S('debugOverlay',debugOverlay); if(!debugOverlay) removeDbg(); });
  on(panel.querySelector('#tmDbgAllOn'),'click',()=>{ debugOverlay=true; debugShowFps=debugShowSpeed=debugShowDistance=debugShowState=true; S('debugOverlay',true); S('debugShowFps',true); S('debugShowSpeed',true); S('debugShowDistance',true); S('debugShowState',true); });
  on(panel.querySelector('#tmDbgAllOff'),'click',()=>{ debugOverlay=false; debugShowFps=debugShowSpeed=debugShowDistance=debugShowState=false; S('debugOverlay',false); S('debugShowFps',false); S('debugShowSpeed',false); S('debugShowDistance',false); S('debugShowState',false); removeDbg(); });
  on(panel.querySelector('#tmDbgFps'),'change',e=>{ debugShowFps=!!e.target.checked; S('debugShowFps',debugShowFps); });
  on(panel.querySelector('#tmDbgSpeed'),'change',e=>{ debugShowSpeed=!!e.target.checked; S('debugShowSpeed',debugShowSpeed); });
  on(panel.querySelector('#tmDbgDist'),'change',e=>{ debugShowDistance=!!e.target.checked; S('debugShowDistance',debugShowDistance); });
  on(panel.querySelector('#tmDbgState'),'change',e=>{ debugShowState=!!e.target.checked; S('debugShowState',debugShowState); });

  /* ------------------------ Perfiles helpers ------------------------ */
  function saveProfilePartial(partial){ const P=getProfiles(); P[HOST]={...(P[HOST]||{}),...partial}; setProfiles(P); renderProfileList(); }
  function saveProfileAll(){
    const P=getProfiles(); P[HOST]={
      speedPxPerSec, hotkey:hotkeyStr, panelToggleHotkey,
      clickToggleEnabled, clickToggleCount, clickToggleWindowMs,
      tripleClickAction, tripleClickWindowMs,
      useEdgeStrip, edgeSide, edgeHeightPx, edgeTopPct, edgeWidthPx, edgeHoverWidthPx, edgeHoverRangePx, edgeAutoHideSec,
      infScrollEnabled, infScrollSentinelPx, infScrollTimeoutMs, infScrollLoaderSel
    }; setProfiles(P); renderProfileList(); alert('Perfil guardado para este host.');
  }
  on(btnProfileSave,'click',saveProfileAll);

  function reflectProfileToUI(){
    elSpeed.value=String(speedPxPerSec); elSpeedVal.textContent=String(speedPxPerSec);
    elHotkey.value=hotkeyStr; elPanelHotkey.value=panelToggleHotkey;
    elQuickStep.value=String(quickStepAddPx);
    elUseEdgeStrip.checked=!!useEdgeStrip; panel.querySelector('#tmEdgeOptions').style.display=useEdgeStrip?'':'none';
    elEdgeSide.value=edgeSide; elEdgeAutoHide.value=String(edgeAutoHideSec); elEdgeWidth.value=String(edgeWidthPx); elEdgeHoverWidth.value=String(edgeHoverWidthPx);
    elEdgeHeight.value=String(edgeHeightPx); elEdgeTop.value=String(edgeTopPct); elEdgeRange.value=String(edgeHoverRangePx);
    elInfEnabled.checked=!!infScrollEnabled; elInfPx.value=String(infScrollSentinelPx); elInfTimeout.value=String(infScrollTimeoutMs); elInfLoader.value=infScrollLoaderSel;
    elTripleAction.value=tripleClickAction; elTripleWindow.value=String(tripleClickWindowMs);
  }
  function buildProfileFromCurrentGlobals(){
    return {
      speedPxPerSec: G('speedPxPerSec'),
      hotkey: G('hotkey'),
      panelToggleHotkey: G('panelToggleHotkey'),
      clickToggleEnabled: G('clickToggleEnabled'),
      clickToggleCount: G('clickToggleCount'),
      clickToggleWindowMs: G('clickToggleWindowMs'),
      tripleClickAction: G('tripleClickAction')||'none',
      tripleClickWindowMs: G('tripleClickWindowMs'),
      useEdgeStrip: G('useEdgeStrip'),
      edgeSide: G('edgeSide'),
      edgeHeightPx: G('edgeHeightPx'),
      edgeTopPct: G('edgeTopPct'),
      edgeWidthPx: G('edgeWidthPx'),
      edgeHoverWidthPx: G('edgeHoverWidthPx'),
      edgeHoverRangePx: G('edgeHoverRangePx'),
      edgeAutoHideSec: G('edgeAutoHideSec'),
      infScrollEnabled: G('infScrollEnabled'),
      infScrollSentinelPx: G('infScrollSentinelPx'),
      infScrollTimeoutMs: G('infScrollTimeoutMs'),
      infScrollLoaderSel: G('infScrollLoaderSel')
    };
  }
  function buildProfileFromDefaults(){
    return {
      speedPxPerSec: DEFAULTS.speedPxPerSec,
      hotkey: DEFAULTS.hotkey,
      panelToggleHotkey: DEFAULTS.panelToggleHotkey ?? 'Shift+H',
      clickToggleEnabled: DEFAULTS.clickToggleEnabled,
      clickToggleCount: DEFAULTS.clickToggleCount,
      clickToggleWindowMs: DEFAULTS.clickToggleWindowMs,
      tripleClickAction: DEFAULTS.tripleClickAction,
      tripleClickWindowMs: DEFAULTS.tripleClickWindowMs,
      useEdgeStrip: DEFAULTS.useEdgeStrip,
      edgeSide: DEFAULTS.edgeSide,
      edgeHeightPx: DEFAULTS.edgeHeightPx,
      edgeTopPct: DEFAULTS.edgeTopPct,
      edgeWidthPx: DEFAULTS.edgeWidthPx,
      edgeHoverWidthPx: DEFAULTS.edgeHoverWidthPx,
      edgeHoverRangePx: DEFAULTS.edgeHoverRangePx,
      edgeAutoHideSec: DEFAULTS.edgeAutoHideSec,
      infScrollEnabled: DEFAULTS.infScrollEnabled,
      infScrollSentinelPx: DEFAULTS.infScrollSentinelPx,
      infScrollTimeoutMs: DEFAULTS.infScrollTimeoutMs,
      infScrollLoaderSel: DEFAULTS.infScrollLoaderSel
    };
  }
  function createSubProfile(mode){
    const P=getProfiles();
    if(mode==='fromDomain'){
      const base=P[BASE_DOMAIN];
      if(base){ P[HOST]={...base}; setProfiles(P); applyProfile(P[HOST]); }
      else { P[HOST]=buildProfileFromGlobalsOrDefault(); setProfiles(P); applyProfile(P[HOST]); }
    } else if(mode==='fromGlobal'){
      P[HOST]=buildProfileFromGlobalsOrDefault();
      setProfiles(P); applyProfile(P[HOST]);
    } else { // blank
      P[HOST]=buildProfileFromDefaults();
      setProfiles(P); applyProfile(P[HOST]);
    }
    renderProfileList();
  }
  function buildProfileFromGlobalsOrDefault(){ return buildProfileFromCurrentGlobals() || buildProfileFromDefaults(); }

  function applyProfile(p){
    if(!p) return;
    if('speedPxPerSec' in p) speedPxPerSec=p.speedPxPerSec;
    if('hotkey' in p) hotkeyStr=p.hotkey;
    if('panelToggleHotkey' in p) panelToggleHotkey=p.panelToggleHotkey;
    if('clickToggleEnabled' in p) clickToggleEnabled=p.clickToggleEnabled;
    if('clickToggleCount' in p) clickToggleCount=p.clickToggleCount;
    if('clickToggleWindowMs' in p) clickToggleWindowMs=p.clickToggleWindowMs;
    if('tripleClickAction' in p) tripleClickAction=p.tripleClickAction;
    if('tripleClickWindowMs' in p) tripleClickWindowMs=p.tripleClickWindowMs;

    if('useEdgeStrip' in p) useEdgeStrip=p.useEdgeStrip;
    if('edgeSide' in p) edgeSide=p.edgeSide;
    if('edgeHeightPx' in p) edgeHeightPx=p.edgeHeightPx;
    if('edgeTopPct' in p) edgeTopPct=p.edgeTopPct;
    if('edgeWidthPx' in p) edgeWidthPx=p.edgeWidthPx;
    if('edgeHoverWidthPx' in p) edgeHoverWidthPx=p.edgeHoverWidthPx;
    if('edgeHoverRangePx' in p) edgeHoverRangePx=p.edgeHoverRangePx;
    if('edgeAutoHideSec' in p) edgeAutoHideSec=p.edgeAutoHideSec;

    if('infScrollEnabled' in p) infScrollEnabled=p.infScrollEnabled;
    if('infScrollSentinelPx' in p) infScrollSentinelPx=p.infScrollSentinelPx;
    if('infScrollTimeoutMs' in p) infScrollTimeoutMs=p.infScrollTimeoutMs;
    if('infScrollLoaderSel' in p) infScrollLoaderSel=p.infScrollLoaderSel;
  }

  function resolveProfilesOnInit(refreshUI=false){
    const P=getProfiles();
    if(!useSiteProfile){ if(refreshUI) reflectProfileToUI(); return; }

    if(HAS_SUBDOMAIN && forceSubdomain){
      if(P[HOST]) { applyProfile(P[HOST]); }
      else {
        if(forceSubdomainDefaultAction!=='ask'){ autoCreateByDefaultAction(); }
      }
    } else {
      if(P[HOST]) { applyProfile(P[HOST]); }
      else if(P[BASE_DOMAIN]) { applyProfile(P[BASE_DOMAIN]); }
    }
    if(refreshUI) reflectProfileToUI();
  }
  function autoCreateByDefaultAction(){
    const action = forceSubdomainDefaultAction;
    if(action==='fromDomain'){
      const P=getProfiles();
      if(P[BASE_DOMAIN]) createSubProfile('fromDomain');
      else createSubProfile('blank');
    } else if(action==='fromGlobal'){ createSubProfile('fromGlobal'); }
    else if(action==='blank'){ createSubProfile('blank'); }
  }
  function maybeAutoCreateByDefaultAction(){
    const P=getProfiles();
    if(!(HAS_SUBDOMAIN && forceSubdomain && useSiteProfile)) return;
    if(P[HOST]) return;
    if(forceSubdomainDefaultAction!=='ask'){ autoCreateByDefaultAction(); }
  }
  function maybeShowSubPrompt(){
    const P=getProfiles();
    subPromptBox.style.display = (HAS_SUBDOMAIN && forceSubdomain && useSiteProfile && !P[HOST] && forceSubdomainDefaultAction==='ask' && !forceSubdomainNoPromptHosts[HOST]) ? 'grid' : 'none';
  }

  // Subprompt actions
  on(btnFromDomain,'click',()=>{ createSubProfile('fromDomain'); afterSubPromptAction(); });
  on(btnFromGlobal,'click',()=>{ createSubProfile('fromGlobal'); afterSubPromptAction(); });
  on(btnBlank,'click',()=>{ createSubProfile('blank'); afterSubPromptAction(); });
  function afterSubPromptAction(){
    const val=selRememberAction.value;
    if(val!=='ask'){ forceSubdomainDefaultAction=val; S('forceSubdomainDefaultAction',forceSubdomainDefaultAction); elForceDefault.value=val; }
    if(chkNoPromptThis.checked){ forceSubdomainNoPromptHosts[HOST]=true; S('forceSubdomainNoPromptHosts',forceSubdomainNoPromptHosts); }
    subPromptBox.style.display='none';
    reflectProfileToUI();
  }

  /* ---------- Listado de perfiles ---------- */
  function renderProfileList(){
    const P=getProfiles();
    const q=(elProfSearch.value||'').toLowerCase().trim();
    const order=elProfSort.value||'alpha';
    let keys=Object.keys(P);
    if(q) keys=keys.filter(k=>k.toLowerCase().includes(q));
    if(order==='alpha') keys.sort();
    else keys.sort((a,b)=>b.length-a.length); // más específico primero
    elProfilesList.innerHTML='';
    if(keys.length===0){ elProfilesList.innerHTML='<span class="tm-as-label">No hay perfiles guardados.</span>'; return; }
    for(const k of keys){
      const row=document.createElement('div'); row.className='tm-as-inline';
      const tag = (k===HOST)?' (este host)':'';
      row.innerHTML=`
        <code style="font-size:12px">${k}${tag}</code>
        <button class="tm-as-btn" data-act="apply" data-k="${k}">Aplicar aquí</button>
        <button class="tm-as-btn" data-act="load" data-k="${k}">Cargar</button>
        <button class="tm-as-btn warn" data-act="del" data-k="${k}">Eliminar</button>`;
      elProfilesList.appendChild(row);
    }
  }
  on(elProfSearch,'input',renderProfileList);
  on(elProfSort,'change',renderProfileList);
  on(elProfilesList,'click',(e)=>{
    const btn=e.target.closest('button'); if(!btn) return;
    const act=btn.dataset.act, key=btn.dataset.k; const P=getProfiles(); const profile=P[key]; if(!profile) return;
    if(act==='load'){ applyProfile(profile); reflectProfileToUI(); }
    if(act==='apply'){ P[HOST]={...profile}; setProfiles(P); alert('Perfil aplicado a este host.'); }
    if(act==='del'){ if(confirm(`Eliminar perfil de "${key}"?`)){ delete P[key]; setProfiles(P); renderProfileList(); } }
  });

  // Inicializa herencia/forzar y listado
  resolveProfilesOnInit(true);
  maybeAutoCreateByDefaultAction();
  maybeShowSubPrompt();
  renderProfileList();

  /* ------------------------ Export / Import helpers ------------------------ */
  const btnExport = panel.querySelector('#tmExport');
  const btnImport = panel.querySelector('#tmImport');
  const btnResetGlobal = panel.querySelector('#tmResetGlobal');
  const btnResetSite = panel.querySelector('#tmResetSite');

  function exportConfig(){
    return {
      globals: {
        speedPxPerSec, hotkeyStr, panelToggleHotkey,
        useEdgeStrip, edgeSide, edgeHeightPx, edgeTopPct, edgeWidthPx, edgeHoverWidthPx, edgeHoverRangePx, edgeAutoHideSec,
        infScrollEnabled, infScrollSentinelPx, infScrollTimeoutMs, infScrollLoaderSel,
        smart: { smartPauseEnabled, smartPause_wheel, smartPause_keys, smartPause_select, smartPause_focusInput, smartResumeMs, smartNoResumeIfInputFocused },
        curves: { rampStartMs, rampStopMs, boostShiftMul, boostCtrlMul, boostAllowCombine, invertDirection },
        ui: { theme, panelOpacity, a11yEnabled, fontScalePct, borderRadiusPx, compactUI, panelWidthPx, shadowAlpha, accent },
        rules, rulesAutoStart,
        profilesConfig: { forceSubdomain, forceSubdomainNoPromptHosts, forceSubdomainDefaultAction },
        psl: { usePslLite, baseDomainOverrides }
      },
      profiles: getProfiles()
    };
  }
  function importConfig(data){
    try{
      const g=data.globals||{};
      const assign = (obj)=>{ for(const k of Object.keys(obj||{})) { S(k,obj[k]); eval(`${k}=obj.${k}`); } };

      if('speedPxPerSec' in g){ speedPxPerSec=g.speedPxPerSec; S('speedPxPerSec',speedPxPerSec); }
      if('hotkeyStr' in g){ hotkeyStr=g.hotkeyStr; S('hotkey',hotkeyStr); }
      if('panelToggleHotkey' in g){ panelToggleHotkey=g.panelToggleHotkey; S('panelToggleHotkey',panelToggleHotkey); }
      if('useEdgeStrip' in g){ useEdgeStrip=g.useEdgeStrip; S('useEdgeStrip',useEdgeStrip); }

      assign({
        edgeSide:g.edgeSide, edgeHeightPx:g.edgeHeightPx, edgeTopPct:g.edgeTopPct,
        edgeWidthPx:g.edgeWidthPx, edgeHoverWidthPx:g.edgeHoverWidthPx, edgeHoverRangePx:g.edgeHoverRangePx, edgeAutoHideSec:g.edgeAutoHideSec
      });
      assign({ infScrollEnabled:g.infScrollEnabled, infScrollSentinelPx:g.infScrollSentinelPx, infScrollTimeoutMs:g.infScrollTimeoutMs, infScrollLoaderSel:g.infScrollLoaderSel });

      if(g.smart){ assign(g.smart); }
      if(g.curves){ assign(g.curves); }
      if(g.ui){ assign(g.ui);
        panel.style.opacity=String(panelOpacity);
        panel.style.fontSize=`${13*fontScalePct/100}px`;
        panel.style.setProperty('--tm-radius', `${borderRadiusPx}px`);
        panel.classList.toggle('compact',compactUI);
        panel.classList.toggle('tm-light', theme==='light' || (theme==='auto' && matchMedia?.('(prefers-color-scheme: light)').matches));
        panel.style.setProperty('--tm-width', `${clamp(panelWidthPx,260,520)}px`);
        panel.style.setProperty('--tm-shadow-a', String(clamp(shadowAlpha,0,0.6)));
        setAccent(accent);
      }
      if(Array.isArray(g.rules)) { rules=g.rules; S('rules',rules); renderRules(); }
      if('rulesAutoStart' in g){ rulesAutoStart=g.rulesAutoStart; S('rulesAutoStart',rulesAutoStart); panel.querySelector('#tmRulesAutoStart').checked=rulesAutoStart; }
      if(g.profilesConfig){ assign(g.profilesConfig); if(elForceSub) elForceSub.checked=!!forceSubdomain; if(elForceDefault) elForceDefault.value=forceSubdomainDefaultAction; }
      if(g.psl){ assign(g.psl); if(elUsePslLite) elUsePslLite.checked=usePslLite; }

      if(data.profiles) setProfiles(data.profiles);
      recomputeBaseAndRefresh();
      maybeAutoCreateByDefaultAction(); maybeShowSubPrompt(); renderProfileList();
    }catch(e){ console.error('Import error',e); }
  }

  on(btnExport,'click',()=>{ const data=exportConfig(); const json=JSON.stringify(data,null,2); const blob=new Blob([json],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`autoscroll-config-${location.hostname}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); });
  on(btnImport,'click',()=>{ const json=prompt('Pega aquí el JSON a importar:'); if(!json) return; try{ const data=JSON.parse(json); importConfig(data); alert('Importado.'); }catch(e){ alert('JSON inválido'); } });

  on(btnResetGlobal,'click',()=>{ if(confirm('Restablecer valores globales a fábrica?')){ for(const k of Object.keys(DEFAULTS)) S(k, DEFAULTS[k]); alert('Listo. Recarga la página.'); } });
  on(btnResetSite,'click',()=>{ const P=getProfiles(); if(P[HOST]){ delete P[HOST]; setProfiles(P);} alert('Perfil del sitio restablecido.'); });

  /* ------------------------ A11y: focus panel (Alt+P) + Esc ------------------------ */
  let lastFocused=null;
  on(window,'keydown',e=>{
    if(!a11yEnabled) return;
    if(e.altKey && e.code==='KeyP'){ e.preventDefault(); lastFocused=document.activeElement; panel.querySelector('.tm-sec-head')?.focus(); showPanel(); }
    if(e.key==='Escape' && panelVisibility==='visible'){ if(lastFocused) { lastFocused.focus?.(); } }
  });

  /* ------------------------ Menu commands ------------------------ */
  try{
    GM_registerMenuCommand('Iniciar/Detener AutoScroll',()=>toggleRun());
    GM_registerMenuCommand('Mostrar/Ocultar Panel',()=>{ if(panelVisibility==='visible') hidePanelFull(); else showPanel(); });
    GM_registerMenuCommand('Ocultar Panel con Tira',()=>hidePanelEdge());
    GM_registerMenuCommand('Colapsar/Expandir Panel',()=>panel.querySelector('#tmCollapse').click());
  }catch{}

  // Estado inicial de UI
  if(running) toggleRun(true);

  /* ------------------------ Gestos globales ------------------------ */
  // Clic medio: pausa/reanuda
  on(window,'mousedown',e=>{ if(e.button===1 && elMiddlePause.checked && !isInsideUI(e.target)){ e.preventDefault(); toggleRun(!running); } }, true);

  // Triple-clic
  let tripleTimes=[];
  on(window,'mousedown',e=>{
    if(e.button!==0 || isForm(e.target) || isInsideUI(e.target)) return;
    const now=performance.now(); tripleTimes=tripleTimes.filter(t=>now-t<=tripleClickWindowMs); tripleTimes.push(now);
    if(tripleTimes.length>=3){ tripleTimes=[]; const v=elTripleAction.value;
      if(v==='top') window.scrollTo({top:0,behavior:'smooth'});
      else if(v==='bottom') window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'});
      else if(v==='toggleDir'){ invertDirection=!invertDirection; S('invertDirection',invertDirection); }
    }
  }, true);

  // Clics para alternar autoscroll
  let clickTimes=[];
  function isInsideUI(el){ return el && (el===panel || panel.contains(el) || el===edgeStrip || el===edgeSensor); }
  on(window,'mousedown',e=>{
    if(!clickToggleEnabled || e.button!==0 || isForm(e.target) || e.isComposing || isInsideUI(e.target)) return;
    const now=performance.now();
    clickTimes=clickTimes.filter(t=>now-t<=clickToggleWindowMs); clickTimes.push(now);
    if(clickTimes.length>=clickToggleCount){ clickTimes=[]; toggleRun(); e.preventDefault(); }
  }, true);

  /* ------------------------ Pausa inteligente (sin clic de mouse) ------------------------ */
  const readingKeys = new Set(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ']);
  on(window,'wheel',e=>{ if(!smartPauseEnabled || !smartPause_wheel) return; if(running){ toggleRun(false); scheduleResume(); } }, {passive:true});
  on(window,'keydown',e=>{
    if(!smartPauseEnabled || !smartPause_keys) return;
    if(isInsideUI(e.target) || isForm(e.target)) return;
    if(readingKeys.has(e.key)){ if(running){ toggleRun(false); scheduleResume(); } }
  });
  document.addEventListener('selectionchange',()=>{
    if(!smartPauseEnabled || !smartPause_select) return;
    const sel=window.getSelection?.(); if(!sel) return;
    if(!sel.isCollapsed && running){ toggleRun(false); scheduleResume(); }
  });
  on(window,'focusin',e=>{ if(!smartPauseEnabled || !smartPause_focusInput) return; if(isForm(e.target) && running){ toggleRun(false); scheduleResume(); } });

  /* ------------------------ Fin script ------------------------ */
})();
