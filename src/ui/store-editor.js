// Shop editor dialog shared by «Магазины» and «Где платить» (add from an empty search).
// "Store" here is a shop from state.stores, not the state holder in ./store.js.
import { includesMcc, formatMcc } from '../core/match.js';
import { upsertStore, removeStore } from '../core/state.js';
import { html } from './format.js';
import { clearFormError, showFormError } from './forms.js';

const DIALOG_ID = 'store-dialog';

export function storeDialog() {
  return html`
    <dialog id="${DIALOG_ID}" class="sheet" aria-labelledby="store-dialog-title">
      <form data-submit="saveStore" novalidate>
        <h2 id="store-dialog-title" class="sheet-title">Магазин</h2>
        <input type="hidden" name="storeId">
        <label class="field">Название
          <input class="input" name="name" maxlength="60" autocomplete="off" required>
        </label>
        <label class="field">Другие названия через запятую
          <input class="input" name="aliases" autocomplete="off" placeholder="пятерка, 5ка">
        </label>
        <label class="field">MCC-код (из выписки или чека)
          <input class="input" name="mcc" inputmode="numeric" maxlength="4" autocomplete="off"
            placeholder="5411" data-input="storeMccHint" aria-describedby="store-mcc-hint" required>
        </label>
        <p id="store-mcc-hint" class="muted small" data-mcc-hint></p>
        <label class="field">Заметка
          <input class="input" name="note" maxlength="80" autocomplete="off">
        </label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-click="deleteStore">Удалить</button>
          <button type="button" class="btn" data-click="closeStoreDialog">Отмена</button>
          <button type="submit" class="btn btn-primary">Сохранить</button>
        </div>
      </form>
    </dialog>`;
}

function mccHint(state, text) {
  if (!/^\d{4}$/.test(text)) return 'Четыре цифры, например 5411 или 0742.';
  const mcc = Number(text);
  const groups = state.mccGroups.filter((g) => includesMcc(g.codes, mcc)).map((g) => g.name);
  return groups.length ? `MCC ${formatMcc(mcc)}: ${groups.join(', ')}` : `MCC ${formatMcc(mcc)} нет в справочнике групп`;
}

// prefill: { name } when adding from the search screen.
export function openStoreDialog(ctx, store, prefill = {}) {
  const dialog = document.getElementById(DIALOG_ID);
  const form = dialog.querySelector('form');
  form.reset();
  form.elements.storeId.value = store?.id ?? '';
  form.elements.name.value = store?.name ?? prefill.name ?? '';
  form.elements.aliases.value = (store?.aliases ?? []).join(', ');
  form.elements.mcc.value = store ? formatMcc(store.mcc) : '';
  form.elements.note.value = store?.note ?? '';
  form.querySelector('[data-mcc-hint]').textContent = store ? mccHint(ctx.state, formatMcc(store.mcc)) : '';
  form.querySelector('.sheet-title').textContent = store ? 'Магазин' : 'Новый магазин';
  form.querySelector('[data-click="deleteStore"]').hidden = !store;
  clearFormError(form);
  dialog.showModal();
  if (!store) form.elements[prefill.name ? 'mcc' : 'name'].focus();
}

// Returns { store } or { error, field }; keeps usage counters of an existing store.
function readStore(ctx, form) {
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const mccText = String(data.get('mcc')).trim();
  if (!name) return { error: 'Укажите название магазина.', field: 'name' };
  if (!/^\d{1,4}$/.test(mccText)) return { error: 'MCC — до четырёх цифр, например 5411.', field: 'mcc' };
  const id = String(data.get('storeId'));
  const existing = ctx.state.stores.find((s) => s.id === id);
  const aliases = String(data.get('aliases')).split(',').map((a) => a.trim()).filter(Boolean);
  return {
    store: {
      usedCount: 0, lastUsedAt: null, ...existing,
      id: id || ctx.newId(), name, aliases, mcc: Number(mccText), note: String(data.get('note')).trim(),
    },
  };
}

function closeStoreDialog() {
  document.getElementById(DIALOG_ID)?.close();
}

// Spread into a screen's actions; onSave(store) runs right before the state
// update, so the screen can adjust its view for the re-render.
export function storeEditorActions({ onSave = () => {} } = {}) {
  return {
    storeMccHint(ctx, el) {
      el.form.querySelector('[data-mcc-hint]').textContent = mccHint(ctx.state, el.value.trim());
    },
    saveStore(ctx, form) {
      const result = readStore(ctx, form);
      if (result.error) {
        showFormError(form, result);
        return;
      }
      closeStoreDialog();
      onSave(result.store);
      ctx.store.set((state) => upsertStore(state, result.store));
      ctx.toast(`Сохранено: ${result.store.name}`);
    },
    deleteStore(ctx, el) {
      const store = ctx.state.stores.find((s) => s.id === el.form.elements.storeId.value);
      if (!store) return;
      closeStoreDialog();
      ctx.store.set((state) => removeStore(state, store.id));
      ctx.toast(`Удалено: ${store.name}`, {
        actionLabel: 'Вернуть',
        onAction: () => ctx.store.set((state) => upsertStore(state, store)),
      });
    },
    closeStoreDialog,
  };
}
