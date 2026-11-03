// Month keys ('YYYY-MM') come from local date parts only, never toISOString,
// so a purchase at 23:59 local time stays in its own month.
import { codesOverlap } from './match.js';

const pad = (value, width = 2) => String(value).padStart(width, '0');

export function monthKey(date) {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}`;
}

export function dateKey(date) {
  return `${monthKey(date)}-${pad(date.getDate())}`;
}

export function isMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
}

export const prevMonth = (month) => shiftMonth(month, -1);
export const nextMonth = (month) => shiftMonth(month, 1);

export function plansFor(state, month) {
  return state.plans.filter((plan) => plan.month === month);
}

export function categoriesFor(state, month, bankId) {
  return state.plans.find((plan) => plan.month === month && plan.bankId === bankId)?.categories ?? [];
}

export function hasCategories(state, month) {
  return plansFor(state, month).some((plan) => plan.categories.length > 0);
}

export function latestPlannedMonthBefore(state, month) {
  const months = state.plans
    .filter((plan) => plan.month < month && plan.categories.length > 0)
    .map((plan) => plan.month)
    .sort();
  return months.at(-1) ?? null;
}

function withPlan(plans, plan) {
  const others = plans.filter((p) => !(p.month === plan.month && p.bankId === plan.bankId));
  return [...others, plan];
}

const cloneCategory = (category, id) => ({ ...category, codes: structuredClone(category.codes), id });

// Copies each bank's categories from one month to another with fresh ids.
// Banks that already have categories in the target month are kept unless overwrite.
export function copyPlans(state, { from, to, overwrite = false, newId }) {
  let plans = state.plans;
  for (const source of plansFor(state, from)) {
    if (source.categories.length === 0) continue;
    const existing = categoriesFor({ plans }, to, source.bankId);
    if (existing.length > 0 && !overwrite) continue;
    const categories = source.categories.map((category) => cloneCategory(category, newId()));
    plans = withPlan(plans, { month: to, bankId: source.bankId, categories });
  }
  return plans === state.plans ? state : { ...state, plans };
}

export function upsertCategory(state, { month, bankId, category }) {
  const current = categoriesFor(state, month, bankId);
  const exists = current.some((c) => c.id === category.id);
  const categories = exists
    ? current.map((c) => (c.id === category.id ? category : c))
    : [...current, category];
  return { ...state, plans: withPlan(state.plans, { month, bankId, categories }) };
}

// Other categories of the same bank and month that share at least one code.
export function overlappingCategories(state, { month, bankId, codes, exceptId = null }) {
  return categoriesFor(state, month, bankId)
    .filter((category) => category.id !== exceptId && codesOverlap(category.codes, codes));
}

export function removeCategory(state, { month, bankId, categoryId }) {
  const categories = categoriesFor(state, month, bankId).filter((c) => c.id !== categoryId);
  return { ...state, plans: withPlan(state.plans, { month, bankId, categories }) };
}
