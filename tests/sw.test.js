// The service worker must precache every shipped file, and its VERSION must
// match the one the UI shows; otherwise the app breaks offline after a release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/version.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const swSource = readFileSync(join(ROOT, 'sw.js'), 'utf8');

function assetsFromSw() {
  const block = swSource.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, 'ASSETS array not found in sw.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function filesUnder(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const full = join(ROOT, dir, name);
    return statSync(full).isDirectory() ? filesUnder(relative(ROOT, full)) : [relative(ROOT, full)];
  });
}

const toAsset = (file) => `./${file.split(sep).join('/')}`;

test('ASSETS lists every shipped file', () => {
  const assets = new Set(assetsFromSw());
  const shipped = ['index.html', 'styles.css', 'manifest.webmanifest', ...filesUnder('src'), ...filesUnder('icons')];
  const missing = shipped.map(toAsset).filter((asset) => !assets.has(asset));
  assert.deepEqual(missing, []);
});

test('every ASSETS entry exists on disk', () => {
  const absent = assetsFromSw().filter((asset) => asset !== './' && !existsSync(join(ROOT, asset)));
  assert.deepEqual(absent, []);
});

test('sw.js VERSION matches src/version.js', () => {
  const version = swSource.match(/const VERSION = '([^']+)';/)?.[1];
  assert.equal(version, APP_VERSION);
});

test('manifest icons exist and paths are relative', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./'), icon.src);
    assert.ok(existsSync(join(ROOT, icon.src)), icon.src);
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});
