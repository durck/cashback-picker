// «Магазины»: search, list and edit shops with their MCC codes.
import { findCandidates, formatMcc, includesMcc } from '../core/match.js';
import { html } from './format.js';
import { storeDialog, openStoreDialog, storeEditorActions } from './store-editor.js';

const view = { query: '' };
const SEARCH_LIMIT = 50;

export function render(ctx) {
  return html`
    <section class="screen stores">
      <header class="screen-head">
        <h1 class="screen-title" tabindex="-1">Магазины</h1>
        <button type="button" class="btn btn-primary" data-click="addStore">+ Магазин</button>
      </header>
      <input id="stores-filter" class="input" type="search" value="${view.query}" placeholder="Найти магазин"
        aria-label="Найти магазин" autocomplete="off" data-input="filterStores">
      <div id="stores-list">${storeList(ctx.state)}</div>
      ${storeDialog()}
    </section>`;
}

function visibleStores(state) {
  if (!view.query.trim()) return [...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return findCandidates({ ...state, mccGroups: [] }, view.query, { limit: SEARCH_LIMIT })
    .filter((c) => c.kind === 'store')
    .map((c) => c.store);
}

function groupNames(state, mcc) {
  return state.mccGroups.filter((g) => includesMcc(g.codes, mcc)).map((g) => g.name).join(', ');
}

function storeRow(state, store) {
  const groups = groupNames(state, store.mcc);
  const aliases = store.aliases?.length ? html`<div class="muted small">${store.aliases.join(', ')}</div>` : '';
  return html`
    <li>
      <button type="button" class="list-row" data-click="editStore" data-id="${store.id}">
        <span class="list-main">
          <span class="cat-name">${store.name}</span>
          ${aliases}
          <span class="muted small">MCC ${formatMcc(store.mcc)}${groups ? ` · ${groups}` : ''}${store.note ? ` · ${store.note}` : ''}</span>
        </span>
        <span class="muted" aria-hidden="true">›</span>
      </button>
    </li>`;
}

function emptyList() {
  const query = view.query.trim();
  if (!query) return html`<p class="hint">Магазинов пока нет. Добавьте первый кнопкой «+ Магазин».</p>`;
  return html`
    <p class="hint">Ничего не нашлось по запросу «${query}».</p>
    <button type="button" class="btn btn-primary btn-wide" data-click="addStore">Добавить магазин «${query}»</button>`;
}

function storeList(state) {
  const stores = visibleStores(state);
  if (stores.length === 0) return emptyList();
  return html`<ul class="plain-list card" role="list">${stores.map((store) => storeRow(state, store))}</ul>`;
}

export const actions = {
  filterStores(ctx, el) {
    view.query = el.value;
    ctx.patch('#stores-list', storeList(ctx.state));
  },
  addStore(ctx) {
    openStoreDialog(ctx, null, { name: view.query.trim() });
  },
  editStore(ctx, el) {
    const store = ctx.state.stores.find((s) => s.id === el.dataset.id);
    if (store) openStoreDialog(ctx, store);
  },
  ...storeEditorActions(),
};
