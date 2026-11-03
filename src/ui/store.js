// In-memory state holder. The only place that writes the document to storage.
import {
  save, saveBackup, loadBackup, clearBackup, BACKUP_KEY,
} from '../core/state.js';

export function createStore(initial, storage) {
  let state = initial;
  const listeners = new Set();
  const notify = (result) => listeners.forEach((listener) => listener(state, result));

  function set(update) {
    state = typeof update === 'function' ? update(state) : update;
    const result = save(storage, state);
    notify(result);
    return result;
  }

  return {
    get: () => state,
    set,
    // Replaces the whole document (import) after backing up the current one.
    replace(next) {
      const backup = saveBackup(storage, state);
      if (!backup.ok) return backup;
      return set(next);
    },
    hasBackup() {
      try {
        return storage.getItem(BACKUP_KEY) !== null;
      } catch {
        return false;
      }
    },
    restoreBackup() {
      const backup = loadBackup(storage);
      if (!backup.ok) return backup;
      const result = set(backup.state);
      if (result.ok) clearBackup(storage);
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
