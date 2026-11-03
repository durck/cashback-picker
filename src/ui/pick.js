// Main screen «Где платить»: search → target MCC codes → banks ranked by value.
import { findCandidates, formatMcc } from '../core/match.js';
import { monthKey } from '../core/months.js';
import { rankBanks } from '../core/rank.js';
import { touchStore } from '../core/state.js';
import {
  html, fmtMoney, fmtPct, fmtReward, parseAmount, bankColor,
} from './format.js';

// Transient input state survives re-renders but is not persisted.
const view = { query: '', amountText: '', chosenKey: null };
const CANDIDATE_LIMIT = 6;

const candidateKey = (c) => (c.kind === 'store' ? `store:${c.store.id}`
  : c.kind === 'group' ? `group:${c.group.id}` : `mcc:${c.codes[0]}`);

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
    </section>`;
}

function results(ctx) {
  if (!view.query.trim()) {
    return html`<p class="hint">Введите название магазина, 4-значный MCC-код или категорию, например «АЗС».</p>`;
  }
  const candidates = findCandidates(ctx.state, view.query, { limit: CANDIDATE_LIMIT });
  if (candidates.length === 0) {
    return html`<p class="hint">Ничего не нашлось по запросу «${view.query.trim()}». Попробуйте MCC-код из выписки.</p>`;
  }
  const target = candidates.find((c) => candidateKey(c) === view.chosenKey) ?? candidates[0];
  const amount = parseAmount(view.amountText);
  const ranked = rankBanks(ctx.state, { codes: target.codes, amount, month: monthKey(ctx.now()) });
  return html`
    ${targetHeader(target, amount)}
    ${alternatives(candidates, target)}
    <ol class="bank-list">${ranked.map((row, index) => bankRow(row, index === 0 && row.value > 0))}</ol>`;
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
      <div class="bank-figures">${figures(row)}</div>
    </li>`;
}

function refreshResults(ctx) {
  ctx.patch('#pick-results', results(ctx));
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
};
