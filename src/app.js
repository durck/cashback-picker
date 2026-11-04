// App shell: load state, hash routing, delegated events, toasts.
import { load } from './core/state.js';
import { createStore } from './ui/store.js';
import { parseRoute, href } from './ui/router.js';
import * as pick from './ui/pick.js';
import * as categories from './ui/categories.js';
import * as stores from './ui/stores.js';
import * as banks from './ui/banks.js';
import * as more from './ui/more.js';
import { registerServiceWorker } from './ui/updates.js';

const SCREENS = { pick, categories, stores, banks, more };
const APP_TITLE = 'Какой картой?';
const SCREEN_TITLES = {
  pick: 'Где платить', categories: 'Категории', stores: 'Магазины', banks: 'Банки', more: 'Ещё',
};
// Attributes that identify a control across re-renders.
const FOCUS_ATTRS = ['click', 'change', 'input', 'id', 'bank', 'key', 'delta'];
const CARET_FIELDS = 'input[type="text"], input[type="search"], input:not([type]), textarea';
const EVENT_TYPES = ['click', 'input', 'change', 'submit'];
const TOAST_MS = 2600;
const TOAST_ACTION_MS = 6000;
const LOAD_MESSAGES = {
  recovered: 'Сохранённые данные повреждены: копия отложена, открыты заготовки',
  unavailable: 'Хранилище браузера недоступно — изменения не сохранятся',
};
const SAVE_MESSAGES = {
  quota: 'Не сохранилось: память браузера заполнена',
  unavailable: 'Не сохранилось: хранилище браузера недоступно',
};

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

function browserStorage() {
  try {
    return window.localStorage ?? memoryStorage();
  } catch {
    return memoryStorage();
  }
}

const newId = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const root = document.getElementById('app');
const toastEl = document.getElementById('toast');
const toastText = toastEl.querySelector('[data-toast-text]');
const toastButton = toastEl.querySelector('[data-toast-action]');
let toastTimer = null;
let toastAction = null;
// A persistent toast (update offer) comes back after any transient one.
let pendingPersistent = null;

function showToast(message, actionLabel, onAction) {
  toastText.textContent = message;
  toastButton.textContent = actionLabel;
  toastButton.hidden = !actionLabel;
  toastAction = onAction;
  toastEl.hidden = false;
}

function hideToast() {
  toastEl.hidden = true;
  toastAction = null;
  if (pendingPersistent) showToast(...pendingPersistent);
}

// toast('Готово') or toast('Удалено', { actionLabel: 'Вернуть', onAction });
// persistent toasts stay until their action is used.
function toast(message, { actionLabel = '', onAction = null, persistent = false } = {}) {
  clearTimeout(toastTimer);
  if (persistent) pendingPersistent = [message, actionLabel, onAction];
  showToast(message, actionLabel, onAction);
  if (!persistent) toastTimer = setTimeout(hideToast, actionLabel ? TOAST_ACTION_MS : TOAST_MS);
}

toastButton.addEventListener('click', () => {
  const action = toastAction;
  if (pendingPersistent && action === pendingPersistent[2]) pendingPersistent = null;
  clearTimeout(toastTimer);
  hideToast();
  action?.();
});

const storage = browserStorage();
const loaded = load(storage);
const store = createStore(loaded.state, storage);

const ctx = {
  store,
  route: parseRoute(location.hash),
  get state() { return store.get(); },
  now: () => new Date(),
  newId,
  toast,
  rerender: render,
  patch(selector, content) {
    const target = root.querySelector(selector);
    if (target) target.innerHTML = String(content);
  },
};

// Selector that finds the same control after a re-render, or null.
function focusSelector(el) {
  if (!el || el === root || !root.contains(el)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const attrs = FOCUS_ATTRS.filter((name) => el.dataset[name] !== undefined);
  return attrs.length ? attrs.map((name) => `[data-${name}="${CSS.escape(el.dataset[name])}"]`).join('') : null;
}

// Back to the same control; a neighbour if it got disabled; the heading if it is gone.
function restoreFocus(selector) {
  const found = root.querySelector(selector);
  const target = found?.disabled ? found.closest('li, article')?.querySelector('button:not(:disabled)') : found;
  (target ?? root.querySelector('h1'))?.focus({ preventScroll: true });
  if (target?.matches(CARET_FIELDS)) target.setSelectionRange(target.value.length, target.value.length);
}

function markActiveTab(name) {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function render() {
  const selector = focusSelector(document.activeElement);
  ctx.route = parseRoute(location.hash);
  const { name } = ctx.route;
  root.innerHTML = String(SCREENS[name].render(ctx));
  document.title = name === 'pick' ? APP_TITLE : `${SCREEN_TITLES[name]} — ${APP_TITLE}`;
  markActiveTab(name);
  if (selector) restoreFocus(selector);
}

// A new screen starts from the top, and screen readers land on its heading.
function onRouteChange() {
  const previous = ctx.route.name;
  render();
  if (ctx.route.name === previous) return;
  window.scrollTo(0, 0);
  root.querySelector('h1')?.focus({ preventScroll: true });
}

function reportLoad(status) {
  const message = LOAD_MESSAGES[status];
  if (!message) return;
  if (status !== 'recovered') {
    toast(message);
    return;
  }
  toast(message, { actionLabel: 'Подробнее', onAction: () => { location.hash = href('more'); } });
}

function dispatch(event) {
  const el = event.target.closest(`[data-${event.type}]`);
  if (!el || !root.contains(el)) return;
  const handler = SCREENS[ctx.route.name].actions?.[el.dataset[event.type]];
  if (!handler) return;
  if (event.type === 'submit') event.preventDefault();
  handler(ctx, el, event);
}

EVENT_TYPES.forEach((type) => root.addEventListener(type, dispatch));
store.subscribe((state, result) => {
  render();
  if (!result.ok) toast(SAVE_MESSAGES[result.error] ?? SAVE_MESSAGES.unavailable);
});
window.addEventListener('hashchange', onRouteChange);
// The app may stay open past midnight: recompute the current month on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !root.querySelector('dialog[open]')) render();
});

render();
reportLoad(loaded.status);
registerServiceWorker(toast);
// Best effort: asks the browser not to evict localStorage under storage pressure.
navigator.storage?.persist?.().catch(() => false);
