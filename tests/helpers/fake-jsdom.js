const NOOP = () => {};

function createStyle() {
  const store = Object.create(null);
  const base = {
    setProperty(name, value) {
      store[name] = String(value ?? '');
    },
    removeProperty(name) {
      delete store[name];
    },
    getPropertyValue(name) {
      return store[name] ?? '';
    },
  };

  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      return store[prop] ?? '';
    },
    set(_target, prop, value) {
      store[prop] = String(value ?? '');
      return true;
    },
    ownKeys() {
      return Reflect.ownKeys(store);
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop in store) {
        return { configurable: true, enumerable: true, value: store[prop] };
      }
      return { configurable: true, enumerable: true, value: undefined };
    },
  });
}

class Event {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    this.cancelable = Boolean(options.cancelable);
    this.defaultPrevented = false;
    this.detail = options.detail ?? null;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {}
}

class CustomEvent extends Event {}

class EventTarget {
  constructor() {
    this.__listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!listener) return;
    const set = this.__listeners.get(type) ?? new Set();
    set.add(listener);
    this.__listeners.set(type, set);
  }

  removeEventListener(type, listener) {
    const set = this.__listeners.get(type);
    if (!set) return;
    set.delete(listener);
  }

  dispatchEvent(event) {
    if (!event || typeof event.type !== 'string') return true;
    const set = this.__listeners.get(event.type);
    if (!set || set.size === 0) return !event.defaultPrevented;
    for (const listener of Array.from(set)) {
      event.target = event.target ?? this;
      event.currentTarget = this;
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }
}

function createClassList(state) {
  const set = state.classSet;
  return {
    add: (...tokens) => tokens.forEach((t) => set.add(String(t))),
    remove: (...tokens) => tokens.forEach((t) => set.delete(String(t))),
    contains: (token) => set.has(String(token)),
    toggle: (token, force) => {
      const has = set.has(String(token));
      const shouldAdd = force ?? !has;
      if (shouldAdd) {
        set.add(String(token));
        return true;
      }
      set.delete(String(token));
      return false;
    },
  };
}

function makeNodeList(nodes) {
  return {
    length: nodes.length,
    forEach: (fn) => nodes.forEach((node, idx) => fn(node, idx, nodes)),
    item: (idx) => nodes[idx] ?? null,
    [Symbol.iterator]: function* iterator() {
      yield* nodes;
    },
  };
}

