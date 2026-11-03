// In-memory state holder. The only place that writes the document to storage.
import { save } from '../core/state.js';

export function createStore(initial, storage) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(update) {
      state = typeof update === 'function' ? update(state) : update;
      const result = save(storage, state);
      listeners.forEach((listener) => listener(state, result));
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
