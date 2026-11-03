// App shell: load state, hash routing, delegated events, toasts.
import { load } from './core/state.js';
import { createStore } from './ui/store.js';
import { parseRoute } from './ui/router.js';
import * as pick from './ui/pick.js';
import * as categories from './ui/categories.js';
import { stubScreen } from './ui/stub.js';

const SCREENS = {
  pick,
  categories,
  stores: stubScreen('Магазины'),
  banks: stubScreen('Банки'),
  more: stubScreen('Ещё'),
};
const EVENT_TYPES = ['click', 'input', 'change', 'submit'];
const TOAST_MS = 2600;
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
let toastTimer = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, TOAST_MS);
}

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