function createNode(tagName = 'div', ownerDocument, nodeType = 1) {
  const state = {
    tagName: String(tagName || 'div').toUpperCase(),
    ownerDocument,
    children: [],
    classSet: new Set(),
    attributes: new Map(),
    selectors: new Map(),
    listeners: new Map(),
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    dataset: Object.create(null),
    style: createStyle(),
  };

  const proxy = new Proxy(new EventTarget(), {
    get(target, prop) {
      if (prop === 'nodeType') return nodeType;
      if (prop === 'tagName') return state.tagName;
      if (prop === 'ownerDocument') return ownerDocument;
      if (prop === 'parentNode' || prop === 'parentElement') return state.parent ?? null;
      if (prop === 'children') return state.children;
      if (prop === 'childNodes') return state.children;
      if (prop === 'firstElementChild') {
        return state.children.find((child) => child.nodeType === 1 || child.nodeType === 11) ?? null;
      }
      if (prop === 'style') return state.style;
      if (prop === 'dataset') return state.dataset;
      if (prop === 'classList') return state.classList ?? (state.classList = createClassList(state));
      if (prop === 'textContent') return state.textContent;
      if (prop === 'innerText') return state.textContent;
      if (prop === 'innerHTML') return state.innerHTML;
      if (prop === 'value') return state.value;
      if (prop === 'checked') return state.checked;
      if (prop === 'disabled') return state.disabled;
      if (prop === 'getAttribute') {
        return (name) => (state.attributes.has(name) ? state.attributes.get(name) : null);
      }
      if (prop === 'setAttribute') {
        return (name, value) => {
          state.attributes.set(name, String(value));
        };
      }
      if (prop === 'removeAttribute') {
        return (name) => {
          state.attributes.delete(name);
        };
      }
      if (prop === 'appendChild') {
        return (child) => {
          if (!child) return child;
          state.children.push(child);
          child.__setParent?.(proxy);
          return child;
        };
      }
      if (prop === 'removeChild') {
        return (child) => {
          state.children = state.children.filter((c) => c !== child);
        };
      }
      if (prop === 'replaceChildren') {
        return (...newChildren) => {
          state.children = [];
          newChildren.forEach((child) => proxy.appendChild(child));
        };
      }
      if (prop === 'insertBefore') {
        return (newNode, referenceNode) => {
          const idx = state.children.indexOf(referenceNode);
          if (idx === -1) return proxy.appendChild(newNode);
          state.children.splice(idx, 0, newNode);
          newNode.__setParent?.(proxy);
          return newNode;
        };
      }
      if (prop === 'remove') {
        return () => {
          state.parent?.removeChild?.(proxy);
        };
      }
      if (prop === 'querySelector') {
        return (selector) => {
          if (!state.selectors.has(selector)) {
            const child = createNode('div', ownerDocument);
            state.selectors.set(selector, child);
          }
          return state.selectors.get(selector);
        };
      }
      if (prop === 'querySelectorAll') {
        return (selector) => {
          const node = proxy.querySelector(selector);
          return makeNodeList(node ? [node] : []);
        };
      }
      if (prop === 'getBoundingClientRect') {
        return () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
      }
      if (prop === 'focus' || prop === 'blur' || prop === 'click' || prop === 'scrollIntoView') {
        return NOOP;
      }
      if (prop === 'contains') {
        return (node) => state.children.includes(node);
      }
      if (prop === '__setParent') {
        return (parent) => {
          state.parent = parent;
        };
      }
      if (prop === Symbol.iterator) {
        return function* iterator() {
          yield* state.children;
        };
      }
      if (prop === 'className') {
        return Array.from(state.classSet).join(' ');
      }
      if (prop === 'offsetWidth' || prop === 'offsetHeight' || prop === 'scrollHeight' || prop === 'clientHeight' || prop === 'clientWidth') {
        return 0;
      }
      if (prop === 'style') return state.style;
      if (prop === 'dataset') return state.dataset;
      if (prop === 'toString') {
        return () => `[object StubElement ${state.tagName}]`;
      }
      if (prop === 'content' && state.tagName === 'TEMPLATE') {
        if (!state.content) {
          state.content = createNode('#fragment', ownerDocument, 11);
        }
        return state.content;
      }
      return target[prop];
    },
    set(target, prop, value) {
      if (prop === 'textContent' || prop === 'innerText') {
        state.textContent = String(value ?? '');
        return true;
      }
      if (prop === 'innerHTML') {
        state.innerHTML = String(value ?? '');
        state.children = [];
        state.selectors.clear();
        if (state.tagName === 'TEMPLATE') {
          const fragment = createNode('#fragment', ownerDocument, 11);
          const root = createNode('div', ownerDocument);
          fragment.appendChild(root);
          state.content = fragment;
        }
        return true;
      }
      if (prop === 'value') {
        state.value = value;
        return true;
      }
      if (prop === 'checked') {
        state.checked = Boolean(value);
        return true;
      }
      if (prop === 'disabled') {
        state.disabled = Boolean(value);
        return true;
      }
      if (prop === 'className') {
        state.classSet = new Set(String(value || '').split(/\s+/).filter(Boolean));
        state.classList = createClassList(state);
        return true;
      }
      if (prop === 'style') {
        state.style = value;
        return true;
      }
      target[prop] = value;
      return true;
    },
  });

  return proxy;
}

