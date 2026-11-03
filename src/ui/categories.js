// «Категории»: per-month categories of each enabled bank, edited in a dialog.
import { formatCodes, parseCodes } from '../core/match.js';
import {
  monthKey, isMonthKey, prevMonth, nextMonth, categoriesFor, latestPlannedMonthBefore,
  copyPlans, upsertCategory, removeCategory,
} from '../core/months.js';
import { remaining } from '../core/limits.js';
import {
  html, fmtPct, fmtReward, fmtMonthRu, parseDecimal, bankColor,
} from './format.js';
import { href } from './router.js';

const MAX_CODES_SHOWN = 6;

function currentMonth(ctx) {
  const [month] = ctx.route.params;
  return isMonthKey(month) ? month : monthKey(ctx.now());
}

export function render(ctx) {
  const month = currentMonth(ctx);
  const banks = ctx.state.banks.filter((bank) => bank.enabled).sort((a, b) => a.order - b.order);
  return html`
    <section class="screen categories">
      <header class="month-switch">
        <a class="icon-btn" href="${href('categories', prevMonth(month))}" aria-label="Предыдущий месяц">‹</a>
        <h1 class="screen-title">${fmtMonthRu(month)}</h1>
        <a class="icon-btn" href="${href('categories', nextMonth(month))}" aria-label="Следующий месяц">›</a>
      </header>
      ${copyBar(ctx.state, month)}
      ${banks.map((bank) => bankCard(ctx.state, bank, month))}
      ${dialog(ctx.state)}
    </section>`;
}

function copyBar(state, month) {
  const source = latestPlannedMonthBefore(state, month);
  if (!source) return '';
  return html`
    <button type="button" class="btn btn-wide" data-click="copyPrevious" data-from="${source}">
      Скопировать из прошлого месяца (${fmtMonthRu(source)})
    </button>`;
}

function codesLabel(state, codes) {
  const text = formatCodes(codes);
  const group = state.mccGroups.find((g) => formatCodes(g.codes) === text);
  if (group) return `группа «${group.name}»`;
  const shown = codes.slice(0, MAX_CODES_SHOWN);
  return `MCC ${formatCodes(shown)}${codes.length > shown.length ? ' …' : ''}`;
}

function limitLabel(state, bank, month, category) {
  if (category.limit == null) return '';
  const left = remaining(state, { month, bankId: bank.id, categoryId: category.id }).category;
  return ` · лимит ${fmtReward(category.limit, bank)}, осталось ${fmtReward(left, bank)}`;
}

function categoryRow(state, bank, month, category) {
  return html`
    <li class="cat-row">
      <div class="cat-main">
        <div class="cat-name">${category.name}</div>
        <div class="muted small">${codesLabel(state, category.codes)}${limitLabel(state, bank, month, category)}</div>
      </div>
      <div class="cat-pct">${fmtPct(category.percent)}</div>
      <button type="button" class="icon-btn" data-click="editCategory" data-bank="${bank.id}"
        data-id="${category.id}" aria-label="Изменить категорию ${category.name}">✎</button>
    </li>`;
}

function bankCard(state, bank, month) {
  const categories = categoriesFor(state, month, bank.id);
  const unit = bank.rewardType === 'points' ? bank.pointsName || 'баллы' : 'рубли';
  const list = categories.length
    ? html`<ul class="cat-list">${categories.map((c) => categoryRow(state, bank, month, c))}</ul>`
    : html`<p class="muted small">Категорий нет — везде базовый ${fmtPct(bank.basePercent)}.</p>`;
  return html`
    <article class="card" style="--bank-color: ${bankColor(bank.color)}">
      <header class="card-head">
        <span class="bank-dot" aria-hidden="true"></span>
        <h2 class="card-title">${bank.name}</h2>
        <span class="muted small">база ${fmtPct(bank.basePercent)} · ${unit}</span>
      </header>
      ${list}
      <button type="button" class="btn btn-ghost" data-click="addCategory" data-bank="${bank.id}">+ Категория</button>
    </article>`;
}

function dialog(state) {
  const groups = state.mccGroups.map((g) => html`<option value="${g.id}">${g.name}</option>`);
  return html`
    <dialog id="category-dialog" class="sheet" aria-labelledby="category-dialog-title">
      <form data-submit="saveCategory" novalidate>
        <h2 id="category-dialog-title" class="sheet-title">Категория</h2>
        <input type="hidden" name="bankId"><input type="hidden" name="categoryId">
        <label class="field">Группа MCC
          <select class="input" name="groupId" data-change="pickGroup">
            <option value="">Свои коды</option>${groups}
          </select>
        </label>
        <label class="field">Название
          <input class="input" name="name" maxlength="40" autocomplete="off">
        </label>
        <label class="field">Процент кешбэка
          <input class="input" name="percent" inputmode="decimal" autocomplete="off" placeholder="5">
        </label>
        <label class="field">MCC-коды
          <input class="input" name="codes" autocomplete="off" placeholder="5411, 5499, 3000-3299">
        </label>
        <label class="field"><span>Лимит в месяц, <span data-unit>рубли</span> (необязательно)</span>
          <input class="input" name="limit" inputmode="decimal" autocomplete="off">
        </label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-click="deleteCategory">Удалить</button>
          <button type="button" class="btn" data-click="closeDialog">Отмена</button>
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </dialog>`;
}

