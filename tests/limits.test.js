import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  remaining, spent, purchasesFor, addPurchase, removePurchase, limitsOverview,
} from '../src/core/limits.js';
import { category, makeState, plan, purchase } from './helpers.js';

function limitedState(purchases = []) {
  const banks = makeState().banks.map((b) => (b.id === 'tbank' ? { ...b, monthlyLimit: 5000 } : b));
  return makeState({
    banks,
    plans: [
      plan('2026-11', 'tbank', [category('food', 5, [5411], 300), category('taxi', 3, [4121])]),
      plan('2026-12', 'tbank', [category('food', 5, [5411], 300)]),
    ],
    purchases,
  });
}

test('remaining is null when there is no limit', () => {
  assert.deepEqual(remaining(makeState(), { month: '2026-11', bankId: 'vtb' }), { category: null, bank: null });
  assert.equal(remaining(limitedState(), { month: '2026-11', bankId: 'tbank', categoryId: 'taxi' }).category, null);
});

test('remaining subtracts this month purchases from both limits', () => {
  const state = limitedState([
    purchase('p1', '2026-11-01', 'tbank', 'food', 100),
    purchase('p2', '2026-11-05', 'tbank', 'taxi', 40),
    purchase('p3', '2026-10-30', 'tbank', 'food', 250),
  ]);
  const left = remaining(state, { month: '2026-11', bankId: 'tbank', categoryId: 'food' });
  assert.deepEqual(left, { category: 200, bank: 4860 });
});

test('a new month starts with full limits', () => {
  const state = limitedState([purchase('p1', '2026-11-20', 'tbank', 'food', 300)]);
  assert.deepEqual(
    remaining(state, { month: '2026-12', bankId: 'tbank', categoryId: 'food' }),
    { category: 300, bank: 5000 },
  );
});

test('remaining never goes below zero', () => {
  const state = limitedState([purchase('p1', '2026-11-01', 'tbank', 'food', 450)]);
  assert.equal(remaining(state, { month: '2026-11', bankId: 'tbank', categoryId: 'food' }).category, 0);
});

test('spent sums rewards per bank and per category', () => {
  const state = limitedState([
    purchase('p1', '2026-11-01', 'tbank', 'food', 10.1),
    purchase('p2', '2026-11-02', 'tbank', 'food', 20.2),
    purchase('p3', '2026-11-03', 'tbank', null, 5),
  ]);
  assert.equal(spent(state, { month: '2026-11', bankId: 'tbank', categoryId: 'food' }), 30.3);
  assert.equal(spent(state, { month: '2026-11', bankId: 'tbank' }), 35.3);
});

test('purchasesFor filters by month', () => {
  const state = limitedState([
    purchase('p1', '2026-11-30', 'tbank', 'food', 1),
    purchase('p2', '2026-12-01', 'tbank', 'food', 1),
  ]);
  assert.deepEqual(purchasesFor(state, '2026-11').map((p) => p.id), ['p1']);
});

test('addPurchase and removePurchase do not mutate the input', () => {
  const state = limitedState();
  const added = addPurchase(state, purchase('p1', '2026-11-01', 'tbank', 'food', 300));
  assert.equal(state.purchases.length, 0);
  assert.equal(remaining(added, { month: '2026-11', bankId: 'tbank', categoryId: 'food' }).category, 0);

  const removed = removePurchase(added, 'p1');
  assert.equal(added.purchases.length, 1);
  assert.equal(remaining(removed, { month: '2026-11', bankId: 'tbank', categoryId: 'food' }).category, 300);
});

test('limitsOverview reports enabled banks with category usage', () => {
  const state = limitedState([purchase('p1', '2026-11-01', 'tbank', 'food', 120)]);
  const tbank = limitsOverview(state, '2026-11').find((row) => row.bank.id === 'tbank');
  assert.equal(tbank.limit, 5000);
  assert.equal(tbank.spent, 120);
  assert.equal(tbank.remaining, 4880);
  const food = tbank.categories.find((row) => row.category.id === 'food');
  assert.deepEqual({ limit: food.limit, spent: food.spent, remaining: food.remaining }, { limit: 300, spent: 120, remaining: 180 });
});