function createDocument(url) {
  const doc = new EventTarget();
  doc.nodeType = 9;
  doc.contentType = 'text/html';
  doc.documentURI = url.href;
  doc.readyState = 'complete';
  doc.visibilityState = 'visible';
  doc._url = url;

  doc.createElement = (tag) => {
    const el = createNode(tag, doc);
    if (String(tag).toLowerCase() === 'template') {
      el.innerHTML = '';
    }
    return el;
  };
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  doc.createTextNode = (text) => {
    const node = createNode('#text', doc, 3);
    node.textContent = text;
    return node;
  };
  doc.createComment = (text) => {
    const node = createNode('#comment', doc, 8);
    node.textContent = text;
    return node;
  };
  doc.createDocumentFragment = () => createNode('#fragment', doc, 11);
  doc.getElementById = (id) => doc.documentElement.querySelector(`#${id}`);
  doc.querySelector = (selector) => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = (selector) => doc.documentElement.querySelectorAll(selector);
  doc.importNode = (node) => node;
  doc.hasFocus = () => true;
  doc.createEvent = () => new Event('');
  doc.addEventListener = doc.addEventListener.bind(doc);
  doc.removeEventListener = doc.removeEventListener.bind(doc);
  doc.dispatchEvent = doc.dispatchEvent.bind(doc);

  const head = createNode('head', doc);
  const body = createNode('body', doc);
  const html = createNode('html', doc);
  html.appendChild(head);
  html.appendChild(body);
  doc.head = head;
  doc.body = body;
  doc.documentElement = html;
  head.__setParent(html);
  body.__setParent(html);

  return doc;
}

function createWindow(html, options) {
  const url = new URL(options.url ?? 'https://example.com/');
  const document = createDocument(url);
  document.innerHTML = html;

  const win = new EventTarget();
  win.window = win;
  win.self = win;
  win.top = win;
  win.parent = win;
  win.globalThis = win;
  win.document = document;
  win.navigator = { userAgent: 'fake-jsdom', language: 'en', languages: ['en'], platform: 'node' };
  win.location = url;
  win.history = {
    state: null,
    pushState(state, _title, _url) {
      this.state = state;
    },
    replaceState(state, _title, _url) {
      this.state = state;
    },
  };
  win.screen = { width: 1024, height: 768 };
  win.innerWidth = 1024;
  win.innerHeight = 768;
  win.scrollX = 0;
  win.scrollY = 0;
  win.pageXOffset = 0;
  win.pageYOffset = 0;
  win.devicePixelRatio = 1;
  win.performance = globalThis.performance ?? { now: () => Date.now() };
  win.console = console;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.setInterval = setInterval;
  win.clearInterval = clearInterval;
  win.requestAnimationFrame = (cb) => setTimeout(() => cb(win.performance.now()), 16);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  win.alert = NOOP;
  win.confirm = () => false;
  win.prompt = () => null;
  win.matchMedia = () => ({
    matches: false,
    media: '',
    addListener: NOOP,
    removeListener: NOOP,
    addEventListener: NOOP,
    removeEventListener: NOOP,
  });
  win.getSelection = () => ({ isCollapsed: true });
  win.scrollTo = (_x, _y) => {};
  win.Blob = globalThis.Blob;
  win.URL = globalThis.URL;
  win.Event = Event;
  win.CustomEvent = CustomEvent;
  win.EventTarget = EventTarget;
  win.DOMParser = class {
    parseFromString() {
      return createDocument(url);
    }
  };
  win.getComputedStyle = () => ({
    getPropertyValue: () => '',
  });
  win.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  document.defaultView = win;
  document.location = win.location;

  return win;
}

class JSDOM {
  constructor(html = '<!DOCTYPE html><html><head></head><body></body></html>', options = {}) {
    this.window = createWindow(html, options);
    this._vmContext = this.window;
  }

  getInternalVMContext() {
    return this._vmContext;
  }

  serialize() {
    return '';
  }
}

export { JSDOM, Event, CustomEvent };
