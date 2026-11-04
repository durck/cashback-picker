// Persistent document: schema, defaults, validation, migrations, storage,
// export/import, and entity reducers. Pure functions; storage is injected.
import { DEFAULT_BANKS } from '../data/banks.js';
import { DEFAULT_MCC_GROUPS } from '../data/mcc-groups.js';
import { DEFAULT_STORES } from '../data/stores.js';
import { isMonthKey } from './months.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'cashbackPicker.state';
export const BACKUP_KEY = `${STORAGE_KEY}.backup`;
export const CORRUPT_KEY = `${STORAGE_KEY}.corrupt`;
export const APP_MARKER = 'cashback-picker';
const EXPORT_REMINDER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    banks: structuredClone(DEFAULT_BANKS),
    mccGroups: structuredClone(DEFAULT_MCC_GROUPS),
    stores: structuredClone(DEFAULT_STORES),
    plans: [],
    purchases: [],
    settings: {},
  };
}

// --- Validation -----------------------------------------------------------

const isText = (v) => typeof v === 'string' && v.length > 0;
const isNonNegative = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isLimit = (v) => v === null || isNonNegative(v);
const isCode = (v) => Number.isInteger(v) && v >= 0 && v <= 9999;
const isRange = (v) => Array.isArray(v) && v.length === 2 && isCode(v[0]) && isCode(v[1]) && v[0] <= v[1];
const isCodes = (v) => Array.isArray(v) && v.every((code) => isCode(code) || isRange(code));
const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCategory = (c) => Boolean(c) && isText(c.id) && isText(c.name)
  && isNonNegative(c.percent) && isCodes(c.codes) && isLimit(c.limit ?? null);

const ENTITY_RULES = {
  banks: {
    id: isText, name: isText, basePercent: isNonNegative, valueCoef: isNonNegative,
    rewardType: (v) => v === 'rub' || v === 'points', monthlyLimit: isLimit,
  },
  mccGroups: { id: isText, name: isText, codes: isCodes },
  stores: {
    id: isText, name: isText, mcc: isCode,
    aliases: (v) => Array.isArray(v) && v.every((alias) => typeof alias === 'string'),
  },
  plans: {
    month: isMonthKey, bankId: isText,
    categories: (v) => Array.isArray(v) && v.every(isCategory),
  },
  purchases: { id: isText, date: isDateKey, bankId: isText, amount: isNonNegative, reward: isNonNegative },
};

function entityErrors(key, items, rules) {
  if (!Array.isArray(items)) return [`${key}: ожидается массив`];
  return items.flatMap((item, index) => Object.entries(rules)
    .filter(([field, check]) => !check(item?.[field]))
    .map(([field]) => `${key}[${index}].${field}: неверное значение`));
}

// Returns a list of human-readable problems; empty list means valid.
export function validate(doc) {
  if (!doc || typeof doc !== 'object') return ['документ не является объектом'];
  const errors = Object.entries(ENTITY_RULES).flatMap(([key, rules]) => entityErrors(key, doc[key], rules));
  if (doc.schemaVersion !== SCHEMA_VERSION) errors.unshift(`schemaVersion: ожидается ${SCHEMA_VERSION}`);
  if (!doc.settings || typeof doc.settings !== 'object') errors.push('settings: ожидается объект');
  return errors;
}

// --- Migrations -----------------------------------------------------------

const BANK_FIELD_DEFAULTS = {
  color: '#888888', order: 99, enabled: true, basePercent: 0,
  rewardType: 'rub', pointsName: '', valueCoef: 1, monthlyLimit: null,
};
const STORE_FIELD_DEFAULTS = { aliases: [], note: '', usedCount: 0, lastUsedAt: null };

// MIGRATIONS[n] upgrades a document from schema n to n + 1.
const MIGRATIONS = {
  // v0: hand-made or pre-release documents without schemaVersion.
  0: (doc) => {
    const defaults = createDefaultState();
    return {
      banks: (doc.banks ?? defaults.banks).map((bank) => ({ ...BANK_FIELD_DEFAULTS, ...bank })),
      mccGroups: doc.mccGroups ?? defaults.mccGroups,
      stores: (doc.stores ?? defaults.stores).map((store) => ({ ...STORE_FIELD_DEFAULTS, ...store })),
      plans: doc.plans ?? [],
      purchases: doc.purchases ?? [],
      settings: doc.settings ?? {},
    };
  },
};

