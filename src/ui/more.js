// «Ещё»: purchase log for a month with deletion (export/import and MCC groups come later).
import { monthKey, isMonthKey, prevMonth, nextMonth, categoriesFor } from '../core/months.js';
import { monthLog, addPurchase, removePurchase } from '../core/limits.js';
import {
  html, fmtMoney, fmtReward, fmtMonthRu, fmtDay, bankColor,
} from './format.js';
import { href } from './router.js';

const RUB = { rewardType: 'rub' };

function currentMonth(ctx) {
  const [month] = ctx.route.params;
  return isMonthKey(month) ? month : monthKey(ctx.now());
}

export function render(ctx) {
  const month = currentMonth(ctx);
  const entries = monthLog(ctx.state, month);
  const list = entries.length
    ? html`<ul class="log-list">${entries.map((entry) => logRow(ctx.state, entry))}</ul>`
    : html`<p class="muted small">За этот месяц записей нет. Кнопка «Записать» на главном экране добавляет покупку сюда.</p>`;
  return html`
    <section class="screen more">
      <h1 class="screen-title">Ещё</h1>
      <article class="card">
        <header class="month-switch">
          <a class="icon-btn" href="${href('more', prevMonth(month))}" aria-label="Предыдущий месяц">‹</a>
          <h2 class="card-title">Покупки · ${fmtMonthRu(month)}</h2>
          <a class="icon-btn" href="${href('more', nextMonth(month))}" aria-label="Следующий месяц">›</a>
        </header>
        ${entries.length ? html`<p class="muted small">Записей: ${entries.length}</p>` : ''}
        ${list}
      </article>
    </section>`;
}

// Log entries may outlive their bank or category: show them as deleted.
function categoryName(state, entry, month) {
  if (!entry.categoryId) return 'базовый';
  return categoriesFor(state, month, entry.bankId).find((c) => c.id === entry.categoryId)?.name ?? 'категория удалена';
}

function logRow(state, entry) {
  const bank = state.banks.find((b) => b.id === entry.bankId);
  const month = entry.date.slice(0, 7);
  return html`
    <li class="log-row" style="--bank-color: ${bankColor(bank?.color)}">
      <span class="bank-dot" aria-hidden="true"></span>
      <div class="log-main">
        <div><b>${bank?.name ?? 'Банк удалён'}</b>${entry.label ? html` · ${entry.label}` : ''}</div>
        <div class="muted small">${fmtDay(entry.date)} · ${fmtMoney(entry.amount)} · ${categoryName(state, entry, month)}</div>
      </div>
      <div class="log-reward">${fmtReward(entry.reward, bank ?? RUB)}</div>
      <button type="button" class="icon-btn" data-click="deletePurchase" data-id="${entry.id}"
        aria-label="Удалить запись">✕</button>
    </li>`;
}

export const actions = {
  deletePurchase(ctx, el) {
    const entry = ctx.state.purchases.find((p) => p.id === el.dataset.id);
    if (!entry) return;
    ctx.store.set((state) => removePurchase(state, entry.id));
    ctx.toast('Запись удалена', {
      actionLabel: 'Вернуть',
      onAction: () => ctx.store.set((state) => addPurchase(state, entry)),
    });
  },
};
