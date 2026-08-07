/* jsdom 으로 앱을 실제로 띄워 초기화 오류와 화면 배선을 확인합니다.
   실행: npm install jsdom 후 `node tests/dom.test.mjs`
   jsdom 은 Safari 가 아니므로 최종 확인은 실기기에서 해야 합니다. */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(resolve(process.env.JSDOM_BASE || '/tmp', 'noop.js'));
const { JSDOM } = require('jsdom');

let pass = 0;
let fail = 0;
const t = (name, condition, detail = '') => {
  if (condition) { pass += 1; console.log('  ok  ', name); }
  else { fail += 1; console.log('  FAIL', name, detail); }
};

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const consoleErrors = [];

const dom = new JSDOM(html, {
  url: 'https://example.invalid/quill/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});

const { window } = dom;
window.console.error = (...args) => consoleErrors.push(args.join(' '));

// jsdom 에 없는 브라우저 API 를 최소한만 채웁니다.
window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
window.HTMLElement.prototype.scrollIntoView = () => {};
if (!window.navigator.serviceWorker) {
  Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined, configurable: true });
}

const globals = ['window', 'document', 'navigator', 'localStorage', 'Blob', 'File',
  'FileReader', 'URL', 'TextEncoder', 'indexedDB', 'Event', 'CustomEvent'];
const saved = new Map();
globals.forEach((key) => {
  saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  if (window[key] === undefined) return;
  // navigator 처럼 getter 만 있는 전역은 defineProperty 로 덮어써야 합니다.
  Object.defineProperty(globalThis, key, {
    value: window[key],
    configurable: true,
    writable: true
  });
});

const appUrl = pathToFileURL(resolve(root, 'src/app.js')).href;
await import(appUrl);
// init() 은 비동기이므로 마이크로태스크가 끝나기를 기다립니다.
await new Promise((done) => setTimeout(done, 50));

const $ = (id) => window.document.getElementById(id);

console.log('[dom] 초기화');
t('콘솔 오류 0건', consoleErrors.length === 0, consoleErrors.join(' | '));
t('에디터가 존재한다', Boolean($('editor-body')));
t('에디터가 비어 있다', $('editor-body').value === '');
t('파일명 기본값 Untitled', $('file-name-display').textContent === 'Untitled');
t('상태 표시줄이 채워졌다', $('document-status').textContent === '1 lines · 0 characters');

console.log('[dom] 설정 배선');
t('UI 크기 버튼 6개', $('interface-size-picker').querySelectorAll('button').length === 6);
t('에디터 크기 버튼 6개', $('editor-size-picker').querySelectorAll('button').length === 6);
t('기본 12px 선택됨',
  $('interface-size-picker').querySelector('button[data-size="12"]').getAttribute('aria-pressed') === 'true');
t('기본 16px 선택됨',
  $('editor-size-picker').querySelector('button[data-size="16"]').getAttribute('aria-pressed') === 'true');
t('빠른 확장자 목록이 그려졌다', $('quick-extensions').querySelectorAll('button').length === 10);
t('줄바꿈 기본 켜짐', $('wrap-toggle').checked === true);
t('에디터 wrap 속성 반영', $('editor-body').dataset.wrap === 'true');

console.log('[dom] 접근성');
const unlabelled = [...window.document.querySelectorAll('button')].filter((button) => {
  const text = (button.textContent || '').trim();
  return !text && !button.getAttribute('aria-label');
});
t('이름 없는 버튼 없음', unlabelled.length === 0, unlabelled.map((b) => b.id).join(','));

const inputs = [...window.document.querySelectorAll('input:not([type=checkbox]):not([type=file])')];
const unlabelledInputs = inputs.filter((input) => {
  if (input.getAttribute('aria-label')) return false;
  if (input.getAttribute('placeholder') && input.closest('label')) return false;
  return !window.document.querySelector(`label[for="${input.id}"]`) && !input.closest('label');
});
t('label 없는 입력창 없음', unlabelledInputs.length === 0, unlabelledInputs.map((i) => i.id).join(','));

console.log('[dom] 입력 반응');
$('editor-body').value = '가나다\nhello';
$('editor-body').dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((done) => setTimeout(done, 10));
t('상태 표시줄이 갱신된다', $('document-status').textContent === '2 lines · 9 characters',
  $('document-status').textContent);
t('수정 표시가 켜진다', $('file-name-display').dataset.dirty === 'true');

console.log('[dom] Find');
$('find-button').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise((done) => setTimeout(done, 10));
t('Find 바가 열린다', $('find-bar').hidden === false);
$('find-input').value = '나';
$('find-input').dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((done) => setTimeout(done, 10));
t('일치 개수가 표시된다', $('find-count').textContent === '1 / 1', $('find-count').textContent);
$('find-input').value = '없는말';
$('find-input').dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((done) => setTimeout(done, 10));
t('일치 없음이 표시된다', $('find-count').textContent === 'No matches');
t('이동 버튼이 비활성화된다', $('find-next').disabled === true);

console.log('[dom] 사용자 텍스트가 HTML 로 실행되지 않는다');
$('editor-body').value = '<img src=x onerror="window.__xss=1">';
$('editor-body').dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((done) => setTimeout(done, 10));
t('스크립트가 실행되지 않았다', window.__xss === undefined);
t('파일명은 textContent 로만 들어간다', !$('file-name-display').innerHTML.includes('<img'));

globals.forEach((key) => {
  const descriptor = saved.get(key);
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete globalThis[key];
});

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
