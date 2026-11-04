// Damaged stored data: the raw copy is kept, and whatever is valid can be restored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CORRUPT_KEY, SCHEMA_VERSION, STORAGE_KEY, createDefaultState, load, loadCorrupt, clearCorrupt,
  keepCorrupt, salvageDoc, validate,
} from '../src/core/state.js';
import { createStore } from '../src/ui/store.js';
import { MemoryStorage } from './helpers.js';

const fixtureV1 = () => JSON.parse(readFileSync(new URL('./fixtures/state-v1.json', import.meta.url), 'utf8'));
const salvage = (doc) => salvageDoc(JSON.stringify(doc));

test('salvageDoc keeps a valid document whole', () => {
  const result = salvage(fixtureV1());
  assert.equal(result.ok, true);
  assert.equal(result.dropped, 0);
  assert.deepEqual(result.state, fixtureV1());
});

test('salvageDoc drops invalid records and counts them', () => {
  const doc = fixtureV1();
  doc.purchases.push({ id: 'bad', date: 'not-a-date', bankId: 'sber', amount: 1, reward: 1 });
  doc.stores.push({ id: 'broken', name: 'Без MCC' });
  const result = salvage(doc);
  assert.equal(result.dropped, 2);
  assert.deepEqual(result.state.purchases.map((p) => p.id), ['p1']);
  assert.deepEqual(result.state.stores.map((s) => s.id), ['pyaterochka']);
  assert.deepEqual(validate(result.state), []);
});

test('salvageDoc keeps a plan when only one of its categories is broken', () => {
  const doc = fixtureV1();
  doc.plans[0].categories.push({ id: 'bad', name: 'Без кодов', percent: 5, codes: 'x' });
  const result = salvage(doc);
  assert.equal(result.dropped, 1);
  assert.deepEqual(result.state.plans[0].categories.map((c) => c.id), ['c1']);
});

test('salvageDoc drops a plan with a broken month', () => {
  const doc = fixtureV1();
  doc.plans.push({ month: 'осень', bankId: 'sber', categories: [] });
  const result = salvage(doc);
  assert.equal(result.dropped, 1);
  assert.equal(result.state.plans.length, 1);
});

test('salvageDoc falls back to presets when reference data is unusable', () => {
  const doc = fixtureV1();
  doc.banks = 'сломано';
  delete doc.mccGroups;
  doc.stores = [{ id: 'x' }];
  const result = salvage(doc);
  const defaults = createDefaultState();
  assert.equal(result.state.banks.length, defaults.banks.length);
  assert.equal(result.state.mccGroups.length, defaults.mccGroups.length);
  assert.equal(result.state.stores.length, defaults.stores.length);
  assert.deepEqual(result.state.purchases.map((p) => p.id), ['p1']);
  assert.deepEqual(validate(result.state), []);
});

test('salvageDoc fills optional fields of surviving records', () => {
  const doc = fixtureV1();
  doc.banks = [{ id: 'mine', name: 'Мой банк' }];
  doc.stores = [{ id: 'shop', name: 'Лавка', mcc: 5411 }];
  delete doc.settings;
  const { state } = salvage(doc);
  assert.equal(state.banks[0].valueCoef, 1);
  assert.equal(state.banks[0].enabled, true);
  assert.deepEqual(state.stores[0].aliases, []);
  assert.deepEqual(state.settings, {});
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(validate(state), []);
});

test('salvageDoc refuses what it cannot read', () => {
  assert.equal(salvageDoc('{"banks": [').ok, false);
  assert.equal(salvageDoc('[1, 2]').ok, false);
  assert.equal(salvageDoc('null').ok, false);
  const newer = salvage({ ...fixtureV1(), schemaVersion: SCHEMA_VERSION + 1 });
  assert.equal(newer.ok, false);
  assert.match(newer.error, /Обновите приложение/);
});

test('a corrupt copy kept by load can be read and cleared', () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: '{broken' });
  assert.equal(loadCorrupt(storage), null);
  assert.equal(load(storage).status, 'recovered');
  assert.equal(loadCorrupt(storage), '{broken');
  assert.equal(clearCorrupt(storage), true);
  assert.equal(loadCorrupt(storage), null);
  assert.equal(keepCorrupt(storage, '{again'), true);
  assert.equal(loadCorrupt(storage), '{again');
});

test('corrupt helpers survive unavailable storage', () => {
  const storage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  assert.equal(loadCorrupt(storage), null);
  assert.equal(clearCorrupt(storage), false);
  assert.equal(keepCorrupt(storage, 'x'), false);
});

test('store exposes the corrupt copy for the recovery screen', () => {
  const storage = new MemoryStorage({ [CORRUPT_KEY]: '{broken' });
  const store = createStore(createDefaultState(), storage);
  assert.equal(store.corruptCopy(), '{broken');
  store.clearCorrupt();
  assert.equal(store.corruptCopy(), null);
  store.keepCorrupt('{back');
  assert.equal(store.corruptCopy(), '{back');
});
