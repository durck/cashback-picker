// «Ещё»: backup, purchase log for a month, MCC group reference, app version.
import { formatCodes, parseCodes } from '../core/match.js';
import { APP_VERSION } from '../version.js';
import { backupCard, backupActions } from './backup.js';
import { clearFormError, showFormError } from './forms.js';
import { corruptCard, recoveryActions } from './recovery.js';
import { checkForUpdates } from './updates.js';
import { monthKey, isMonthKey, prevMonth, nextMonth, categoriesFor } from '../core/months.js';
import { monthLog, addPurchase, removePurchase } from '../core/limits.js';
import { upsertGroup, removeGroup } from '../core/state.js';
import {
  html, fmtMoney, fmtReward, fmtMonthRu, fmtDay, bankColor,
} from './format.js';
import { href } from './router.js';

const RUB = { rewardType: 'rub' };
const GROUP_DIALOG_ID = 'group-dialog';
const CODES_PREVIEW = 8;
// Keeps the reference open across re-renders, e.g. after saving a group.
const view = { groupsOpen: false };

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
      <h1 class="screen-title" tabindex="-1">Ещё</h1>
      ${corruptCard(ctx)}
      ${backupCard(ctx)}
      <article class="card">
        <header class="month-switch">
          <a id="log-month-prev" class="icon-btn" href="${href('more', prevMonth(month))}" aria-label="Предыдущий месяц">‹</a>
          <h2 class="card-title">Покупки · ${fmtMonthRu(month)}</h2>
          <a id="log-month-next" class="icon-btn" href="${href('more', nextMonth(month))}" aria-label="Следующий месяц">›</a>
        </header>
        ${entries.length ? html`<p class="muted small">Записей: ${entries.length}</p>` : ''}
        ${list}
      </article>
      ${groupsCard(ctx.state)}
      ${groupDialog()}
      <article class="card">
        <h2 class="card-title">О приложении</h2>
        <p class="muted small">Версия ${APP_VERSION}. Работает без сети после первого открытия.</p>
        <button type="button" class="btn" data-click="checkUpdates">Проверить обновления</button>
      </article>
    </section>`;
}

// 'waiting' has no message: its «Обновить» toast is already shown.
const UPDATE_MESSAGES = {
  none: 'Установлена последняя версия',
  installing: 'Нашлась новая версия — загружаю',
  unsupported: 'Обновления недоступны: браузер не поддерживает офлайн-режим',
};

function codesPreview(codes) {
  const shown = formatCodes(codes.slice(0, CODES_PREVIEW));
  return codes.length > CODES_PREVIEW ? `${shown} …` : shown;
}

function groupsCard(state) {
  const rows = state.mccGroups.map((group) => html`
    <li>
      <button type="button" class="list-row" data-click="editGroup" data-id="${group.id}">
        <span class="list-main">
          <span class="cat-name">${group.name}</span>
          <span class="muted small">${codesPreview(group.codes)}</span>
        </span>
        <span class="muted" aria-hidden="true">›</span>
      </button>
    </li>`);
  const list = rows.length
    ? html`<ul class="plain-list" role="list">${rows}</ul>`
    : html`<p class="muted small">Групп нет. Добавьте первую — из неё удобно создавать категории.</p>`;
  return html`
    <details class="card" ${view.groupsOpen ? 'open' : ''}>
      <summary class="card-title" data-click="toggleGroups">Справочник MCC-групп (${state.mccGroups.length})</summary>
      <p class="muted small">Группы — заготовки для категорий. Правка группы не меняет уже созданные категории.</p>
      ${list}
      <button type="button" class="btn btn-ghost" data-click="addGroup">+ Группа</button>
    </details>`;
}

function groupDialog() {
  return html`
    <dialog id="${GROUP_DIALOG_ID}" class="sheet" aria-labelledby="group-dialog-title">
      <form data-submit="saveGroup" novalidate>
        <h2 id="group-dialog-title" class="sheet-title">MCC-группа</h2>
        <input type="hidden" name="groupId">
        <label class="field">Название <input class="input" name="name" maxlength="40" autocomplete="off" required></label>
        <label class="field">MCC-коды, диапазоны через дефис
          <textarea class="input" name="codes" rows="3" autocomplete="off" placeholder="5411, 5499, 3000-3299" required></textarea>
        </label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-click="deleteGroup">Удалить</button>
          <button type="button" class="btn" data-click="closeGroupDialog">Отмена</button>
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </dialog>`;
}

function openGroupDialog(group) {
  const dialog = document.getElementById(GROUP_DIALOG_ID);
  const form = dialog.querySelector('form');
  form.reset();
  form.elements.groupId.value = group?.id ?? '';
  form.elements.name.value = group?.name ?? '';
  form.elements.codes.value = group ? formatCodes(group.codes) : '';
  form.querySelector('.sheet-title').textContent = group ? 'MCC-группа' : 'Новая MCC-группа';
  form.querySelector('[data-click="deleteGroup"]').hidden = !group;
  clearFormError(form);
  dialog.showModal();
}

// Returns { group } or { error } from the dialog values.
function readGroup(ctx, form) {
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const { codes, errors } = parseCodes(data.get('codes'));
  if (!name) return { error: 'Укажите название группы.', field: 'name' };
  if (errors.length) return { error: `Не понял коды: ${errors.join(', ')}`, field: 'codes' };
  if (codes.length === 0) return { error: 'Нужен хотя бы один MCC-код.', field: 'codes' };
  return { group: { id: String(data.get('groupId')) || ctx.newId(), name, codes } };
}

function closeGroupDialog() {
  document.getElementById(GROUP_DIALOG_ID)?.close();
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
  // Runs before the browser toggles the element.
  toggleGroups(ctx, el) {
    view.groupsOpen = !el.closest('details').open;
  },
  addGroup() {
    openGroupDialog(null);
  },
  editGroup(ctx, el) {
    const group = ctx.state.mccGroups.find((g) => g.id === el.dataset.id);
    if (group) openGroupDialog(group);
  },
  saveGroup(ctx, form) {
    const result = readGroup(ctx, form);
    if (result.error) {
      showFormError(form, result);
      return;
    }
    closeGroupDialog();
    ctx.store.set((state) => upsertGroup(state, result.group));
    ctx.toast(`Сохранено: ${result.group.name}`);
  },
  deleteGroup(ctx, el) {
    const group = ctx.state.mccGroups.find((g) => g.id === el.form.elements.groupId.value);
    if (!group) return;
    closeGroupDialog();
    ctx.store.set((state) => removeGroup(state, group.id));
    ctx.toast(`Удалено: ${group.name}`, {
      actionLabel: 'Вернуть',
      onAction: () => ctx.store.set((state) => upsertGroup(state, group)),
    });
  },
  closeGroupDialog,
  checkUpdates(ctx) {
    checkForUpdates(ctx.toast)
      .then((status) => {
        if (UPDATE_MESSAGES[status]) ctx.toast(UPDATE_MESSAGES[status]);
      })
      .catch((error) => ctx.toast(`Не удалось проверить обновления: ${error.message}`));
  },
  ...backupActions,
  ...recoveryActions,
};
