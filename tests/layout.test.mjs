import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('compact toolbar covers 320px screens without losing accessible names', () => {
  const css = read('../assets/app.css');
  assert.match(css, /@media \(max-width: 359px\)[\s\S]*#save-button::before/);

  const html = read('../index.html');
  for (const id of ['menu-open', 'find-button', 'save-button']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`));
  }
});

test('Open/New/Snapshots/Settings are consolidated into the menu dialog, each keeping an accessible name', () => {
  const html = read('../index.html');
  assert.match(html, /id="menu-dialog"/);
  for (const id of ['menu-open-button', 'menu-new-button', 'menu-snapshots-open', 'menu-settings-open']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // These no longer live in the main toolbar as standalone buttons.
  for (const id of ['open-button', 'new-button', 'snapshots-open', 'settings-open']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
  }
});
