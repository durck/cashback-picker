import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCHEMA_VERSION, STORAGE_KEY, createDefaultState, validate, migrate, load, save,
  exportDoc, importDoc, touchStore, setSetting,
} from '../src/core/state.js';
import { MemoryStorage } from './helpers.js';

const fixtureV1 = () => JSON.parse(readFileSync(new URL('./fixtures/state-v1.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-11-03T12:00:00.000Z');

test('default state has seven enabled banks and a valid starter set', () => {
  const state = createDefaultState();
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.banks.length, 7);
  assert.ok(state.banks.every((b) => b.enabled));
  assert.ok(state.stores.length >= 55, `stores: ${state.stores.length}`);
  assert.ok(state.stores.every((s) => s.note === 'ориентировочно'));
  assert.deepEqual(validate(state), []);
});

test('default state ids are unique', () => {
  const state = createDefaultState();
  for (const key of ['banks', 'mccGroups', 'stores']) {
    const ids = state[key].map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, key);
  }
});

test('default state is a fresh copy every time', () => {
  const first = createDefaultState();
  first.banks[0].basePercent = 99;
  first.mccGroups[0].codes.push(1);
  const second = createDefaultState();
  assert.notEqual(second.banks[0].basePercent, 99);
  assert.ok(!second.mccGroups[0].codes.includes(1));
});

test('validate reports broken entities', () => {
  const state = fixtureV1();
  state.banks[0].rewardType = 'gold';
  state.plans[0].categories[0].codes = ['x'];
  delete state.purchases;
  const errors = validate(state);
  assert.ok(errors.some((e) => e.startsWith('banks[0].rewardType')));
  assert.ok(errors.some((e) => e.startsWith('plans[0].categories')));
  assert.ok(errors.some((e) => e.startsWith('purchases')));
});

test('migrate keeps a current v1 fixture unchanged and valid', () => {
  const migrated = migrate(fixtureV1());
  assert.deepEqual(migrated, fixtureV1());
  assert.deepEqual(validate(migrated), []);
});

test('migrate upgrades a v0 document without schemaVersion', () => {
  const { schemaVersion, settings, ...legacy } = fixtureV1();
  delete legacy.banks[0].valueCoef;
  delete legacy.purchases;
  const migrated = migrate(legacy);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.banks[0].valueCoef, 1);
  assert.deepEqual(migrated.purchases, []);
  assert.deepEqual(migrated.settings, {});
  assert.deepEqual(validate(migrated), []);
});

test('migrate applies steps in order up to the target version', () => {
  const steps = {
    1: (doc) => ({ ...doc, trail: [...(doc.trail ?? []), 'v2'] }),
    2: (doc) => ({ ...doc, trail: [...doc.trail, 'v3'] }),
  };
  const migrated = migrate(fixtureV1(), steps, 3);
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.trail, ['v2', 'v3']);
});

test('load starts fresh on empty storage', () => {
  const { state, status } = load(new MemoryStorage());
  assert.equal(status, 'fresh');
  assert.deepEqual(state, createDefaultState());
});

test('save then load returns the same state', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(save(storage, fixtureV1()), { ok: true });
  const { state, status } = load(storage);
  assert.equal(status, 'loaded');
  assert.deepEqual(state, fixtureV1());
});

test('load migrates an older stored document', () => {
  const { schemaVersion, ...legacy } = fixtureV1();
  const { state, status } = load(new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(legacy) }));
  assert.equal(status, 'migrated');
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
});

test('load recovers from corrupt JSON and keeps the raw copy', () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: '{"schemaVersion": 1, "banks": [' });
  const { state, status } = load(storage);
  assert.equal(status, 'recovered');
  assert.equal(state.banks.length, 7);
  assert.equal(storage.getItem(`${STORAGE_KEY}.corrupt`), '{"schemaVersion": 1, "banks": [');
});

test('load does not crash when storage is unavailable', () => {
  const storage = { getItem() { throw new Error('SecurityError'); } };
  const { state, status } = load(storage);
  assert.equal(status, 'unavailable');
  assert.equal(state.banks.length, 7);
});

test('save reports a full storage instead of throwing', () => {
  const storage = {
    setItem() {
      const error = new Error('full');
      error.name = 'QuotaExceededError';
      throw error;
    },
  };
  assert.deepEqual(save(storage, fixtureV1()), { ok: false, error: 'quota' });
});

test('export then import restores everything without loss', () => {
  const original = fixtureV1();
  const json = exportDoc(original, { now: NOW });
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, 'cashback-picker');
  assert.equal(parsed.exportedAt, NOW.toISOString());

  const result = importDoc(json);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, original);
});

test('import rejects foreign, newer, broken and invalid documents', () => {
  const doc = { ...fixtureV1(), app: 'cashback-picker' };
  assert.match(importDoc(JSON.stringify({ ...doc, app: 'other' })).error, /не резервная копия/);
  assert.match(importDoc(JSON.stringify({ ...doc, schemaVersion: SCHEMA_VERSION + 1 })).error, /Обновите приложение/);
  assert.match(importDoc('{oops').error, /не JSON/);
  assert.match(importDoc(JSON.stringify({ ...doc, banks: 'none' })).error, /повреждены/);
});

test('touchStore counts a selection and records its time', () => {
  const state = fixtureV1();
  const next = touchStore(state, 'pyaterochka', NOW.toISOString());
  assert.equal(next.stores[0].usedCount, 4);
  assert.equal(next.stores[0].lastUsedAt, NOW.toISOString());
  assert.equal(state.stores[0].usedCount, 3);
});

test('setSetting stores a value without mutating the input', () => {
  const state = fixtureV1();
  const next = setSetting(state, 'bannerDismissed', '2026-11');
  assert.equal(next.settings.bannerDismissed, '2026-11');
  assert.equal(state.settings.bannerDismissed, undefined);
});
