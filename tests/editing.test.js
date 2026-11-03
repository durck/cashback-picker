// Phase 3 behaviours: editing stores, banks and MCC groups changes search and ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCandidates, parseCodes } from '../src/core/match.js';
import { rankBanks } from '../src/core/rank.js';
import { overlappingCategories, upsertCategory } from '../src/core/months.js';
import {
  createDefaultState, upsertStore, removeStore, upsertBank, upsertGroup, removeGroup, moveBank, validate,
} from '../src/core/state.js';
import { category, makeState, plan } from './helpers.js';

const MONTH = '2026-11';
const bankById = (state, id) => state.banks.find((b) => b.id === id);
const rankedIds = (state, codes) => rankBanks(state, { codes, month: MONTH }).map((r) => r.bank.id);

test('a store found by a user-added alias', () => {
  const state = createDefaultState();
  const vkusvill = state.stores.find((s) => s.id === 'vkusvill');
  const next = upsertStore(state, { ...vkusvill, aliases: [...vkusvill.aliases, 'ВВ'] });
  assert.equal(findCandidates(next, 'вв')[0].store.id, 'vkusvill');
  assert.equal(findCandidates(next, 'Вкусвилл')[0].store.id, 'vkusvill');
  assert.equal(next.stores.length, state.stores.length);
});

test('a new store is added and can be removed', () => {
  const store = { id: 'mine', name: 'Кофейня у дома', aliases: [], mcc: 5814, note: '', usedCount: 0, lastUsedAt: null };
  const added = upsertStore(createDefaultState(), store);
  assert.equal(findCandidates(added, 'кофейня')[0].store.id, 'mine');
  assert.deepEqual(validate(added), []);
  assert.deepEqual(findCandidates(removeStore(added, 'mine'), 'кофейня'), []);
});

test('a disabled bank disappears from ranking', () => {
  const state = createDefaultState();
  const next = upsertBank(state, { ...bankById(state, 'ozon'), enabled: false });
  assert.ok(rankedIds(state, [5411]).includes('ozon'));
  assert.ok(!rankedIds(next, [5411]).includes('ozon'));
});

test('changing the Спасибо coefficient changes the order', () => {
  const state = makeState({
    plans: [plan(MONTH, 'sber', [category('sm', 5, [5411])]), plan(MONTH, 'tbank', [category('food', 4.5, [5411])])],
  });
  assert.deepEqual(rankedIds(state, [5411]).slice(0, 2), ['tbank', 'sber']);
  const next = upsertBank(state, { ...bankById(state, 'sber'), valueCoef: 1 });
  assert.deepEqual(rankedIds(next, [5411]).slice(0, 2), ['sber', 'tbank']);
});

test('a 3000-3299 range is saved in a group and matched through a category', () => {
  const { codes } = parseCodes('3000-3299, 4511');
  const state = upsertGroup(makeState(), { id: 'air', name: 'Авиа', codes });
  const group = state.mccGroups[0];
  assert.deepEqual(group.codes, [[3000, 3299], 4511]);

  const planned = upsertCategory(state, { month: MONTH, bankId: 'vtb', category: category('air', 6, group.codes) });
  const [first] = rankBanks(planned, { codes: [3011], month: MONTH });
  assert.equal(first.bank.id, 'vtb');
  assert.equal(first.category.id, 'air');
  assert.equal(rankBanks(planned, { codes: [3300], month: MONTH })[0].bank.id, 'tbank');
});

test('removeGroup deletes only that group', () => {
  const state = createDefaultState();
  const next = removeGroup(state, 'fuel');
  assert.equal(next.mccGroups.length, state.mccGroups.length - 1);
  assert.ok(!next.mccGroups.some((g) => g.id === 'fuel'));
});

test('moveBank swaps neighbours and renumbers order', () => {
  const state = makeState();
  const moved = moveBank(state, 'vtb', -1);
  const order = [...moved.banks].sort((a, b) => a.order - b.order).map((b) => b.id);
  assert.deepEqual(order, ['sber', 'vtb', 'tbank']);
  assert.deepEqual(moved.banks.map((b) => b.order).sort(), [1, 2, 3]);
  assert.equal(moveBank(state, 'sber', -1), state);
  assert.equal(moveBank(state, 'vtb', 1), state);
});

test('overlappingCategories finds other categories sharing a code', () => {
  const state = makeState({
    plans: [plan(MONTH, 'tbank', [category('food', 5, [5411, 5499]), category('cafe', 3, [5812])])],
  });
  const overlaps = overlappingCategories(state, { month: MONTH, bankId: 'tbank', codes: [5499] });
  assert.deepEqual(overlaps.map((c) => c.id), ['food']);
  assert.deepEqual(overlappingCategories(state, { month: MONTH, bankId: 'tbank', codes: [5411], exceptId: 'food' }), []);
});
