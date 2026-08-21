import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('compact toolbar covers 320px screens without losing accessible names', () => {
  const css = read('../assets/app.css');
  assert.match(css, /@media \(max-width: 359px\)[\s\S]*#settings-open::before/);

  const html = read('../index.html');
  for (const id of ['open-button', 'new-button', 'find-button', 'save-button', 'settings-open']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`));
  }
});
