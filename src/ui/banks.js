// «Банки»: enable/disable, order and cashback settings of each bank.
import { upsertBank, moveBank } from '../core/state.js';
import {
  html, fmtPct, fmtNumber, fmtReward, parseDecimal, bankColor,
} from './format.js';
import { clearFormError, showFormError } from './forms.js';

const DIALOG_ID = 'bank-dialog';

export function render(ctx) {
  const banks = [...ctx.state.banks].sort((a, b) => a.order - b.order);
  const allOff = banks.every((bank) => !bank.enabled);
  return html`
    <section class="screen banks">
      <h1 class="screen-title" tabindex="-1">Банки</h1>
      <p class="muted small">Проценты и лимиты возьмите из приложения банка. Выключенные банки не участвуют в подборе.</p>
      ${allOff ? html`<p class="warn small">Все банки выключены: включите хотя бы один, иначе сравнивать нечего.</p>` : ''}
      <ul class="plain-list" role="list">${banks.map((bank, index) => bankCard(bank, index, banks.length))}</ul>
      ${bankDialog()}
    </section>`;
}

function summary(bank) {
  const reward = bank.rewardType === 'points'
    ? `${bank.pointsName || 'баллы'}, 1 = ${fmtNumber(bank.valueCoef)} ₽`
    : 'рубли';
  const limit = bank.monthlyLimit == null ? 'без общего лимита' : `лимит ${fmtReward(bank.monthlyLimit, bank)}`;
  return `база ${fmtPct(bank.basePercent)} · ${reward} · ${limit}`;
}

function bankCard(bank, index, total) {
  return html`
    <li class="card bank-card${bank.enabled ? '' : ' is-dim'}" style="--bank-color: ${bankColor(bank.color)}">
      <div class="card-head">
        <span class="bank-dot" aria-hidden="true"></span>
        <h2 class="card-title">${bank.name}</h2>
        <label class="switch">
          <input type="checkbox" data-change="toggleBank" data-id="${bank.id}" ${bank.enabled ? 'checked' : ''}
            aria-label="${bank.enabled ? 'Выключить' : 'Включить'} ${bank.name}">
          <span>${bank.enabled ? 'Вкл.' : 'Выкл.'}</span>
        </label>
      </div>
      <p class="muted small">${summary(bank)}</p>
      <div class="card-actions">
        <button type="button" class="icon-btn" data-click="moveBank" data-id="${bank.id}" data-delta="-1"
          aria-label="Выше: ${bank.name}" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="icon-btn" data-click="moveBank" data-id="${bank.id}" data-delta="1"
          aria-label="Ниже: ${bank.name}" ${index === total - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="btn" data-click="editBank" data-id="${bank.id}">Настроить</button>
      </div>
    </li>`;
}

function bankDialog() {
  return html`
    <dialog id="${DIALOG_ID}" class="sheet" aria-labelledby="bank-dialog-title">
      <form data-submit="saveBank" novalidate>
        <h2 id="bank-dialog-title" class="sheet-title">Банк</h2>
        <input type="hidden" name="bankId">
        <div class="field-row">
          <label class="field">Название <input class="input" name="name" maxlength="30" autocomplete="off" required></label>
          <label class="field field-color">Цвет <input class="input" type="color" name="color"></label>
        </div>
        <label class="field">Базовый кешбэк, % <input class="input" name="basePercent" inputmode="decimal" autocomplete="off" required></label>
        <label class="field">Чем начисляется
          <select class="input" name="rewardType" data-change="rewardTypeChanged">
            <option value="rub">Рубли</option>
            <option value="points">Бонусы / баллы</option>
          </select>
        </label>
        <div data-points-fields>
          <label class="field">Название бонусов <input class="input" name="pointsName" maxlength="20" autocomplete="off" placeholder="Спасибо"></label>
          <label class="field">Сколько рублей стоит 1 бонус (0…1) <input class="input" name="valueCoef" inputmode="decimal" autocomplete="off" placeholder="0,8"></label>
        </div>
        <label class="field">Общий лимит кешбэка в месяц (необязательно) <input class="input" name="monthlyLimit" inputmode="decimal" autocomplete="off"></label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn" data-click="closeBankDialog">Отмена</button>
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </dialog>`;
}

