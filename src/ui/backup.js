// Export/import of the whole document (SPEC §4.5) with a pre-import backup and undo.
import {
  exportDoc, importDoc, summarizeDoc, setSetting, exportReminderDue,
} from '../core/state.js';
import { dateKey } from '../core/months.js';
import { html, fmtDay } from './format.js';
import { clearFormError, showFormError } from './forms.js';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const IMPORT_EXTENSION = /\.(json|txt)$/i;
// Phones often report an empty type; then the extension decides.
const IMPORT_TYPES = new Set(['application/json', 'text/plain']);
const IMPORT_DIALOG_ID = 'import-dialog';
const TEXT_DIALOG_ID = 'text-dialog';

// Validated document waiting for the user's confirmation: { state, doneMessage }.
let pendingImport = null;

export function backupCard(ctx) {
  const last = ctx.state.settings.lastExportAt;
  const lastText = last ? `Последний экспорт: ${fmtDay(dateKey(new Date(last)))}` : 'Экспорта ещё не было';
  const reminder = exportReminderDue(ctx.state, ctx.now())
    ? html`<p class="warn small">Сделайте резервную копию: последней больше 30 дней или её не было.</p>`
    : '';
  const undo = ctx.store.hasBackup()
    ? html`<button type="button" class="btn btn-ghost" data-click="undoImport">Вернуть предыдущие данные</button>`
    : '';
  return html`
    <article class="card">
      <h2 class="card-title">Резервная копия</h2>
      <p class="muted small">Данные хранятся только в этом браузере. Экспорт сохраняет их в файл — для резервной копии и переноса на другой телефон.</p>
      ${reminder}
      <p class="muted small">${lastText}</p>
      <div class="card-buttons">
        <button type="button" class="btn btn-primary" data-click="exportBackup">Экспорт</button>
        <label class="btn">Импорт из файла
          <input class="visually-hidden" type="file" accept=".json,application/json,text/plain" data-change="importFile">
        </label>
        <button type="button" class="btn" data-click="openPaste">Вставить текст</button>
        <button type="button" class="btn" data-click="showExportText">Показать как текст</button>
      </div>
      ${undo}
    </article>
    ${importDialog()}
    ${textDialog()}`;
}

function importDialog() {
  return html`
    <dialog id="${IMPORT_DIALOG_ID}" class="sheet" aria-labelledby="import-dialog-title">
      <form data-submit="confirmImport" novalidate>
        <h2 id="import-dialog-title" class="sheet-title">Заменить все данные?</h2>
        <p data-import-summary></p>
        <p class="muted small">Текущие данные сохранятся отдельно — импорт можно будет отменить.</p>
        <div class="sheet-actions">
          <button type="button" class="btn" data-click="cancelImport">Отмена</button>
          <button type="submit" class="btn btn-primary">Заменить</button>
        </div>
      </form>
    </dialog>`;
}

function textDialog() {
  return html`
    <dialog id="${TEXT_DIALOG_ID}" class="sheet" aria-labelledby="text-dialog-title">
      <form data-submit="checkPasted" novalidate>
        <h2 id="text-dialog-title" class="sheet-title"></h2>
        <textarea class="input mono" name="json" rows="8" spellcheck="false" autocomplete="off"
          aria-labelledby="text-dialog-title"></textarea>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          <button type="button" class="btn" data-click="closeTextDialog">Закрыть</button>
          <button type="button" class="btn" data-click="copyExportText" data-mode="export">Скопировать</button>
          <button type="submit" class="btn btn-primary" data-mode="paste">Проверить</button>
        </div>
      </form>
    </dialog>`;
}

function openTextDialog(mode, text) {
  const dialog = document.getElementById(TEXT_DIALOG_ID);
  const form = dialog.querySelector('form');
  form.reset();
  form.querySelector('.sheet-title').textContent = mode === 'export' ? 'Резервная копия как текст' : 'Вставьте текст резервной копии';
  form.elements.json.value = text;
  form.elements.json.readOnly = mode === 'export';
  form.querySelectorAll('[data-mode]').forEach((button) => { button.hidden = button.dataset.mode !== mode; });
  clearFormError(form);
  dialog.showModal();
}

function summaryText(state) {
  const s = summarizeDoc(state);
  return `Банков: ${s.banks} · магазинов: ${s.stores} · MCC-групп: ${s.groups} · `
    + `категорий: ${s.categories} (месяцев: ${s.months}) · покупок: ${s.purchases}.`;
}

