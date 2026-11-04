// Damaged stored data (kept aside by load): download it, restore what survived, or delete it.
import { salvageDoc } from '../core/state.js';
import { dateKey } from '../core/months.js';
import { html } from './format.js';
import { offerReplace, saveFile } from './backup.js';

export function corruptCard(ctx) {
  const raw = ctx.store.corruptCopy();
  if (raw === null) return '';
  const salvage = salvageDoc(raw);
  const restore = salvage.ok
    ? html`<button type="button" class="btn btn-primary" data-click="restoreCorrupt">Восстановить уцелевшее</button>`
    : '';
  const note = salvage.ok
    ? 'Часть данных можно восстановить. Текущие данные при этом сохранятся отдельно, восстановление можно отменить.'
    : salvage.error;
  return html`
    <article class="card card-alert">
      <h2 class="card-title">Найдена повреждённая копия данных</h2>
      <p class="small">Сохранённые данные не удалось прочитать, поэтому приложение открылось с заготовками, а старые данные отложило.</p>
      <p class="muted small">${note}</p>
      <div class="card-buttons">
        ${restore}
        <button type="button" class="btn" data-click="downloadCorrupt">Скачать повреждённые данные</button>
        <button type="button" class="btn" data-click="discardCorrupt">Удалить копию</button>
      </div>
    </article>`;
}

export const recoveryActions = {
  restoreCorrupt(ctx) {
    const salvage = salvageDoc(ctx.store.corruptCopy() ?? '');
    if (!salvage.ok) {
      ctx.toast(salvage.error);
      return;
    }
    const lost = salvage.dropped > 0 ? ` Повреждённых записей отброшено: ${salvage.dropped}.` : '';
    offerReplace(salvage.state, { intro: 'Удастся восстановить', outro: lost, doneMessage: 'Данные восстановлены' });
  },
  downloadCorrupt(ctx) {
    const raw = ctx.store.corruptCopy();
    if (raw === null) return;
    const name = `cashback-picker-corrupt-${dateKey(ctx.now())}.json`;
    saveFile(new File([raw], name, { type: 'application/json' }), 'Повреждённые данные «Какой картой?»')
      .then((saved) => {
        if (saved) ctx.toast('Копия сохранена в файл');
      })
      .catch((error) => ctx.toast(`Не удалось сохранить файл: ${error.message}`));
  },
  discardCorrupt(ctx) {
    const raw = ctx.store.corruptCopy();
    if (raw === null) return;
    ctx.store.clearCorrupt();
    ctx.rerender();
    ctx.toast('Копия удалена', {
      actionLabel: 'Вернуть',
      onAction: () => {
        ctx.store.keepCorrupt(raw);
        ctx.rerender();
      },
    });
  },
};
