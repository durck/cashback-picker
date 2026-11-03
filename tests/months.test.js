import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthKey, dateKey, prevMonth, nextMonth, isMonthKey, plansFor, categoriesFor,
  hasCategories, latestPlannedMonthBefore, copyPlans, upsertCategory, removeCategory,
} from '../src/core/months.js';
import { category, makeState, plan, sequentialIds } from './helpers.js';

test('monthKey and dateKey use local date parts', () => {
  const lateEvening = new Date(2026, 0, 31, 23, 59, 59);
  assert.equal(monthKey(lateEvening), '2026-01');
  assert.equal(dateKey(lateEvening), '2026-01-31');
  assert.equal(dateKey(new Date(2026, 10, 3)), '2026-11-03');
});

test('prevMonth and nextMonth cross year boundaries', () => {
  assert.equal(prevMonth('2026-01'), '2025-12');
  assert.equal(prevMonth('2026-11'), '2026-10');
  assert.equal(nextMonth('2025-12'), '2026-01');
});

test('isMonthKey validates YYYY-MM', () => {
  assert.equal(isMonthKey('2026-11'), true);
  assert.equal(isMonthKey('2026-13'), false);
  assert.equal(isMonthKey('2026-1'), false);
});

test('plansFor, categoriesFor and hasCategories read one month', () => {
  const state = makeState({
    plans: [plan('2026-11', 'sber', [category('sm', 5, [5411])]), plan('2026-12', 'sber', [])],
  });
  assert.equal(plansFor(state, '2026-11').length, 1);
  assert.equal(categoriesFor(state, '2026-11', 'sber')[0].id, 'sm');
  assert.deepEqual(categoriesFor(state, '2026-11', 'vtb'), []);
  assert.equal(hasCategories(state, '2026-11'), true);
  assert.equal(hasCategories(state, '2026-12'), false);
});

test('latestPlannedMonthBefore skips empty and later months', () => {
  const state = makeState({
    plans: [
      plan('2026-08', 'sber', [category('a', 5, [5411])]),
      plan('2026-09', 'sber', [category('b', 5, [5411])]),
      plan('2026-10', 'sber', []),
      plan('2026-12', 'sber', [category('c', 5, [5411])]),
    ],
  });
  assert.equal(latestPlannedMonthBefore(state, '2026-11'), '2026-09');
  assert.equal(latestPlannedMonthBefore(state, '2026-08'), null);
});

test('copyPlans copies categories with new ids and independent codes', () => {
  const state = makeState({
    plans: [plan('2026-10', 'sber', [category('sm', 5, [5411, [3000, 3350]], 500)])],
  });
  const next = copyPlans(state, { from: '2026-10', to: '2026-11', newId: sequentialIds('cat') });
  const [copied] = categoriesFor(next, '2026-11', 'sber');
  assert.deepEqual(copied, { id: 'cat-1', name: 'sm', percent: 5, codes: [5411, [3000, 3350]], limit: 500 });

  copied.codes[1][0] = 1;
  assert.deepEqual(categoriesFor(state, '2026-10', 'sber')[0].codes, [5411, [3000, 3350]]);
  assert.equal(state.plans.length, 1);
});

test('copyPlans keeps an existing bank plan unless overwrite is set', () => {
  const state = makeState({
    plans: [
      plan('2026-10', 'sber', [category('old', 5, [5411])]),
      plan('2026-10', 'tbank', [category('food', 3, [5411])]),
      plan('2026-11', 'sber', [category('mine', 7, [5814])]),
    ],
  });
  const kept = copyPlans(state, { from: '2026-10', to: '2026-11', newId: sequentialIds() });
  assert.equal(categoriesFor(kept, '2026-11', 'sber')[0].name, 'mine');
  assert.equal(categoriesFor(kept, '2026-11', 'tbank')[0].name, 'food');

  const replaced = copyPlans(state, { from: '2026-10', to: '2026-11', overwrite: true, newId: sequentialIds() });
  assert.equal(categoriesFor(replaced, '2026-11', 'sber')[0].name, 'old');
});

test('upsertCategory adds a new category and replaces an existing one', () => {
  const state = makeState();
  const added = upsertCategory(state, { month: '2026-11', bankId: 'sber', category: category('sm', 5, [5411]) });
  assert.equal(categoriesFor(added, '2026-11', 'sber').length, 1);
  assert.equal(state.plans.length, 0);

  const updated = upsertCategory(added, { month: '2026-11', bankId: 'sber', category: category('sm', 7, [5411]) });
  const categories = categoriesFor(updated, '2026-11', 'sber');
  assert.equal(categories.length, 1);
  assert.equal(categories[0].percent, 7);
});

test('removeCategory deletes only the given category', () => {
  const state = makeState({
    plans: [plan('2026-11', 'sber', [category('a', 5, [5411]), category('b', 3, [5814])])],
  });
  const next = removeCategory(state, { month: '2026-11', bankId: 'sber', categoryId: 'a' });
  assert.deepEqual(categoriesFor(next, '2026-11', 'sber').map((c) => c.id), ['b']);
  assert.equal(categoriesFor(state, '2026-11', 'sber').length, 2);
});
