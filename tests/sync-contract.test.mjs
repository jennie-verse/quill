import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

globalThis.localStorage = memoryStorage();
const sync = await import('../src/sync.js');

test('sync module is optional at app startup', () => {
  const text = source('src/sync.js');
  assert.match(text, /import\(['"]\.\.\/\.\.\/shared\/v1\/sync\.js['"]\)/);
  assert.doesNotMatch(text, /^import\s+.*shared\/v1\/sync\.js/m);
});

test('only the seven approved settings are selected', () => {
  const picked = sync.pickSettings({
    interfaceSize: 14,
    editorSize: 18,
    tabSize: 4,
    wrap: false,
    spellcheck: true,
    autocorrect: true,
    defaultExtension: '.md',
    draft: 'must not sync',
    text: 'must not sync'
  });
  assert.deepEqual(Object.keys(picked).sort(), [
    'autocorrect', 'defaultExtension', 'editorSize', 'interfaceSize',
    'spellcheck', 'tabSize', 'wrap'
  ]);
  assert.equal(JSON.stringify(picked).includes('must not sync'), false);
});

test('settings timestamp changes only through the explicit marker', () => {
  assert.equal(sync.getSettingsUpdatedAt(), 0);
  sync.markSettingsChanged();
  assert.ok(sync.getSettingsUpdatedAt() > 0);
  const calls = source('src/app.js').match(/Sync\.markSettingsChanged\(\)/g) || [];
  assert.equal(calls.length, 1);
});

test('service worker and visible build versions match', () => {
  const worker = source('sw.js').match(/const VERSION = ['"]([^'"]+)['"]/);
  const app = source('src/version.js').match(/APP_BUILD = ['"]([^'"]+)['"]/);
  assert.ok(worker && app);
  assert.equal(worker[1], app[1]);
});

test('sync defaults to disabled without credentials and context', () => {
  assert.equal(sync.isEnabled(), false);
  assert.equal(sync.isReady(), false);
  assert.equal(sync.tokenHint(), '');
});