function openDialog(ctx, bankId, category) {
  const dialogEl = document.getElementById('category-dialog');
  const form = dialogEl.querySelector('form');
  const bank = ctx.state.banks.find((b) => b.id === bankId);
  const group = category && ctx.state.mccGroups.find((g) => formatCodes(g.codes) === formatCodes(category.codes));
  form.reset();
  form.elements.bankId.value = bankId;
  form.elements.categoryId.value = category?.id ?? '';
  form.elements.groupId.value = group?.id ?? '';
  form.elements.name.value = category?.name ?? '';
  form.elements.percent.value = category ? String(category.percent).replace('.', ',') : '';
  form.elements.codes.value = category ? formatCodes(category.codes) : '';
  form.elements.limit.value = category?.limit ?? '';
  form.querySelector('[data-unit]').textContent = bank.rewardType === 'points' ? bank.pointsName || 'баллы' : 'рубли';
  form.querySelector('.sheet-title').textContent = `${bank.name}: ${category ? 'категория' : 'новая категория'}`;
  form.querySelector('[data-click="deleteCategory"]').hidden = !category;
  form.querySelector('.form-error').textContent = '';
  dialogEl.showModal();
}

// Returns { category } or { error } from the dialog form values.
function readCategory(ctx, form) {
  const data = new FormData(form);
  const group = ctx.state.mccGroups.find((g) => g.id === data.get('groupId'));
  const name = String(data.get('name')).trim() || group?.name || '';
  const percent = parseDecimal(data.get('percent'));
  const { codes, errors } = parseCodes(data.get('codes'));
  const limitText = String(data.get('limit')).trim();
  const limit = limitText ? parseDecimal(limitText) : null;
  if (!name) return { error: 'Укажите название или выберите группу.' };
  if (percent === null || percent <= 0 || percent > 100) return { error: 'Процент — число от 0 до 100.' };
  if (errors.length) return { error: `Не понял коды: ${errors.join(', ')}` };
  if (codes.length === 0) return { error: 'Выберите группу или введите MCC-коды.' };
  if (limitText && limit === null) return { error: 'Лимит — неотрицательное число.' };
  const id = String(data.get('categoryId')) || ctx.newId();
  return { category: { id, name, percent, codes, limit } };
}

function closeDialog() {
  document.getElementById('category-dialog')?.close();
}

export const actions = {
  addCategory(ctx, el) {
    openDialog(ctx, el.dataset.bank, null);
  },
  editCategory(ctx, el) {
    const category = categoriesFor(ctx.state, currentMonth(ctx), el.dataset.bank).find((c) => c.id === el.dataset.id);
    if (category) openDialog(ctx, el.dataset.bank, category);
  },
  pickGroup(ctx, el) {
    const form = el.form;
    const group = ctx.state.mccGroups.find((g) => g.id === el.value);
    if (!group) return;
    form.elements.codes.value = formatCodes(group.codes);
    const nameInput = form.elements.name;
    if (!nameInput.value.trim() || nameInput.dataset.auto === nameInput.value) {
      nameInput.value = group.name;
      nameInput.dataset.auto = group.name;
    }
  },
  saveCategory(ctx, form) {
    const result = readCategory(ctx, form);
    if (result.error) {
      form.querySelector('.form-error').textContent = result.error;
      return;
    }
    const bankId = form.elements.bankId.value;
    closeDialog();
    ctx.store.set((state) => upsertCategory(state, { month: currentMonth(ctx), bankId, category: result.category }));
    ctx.toast('Категория сохранена');
  },
  deleteCategory(ctx, el) {
    const form = el.form;
    const bankId = form.elements.bankId.value;
    const categoryId = form.elements.categoryId.value;
    closeDialog();
    ctx.store.set((state) => removeCategory(state, { month: currentMonth(ctx), bankId, categoryId }));
    ctx.toast('Категория удалена');
  },
  closeDialog,
  copyPrevious(ctx, el) {
    const month = currentMonth(ctx);
    const before = ctx.state;
    const after = copyPlans(before, { from: el.dataset.from, to: month, newId: ctx.newId });
    if (after === before) {
      ctx.toast('Нечего копировать: у банков уже есть категории на этот месяц');
      return;
    }
    ctx.store.set(after);
    ctx.toast(`Скопировано из: ${fmtMonthRu(el.dataset.from)}`);
  },
};
