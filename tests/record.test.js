// Recording purchases end to end through the core: rank → log entry → balances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankBanks } from '../src/core/rank.js';
import {
  addPurchase, removePurchase, remaining, monthLog, purchaseFromRanked,
} from '../src/core/limits.js';
import { category, makeState, plan, purchase, sequentialIds } from './helpers.js';

const MONTH = '2026-11';
const CODES = [5411];

function record(state, bankId, { amount, id, date = '2026-11-05' }) {
  const row = rankBanks(state, { codes: CODES, amount, month: date.slice(0, 7) }).find((r) => r.bank.id === bankId);
  return addPurchase(state, purchaseFromRanked(row, { id, date, codes: CODES, amount, label: 'Пятёрочка' }));
}

test('purchaseFromRanked keeps the applied category and the capped reward', () => {
  const state = makeState({ plans: [plan(MONTH, 'tbank', [category('food', 5, CODES, 30)])] });
  const row = rankBanks(state, { codes: CODES, amount: 1000, month: MONTH })[0];
  const entry = purchaseFromRanked(row, { id: 'p1', date: '2026-11-05', codes: CODES, amount: 1000, label: 'Пятёрочка' });
  assert.deepEqual(entry, {
    id: 'p1', date: '2026-11-05', bankId: 'tbank', categoryId: 'food',
    mcc: 5411, amount: 1000, reward: 30, label: 'Пятёрочка',
  });
});

test('purchaseFromRanked stores no MCC for a range target', () => {
  const state = makeState();
  const row = rankBanks(state, { codes: [[3000, 3350]], amount: 100, month: MONTH })[0];
  assert.equal(purchaseFromRanked(row, { id: 'p', date: '2026-11-01', codes: [[3000, 3350]], amount: 100 }).mcc, null);
});

test('recording until the category limit is spent switches to base percent', () => {
  const newId = sequentialIds('p');
  let state = makeState({ plans: [plan(MONTH, 'tbank', [category('food', 5, CODES, 100)])] });
  state = record(state, 'tbank', { amount: 1000, id: newId() }); // 50
  state = record(state, 'tbank', { amount: 1000, id: newId() }); // 50 → limit spent

  const tbank = rankBanks(state, { codes: CODES, month: MONTH }).find((r) => r.bank.id === 'tbank');
  assert.equal(tbank.exhausted, 'category');
  assert.equal(tbank.pct, 1);

  state = record(state, 'tbank', { amount: 1000, id: newId() }); // base 1 % → 10, outside the category
  assert.equal(state.purchases.at(-1).categoryId, null);
  assert.equal(state.purchases.at(-1).reward, 10);
  assert.equal(remaining(state, { month: MONTH, bankId: 'tbank', categoryId: 'food' }).category, 0);
});

test('recording until the bank limit is spent caps and then zeroes rewards', () => {
  const banks = makeState().banks.map((b) => (b.id === 'tbank' ? { ...b, monthlyLimit: 60 } : b));
  let state = makeState({ banks, plans: [plan(MONTH, 'tbank', [category('food', 5, CODES)])] });
  state = record(state, 'tbank', { amount: 1000, id: 'p1' }); // 50
  state = record(state, 'tbank', { amount: 1000, id: 'p2' }); // capped at the 10 left
  assert.deepEqual(state.purchases.map((p) => p.reward), [50, 10]);
  assert.equal(remaining(state, { month: MONTH, bankId: 'tbank' }).bank, 0);

  const tbank = rankBanks(state, { codes: CODES, amount: 1000, month: MONTH }).find((r) => r.bank.id === 'tbank');
  assert.equal(tbank.exhausted, 'bank');
  assert.equal(tbank.reward, 0);
  state = record(state, 'tbank', { amount: 1000, id: 'p3' });
  assert.equal(state.purchases.at(-1).reward, 0);
});

test('two categories on one MCC: spending the better one moves records to the other', () => {
  const categories = [category('low', 3, CODES), category('high', 7, CODES, 70)];
  let state = makeState({ plans: [plan(MONTH, 'tbank', categories)] });
  state = record(state, 'tbank', { amount: 1000, id: 'p1' });
  assert.deepEqual(
    { categoryId: state.purchases[0].categoryId, reward: state.purchases[0].reward },
    { categoryId: 'high', reward: 70 },
  );
  state = record(state, 'tbank', { amount: 1000, id: 'p2' });
  assert.deepEqual(
    { categoryId: state.purchases[1].categoryId, reward: state.purchases[1].reward },
    { categoryId: 'low', reward: 30 },
  );
  assert.equal(remaining(state, { month: MONTH, bankId: 'tbank', categoryId: 'high' }).category, 0);
});

test('removing a record returns the balance', () => {
  let state = makeState({ plans: [plan(MONTH, 'tbank', [category('food', 5, CODES, 100)])] });
  state = record(state, 'tbank', { amount: 2000, id: 'p1' });
  assert.equal(remaining(state, { month: MONTH, bankId: 'tbank', categoryId: 'food' }).category, 0);
  state = removePurchase(state, 'p1');
  assert.equal(remaining(state, { month: MONTH, bankId: 'tbank', categoryId: 'food' }).category, 100);
  assert.equal(rankBanks(state, { codes: CODES, month: MONTH })[0].exhausted, null);
});

test('the next month starts with full balances after a spent month', () => {
  const plans = [
    plan('2026-11', 'tbank', [category('food', 5, CODES, 100)]),
    plan('2026-12', 'tbank', [category('food-dec', 5, CODES, 100)]),
  ];
  let state = makeState({ plans });
  state = record(state, 'tbank', { amount: 5000, id: 'p1', date: '2026-11-30' });
  const december = rankBanks(state, { codes: CODES, month: '2026-12' })[0];
  assert.equal(december.category.id, 'food-dec');
  assert.equal(december.remainingCategory, 100);
});

test('monthLog lists the month newest first', () => {
  const state = makeState({
    purchases: [
      purchase('a', '2026-11-02', 'tbank', null, 1),
      purchase('b', '2026-11-05', 'tbank', null, 1),
      purchase('c', '2026-11-02', 'tbank', null, 1),
      purchase('d', '2026-10-31', 'tbank', null, 1),
    ],
  });
  assert.deepEqual(monthLog(state, MONTH).map((p) => p.id), ['b', 'c', 'a']);
});
