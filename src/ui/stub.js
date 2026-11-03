// Placeholder for screens that are not built yet.
import { html } from './format.js';

export function stubScreen(title) {
  return {
    render: () => html`
      <section class="screen">
        <h1 class="screen-title">${title}</h1>
        <p class="hint">Раздел появится в следующей версии.</p>
      </section>`,
    actions: {},
  };
}
