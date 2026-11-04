// A category that overlaps a searched group only partly must be marked as such.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codesCover } from '../src/core/match.js';
import { rankBanks } from '../src/core/rank.js';
import { category, makeState, plan, purchase } from './helpers.js';

const MONTH = '2026-11';
const FUEL = [5541, 5542];
const AIR = [[3000, 3350], 4511];

function vtbRow(categories, codes, purchases = []) {
  const state = makeState({ plans: [plan(MONTH, 'vtb', categories)], purchases });
  return rankBanks(state, { codes, month: MONTH }).find((row) => row.bank.id === 'vtb');
}

test('codesCover checks every required code', () => {
  assert.equal(codesCover([5541, 5542, 5552], FUEL), true);
  assert.equal(codesCover([5542], FUEL), false);
  assert.equal(codesCover([], FUEL), false);
  assert.equal(codesCover([5411], []), true);
});

test('codesCover handles ranges on both sides', () => {
  assert.equal(codesCover(AIR, [3011]), true);
  assert.equal(codesCover(AIR, AIR), true);
  assert.equal(codesCover([[3000, 3100]], [[3000, 3350]]), false);
  assert.equal(codesCover([[3000, 3350]], [[3000, 3351]]), false);
});

test('codesCover joins adjacent and overlapping ranges', () => {
  assert.equal(codesCover([[3000, 3200], [3201, 3350]], [[3000, 3350]]), true);
  assert.equal(codesCover([[3100, 3350], [3000, 3150]], [[3000, 3350]]), true);
  assert.equal(codesCover([5541, 5542], [[5541, 5542]]), true);
  assert.equal(codesCover([[3000, 3200], [3202, 3350]], [[3000, 3350]]), false);
});

test('a category covering part of the group is partial', () => {
  const row = vtbRow([category('fuel', 4, [5542])], FUEL);
  assert.equal(row.category.id, 'fuel');
  assert.equal(row.partial, true);
});

test('a category covering the whole group is not partial', () => {
  assert.equal(vtbRow([category('fuel', 4, [5541, 5542, 5552])], FUEL).partial, false);
  assert.equal(vtbRow([category('air', 4, AIR)], AIR).partial, false);
});

test('a single MCC target is never partial', () => {
  assert.equal(vtbRow([category('fuel', 4, [5542])], [5542]).partial, false);
});

test('base percent and exhausted rows are not partial', () => {
  assert.equal(vtbRow([], FUEL).partial, false);
  const spent = [purchase('p1', '2026-11-02', 'vtb', 'fuel', 10)];
  const row = vtbRow([category('fuel', 4, [5542], 10)], FUEL, spent);
  assert.equal(row.exhausted, 'category');
  assert.equal(row.partial, false);
});

test('an exhausted bank limit hides the partial mark', () => {
  const banks = makeState().banks.map((b) => (b.id === 'vtb' ? { ...b, monthlyLimit: 10 } : b));
  const state = makeState({
    banks,
    plans: [plan(MONTH, 'vtb', [category('fuel', 4, [5542])])],
    purchases: [purchase('p1', '2026-11-02', 'vtb', 'fuel', 10)],
  });
  const row = rankBanks(state, { codes: FUEL, month: MONTH }).find((r) => r.bank.id === 'vtb');
  assert.equal(row.exhausted, 'bank');
  assert.equal(row.partial, false);
});