const decimalText = (value) => (value == null ? '' : String(value).replace('.', ','));

function syncPointsFields(form) {
  form.querySelector('[data-points-fields]').hidden = form.elements.rewardType.value !== 'points';
}

function openBankDialog(bank) {
  const dialog = document.getElementById(DIALOG_ID);
  const form = dialog.querySelector('form');
  const { elements } = form;
  form.reset();
  elements.bankId.value = bank.id;
  elements.name.value = bank.name;
  // <input type="color"> only accepts #rrggbb.
  elements.color.value = /^#[0-9a-f]{6}$/i.test(bank.color) ? bank.color : '#888888';
  elements.basePercent.value = decimalText(bank.basePercent);
  elements.rewardType.value = bank.rewardType;
  elements.pointsName.value = bank.pointsName ?? '';
  elements.valueCoef.value = decimalText(bank.valueCoef);
  elements.monthlyLimit.value = decimalText(bank.monthlyLimit);
  clearFormError(form);
  syncPointsFields(form);
  dialog.showModal();
}

function bankFields(data) {
  const isPoints = data.get('rewardType') === 'points';
  const limitText = String(data.get('monthlyLimit')).trim();
  return {
    limitText,
    name: String(data.get('name')).trim(),
    color: bankColor(data.get('color')),
    basePercent: parseDecimal(data.get('basePercent')),
    rewardType: isPoints ? 'points' : 'rub',
    pointsName: isPoints ? String(data.get('pointsName')).trim() || 'баллы' : '',
    valueCoef: isPoints ? parseDecimal(data.get('valueCoef')) : 1,
    monthlyLimit: limitText ? parseDecimal(limitText) : null,
  };
}

function bankFieldsError(fields) {
  if (!fields.name) return { error: 'Укажите название банка.', field: 'name' };
  if (fields.basePercent === null || fields.basePercent > 100) {
    return { error: 'Базовый процент — число от 0 до 100.', field: 'basePercent' };
  }
  if (fields.valueCoef === null || fields.valueCoef > 1) {
    return { error: 'Ценность бонуса — число от 0 до 1, например 0,8.', field: 'valueCoef' };
  }
  if (fields.limitText && fields.monthlyLimit === null) return { error: 'Лимит — неотрицательное число.', field: 'monthlyLimit' };
  return null;
}

// Returns { bank } or { error, field } from the dialog values.
function readBank(ctx, form) {
  const data = new FormData(form);
  const bank = ctx.state.banks.find((b) => b.id === data.get('bankId'));
  if (!bank) return { error: 'Банк не найден.' };
  const parsed = bankFields(data);
  const problem = bankFieldsError(parsed);
  if (problem) return problem;
  const { limitText, ...fields } = parsed;
  return { bank: { ...bank, ...fields } };
}

function closeBankDialog() {
  document.getElementById(DIALOG_ID)?.close();
}

export const actions = {
  toggleBank(ctx, el) {
    const bank = ctx.state.banks.find((b) => b.id === el.dataset.id);
    if (bank) ctx.store.set((state) => upsertBank(state, { ...bank, enabled: el.checked }));
  },
  moveBank(ctx, el) {
    ctx.store.set((state) => moveBank(state, el.dataset.id, Number(el.dataset.delta)));
  },
  editBank(ctx, el) {
    const bank = ctx.state.banks.find((b) => b.id === el.dataset.id);
    if (bank) openBankDialog(bank);
  },
  rewardTypeChanged(ctx, el) {
    syncPointsFields(el.form);
  },
  saveBank(ctx, form) {
    const result = readBank(ctx, form);
    if (result.error) {
      showFormError(form, result);
      return;
    }
    closeBankDialog();
    ctx.store.set((state) => upsertBank(state, result.bank));
    ctx.toast(`Сохранено: ${result.bank.name}`);
  },
  closeBankDialog,
};
