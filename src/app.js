// App shell: load state, hash routing, delegated events, toasts.
import { load } from './core/state.js';
import { createStore } from './ui/store.js';
import { parseRoute } from './ui/router.js';
import * as pick from './ui/pick.js';
import * as categories from './ui/categories.js';
import * as stores from './ui/stores.js';
import * as banks from './ui/banks.js';
import * as more from './ui/more.js';
import { registerServiceWorker } from './ui/updates.js';

const SCREENS = { pick, categories, stores, banks, more };
const EVENT_TYPES = ['click', 'input', 'change', 'submit'];
const TOAST_MS = 2600;
const TOAST_ACTION_MS = 6000;
const LOAD_MESSAGES = {
  recovered: 'Сохранённые данные повреждены: копия отложена, начинаем с заготовок',
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

function render() {
  ctx.route = parseRoute(location.hash);
  root.innerHTML = String(SCREENS[ctx.route.name].render(ctx));
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    const active = tab.dataset.tab === ctx.route.name;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
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
window.addEventListener('hashchange', render);
// The app may stay open past midnight: recompute the current month on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !root.querySelector('dialog[open]')) render();
});

render();
if (LOAD_MESSAGES[loaded.status]) toast(LOAD_MESSAGES[loaded.status]);
registerServiceWorker(toast);
// Best effort: asks the browser not to evict localStorage under storage pressure.
navigator.storage?.persist?.().catch(() => false);
