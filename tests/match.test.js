import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, parseMcc, includesMcc, codesOverlap, parseCodes, formatCodes,
  formatMcc, findCandidates, frequentStores,
} from '../src/core/match.js';
import { createDefaultState } from '../src/core/state.js';
import { makeState } from './helpers.js';

test('normalize ignores case, ё/е and punctuation', () => {
  assert.equal(normalize('ПЯТЁРОЧКА'), 'пятерочка');
  assert.equal(normalize('М.Видео'), 'мвидео');
  assert.equal(normalize('  Вкусно — и точка '), 'вкусноиточка');
  assert.equal(normalize(null), '');
});

for (const query of ['пятёрочка', 'пятерочка', 'ПЯТЕРОЧКА', 'Пятёр', '5ка']) {
  test(`findCandidates finds Пятёрочка for "${query}"`, () => {
    const [first] = findCandidates(createDefaultState(), query);
    assert.equal(first.kind, 'store');
    assert.equal(first.store.id, 'pyaterochka');
    assert.deepEqual(first.codes, [5411]);
  });
}

test('findCandidates matches a store by alias', () => {
  const [first] = findCandidates(createDefaultState(), 'макдональдс');
  assert.equal(first.store.id, 'vkusno');
});

test('findCandidates treats four digits as an MCC and names its group', () => {
  const candidates = findCandidates(createDefaultState(), ' 5411 ');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, 'mcc');
  assert.deepEqual(candidates[0].codes, [5411]);
  assert.equal(candidates[0].group.id, 'supermarkets');
});

test('findCandidates finds an MCC group by name', () => {
  const candidates = findCandidates(createDefaultState(), 'азс');
  const group = candidates.find((c) => c.kind === 'group');
  assert.equal(group.group.id, 'fuel');
  assert.deepEqual(group.codes, [5541, 5542, 5552, 5983]);
});

test('findCandidates ranks exact over prefix over substring', () => {
  const state = makeState({
    stores: [
      { id: 'sub', name: 'Супер Лента', aliases: [], mcc: 5411 },
      { id: 'prefix', name: 'Лента Онлайн', aliases: [], mcc: 5411 },
      { id: 'exact', name: 'Лента', aliases: [], mcc: 5411 },
    ],
  });
  const ids = findCandidates(state, 'лента').map((c) => c.store.id);
  assert.deepEqual(ids, ['exact', 'prefix', 'sub']);
});

test('findCandidates breaks ties by usedCount', () => {
  const state = makeState({
    stores: [
      { id: 'rare', name: 'Магнит Косметик', aliases: [], mcc: 5977, usedCount: 1 },
      { id: 'often', name: 'Магнит Семейный', aliases: [], mcc: 5411, usedCount: 9 },
    ],
  });
  assert.equal(findCandidates(state, 'магнит')[0].store.id, 'often');
});

test('findCandidates returns nothing for an empty or unknown query', () => {
  assert.deepEqual(findCandidates(createDefaultState(), '   '), []);
  assert.deepEqual(findCandidates(createDefaultState(), 'zzzqqq'), []);
});

test('findCandidates respects the limit', () => {
  assert.equal(findCandidates(createDefaultState(), 'а', { limit: 3 }).length, 3);
});

test('parseMcc accepts exactly four digits', () => {
  assert.equal(parseMcc('5411'), 5411);
  assert.equal(parseMcc('0742'), 742);
  assert.equal(parseMcc('541'), null);
  assert.equal(parseMcc('54111'), null);
  assert.equal(parseMcc('ab12'), null);
});

test('includesMcc handles single codes and ranges', () => {
  const codes = [5411, [3000, 3350]];
  assert.equal(includesMcc(codes, 5411), true);
  assert.equal(includesMcc(codes, 3011), true);
  assert.equal(includesMcc(codes, 3350), true);
  assert.equal(includesMcc(codes, 3351), false);
  assert.equal(includesMcc([], 5411), false);
});

test('codesOverlap detects any shared code between two lists', () => {
  assert.equal(codesOverlap([5541, 5542], [5542]), true);
  assert.equal(codesOverlap([[3000, 3350]], [[3300, 3400]]), true);
  assert.equal(codesOverlap([5411], [5499]), false);
});

test('parseCodes reads lists and ranges', () => {
  assert.deepEqual(parseCodes('5411, 5499; 3000-3299').codes, [5411, 5499, [3000, 3299]]);
  assert.deepEqual(parseCodes('3000 – 3299 742').codes, [[3000, 3299], 742]);
  assert.deepEqual(parseCodes('5411, 5411').codes, [5411]);
  assert.deepEqual(parseCodes('').codes, []);
});

test('parseCodes reports invalid tokens', () => {
  const { codes, errors } = parseCodes('5411, abc, 54111, 3299-3000');
  assert.deepEqual(codes, [5411]);
  assert.deepEqual(errors, ['abc', '54111', '3299-3000']);
});

test('formatCodes round-trips through parseCodes', () => {
  const codes = [742, 5411, [3000, 3299]];
  assert.equal(formatCodes(codes), '0742, 5411, 3000-3299');
  assert.deepEqual(parseCodes(formatCodes(codes)).codes, codes);
  assert.equal(formatMcc(742), '0742');
});

test('frequentStores lists used stores by count, then recency', () => {
  const state = makeState({
    stores: [
      { id: 'a', name: 'A', aliases: [], mcc: 5411, usedCount: 2, lastUsedAt: '2026-11-01T10:00:00.000Z' },
      { id: 'b', name: 'B', aliases: [], mcc: 5411, usedCount: 0, lastUsedAt: null },
      { id: 'c', name: 'C', aliases: [], mcc: 5411, usedCount: 5, lastUsedAt: '2026-10-01T10:00:00.000Z' },
      { id: 'd', name: 'D', aliases: [], mcc: 5411, usedCount: 2, lastUsedAt: '2026-11-02T10:00:00.000Z' },
    ],
  });
  assert.deepEqual(frequentStores(state).map((s) => s.id), ['c', 'd', 'a']);
  assert.deepEqual(frequentStores(state, { limit: 1 }).map((s) => s.id), ['c']);
});
