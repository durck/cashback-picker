// Query matching: store name / alias, 4-digit MCC, or MCC group name.
const NON_ALNUM = /[^\p{L}\p{N}]+/gu;
const SCORE = { exact: 0, prefix: 1, substring: 2 };

export function normalize(text) {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е').replace(NON_ALNUM, '');
}

export function parseMcc(query) {
  const trimmed = String(query ?? '').trim();
  return /^\d{4}$/.test(trimmed) ? Number(trimmed) : null;
}

export function formatMcc(code) {
  return String(code).padStart(4, '0');
}

function toRanges(codes) {
  return (codes ?? []).map((code) => (Array.isArray(code) ? [code[0], code[1]] : [code, code]));
}

export function codesOverlap(left, right) {
  const rightRanges = toRanges(right);
  return toRanges(left).some(([from, to]) => rightRanges.some(([f, t]) => from <= t && f <= to));
}

export function includesMcc(codes, mcc) {
  return codesOverlap(codes, [mcc]);
}

function mergedRanges(codes) {
  const merged = [];
  for (const [from, to] of toRanges(codes).sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

// True when every code in `required` falls inside `container`.
export function codesCover(container, required) {
  const merged = mergedRanges(container);
  return toRanges(required).every(([from, to]) => merged.some(([f, t]) => f <= from && to <= t));
}

function parseToken(token) {
  const range = token.match(/^(\d{1,4})-(\d{1,4})$/);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    if (from > to) return null;
    return from === to ? from : [from, to];
  }
  return /^\d{1,4}$/.test(token) ? Number(token) : null;
}

// "5411, 5499 3000-3299" → { codes: [5411, 5499, [3000, 3299]], errors: [] }
export function parseCodes(text) {
  const tokens = String(text ?? '')
    .replace(/\s*[-–—]\s*/g, '-')
    .split(/[\s,;]+/)
    .filter(Boolean);
  const codes = [];
  const errors = [];
  const seen = new Set();
  for (const token of tokens) {
    const code = parseToken(token);
    if (code === null) {
      errors.push(token);
    } else if (!seen.has(String(code))) {
      seen.add(String(code));
      codes.push(code);
    }
  }
  return { codes, errors };
}

export function formatCodes(codes) {
  return (codes ?? [])
    .map((code) => (Array.isArray(code) ? `${formatMcc(code[0])}-${formatMcc(code[1])}` : formatMcc(code)))
    .join(', ');
}

function scoreNames(key, names) {
  let best = null;
  for (const name of names) {
    const value = normalize(name);
    let score = null;
    if (value === key) score = SCORE.exact;
    else if (value.startsWith(key)) score = SCORE.prefix;
    else if (value.includes(key)) score = SCORE.substring;
    if (score !== null && (best === null || score < best)) best = score;
  }
  return best;
}

function mccCandidate(state, mcc) {
  const group = state.mccGroups.find((g) => includesMcc(g.codes, mcc)) ?? null;
  return { kind: 'mcc', codes: [mcc], label: formatMcc(mcc), group };
}

function scoredStores(state, key) {
  return state.stores.map((store) => ({
    score: scoreNames(key, [store.name, ...(store.aliases ?? [])]),
    usedCount: store.usedCount ?? 0,
    candidate: { kind: 'store', codes: [store.mcc], label: store.name, store },
  }));
}

function scoredGroups(state, key) {
  return state.mccGroups.map((group) => ({
    score: scoreNames(key, [group.name]),
    usedCount: 0,
    candidate: { kind: 'group', codes: group.codes, label: group.name, group },
  }));
}

function compareScored(a, b) {
  return a.score - b.score
    || b.usedCount - a.usedCount
    || a.candidate.label.localeCompare(b.candidate.label, 'ru');
}

// Candidates sorted by match quality (exact → prefix → substring), then usage.
export function findCandidates(state, query, { limit = 8 } = {}) {
  const mcc = parseMcc(query);
  if (mcc !== null) return [mccCandidate(state, mcc)];
  const key = normalize(query);
  if (!key) return [];
  return [...scoredStores(state, key), ...scoredGroups(state, key)]
    .filter((item) => item.score !== null)
    .sort(compareScored)
    .slice(0, limit)
    .map((item) => item.candidate);
}

export function frequentStores(state, { limit = 8 } = {}) {
  return state.stores
    .filter((store) => (store.usedCount ?? 0) > 0)
    .sort((a, b) => b.usedCount - a.usedCount
      || String(b.lastUsedAt ?? '').localeCompare(String(a.lastUsedAt ?? '')))
    .slice(0, limit);
}
