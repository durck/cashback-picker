// Main screen «Где платить»: search → target MCC codes → banks ranked by value.
import { findCandidates, formatMcc, frequentStores } from '../core/match.js';
import {
  monthKey, dateKey, hasCategories, latestPlannedMonthBefore, copyPlans,
} from '../core/months.js';
import { rankBanks } from '../core/rank.js';
import { addPurchase, removePurchase, purchaseFromRanked } from '../core/limits.js';
import { touchStore, setSetting } from '../core/state.js';
import {
  html, fmtMoney, fmtPct, fmtReward, fmtMonthRu, parseAmount, bankColor,
} from './format.js';
import { storeDialog, openStoreDialog, storeEditorActions } from './store-editor.js';

// Transient input state survives re-renders but is not persisted.
const view = { query: '', amountText: '', chosenKey: null };
const CANDIDATE_LIMIT = 6;
const FREQUENT_LIMIT = 8;
const BANNER_SETTING = 'copyBannerDismissed';
const INSTALL_HINT_SETTING = 'installHintDismissed';

const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

const candidateKey = (c) => (c.kind === 'store' ? `store:${c.store.id}`
  : c.kind === 'group' ? `group:${c.group.id}` : `mcc:${c.codes[0]}`);

const logLabel = (target) => (target.kind === 'mcc' ? `MCC ${target.label}` : target.label);

export function render(ctx) {
  return html`
    <section class="screen pick">
      <h1 class="visually-hidden">Где платить</h1>
      <div class="pick-inputs">
        <input id="pick-query" class="input input-lg" type="search" value="${view.query}"
          placeholder="Магазин, MCC или категория" aria-label="Магазин, MCC-код или категория"
          autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"
          data-input="query">
        <input id="pick-amount" class="input" type="text" inputmode="decimal" value="${view.amountText}"
          placeholder="Сумма, ₽" aria-label="Сумма покупки, необязательно" autocomplete="off"
          enterkeyhint="done" data-input="amount">
      </div>
      <div id="pick-results" class="pick-results">${results(ctx)}</div>
      ${storeDialog()}
    </section>`;
}

function resolveTarget(state) {
  const candidates = findCandidates(state, view.query, { limit: CANDIDATE_LIMIT });
  const target = candidates.find((c) => candidateKey(c) === view.chosenKey) ?? candidates[0] ?? null;
  return { candidates, target };
}

function results(ctx) {
  const banner = copyBanner(ctx);
  if (!view.query.trim()) {
    return html`${banner}${installHint(ctx.state)}${frequentChips(ctx.state)}
      <p class="hint">Введите название магазина, 4-значный MCC-код или категорию, например «АЗС».</p>`;
  }
  const { candidates, target } = resolveTarget(ctx.state);
  if (!target) {
    return html`${banner}
      <p class="hint">Ничего не нашлось по запросу «${view.query.trim()}». Введите MCC-код из выписки или добавьте магазин.</p>
      <button type="button" class="btn btn-primary btn-wide" data-click="addStoreFromSearch">
        Добавить магазин «${view.query.trim()}»
      </button>`;
  }
  const amount = parseAmount(view.amountText);
  const ranked = rankBanks(ctx.state, { codes: target.codes, amount, month: monthKey(ctx.now()) });
  return html`
    ${banner}
    ${targetHeader(target, amount)}
    ${alternatives(candidates, target)}
    <ol class="bank-list">${ranked.map((row, index) => bankRow(row, index === 0 && row.value > 0))}</ol>`;
}

function copyBanner(ctx) {
  const month = monthKey(ctx.now());
  const { state } = ctx;
  if (hasCategories(state, month) || state.settings[BANNER_SETTING] === month) return '';
  const source = latestPlannedMonthBefore(state, month);
  if (!source) return '';
  return html`
    <div class="banner" role="region" aria-label="Новый месяц">
      <p>Категорий на ${fmtMonthRu(month).toLowerCase()} пока нет. Скопировать с прошлого месяца (${fmtMonthRu(source)})?</p>
      <div class="banner-actions">
        <button type="button" class="btn btn-primary" data-click="copyPrevious" data-from="${source}">Скопировать</button>
        <button type="button" class="btn" data-click="dismissBanner">Не сейчас</button>
      </div>
    </div>`;
}

