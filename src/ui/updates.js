// Service worker registration and the «Доступна новая версия → Обновить» flow.
let registration = null;
let updateRequested = false;

function offerUpdate(worker, toast) {
  toast('Доступна новая версия', {
    actionLabel: 'Обновить',
    persistent: true,
    onAction: () => {
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
  });
}

function watchInstalling(worker, toast) {
  worker?.addEventListener('statechange', () => {
    // Without a controller this is the first install, not an update.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker, toast);
  });
}

export function registerServiceWorker(toast) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
  });
  navigator.serviceWorker.register('./sw.js')
    .then((reg) => {
      registration = reg;
      // The browser may have found the update during navigation, before this listener.
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting, toast);
      else watchInstalling(reg.installing, toast);
      reg.addEventListener('updatefound', () => watchInstalling(reg.installing, toast));
    })
    .catch((error) => toast(`Офлайн-режим не включился: ${error.message}`));
}

// 'unsupported' | 'none' | 'installing' | 'waiting'. A waiting update is offered
// right away; an installing one is offered by the statechange listener.
export async function checkForUpdates(toast) {
  if (!registration) return 'unsupported';
  await registration.update();
  if (registration.waiting) {
    offerUpdate(registration.waiting, toast);
    return 'waiting';
  }
  return registration.installing ? 'installing' : 'none';
}
