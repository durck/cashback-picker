// Persistent document: schema, defaults, validation, migrations, storage,
// export/import, and entity reducers. Pure functions; storage is injected.
import { DEFAULT_BANKS } from '../data/banks.js';
import { DEFAULT_MCC_GROUPS } from '../data/mcc-groups.js';
import { DEFAULT_STORES } from '../data/stores.js';
import { isMonthKey } from './months.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'cashbackPicker.state';
export const APP_MARKER = 'cashback-picker';

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

function keepCorrupt(storage, raw) {
  try {
    storage.setItem(`${STORAGE_KEY}.corrupt`, raw);
    return true;
  } catch {
    return false;
  }
}

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

// --- Entity reducers ------------------------------------------------------

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
