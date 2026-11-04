// In-memory state holder. The only place that writes the document to storage.
import {
  save, saveBackup, loadBackup, clearBackup, BACKUP_KEY, loadCorrupt, keepCorrupt, clearCorrupt,
} from '../core/state.js';

function corruptMethods(storage) {
  return {
    corruptCopy: () => loadCorrupt(storage),
    keepCorrupt: (raw) => keepCorrupt(storage, raw),
    clearCorrupt: () => clearCorrupt(storage),
  };
}

function backupMethods(storage, { get, set, write, notify }) {
  return {
    // Replaces the whole document (import) after backing up the current one.
    replace(next) {
      const backup = saveBackup(storage, get());
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
    // The backup goes before listeners run, so a re-render no longer offers it.
    restoreBackup() {
      const backup = loadBackup(storage);
      if (!backup.ok) return backup;
      const result = write(backup.state);
      if (result.ok) clearBackup(storage);
      notify(result);
      return result;
    },
  };
}

export function createStore(initial, storage) {
  let state = initial;
  const listeners = new Set();
  const get = () => state;
  const notify = (result) => listeners.forEach((listener) => listener(state, result));

  function write(update) {
    state = typeof update === 'function' ? update(state) : update;
    return save(storage, state);
  }

  function set(update) {
    const result = write(update);
    notify(result);
    return result;
  }

  return {
    get,
    set,
    ...backupMethods(storage, { get, set, write, notify }),
    ...corruptMethods(storage),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