export function migrate(doc, migrations = MIGRATIONS, target = SCHEMA_VERSION) {
  let current = doc;
  for (let version = doc.schemaVersion ?? 0; version < target; version += 1) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from schema v${version}`);
    current = { ...step(current), schemaVersion: version + 1 };
  }
  return current;
}

// --- Parsing, storage, export/import --------------------------------------

const fail = (error) => ({ ok: false, error });

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return fail('Это не JSON — файл повреждён или выбран не тот файл');
  }
}

function upgrade(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail('Данные повреждены: ожидается объект');
  const version = doc.schemaVersion ?? 0;
  if (!Number.isInteger(version) || version < 0) return fail('Данные повреждены: неизвестная версия схемы');
  if (version > SCHEMA_VERSION) return fail('Данные из более новой версии приложения. Обновите приложение.');
  let migrated;
  try {
    migrated = migrate(doc);
  } catch (error) {
    return fail(`Данные повреждены: ${error.message}`);
  }
  const errors = validate(migrated);
  if (errors.length > 0) return fail(`Данные повреждены: ${errors.slice(0, 3).join('; ')}`);
  return { ok: true, state: migrated, migrated: version < SCHEMA_VERSION };
}

export function keepCorrupt(storage, raw) {
  try {
    storage.setItem(CORRUPT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function loadCorrupt(storage) {
  try {
    return storage.getItem(CORRUPT_KEY);
  } catch {
    return null;
  }
}

function removeKey(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const clearCorrupt = (storage) => removeKey(storage, CORRUPT_KEY);

// status: 'fresh' | 'loaded' | 'migrated' | 'recovered' | 'unavailable'
export function load(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    return { state: createDefaultState(), status: 'unavailable', error: error.message };
  }
  if (raw == null) return { state: createDefaultState(), status: 'fresh' };
  const parsed = parseJson(raw);
  const result = parsed.ok ? upgrade(parsed.value) : parsed;
  if (result.ok) return { state: result.state, status: result.migrated ? 'migrated' : 'loaded' };
  keepCorrupt(storage, raw);
  return { state: createDefaultState(), status: 'recovered', error: result.error };
}

export function save(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.name === 'QuotaExceededError' ? 'quota' : 'unavailable' };
  }
}

export function exportDoc(state, { now }) {
  return JSON.stringify({ app: APP_MARKER, exportedAt: now.toISOString(), ...state }, null, 2);
}

// Full replacement document; the caller keeps a backup for undo.
export function importDoc(json) {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const { app, exportedAt, ...doc } = parsed.value ?? {};
  if (app !== APP_MARKER) return fail('Это не резервная копия «Какой картой?»');
  return upgrade(doc);
}

// Counts shown before an import replaces everything.
export function summarizeDoc(state) {
  const planned = state.plans.filter((plan) => plan.categories.length > 0);
  return {
    banks: state.banks.length,
    stores: state.stores.length,
    groups: state.mccGroups.length,
    months: new Set(planned.map((plan) => plan.month)).size,
    categories: planned.reduce((sum, plan) => sum + plan.categories.length, 0),
    purchases: state.purchases.length,
  };
}

const hasUserData = (state) => state.purchases.length > 0 || state.plans.some((p) => p.categories.length > 0);

// True when there is something worth saving and no export for 30 days.
export function exportReminderDue(state, now) {
  if (!hasUserData(state)) return false;
  const last = Date.parse(state.settings.lastExportAt ?? '');
  return Number.isNaN(last) || now.getTime() - last > EXPORT_REMINDER_DAYS * DAY_MS;
}

export function saveBackup(storage, state) {
  try {
    storage.setItem(BACKUP_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.name === 'QuotaExceededError' ? 'quota' : 'unavailable' };
  }
}

// { ok, state } with the pre-import document, or { ok: false } when there is none.
export function loadBackup(storage) {
  let raw = null;
  try {
    raw = storage.getItem(BACKUP_KEY);
  } catch (error) {
    return fail(`Хранилище недоступно: ${error.message}`);
  }
  if (raw == null) return fail('Резервной копии нет');
  const parsed = parseJson(raw);
  return parsed.ok ? upgrade(parsed.value) : parsed;
}

export const clearBackup = (storage) => removeKey(storage, BACKUP_KEY);

// --- Salvaging a damaged copy ---------------------------------------------

const asList = (value) => (Array.isArray(value) ? value : []);
const isValidRecord = (record, rules) => Object.entries(rules).every(([field, check]) => check(record?.[field]));

function salvageRecords(items, rules, fieldDefaults = {}) {
  const list = asList(items);
  const valid = list.map((item) => ({ ...fieldDefaults, ...item })).filter((item) => isValidRecord(item, rules));
  return { valid, dropped: list.length - valid.length };
}

function salvagePlans(items) {
  const list = asList(items);
  const usable = list.filter((plan) => isMonthKey(plan?.month) && isText(plan?.bankId) && Array.isArray(plan?.categories));
  const valid = usable.map((plan) => ({ ...plan, categories: plan.categories.filter(isCategory) }));
  const droppedCategories = usable.reduce((sum, plan, i) => sum + plan.categories.length - valid[i].categories.length, 0);
  return { valid, dropped: list.length - usable.length + droppedCategories };
}

// Rebuilds a document from a damaged copy: invalid records are dropped and empty
// reference data falls back to the presets. Unparsable JSON cannot be salvaged.
export function salvageDoc(raw) {
  const parsed = parseJson(raw);
  const doc = parsed.ok ? parsed.value : null;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return fail('Копия повреждена так, что восстановить её автоматически нельзя.');
  }
  if (doc.schemaVersion > SCHEMA_VERSION) return fail('Данные из более новой версии приложения. Обновите приложение.');
  const banks = salvageRecords(doc.banks, ENTITY_RULES.banks, BANK_FIELD_DEFAULTS);
  const mccGroups = salvageRecords(doc.mccGroups, ENTITY_RULES.mccGroups);
  const stores = salvageRecords(doc.stores, ENTITY_RULES.stores, STORE_FIELD_DEFAULTS);
  const plans = salvagePlans(doc.plans);
  const purchases = salvageRecords(doc.purchases, ENTITY_RULES.purchases);
  const defaults = createDefaultState();
  const orPreset = (part, preset) => (part.valid.length ? part.valid : preset);
  const state = {
    schemaVersion: SCHEMA_VERSION,
    banks: orPreset(banks, defaults.banks),
    mccGroups: orPreset(mccGroups, defaults.mccGroups),
    stores: orPreset(stores, defaults.stores),
    plans: plans.valid,
    purchases: purchases.valid,
    settings: doc.settings && typeof doc.settings === 'object' ? doc.settings : {},
  };
  const dropped = [banks, mccGroups, stores, plans, purchases].reduce((sum, part) => sum + part.dropped, 0);
  return { ok: true, state, dropped };
}

// --- Entity reducers ------------------------------------------------------

function upsertById(items, item) {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];
}

export const upsertStore = (state, store) => ({ ...state, stores: upsertById(state.stores, store) });
export const removeStore = (state, storeId) => ({ ...state, stores: state.stores.filter((s) => s.id !== storeId) });
export const upsertBank = (state, bank) => ({ ...state, banks: upsertById(state.banks, bank) });
export const upsertGroup = (state, group) => ({ ...state, mccGroups: upsertById(state.mccGroups, group) });
export const removeGroup = (state, groupId) => ({
  ...state, mccGroups: state.mccGroups.filter((g) => g.id !== groupId),
});

// Moves a bank one step up (delta = -1) or down (+1) and renumbers order 1..n.
export function moveBank(state, bankId, delta) {
  const sorted = [...state.banks].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((bank) => bank.id === bankId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sorted.length) return state;
  [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  const orderById = new Map(sorted.map((bank, index) => [bank.id, index + 1]));
  return { ...state, banks: state.banks.map((bank) => ({ ...bank, order: orderById.get(bank.id) })) };
}

export function touchStore(state, storeId, nowIso) {
  return {
    ...state,
    stores: state.stores.map((store) => (store.id === storeId
      ? { ...store, usedCount: (store.usedCount ?? 0) + 1, lastUsedAt: nowIso }
      : store)),
  };
}

export function setSetting(state, key, value) {
  return { ...state, settings: { ...state.settings, [key]: value } };
}
