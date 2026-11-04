// Ranks enabled banks for a purchase (SPEC §3):
//   pct    = best non-exhausted matching category, else basePercent
//   reward = min(amount × pct / 100, category balance, bank balance)
//   value  = reward × valueCoef (ruble equivalent); without amount pct × valueCoef
import { codesCover, codesOverlap } from './match.js';
import { categoriesFor } from './months.js';
import { remaining, roundMoney } from './limits.js';

const round4 = (value) => Math.round(value * 10000) / 10000;

function pickCategory(state, bank, codes, month) {
  const matching = categoriesFor(state, month, bank.id)
    .filter((category) => codesOverlap(category.codes, codes))
    .sort((a, b) => b.percent - a.percent);
  for (const category of matching) {
    const left = remaining(state, { month, bankId: bank.id, categoryId: category.id }).category;
    if (left === null || left > 0) return { category, remainingCategory: left, exhaustedCategory: null };
  }
  return { category: null, remainingCategory: null, exhaustedCategory: matching[0] ?? null };
}

function rewardFor(amount, pct, caps) {
  const rewardRaw = roundMoney((amount * pct) / 100);
  const reward = Math.min(rewardRaw, ...caps.filter((cap) => cap !== null));
  return { rewardRaw, reward };
}

function rankBank(state, bank, { codes, amount, month }) {
  const { category, remainingCategory, exhaustedCategory } = pickCategory(state, bank, codes, month);
  const remainingBank = remaining(state, { month, bankId: bank.id }).bank;
  const bankExhausted = remainingBank === 0;
  const pct = category ? category.percent : bank.basePercent;
  const effectivePct = bankExhausted ? 0 : round4(pct * bank.valueCoef);
  const result = {
    bank, pct, basePct: bank.basePercent, category, exhaustedCategory,
    exhausted: bankExhausted ? 'bank' : exhaustedCategory ? 'category' : null,
    // A group search may hit a category that covers only some of the group's codes.
    partial: !bankExhausted && category !== null && !codesCover(category.codes, codes),
    remainingCategory, remainingBank, effectivePct,
    rewardRaw: null, reward: null, value: effectivePct,
  };
  if (amount == null) return result;
  const { rewardRaw, reward } = rewardFor(amount, pct, [remainingCategory, remainingBank]);
  return { ...result, rewardRaw, reward, value: roundMoney(reward * bank.valueCoef) };
}

function compareRanked(a, b) {
  return b.value - a.value || b.effectivePct - a.effectivePct || a.bank.order - b.bank.order;
}

export function rankBanks(state, { codes, amount = null, month }) {
  return state.banks
    .filter((bank) => bank.enabled)
    .map((bank) => rankBank(state, bank, { codes, amount, month }))
    .sort(compareRanked);
}