// iOS keeps Safari-tab data and installed-app data apart, so install first.
function installHint(state) {
  if (isInstalled() || state.settings[INSTALL_HINT_SETTING]) return '';
  return html`
    <div class="banner banner-info" role="region" aria-label="Установка">
      <p>Добавьте приложение на главный экран: в Safari — «Поделиться» → «На экран „Домой“», в Chrome — меню → «Установить приложение».
        На iPhone данные в Safari и в установленном приложении хранятся раздельно: сначала установите, потом заполняйте
        (или перенесите данные экспортом в «Ещё»).</p>
      <div class="banner-actions">
        <button type="button" class="btn" data-click="dismissInstallHint">Понятно</button>
      </div>
    </div>`;
}

function frequentChips(state) {
  const stores = frequentStores(state, { limit: FREQUENT_LIMIT });
  if (stores.length === 0) return '';
  const chips = stores.map((store) => html`
    <button type="button" class="chip chip-lg" data-click="pickStore" data-id="${store.id}">${store.name}</button>`);
  return html`<div class="chips" aria-label="Частые магазины">${chips}</div>`;
}

function targetHeader(target, amount) {
  const amountNote = amount ? html` · кешбэк с ${fmtMoney(amount)}` : '';
  if (target.kind === 'store') {
    const note = target.store.note ? html` · <span class="muted">${target.store.note}</span>` : '';
    return html`<p class="target"><b>${target.label}</b> · MCC ${formatMcc(target.store.mcc)}${note}${amountNote}</p>`;
  }
  if (target.kind === 'group') {
    return html`<p class="target">Категория <b>${target.label}</b>${amountNote}</p>`;
  }
  const group = target.group ? html` · ${target.group.name}` : '';
  return html`<p class="target"><b>MCC ${target.label}</b>${group}${amountNote}</p>`;
}

function alternatives(candidates, target) {
  const others = candidates.filter((c) => c !== target);
  if (others.length === 0) return '';
  const chips = others.map((c) => html`
    <button type="button" class="chip" data-click="choose" data-key="${candidateKey(c)}">
      ${c.kind === 'group' ? 'Категория: ' : ''}${c.label}
    </button>`);
  return html`<div class="chips" aria-label="Другие варианты">${chips}</div>`;
}

function categoryLabel(row) {
  if (row.exhausted === 'bank') return html`<span class="warn">лимит банка исчерпан</span>`;
  if (row.exhausted === 'category') {
    return html`${row.exhaustedCategory.name}: <span class="warn">лимит исчерпан</span> · базовый`;
  }
  return row.category ? html`${row.category.name}` : 'базовый';
}

function balanceLine(row) {
  const parts = [];
  if (row.category && row.remainingCategory !== null) {
    parts.push(`категория ${fmtReward(row.remainingCategory, row.bank)}`);
  }
  if (row.remainingBank !== null) parts.push(`банк ${fmtReward(row.remainingBank, row.bank)}`);
  return parts.length ? html`<div class="bank-balance">Остаток: ${parts.join(' · ')}</div>` : '';
}

function figures(row) {
  const isPoints = row.bank.rewardType === 'points';
  if (row.reward === null) {
    const equivalent = isPoints && row.exhausted !== 'bank' ? html`<div class="bank-sub">≈ ${fmtPct(row.effectivePct)} в ₽</div>` : '';
    return html`<div class="bank-pct">${fmtPct(row.pct)}</div>${equivalent}`;
  }
  const units = isPoints ? html`<div class="bank-sub">${fmtReward(row.reward, row.bank)}</div>` : '';
  return html`<div class="bank-value">${isPoints ? '≈ ' : ''}${fmtMoney(row.value)}</div>
    <div class="bank-sub">${fmtPct(row.pct)}</div>${units}`;
}