// Asks for confirmation before a document replaces everything.
export function offerReplace(state, { intro, outro = '', doneMessage }) {
  pendingImport = { state, doneMessage };
  const dialog = document.getElementById(IMPORT_DIALOG_ID);
  dialog.querySelector('[data-import-summary]').textContent = `${intro}: ${summaryText(state)}${outro}`;
  dialog.showModal();
}

// Returns an error message, or null when the document is ready to confirm.
// beforeConfirm closes whatever dialog the text came from, so focus stays in the new one.
function prepareImport(text, beforeConfirm = () => {}) {
  const result = importDoc(text);
  if (!result.ok) return result.error;
  beforeConfirm();
  offerReplace(result.state, { intro: 'В файле', doneMessage: 'Данные заменены' });
  return null;
}

function importFileError(file) {
  if (file.size > MAX_IMPORT_BYTES) return 'Файл больше 5 МБ — это не резервная копия приложения.';
  if (!IMPORT_EXTENSION.test(file.name) && !IMPORT_TYPES.has(file.type)) return 'Нужен файл .json из экспорта.';
  if (file.type && !IMPORT_TYPES.has(file.type)) return 'Нужен текстовый файл .json из экспорта.';
  return null;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Resolves to true once the file is handed over, false if the user cancelled.
// navigator.share must start synchronously inside the click to keep user activation.
export function saveFile(file, title) {
  if (!navigator.canShare?.({ files: [file] })) {
    downloadFile(file);
    return Promise.resolve(true);
  }
  return navigator.share({ files: [file], title })
    .then(() => true)
    .catch((error) => {
      if (error.name === 'AbortError') return false;
      downloadFile(file);
      return true;
    });
}

function markExported(ctx) {
  ctx.store.set((state) => setSetting(state, 'lastExportAt', ctx.now().toISOString()));
  ctx.toast('Резервная копия сохранена');
}

function undoImport(ctx) {
  const result = ctx.store.restoreBackup();
  ctx.toast(result.ok ? 'Предыдущие данные возвращены' : `Не удалось вернуть: ${result.error}`);
}

export const backupActions = {
  exportBackup(ctx) {
    const now = ctx.now();
    const file = new File([exportDoc(ctx.state, { now })], `cashback-picker-${dateKey(now)}.json`, { type: 'application/json' });
    saveFile(file, 'Резервная копия «Какой картой?»')
      .then((saved) => {
        if (saved) markExported(ctx);
      })
      .catch((error) => ctx.toast(`Не удалось сохранить файл: ${error.message}`));
  },
  showExportText(ctx) {
    openTextDialog('export', exportDoc(ctx.state, { now: ctx.now() }));
  },
  copyExportText(ctx, el) {
    const field = el.form.elements.json;
    navigator.clipboard.writeText(field.value)
      .then(() => markExported(ctx))
      .catch(() => {
        field.select();
        ctx.toast('Не удалось скопировать автоматически — выделил текст, скопируйте вручную');
      });
  },
  openPaste() {
    openTextDialog('paste', '');
  },
  checkPasted(ctx, form) {
    const error = prepareImport(form.elements.json.value, () => document.getElementById(TEXT_DIALOG_ID).close());
    if (error) showFormError(form, { error, field: 'json' });
  },
  closeTextDialog() {
    document.getElementById(TEXT_DIALOG_ID)?.close();
  },
  importFile(ctx, el) {
    const [file] = el.files;
    el.value = '';
    if (!file) return;
    const invalid = importFileError(file);
    if (invalid) {
      ctx.toast(invalid);
      return;
    }
    file.text()
      .then((text) => {
        const error = prepareImport(text);
        if (error) ctx.toast(error);
      })
      .catch((error) => ctx.toast(`Не удалось прочитать файл: ${error.message}`));
  },
  confirmImport(ctx) {
    const pending = pendingImport;
    pendingImport = null;
    document.getElementById(IMPORT_DIALOG_ID)?.close();
    if (!pending) return;
    const result = ctx.store.replace(pending.state);
    if (!result.ok) {
      ctx.toast('Не выполнено: не хватает места в браузере для резервной копии');
      return;
    }
    ctx.toast(pending.doneMessage, { actionLabel: 'Отменить', onAction: () => undoImport(ctx) });
  },
  cancelImport() {
    pendingImport = null;
    document.getElementById(IMPORT_DIALOG_ID)?.close();
  },
  undoImport,
};
