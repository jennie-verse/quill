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

test('wide/unfolded screens: capped reading width, two-column settings, Mac hover only for fine pointers', () => {
  const css = read('../assets/app.css');
  assert.match(css, /@media \(min-width: 880px\)[\s\S]*grid-template-columns: repeat\(2/);
  assert.match(css, /\.editor-body\[data-wrap="true"\][\s\S]*100cqw \/ var\(--editor-scale, 1\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  // The editor font itself must stay 16px (no iOS focus zoom).
  assert.match(css, /\.editor-body \{[^}]*font-size: 16px/);
});

test('the build stamp in version.js matches VERSION in sw.js', () => {
  const stamp = read('../src/version.js').match(/APP_BUILD = '([^']+)'/)[1];
  assert.equal(read('../sw.js').match(/const VERSION = '([^']+)'/)[1], stamp);
});
