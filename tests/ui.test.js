import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, html, raw, fmtMoney, fmtPct, fmtReward, fmtMonthRu, parseDecimal, parseAmount, bankColor,
} from '../src/ui/format.js';
import { parseRoute, href } from '../src/ui/router.js';
import { createStore } from '../src/ui/store.js';
import { STORAGE_KEY } from '../src/core/state.js';
import { MemoryStorage, makeState } from './helpers.js';

test('esc and html escape interpolated user text', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<b>${name}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;</b>');
});

test('html passes nested templates, arrays and raw through', () => {
  const items = ['a', 'b'].map((item) => html`<li>${item}</li>`);
  assert.equal(String(html`<ul>${items}</ul>${raw('&nbsp;')}${null}${false}`), '<ul><li>a</li><li>b</li></ul>&nbsp;');
});

test('formatters use Russian conventions', () => {
  assert.match(fmtMoney(1234.5), /^1\s234,5 ₽$/u);
  assert.equal(fmtPct(0.5), '0,5 %');
  assert.equal(fmtReward(50, { rewardType: 'points', pointsName: 'Спасибо' }), '50 Спасибо');
  assert.equal(fmtReward(50, { rewardType: 'rub' }), '50 ₽');
  assert.equal(fmtMonthRu('2026-11'), 'Ноябрь 2026');
});

test('parseDecimal accepts comma, spaces and currency signs', () => {
  assert.equal(parseDecimal('1 000,50'), 1000.5);
  assert.equal(parseDecimal(' 250.5 ₽'), 250.5);
  assert.equal(parseDecimal('5,5 %'), 5.5);
  assert.equal(parseDecimal('0'), 0);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('-5'), null);
  assert.equal(parseDecimal('12abc'), null);
});

test('parseAmount requires a positive amount', () => {
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('1500'), 1500);
});

test('bankColor only allows hex colors', () => {
  assert.equal(bankColor('#21a038'), '#21a038');
  assert.equal(bankColor('red; background:url(x)'), '#888888');
});

test('parseRoute reads screen and params, defaulting to pick', () => {
  assert.deepEqual(parseRoute('#/categories/2026-11'), { name: 'categories', params: ['2026-11'] });
  assert.deepEqual(parseRoute(''), { name: 'pick', params: [] });
  assert.deepEqual(parseRoute('#/unknown'), { name: 'pick', params: [] });
  assert.equal(href('categories', '2026-10'), '#/categories/2026-10');
});

test('store persists every change and notifies listeners', () => {
  const storage = new MemoryStorage();
  const store = createStore(makeState(), storage);
  const seen = [];
  store.subscribe((state, result) => seen.push(result.ok));
  store.set((state) => ({ ...state, settings: { a: 1 } }));
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).settings, { a: 1 });
  assert.deepEqual(store.get().settings, { a: 1 });
  assert.deepEqual(seen, [true]);
});
