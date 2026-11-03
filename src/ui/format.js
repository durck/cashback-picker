// HTML escaping, a tiny auto-escaping template tag, and Russian formatting.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(String(value));

function renderValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value instanceof SafeHtml) return value.value;
  return esc(value);
}

// html`<p>${userText}</p>` escapes interpolations; nested html`` and arrays pass through.
export function html(strings, ...values) {
  const out = strings.reduce((acc, part, index) => acc + part + (index < values.length ? renderValue(values[index]) : ''), '');
  return new SafeHtml(out);
}

const NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const fmtNumber = (value) => NUMBER.format(value);
export const fmtMoney = (value) => `${NUMBER.format(value)} ₽`;
export const fmtPct = (value) => `${NUMBER.format(value)} %`;

export function fmtReward(value, bank) {
  if (bank.rewardType !== 'points') return fmtMoney(value);
  return `${NUMBER.format(value)} ${bank.pointsName || 'баллов'}`;
}

export function fmtMonthRu(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

// Accepts "1 000,50", "250.5", "1 000 ₽"; returns a non-negative number or null.
export function parseDecimal(text) {
  const cleaned = String(text ?? '').replace(/[\s  ₽%]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100) / 100;
}

export function parseAmount(text) {
  const value = parseDecimal(text);
  return value !== null && value > 0 ? value : null;
}

// Bank colors end up in a style attribute, so only plain hex colors pass.
export function bankColor(color) {
  return /^#[0-9a-f]{3,8}$/i.test(String(color)) ? color : '#888888';
}
