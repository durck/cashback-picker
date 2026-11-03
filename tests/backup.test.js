// Phase 4 core: import summary, export reminder and the pre-import backup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BACKUP_KEY, summarizeDoc, exportReminderDue, saveBackup, loadBackup, clearBackup, createDefaultState,
} from '../src/core/state.js';
import { createStore } from '../src/ui/store.js';
import { MemoryStorage, category, makeState, plan, purchase } from './helpers.js';

const fixtureV1 = () => JSON.parse(readFileSync(new URL('./fixtures/state-v1.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-11-04T12:00:00.000Z');

test('summarizeDoc counts what an import would bring', () => {
  const state = makeState({
    plans: [
      plan('2026-10', 'sber', [category('a', 5, [5411]), category('b', 3, [5814])]),
      plan('2026-11', 'sber', [category('c', 5, [5411])]),
      plan('2026-12', 'sber', []),
    ],
    purchases: [purchase('p1', '2026-11-01', 'sber', 'c', 10)],
  });
  assert.deepEqual(summarizeDoc(state), { banks: 3, stores: 0, groups: 0, months: 2, categories: 3, purchases: 1 });
});

test('exportReminderDue stays quiet without user data', () => {
  assert.equal(exportReminderDue(createDefaultState(), NOW), false);
});

test('exportReminderDue asks for a first backup and repeats after 30 days', () => {
  const withData = makeState({ purchases: [purchase('p1', '2026-11-01', 'sber', null, 1)] });
  assert.equal(exportReminderDue(withData, NOW), true);
  const recent = { ...withData, settings: { lastExportAt: '2026-10-20T12:00:00.000Z' } };
  assert.equal(exportReminderDue(recent, NOW), false);
  const stale = { ...withData, settings: { lastExportAt: '2026-10-04T11:00:00.000Z' } };
  assert.equal(exportReminderDue(stale, NOW), true);
});

test('backup saves, loads and clears the previous document', () => {
  const storage = new MemoryStorage();
  assert.equal(loadBackup(storage).ok, false);
  assert.deepEqual(saveBackup(storage, fixtureV1()), { ok: true });
  const loaded = loadBackup(storage);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.state, fixtureV1());
  assert.equal(clearBackup(storage), true);
  assert.equal(storage.getItem(BACKUP_KEY), null);
});

test('store.replace keeps a backup that restoreBackup brings back', () => {
  const storage = new MemoryStorage();
  const original = fixtureV1();
  const store = createStore(original, storage);
  assert.equal(store.hasBackup(), false);

  store.replace(createDefaultState());
  assert.equal(store.get().purchases.length, 0);
  assert.equal(store.hasBackup(), true);

  assert.equal(store.restoreBackup().ok, true);
  assert.deepEqual(store.get(), original);
  assert.equal(store.hasBackup(), false);
});
