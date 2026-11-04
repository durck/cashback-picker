// WCAG AA contrast of the color tokens in styles.css, for both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const TEXT_MIN = 4.5;
const UI_MIN = 3;

function tokensOf(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
}

function themes() {
  const light = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const dark = css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(light && dark, 'theme blocks not found in styles.css');
  const lightTokens = tokensOf(light[1]);
  return { light: lightTokens, dark: { ...lightTokens, ...tokensOf(dark[1]) } };
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token] pairs that actually appear in the UI.
const TEXT_PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'accent-soft'],
  ['muted', 'bg'], ['muted', 'surface'], ['muted', 'accent-soft'],
  ['warn', 'bg'], ['warn', 'surface'], ['warn', 'accent-soft'],
  ['danger', 'surface'],
  ['accent', 'surface'],
  ['accent-text', 'accent'],
  ['bg', 'text'], // toast
];
const UI_PAIRS = [
  ['control-border', 'bg'], ['control-border', 'surface'], ['control-border', 'accent-soft'],
  ['accent', 'bg'], ['accent', 'surface'], // focus ring
];

const failures = (tokens, pairs, min) => pairs
  .map(([fg, bg]) => ({ pair: `${fg}/${bg}`, ratio: contrast(tokens[fg], tokens[bg]) }))
  .filter(({ ratio }) => !(ratio >= min))
  .map(({ pair, ratio }) => `${pair} = ${ratio.toFixed(2)}`);

for (const [name, tokens] of Object.entries(themes())) {
  test(`${name} theme: text contrast is at least ${TEXT_MIN}:1`, () => {
    assert.deepEqual(failures(tokens, TEXT_PAIRS, TEXT_MIN), []);
  });

  test(`${name} theme: control borders and focus ring are at least ${UI_MIN}:1`, () => {
    assert.deepEqual(failures(tokens, UI_PAIRS, UI_MIN), []);
  });
}
