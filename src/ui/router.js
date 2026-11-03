// Hash routes: #/pick, #/categories/2026-11, #/stores, #/banks, #/more.
export const SCREEN_NAMES = ['pick', 'categories', 'stores', 'banks', 'more'];

export function parseRoute(hash) {
  const [name, ...params] = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  return SCREEN_NAMES.includes(name) ? { name, params } : { name: 'pick', params: [] };
}

export const href = (name, ...params) => `#/${[name, ...params].join('/')}`;
