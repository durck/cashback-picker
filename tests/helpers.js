// Shared builders for deterministic core tests.
export function bank(id, overrides = {}) {
  return {
    id, name: id, color: '#000000', order: 1, enabled: true,
    basePercent: 1, rewardType: 'rub', pointsName: '',
    valueCoef: 1, monthlyLimit: null, ...overrides,
  };
}

export function makeState(overrides = {}) {
  return {
    schemaVersion: 1,
    banks: [
      bank('sber', { order: 1, basePercent: 0.5, rewardType: 'points', pointsName: 'Спасибо', valueCoef: 0.8 }),
      bank('tbank', { order: 2, basePercent: 1 }),
      bank('vtb', { order: 3, basePercent: 0 }),
    ],
    mccGroups: [],
    stores: [],
    plans: [],
    purchases: [],
    settings: {},
    ...overrides,
  };
}

export const category = (id, percent, codes, limit = null) => ({ id, name: id, percent, codes, limit });

export const plan = (month, bankId, categories) => ({ month, bankId, categories });

export const purchase = (id, date, bankId, categoryId, reward, amount = 1000, mcc = 5411) => ({
  id, date, bankId, categoryId, mcc, amount, reward,
});

export function sequentialIds(prefix = 'id') {
  let counter = 0;
  return () => `${prefix}-${++counter}`;
}

export class MemoryStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}
