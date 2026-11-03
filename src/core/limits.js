// Limit balances are never stored: they are derived from the month's purchases.
// Limits and rewards are in the bank's own units (rubles or points).
import { categoriesFor } from './months.js';

export const roundMoney = (value) => Math.round(value * 100) / 100;

export function purchasesFor(state, month) {
  return state.purchases.filter((purchase) => purchase.date.slice(0, 7) === month);
}

export function spent(state, { month, bankId, categoryId = null }) {
  const total = purchasesFor(state, month)
    .filter((p) => p.bankId === bankId && (categoryId === null || p.categoryId === categoryId))
    .reduce((sum, p) => sum + (p.reward ?? 0), 0);
  return roundMoney(total);
}

function leftOf(limit, used) {
  return limit == null ? null : Math.max(0, roundMoney(limit - used()));
}

// { category, bank }: what is left this month; null means "no limit".
export function remaining(state, { month, bankId, categoryId = null }) {
  const bank = state.banks.find((b) => b.id === bankId);
  const category = categoryId === null
    ? null
    : categoriesFor(state, month, bankId).find((c) => c.id === categoryId);
  return {
    category: leftOf(category?.limit, () => spent(state, { month, bankId, categoryId })),
    bank: leftOf(bank?.monthlyLimit, () => spent(state, { month, bankId })),
  };
}

export function limitsOverview(state, month) {
  return state.banks
    .filter((bank) => bank.enabled)
    .map((bank) => ({
      bank,
      limit: bank.monthlyLimit,
      spent: spent(state, { month, bankId: bank.id }),
      remaining: remaining(state, { month, bankId: bank.id }).bank,
      categories: categoriesFor(state, month, bank.id).map((category) => ({
        category,
        limit: category.limit,
        spent: spent(state, { month, bankId: bank.id, categoryId: category.id }),
        remaining: remaining(state, { month, bankId: bank.id, categoryId: category.id }).category,
      })),
    }));
}

export function addPurchase(state, purchase) {
  return { ...state, purchases: [...state.purchases, purchase] };
}

export function removePurchase(state, purchaseId) {
  return { ...state, purchases: state.purchases.filter((p) => p.id !== purchaseId) };
}