function bankRow(row, isBest) {
  return html`
    <li class="bank-row${isBest ? ' is-best' : ''}${row.exhausted === 'bank' ? ' is-dim' : ''}"
      style="--bank-color: ${bankColor(row.bank.color)}">
      <span class="bank-dot" aria-hidden="true"></span>
      <div class="bank-main">
        <div class="bank-name">${row.bank.name}</div>
        <div class="bank-cat">${categoryLabel(row)}</div>
        ${balanceLine(row)}
      </div>
      <div class="bank-figures">
        ${figures(row)}
        <button type="button" class="btn btn-small" data-click="record" data-bank="${row.bank.id}"
          aria-label="Записать покупку по карте ${row.bank.name}">Записать</button>
      </div>
    </li>`;
}

function refreshResults(ctx) {
  ctx.patch('#pick-results', results(ctx));
}

function askForAmount(ctx) {
  document.getElementById('pick-amount')?.focus();
  ctx.toast('Введите сумму покупки, чтобы записать');
}

function recordPurchase(ctx, bankId) {
  const amount = parseAmount(view.amountText);
  if (!amount) {
    askForAmount(ctx);
    return;
  }
  const { target } = resolveTarget(ctx.state);
  const now = ctx.now();
  const row = target && rankBanks(ctx.state, { codes: target.codes, amount, month: monthKey(now) })
    .find((r) => r.bank.id === bankId);
  if (!row) return;
  const entry = purchaseFromRanked(row, {
    id: ctx.newId(), date: dateKey(now), codes: target.codes, amount, label: logLabel(target),
  });
  const storeBefore = target.kind === 'store' ? target.store : null;
  view.amountText = '';
  ctx.store.set((state) => {
    const next = addPurchase(state, entry);
    return storeBefore ? touchStore(next, storeBefore.id, now.toISOString()) : next;
  });
  ctx.toast(`Записано: ${row.bank.name}, ${fmtReward(entry.reward, row.bank)}`, {
    actionLabel: 'Отменить',
    onAction: () => ctx.store.set((state) => undoRecord(state, entry.id, storeBefore)),
  });
}

// Removes the entry and restores the store's usage counters from before the record.
function undoRecord(state, purchaseId, storeBefore) {
  const next = removePurchase(state, purchaseId);
  if (!storeBefore) return next;
  const { usedCount, lastUsedAt } = storeBefore;
  return {
    ...next,
    stores: next.stores.map((s) => (s.id === storeBefore.id ? { ...s, usedCount, lastUsedAt } : s)),
  };
}

export const actions = {
  query(ctx, el) {
    view.query = el.value;
    view.chosenKey = null;
    refreshResults(ctx);
  },
  amount(ctx, el) {
    view.amountText = el.value;
    refreshResults(ctx);
  },
  choose(ctx, el) {
    view.chosenKey = el.dataset.key;
    const [kind, id] = view.chosenKey.split(':');
    if (kind === 'store') ctx.store.set((state) => touchStore(state, id, ctx.now().toISOString()));
    else refreshResults(ctx);
  },
  pickStore(ctx, el) {
    const store = ctx.state.stores.find((s) => s.id === el.dataset.id);
    if (!store) return;
    view.query = store.name;
    view.chosenKey = `store:${store.id}`;
    ctx.store.set((state) => touchStore(state, store.id, ctx.now().toISOString()));
  },
  record(ctx, el) {
    recordPurchase(ctx, el.dataset.bank);
  },
  copyPrevious(ctx, el) {
    const month = monthKey(ctx.now());
    const next = copyPlans(ctx.state, { from: el.dataset.from, to: month, newId: ctx.newId });
    ctx.store.set(next);
    ctx.toast(`Категории скопированы из: ${fmtMonthRu(el.dataset.from)}`);
  },
  dismissBanner(ctx) {
    ctx.store.set((state) => setSetting(state, BANNER_SETTING, monthKey(ctx.now())));
  },
  dismissInstallHint(ctx) {
    ctx.store.set((state) => setSetting(state, INSTALL_HINT_SETTING, true));
  },
  addStoreFromSearch(ctx) {
    openStoreDialog(ctx, null, { name: view.query.trim() });
  },
  ...storeEditorActions({
    onSave(store) {
      view.query = store.name;
      view.chosenKey = `store:${store.id}`;
    },
  }),
};
