import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankBanks } from '../src/core/rank.js';
import { bank, category, makeState, plan, purchase } from './helpers.js';

const MONTH = '2026-11';
const GROCERY = [5411];

function stateWith({ plans = [], purchases = [], banks } = {}) {
  const state = makeState({ plans, purchases });
  return banks ? { ...state, banks } : state;
}

const ids = (ranked) => ranked.map((r) => r.bank.id);

test('category percent beats base percent', () => {
  const state = stateWith({ plans: [plan(MONTH, 'sber', [category('sm', 5, [5411])])] });
  const [first] = rankBanks(state, { codes: GROCERY, month: MONTH });
  assert.equal(first.bank.id, 'sber');
  assert.equal(first.pct, 5);
  assert.equal(first.category.id, 'sm');
  assert.equal(first.value, 4); // 5 % × 0.8
});

test('valueCoef can make rubles beat a higher points percent', () => {
  const state = stateWith({
    plans: [
      plan(MONTH, 'sber', [category('sm', 5, GROCERY)]),
      plan(MONTH, 'tbank', [category('food', 4.5, GROCERY)]),
    ],
  });
  assert.deepEqual(ids(rankBanks(state, { codes: GROCERY, month: MONTH })), ['tbank', 'sber', 'vtb']);
});

test('without a category the bank gets its base percent', () => {
  const ranked = rankBanks(stateWith(), { codes: GROCERY, month: MONTH });
  const vtb = ranked.find((r) => r.bank.id === 'vtb');
  assert.equal(vtb.pct, 0);
  assert.equal(vtb.category, null);
  assert.equal(vtb.exhausted, null);
});

test('amount gives reward in bank units and value in rubles', () => {
  const state = stateWith({ plans: [plan(MONTH, 'sber', [category('sm', 5, GROCERY)])] });
  const sber = rankBanks(state, { codes: GROCERY, month: MONTH, amount: 1000 })[0];
  assert.equal(sber.rewardRaw, 50);
  assert.equal(sber.reward, 50);
  assert.equal(sber.value, 40);
});

test('rewards are rounded to kopecks', () => {
  const state = stateWith({ plans: [plan(MONTH, 'tbank', [category('food', 3, GROCERY)])] });
  const tbank = rankBanks(state, { codes: GROCERY, month: MONTH, amount: 333.33 })[0];
  assert.equal(tbank.reward, 10);
});

test('category limit caps the reward', () => {
  const state = stateWith({
    plans: [plan(MONTH, 'tbank', [category('food', 5, GROCERY, 300)])],
    purchases: [purchase('p1', '2026-11-02', 'tbank', 'food', 290)],
  });
  const tbank = rankBanks(state, { codes: GROCERY, month: MONTH, amount: 1000 })[0];
  assert.equal(tbank.remainingCategory, 10);
  assert.equal(tbank.rewardRaw, 50);
  assert.equal(tbank.reward, 10);
});

test('exhausted category falls back to base percent with a mark', () => {
  const state = stateWith({
    plans: [plan(MONTH, 'tbank', [category('food', 5, GROCERY, 300)])],
    purchases: [purchase('p1', '2026-11-02', 'tbank', 'food', 300)],
  });
  const tbank = rankBanks(state, { codes: GROCERY, month: MONTH }).find((r) => r.bank.id === 'tbank');
  assert.equal(tbank.pct, 1);
  assert.equal(tbank.category, null);
  assert.equal(tbank.exhausted, 'category');
  assert.equal(tbank.exhaustedCategory.id, 'food');
});

test('bank monthly limit caps the reward', () => {
  const banks = makeState().banks.map((b) => (b.id === 'tbank' ? { ...b, monthlyLimit: 1000 } : b));
  const state = stateWith({
    banks,
    plans: [plan(MONTH, 'tbank', [category('food', 5, GROCERY)])],
    purchases: [purchase('p1', '2026-11-01', 'tbank', null, 980)],
  });
  const tbank = rankBanks(state, { codes: GROCERY, month: MONTH, amount: 1000 })[0];
  assert.equal(tbank.remainingBank, 20);
  assert.equal(tbank.reward, 20);
});

test('exhausted bank limit gives zero value and sorts last', () => {
  const overrides = { tbank: { monthlyLimit: 100 }, vtb: { basePercent: 0.5 } };
  const banks = makeState().banks.map((b) => ({ ...b, ...overrides[b.id] }));
  const state = stateWith({
    banks,
    plans: [plan(MONTH, 'tbank', [category('food', 10, GROCERY)])],
    purchases: [purchase('p1', '2026-11-01', 'tbank', 'food', 100)],
  });
  const ranked = rankBanks(state, { codes: GROCERY, month: MONTH });
  const last = ranked.at(-1);
  assert.equal(last.bank.id, 'tbank');
  assert.equal(last.exhausted, 'bank');
  assert.equal(last.value, 0);
});

test('equal value keeps the user-defined bank order', () => {
  const banks = [bank('b', { order: 2 }), bank('a', { order: 1 }), bank('c', { order: 3 })];
  assert.deepEqual(ids(rankBanks(stateWith({ banks }), { codes: GROCERY, month: MONTH })), ['a', 'b', 'c']);
});

test('disabled banks are excluded', () => {
  const banks = makeState().banks.map((b) => (b.id === 'vtb' ? { ...b, enabled: false } : b));
  assert.deepEqual(ids(rankBanks(stateWith({ banks }), { codes: GROCERY, month: MONTH })), ['tbank', 'sber']);
});

test('the best non-exhausted category wins when two share an MCC', () => {
  const categories = [category('low', 3, GROCERY), category('high', 7, GROCERY, 100)];
  const fresh = stateWith({ plans: [plan(MONTH, 'tbank', categories)] });
  assert.equal(rankBanks(fresh, { codes: GROCERY, month: MONTH })[0].category.id, 'high');

  const spent = { ...fresh, purchases: [purchase('p1', '2026-11-03', 'tbank', 'high', 100)] };
  const tbank = rankBanks(spent, { codes: GROCERY, month: MONTH })[0];
  assert.equal(tbank.category.id, 'low');
  assert.equal(tbank.pct, 3);
  assert.equal(tbank.exhausted, null);
});

test('ranges and group codes match categories', () => {
  const state = stateWith({
    plans: [
      plan(MONTH, 'tbank', [category('air', 5, [[3000, 3350], 4511])]),
      plan(MONTH, 'vtb', [category('fuel', 4, [5542])]),
    ],
  });
  assert.equal(rankBanks(state, { codes: [3011], month: MONTH })[0].category.id, 'air');
  assert.equal(rankBanks(state, { codes: [5541, 5542], month: MONTH })[0].category.id, 'fuel');
});

test('categories of other months are ignored', () => {
  const state = stateWith({ plans: [plan('2026-10', 'vtb', [category('sm', 10, GROCERY)])] });
  assert.equal(rankBanks(state, { codes: GROCERY, month: MONTH })[0].bank.id, 'tbank');
});
