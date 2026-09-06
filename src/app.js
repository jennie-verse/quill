/* ==========================================================================
   app.js — 화면 조립, 이벤트, 상태

   빌드 도구 없이 그대로 배포되는 ES module 입니다.
   외부 CDN·패키지·분석 도구·로그인·서버를 쓰지 않습니다.
   ========================================================================== */

import {
  loadSettings, saveSettings, normalizeSettings, isValidExtension,
  INTERFACE_SIZES, EDITOR_SIZES, TAB_SIZES,
  DEFAULT_INTERFACE_SIZE, DEFAULT_EDITOR_SIZE, SETTINGS_KEY
} from './settings.js';

import {
  readDraft, writeDraft, clearDraft,
  writeFallbackDraft, readFallbackDraft, clearFallbackDraft, newerDraft
} from './recovery.js';

import {
  QUICK_EXTENSIONS, sanitizeFileName, splitName, joinName,
  looksBinary, readFileAsText, downloadText, shareText, canShareFiles
} from './files.js';

import { findMatches, stepMatch, matchAtOrAfter, describeMatches } from './find.js';
import { indent, outdent, newlineWithIndent, applyEdit, describeDocument } from './editor.js';
import { buildBackup, checkBackupSize, parseBackup, backupFileName } from './backup.js';
import {
  MAX_SNAPSHOTS_PER_FILE, createSnapshot, listSnapshots, deleteSnapshot,
  getAllSnapshots, replaceAllSnapshots, clearAllSnapshots
} from './snapshots.js';
import { APP_BUILD } from './version.js';
import * as Journal from './journal.js';

/* 동기화 모듈은 필요할 때만 부릅니다. 이 파일 하나를 못 받아도 Quill 은
   그대로 떠야 하므로, 정적 import 로 물리지 않고 실패를 삼킵니다. */
let Sync = null;
const syncReady = import('./sync.js')
  .then((module) => { Sync = module; return true; })
  .catch(() => false);

const DRAFT_DEBOUNCE_MS = 1200;

const el = {};
const state = {
  settings: loadSettings(),
  fileName: '',
  text: '',
  dirty: false,
  composing: false,
  draftTimer: 0,
  toastTimer: 0,
  journalSessionId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  journalFingerprint: '',
  find: { open: false, matches: [], index: -1 },
  confirmResolve: null,
  saveResolve: null,
  snapshotPreviewRow: null
};

/* ── 유틸 ────────────────────────────────────────────────────────── */

function id(name) { return document.getElementById(name); }

function collect() {
  [
    'app-shell', 'editor-screen', 'settings-screen', 'editor-body', 'file-name-display',
    'menu-open', 'menu-dialog', 'menu-open-button', 'menu-new-button', 'menu-snapshots-open', 'menu-settings-open',
    'find-button', 'save-button', 'settings-close',
    'find-bar', 'find-input', 'find-count', 'find-previous', 'find-next', 'find-match-case', 'find-close',
    'document-status', 'save-status', 'toast',
    'interface-size-picker', 'interface-size-reset', 'editor-size-picker', 'editor-size-reset',
    'tab-size-picker', 'wrap-toggle', 'spellcheck-toggle', 'autocorrect-toggle',
    'quick-extensions', 'custom-extension', 'extension-error',
    'export-backup', 'restore-backup', 'clear-recovery', 'clear-data', 'settings-message',
    'include-snapshots-toggle',
    'snapshots-close', 'snapshots-screen', 'snapshots-file-label',
    'snapshot-save-now', 'snapshot-list', 'snapshot-empty-hint',
    'snapshot-preview-dialog', 'snapshot-preview-title', 'snapshot-preview-meta', 'snapshot-preview-text',
    'snapshot-delete', 'snapshot-preview-close', 'snapshot-restore',
    'save-dialog', 'save-form', 'save-name', 'save-extension', 'save-preview', 'save-error',
    'save-cancel', 'save-confirm',
    'confirm-dialog', 'confirm-message', 'confirm-cancel', 'confirm-accept',
    'file-input', 'backup-input',
    'sync-status', 'sync-device-name', 'sync-token', 'sync-save-token', 'sync-clear-token',
    'sync-toggle', 'sync-now', 'sync-message', 'app-version',
    'journal-status', 'journal-toggle', 'journal-message', 'journal-from', 'journal-to', 'journal-backfill', 'journal-clear-activity'
  ].forEach((name) => { el[name] = id(name); });
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => { el.toast.hidden = true; }, 2600);
}

function setStatus(message, tone = '') {
  el['save-status'].textContent = message;
  if (tone) el['save-status'].dataset.tone = tone;
  else delete el['save-status'].dataset.tone;
}

function displayName() {
  return state.fileName || 'Untitled';
}

/* ── 확인 시트 ───────────────────────────────────────────────────── */

function confirmAction({ title, message, acceptLabel, cancelLabel }) {
  if (state.confirmResolve) return Promise.resolve(false);
  el['confirm-dialog'].querySelector('#confirm-title').textContent = title;
  el['confirm-message'].textContent = message;
  el['confirm-accept'].textContent = acceptLabel;
  el['confirm-cancel'].textContent = cancelLabel;
  el['confirm-dialog'].showModal();
  el['confirm-cancel'].focus();
  return new Promise((resolve) => { state.confirmResolve = resolve; });
}

function settleConfirm(value) {
  if (!state.confirmResolve) return;
  const resolve = state.confirmResolve;
  state.confirmResolve = null;
  el['confirm-dialog'].close();
  resolve(value);
}

async function guardUnsaved(actionLabel) {
  if (!state.dirty) return true;
  return confirmAction({
    title: 'Changes not exported',
    message: `This document has changes that were never sent to Files. ${actionLabel}`,
    acceptLabel: 'Discard Changes',
    cancelLabel: 'Keep Editing'
  });
}

/* ── 초안 저장 ───────────────────────────────────────────────────── */

function scheduleDraft() {
  if (state.draftTimer) window.clearTimeout(state.draftTimer);
  state.draftTimer = window.setTimeout(saveDraftNow, DRAFT_DEBOUNCE_MS);
}

async function saveDraftNow() {
  if (state.draftTimer) {
    window.clearTimeout(state.draftTimer);
    state.draftTimer = 0;
  }
  try {
    await writeDraft({ text: state.text, fileName: state.fileName });
    writeFallbackDraft({ text: state.text, fileName: state.fileName });
    setStatus('Draft saved on this device', 'ok');
  } catch (error) {
    // 초안 저장이 실패해도 편집은 계속할 수 있어야 합니다.
    writeFallbackDraft({ text: state.text, fileName: state.fileName });
    setStatus('Draft save failed', 'warn');
  }
}

/* ── 렌더 ────────────────────────────────────────────────────────── */

function renderDocument() {
  el['document-status'].textContent = describeDocument(state.text);
  el['file-name-display'].textContent = displayName();
  el['file-name-display'].dataset.dirty = String(state.dirty);
  el['file-name-display'].title = displayName();
}

function applyInterfaceSize() {
  document.documentElement.style.setProperty('--ui-size', `${state.settings.interfaceSize}px`);
  el['interface-size-picker'].querySelectorAll('button[data-size]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.size) === state.settings.interfaceSize));
  });
}

function applyEditorSize() {
  document.documentElement.style.setProperty('--editor-size', `${state.settings.editorSize}px`);
  el['editor-size-picker'].querySelectorAll('button[data-size]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.size) === state.settings.editorSize));
  });
}

function applyEditorPreferences() {
  const editor = el['editor-body'];
  editor.dataset.wrap = String(state.settings.wrap);
  editor.setAttribute('wrap', state.settings.wrap ? 'soft' : 'off');
  editor.spellcheck = state.settings.spellcheck;
  editor.setAttribute('autocorrect', state.settings.autocorrect ? 'on' : 'off');
  editor.setAttribute('autocapitalize', state.settings.autocorrect ? 'sentences' : 'off');
  editor.style.tabSize = String(state.settings.tabSize);

  el['wrap-toggle'].checked = state.settings.wrap;
  el['spellcheck-toggle'].checked = state.settings.spellcheck;
  el['autocorrect-toggle'].checked = state.settings.autocorrect;

  el['tab-size-picker'].querySelectorAll('button[data-tab]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.tab) === state.settings.tabSize));
  });
}

function renderExtensions() {
  el['quick-extensions'].replaceChildren();
  QUICK_EXTENSIONS.forEach((extension) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.extension = extension;
    button.textContent = extension;
    button.setAttribute('aria-pressed', String(extension === state.settings.defaultExtension));
    el['quick-extensions'].append(button);
  });
  if (document.activeElement !== el['custom-extension']) {
    el['custom-extension'].value = state.settings.defaultExtension;
  }
}

function renderSettings() {
  applyInterfaceSize();
  applyEditorSize();
  applyEditorPreferences();
  renderExtensions();
  el['include-snapshots-toggle'].checked = state.settings.includeSnapshotsInBackup;
}

function persistSettings() {
  if (!saveSettings(state.settings)) {
    el['settings-message'].textContent = 'Settings could not be saved on this device.';
    delete el['settings-message'].dataset.tone;
    return;
  }
  /* 설정이 바뀐 시각은 **여기서만** 찍습니다. 이 함수는 사용자가 실제로 값을
     바꿨을 때만 불립니다. 앱이 켜질 때 기본값을 최신으로 올려 다른 기기에서
     맞춰 둔 설정을 덮는 사고를 막는 장치입니다. */
  syncReady.then((ok) => {
    if (!ok) return;
    Sync.markSettingsChanged();
    schedulePush();
  });
}

let pushTimer = null;

/** 공용 모듈과 같은 4초 디바운스. 슬라이더를 연달아 만질 때 요청이 쌓이지 않게 합니다. */
function schedulePush() {
  if (!Sync || !Sync.isReady()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    Sync.pushSettings(state.settings).catch(() => { /* 다음 변경 때 다시 시도합니다 */ });
  }, 4000);
}

/* ── 문서 조작 ───────────────────────────────────────────────────── */

function setDocument(text, fileName, { dirty = false } = {}) {
  state.text = text;
  state.fileName = fileName;
  state.dirty = dirty;
  el['editor-body'].value = text;
  renderDocument();
  refreshFind();
}

function documentFingerprint() {
  let hash = 2166136261;
  const input = `${state.fileName}\u0000${state.text}`;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function journalDocument() { return { id: state.journalSessionId, title: displayName() }; }

function beginJournalSession(action) {
  state.journalSessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  state.journalFingerprint = documentFingerprint();
  Journal.recordActivity(journalDocument(), action).catch(() => {});
}

function onEditorInput() {
  if (state.composing) return;
  state.text = el['editor-body'].value;
  state.dirty = true;
  renderDocument();
  refreshFind();
  const fingerprint = documentFingerprint();
  if (fingerprint !== state.journalFingerprint) {
    state.journalFingerprint = fingerprint;
    Journal.recordActivity(journalDocument(), 'edited').catch(() => {});
  }
  scheduleDraft();
}

/* ── Find ────────────────────────────────────────────────────────── */

function refreshFind() {
  if (!state.find.open) return;
  const query = el['find-input'].value;
  state.find.matches = findMatches(state.text, query, el['find-match-case'].checked);
  if (state.find.index >= state.find.matches.length) state.find.index = -1;
  el['find-count'].textContent = describeMatches(state.find.matches, state.find.index);
  const empty = state.find.matches.length === 0;
  el['find-previous'].disabled = empty;
  el['find-next'].disabled = empty;
}

function moveFind(direction) {
  if (state.find.matches.length === 0) return;
  const next = state.find.index < 0
    ? matchAtOrAfter(state.find.matches, el['editor-body'].selectionStart)
    : stepMatch(state.find.matches, state.find.index, direction);
  state.find.index = next;
  const match = state.find.matches[next];
  el['editor-body'].focus();
  el['editor-body'].setSelectionRange(match.start, match.end);
  el['find-count'].textContent = describeMatches(state.find.matches, next);
}

function openFind() {
  state.find.open = true;
  el['find-bar'].hidden = false;
  el['find-button'].setAttribute('aria-expanded', 'true');
  refreshFind();
  el['find-input'].focus();
  el['find-input'].select();
}

function closeFind() {
  state.find.open = false;
  state.find.index = -1;
  state.find.matches = [];
  el['find-bar'].hidden = true;
  el['find-button'].setAttribute('aria-expanded', 'false');
  el['editor-body'].focus();
}

/* ── 열기 ────────────────────────────────────────────────────────── */

async function openFile(file) {
  let text;
  try {
    text = await readFileAsText(file);
  } catch (error) {
    toast('The file could not be read.');
    return;
  }

  if (looksBinary(text)) {
    const proceed = await confirmAction({
      title: 'This appears to be a binary file.',
      message: 'Opening it may show unreadable characters, and saving could damage the original.',
      acceptLabel: 'Open Anyway',
      cancelLabel: 'Cancel'
    });
    if (!proceed) return;
  }

  setDocument(text, file.name, { dirty: false });
  beginJournalSession('opened');
  await saveDraftNow();
  setStatus('File opened.', 'ok');
  toast('File opened.');
}

/* ── 저장 ────────────────────────────────────────────────────────── */

function updateSavePreview() {
  const base = el['save-name'].value;
  const extension = el['save-extension'].value;
  const safeBase = sanitizeFileName(base, '');
  if (safeBase === null) {
    el['save-error'].textContent = 'Remove / \\ : * ? " < > | from the file name.';
    el['save-preview'].textContent = '—';
    el['save-confirm'].disabled = true;
    return null;
  }
  if (!safeBase) {
    el['save-error'].textContent = '';
    el['save-preview'].textContent = '—';
    el['save-confirm'].disabled = true;
    return null;
  }
  if (extension && !isValidExtension(extension.startsWith('.') ? extension : `.${extension}`)) {
    el['save-error'].textContent = 'Use an extension like .txt or .md';
    el['save-preview'].textContent = '—';
    el['save-confirm'].disabled = true;
    return null;
  }

  const full = joinName(safeBase, extension);
  el['save-error'].textContent = '';
  el['save-preview'].textContent = full;
  el['save-confirm'].disabled = false;
  return full;
}

function askFileName() {
  const current = splitName(state.fileName);
  el['save-name'].value = current.base || 'untitled';
  el['save-extension'].value = current.extension || state.settings.defaultExtension;
  el['save-error'].textContent = '';
  updateSavePreview();
  el['save-dialog'].showModal();
  el['save-name'].focus();
  el['save-name'].select();
  return new Promise((resolve) => { state.saveResolve = resolve; });
}

function settleSave(value) {
  if (!state.saveResolve) return;
  const resolve = state.saveResolve;
  state.saveResolve = null;
  el['save-dialog'].close();
  resolve(value);
}

async function saveCopy() {
  const fileName = await askFileName();
  if (!fileName) return;

  // 공유 시트가 있으면 그쪽이 iOS에서 훨씬 편합니다. 없으면 다운로드로 대체합니다.
  if (canShareFiles()) {
    try {
      const shared = await shareText(state.text, fileName);
      if (!shared) {
        setStatus('Export cancelled.', 'warn');
        return;
      }
      state.fileName = fileName;
      state.dirty = false;
      renderDocument();
      await saveDraftNow();
      Journal.recordActivity(journalDocument(), 'export-requested').catch(() => {});
      setStatus('File export requested.', 'ok');
      toast('Sent to Files.');
      return;
    } catch (error) {
      // 공유 실패 시 다운로드로 계속 진행합니다.
    }
  }

  try {
    downloadText(state.text, fileName);
    state.fileName = fileName;
    state.dirty = false;
    renderDocument();
    await saveDraftNow();
    Journal.recordActivity(journalDocument(), 'export-requested').catch(() => {});
    setStatus('File export requested.', 'ok');
    toast('Download started.');
  } catch (error) {
    setStatus('File sharing failed', 'error');
    toast('File sharing failed');
  }
}

/* ── 백업 ────────────────────────────────────────────────────────── */

async function exportBackup() {
  try {
    const payload = buildBackup({
      draft: { text: state.text, fileName: state.fileName, savedAt: new Date().toISOString() },
      settings: state.settings,
      journalActivity: Journal.exportActivityLedger(),
      snapshots: await getAllSnapshots()
    });
    checkBackupSize(payload);
    const name = backupFileName();
    if (canShareFiles()) {
      try {
        const shared = await shareText(payload, name);
        if (shared) {
          el['settings-message'].textContent = 'Backup exported.';
          el['settings-message'].dataset.tone = 'ok';
          return;
        }
      } catch (error) {
        // 다운로드로 대체합니다.
      }
    }
    downloadText(payload, name);
    el['settings-message'].textContent = 'Backup exported.';
    el['settings-message'].dataset.tone = 'ok';
  } catch (error) {
    el['settings-message'].textContent = error.message || 'Backup failed.';
    delete el['settings-message'].dataset.tone;
  }
}

async function restoreBackupFile(file) {
  let backup;
  try {
    backup = parseBackup(await readFileAsText(file));
  } catch (error) {
    el['settings-message'].textContent = error.message || 'Invalid Quill backup.';
    delete el['settings-message'].dataset.tone;
    return;
  }

  const accepted = await confirmAction({
    title: 'Restore Backup',
    message: 'This replaces the current draft and settings on this device.',
    acceptLabel: 'Restore',
    cancelLabel: 'Cancel'
  });
  if (!accepted) return;

  state.settings = backup.settings;
  persistSettings();
  renderSettings();

  if (backup.draft) {
    setDocument(backup.draft.text, backup.draft.fileName, { dirty: true });
    await saveDraftNow();
  }
  if (backup.journalActivity !== undefined) Journal.replaceActivityLedger(backup.journalActivity);
  if (backup.snapshots !== undefined) await replaceAllSnapshots(backup.snapshots);

  el['settings-message'].textContent = 'Backup restored.';
  el['settings-message'].dataset.tone = 'ok';
  toast('Backup restored.');
}

/* ── 초기화 ──────────────────────────────────────────────────────── */

async function clearRecovery() {
  const accepted = await confirmAction({
    title: 'Clear recovery data',
    message: 'The saved draft on this device is deleted. The text on screen stays until you leave.',
    acceptLabel: 'Clear',
    cancelLabel: 'Cancel'
  });
  if (!accepted) return;
  try {
    await clearDraft();
    clearFallbackDraft();
    el['settings-message'].textContent = 'Recovery data cleared.';
    el['settings-message'].dataset.tone = 'ok';
  } catch (error) {
    el['settings-message'].textContent = 'Recovery data could not be cleared.';
    delete el['settings-message'].dataset.tone;
  }
}

async function clearAllData() {
  const accepted = await confirmAction({
    title: 'Clear Data',
    message: 'The draft, settings, snapshots, and text on screen are all reset. Files you already exported are not touched.',
    acceptLabel: 'Clear Data',
    cancelLabel: 'Cancel'
  });
  if (!accepted) return;
  try {
    await clearDraft();
  } catch (error) {
    // 이미 없을 수도 있습니다.
  }
  clearFallbackDraft();
  try { await clearAllSnapshots(); } catch (error) { /* 이미 비어 있을 수도 있습니다 */ }
  try { localStorage.removeItem(SETTINGS_KEY); } catch (error) { /* 무시 */ }
  state.settings = loadSettings();
  renderSettings();
  setDocument('', '', { dirty: false });
  setStatus('');
  el['settings-message'].textContent = 'All data cleared.';
  el['settings-message'].dataset.tone = 'ok';
}

/* ── 화면 전환 ───────────────────────────────────────────────────── */

function openSettings() {
  el['editor-screen'].hidden = true;
  el['settings-screen'].hidden = false;
  el['settings-message'].textContent = '';
  renderSettings();
  el['settings-close'].focus();
}

function closeSettings() {
  el['settings-screen'].hidden = true;
  el['editor-screen'].hidden = false;
  el['editor-body'].focus();
}

/* ── 스냅샷(버전 기록) ───────────────────────────────────────────────
   원본 파일은 iOS 제약으로 덮어쓸 수 없으므로, 스냅샷은 이 앱의
   IndexedDB에만 존재합니다 (snapshots.js). 파일 하나당 최대 10개이고,
   저장은 오직 사용자가 "Save a snapshot now"를 눌렀을 때만 일어납니다. */

function currentSnapshotKey() {
  return displayName();
}

function formatSnapshotMeta(row) {
  const when = Number.isFinite(Date.parse(row.savedAt)) ? new Date(row.savedAt).toLocaleString() : row.savedAt;
  return `${when} · ${row.charCount.toLocaleString()} characters`;
}

async function renderSnapshotList() {
  el['snapshots-file-label'].textContent = currentSnapshotKey();
  const rows = await listSnapshots(currentSnapshotKey());
  el['snapshot-list'].replaceChildren();
  el['snapshot-empty-hint'].hidden = rows.length > 0;
  rows.forEach((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'snapshot-row';
    button.dataset.id = String(row.id);
    const time = document.createElement('span');
    time.className = 'snapshot-time';
    time.textContent = Number.isFinite(Date.parse(row.savedAt)) ? new Date(row.savedAt).toLocaleString() : row.savedAt;
    const count = document.createElement('span');
    count.className = 'snapshot-count';
    count.textContent = `${row.charCount.toLocaleString()} chars`;
    button.append(time, count);
    button.addEventListener('click', () => openSnapshotPreview(row));
    el['snapshot-list'].append(button);
  });
}

function openSnapshotPreview(row) {
  state.snapshotPreviewRow = row;
  el['snapshot-preview-meta'].textContent = formatSnapshotMeta(row);
  el['snapshot-preview-text'].textContent = row.text;
  el['snapshot-preview-dialog'].showModal();
}

async function saveSnapshotNow() {
  await createSnapshot({ fileName: currentSnapshotKey(), text: state.text });
  await renderSnapshotList();
  toast(`Snapshot saved (up to ${MAX_SNAPSHOTS_PER_FILE} kept).`);
}

async function restoreSnapshotFromPreview() {
  const row = state.snapshotPreviewRow;
  if (!row) return;
  const accepted = await confirmAction({
    title: 'Restore Snapshot',
    message: 'Your current text will be replaced. A snapshot of your current text is saved first, so this can be undone from the list.',
    acceptLabel: 'Restore',
    cancelLabel: 'Cancel'
  });
  if (!accepted) return;
  // Safety snapshot first. row.text was captured in memory when the preview
  // opened, so it is unaffected even if this save evicts the oldest snapshot.
  await createSnapshot({ fileName: currentSnapshotKey(), text: state.text });
  setDocument(row.text, state.fileName, { dirty: true });
  await saveDraftNow();
  el['snapshot-preview-dialog'].close();
  closeSnapshotsScreen();
  toast('Snapshot restored.');
}

async function deleteSnapshotFromPreview() {
  const row = state.snapshotPreviewRow;
  if (!row) return;
  const accepted = await confirmAction({
    title: 'Delete Snapshot',
    message: 'This snapshot cannot be recovered afterward.',
    acceptLabel: 'Delete',
    cancelLabel: 'Cancel'
  });
  if (!accepted) return;
  await deleteSnapshot(row.id);
  el['snapshot-preview-dialog'].close();
  await renderSnapshotList();
  toast('Snapshot deleted.');
}

async function openSnapshots() {
  el['editor-screen'].hidden = true;
  el['snapshots-screen'].hidden = false;
  await renderSnapshotList();
  el['snapshots-close'].focus();
}

function closeSnapshotsScreen() {
  el['snapshots-screen'].hidden = true;
  el['editor-screen'].hidden = false;
  el['editor-body'].focus();
}

/* ── 이벤트 ──────────────────────────────────────────────────────── */

function bind() {
  const editor = el['editor-body'];

  editor.addEventListener('input', onEditorInput);
  editor.addEventListener('compositionstart', () => { state.composing = true; });
  editor.addEventListener('compositionend', () => {
    state.composing = false;
    onEditorInput();
  });

  editor.addEventListener('keydown', (event) => {
    // 한글 조합 중에는 키를 가로채지 않습니다.
    if (state.composing || event.isComposing) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const { selectionStart, selectionEnd, value } = editor;
      const result = event.shiftKey
        ? outdent(value, selectionStart, selectionEnd, state.settings.tabSize)
        : indent(value, selectionStart, selectionEnd, state.settings.tabSize);
      applyEdit(editor, result);
      onEditorInput();
      return;
    }

    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      const { selectionStart, selectionEnd, value } = editor;
      const result = newlineWithIndent(value, selectionStart, selectionEnd);
      // 들여쓰기가 없으면 브라우저 기본 동작이 실행 취소 이력에 더 잘 남습니다.
      if (result.text.length !== value.length + 1) {
        event.preventDefault();
        applyEdit(editor, result);
        onEditorInput();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openFind();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveCopy();
      return;
    }

    if (event.key === 'Escape' && state.find.open) {
      event.preventDefault();
      closeFind();
    }
  });

  el['menu-open'].addEventListener('click', () => el['menu-dialog'].showModal());

  el['menu-open-button'].addEventListener('click', async () => {
    el['menu-dialog'].close();
    if (!(await guardUnsaved('Open another file anyway?'))) return;
    el['file-input'].value = '';
    el['file-input'].click();
  });

  el['file-input'].addEventListener('change', () => {
    const file = el['file-input'].files && el['file-input'].files[0];
    if (file) openFile(file);
  });

  el['menu-new-button'].addEventListener('click', async () => {
    el['menu-dialog'].close();
    if (!(await guardUnsaved('Start a new file anyway?'))) return;
    setDocument('', '', { dirty: false });
    beginJournalSession('created');
    await saveDraftNow();
    setStatus('New file ready.', 'ok');
    el['editor-body'].focus();
  });

  el['save-button'].addEventListener('click', saveCopy);

  el['find-button'].addEventListener('click', () => {
    if (state.find.open) closeFind();
    else openFind();
  });
  el['find-close'].addEventListener('click', closeFind);
  el['find-input'].addEventListener('input', () => {
    state.find.index = -1;
    refreshFind();
  });
  el['find-input'].addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      moveFind(event.shiftKey ? -1 : 1);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFind();
    }
  });
  el['find-match-case'].addEventListener('change', () => {
    state.find.index = -1;
    refreshFind();
  });
  el['find-next'].addEventListener('click', () => moveFind(1));
  el['find-previous'].addEventListener('click', () => moveFind(-1));

  bindSync();
  el['journal-toggle'].addEventListener('click', () => { void toggleJournal(); });
  el['journal-backfill'].addEventListener('click', async () => {
    if (!Journal.isJournalEnabled()) { renderJournalStatus('Turn on Include in journal first.'); return; }
    const preview = Journal.previewBackfill(el['journal-from'].value, el['journal-to'].value);
    const accepted = await confirmAction({
      title: 'Add Captured Records',
      message: `Add ${preview.records.length} captured record(s) across ${preview.dates} day(s)?`,
      acceptLabel: 'Add',
      cancelLabel: 'Cancel'
    });
    if (!accepted) return;
    const result = await Journal.backfillJournal(el['journal-from'].value, el['journal-to'].value);
    renderJournalStatus(result.error ? 'Import paused; pending records will retry.' : `Added ${result.written} record(s).`);
  });
  el['journal-clear-activity'].addEventListener('click', async () => {
    const accepted = await confirmAction({
      title: 'Clear Captured Activity',
      message: 'Clear the captured 90-day Journal activity history on this device? The draft and remote Journal records are unchanged.',
      acceptLabel: 'Clear',
      cancelLabel: 'Cancel'
    });
    if (!accepted) return;
    Journal.clearActivityLedger();
    renderJournalStatus('Captured activity cleared on this device.');
  });
  el['menu-settings-open'].addEventListener('click', () => { el['menu-dialog'].close(); openSettings(); });
  el['settings-close'].addEventListener('click', closeSettings);
  el['menu-snapshots-open'].addEventListener('click', () => { el['menu-dialog'].close(); openSnapshots(); });
  el['snapshots-close'].addEventListener('click', closeSnapshotsScreen);
  el['snapshot-save-now'].addEventListener('click', saveSnapshotNow);
  el['snapshot-preview-close'].addEventListener('click', () => el['snapshot-preview-dialog'].close());
  el['snapshot-restore'].addEventListener('click', restoreSnapshotFromPreview);
  el['snapshot-delete'].addEventListener('click', deleteSnapshotFromPreview);
  el['include-snapshots-toggle'].addEventListener('change', () => {
    state.settings.includeSnapshotsInBackup = el['include-snapshots-toggle'].checked;
    persistSettings();
  });

  el['interface-size-picker'].addEventListener('click', (event) => {
    const button = event.target.closest('button[data-size]');
    if (!button) return;
    const size = Number(button.dataset.size);
    if (!INTERFACE_SIZES.includes(size)) return;
    state.settings.interfaceSize = size;
    persistSettings();
    applyInterfaceSize();
  });
  el['interface-size-reset'].addEventListener('click', () => {
    state.settings.interfaceSize = DEFAULT_INTERFACE_SIZE;
    persistSettings();
    applyInterfaceSize();
  });

  el['editor-size-picker'].addEventListener('click', (event) => {
    const button = event.target.closest('button[data-size]');
    if (!button) return;
    const size = Number(button.dataset.size);
    if (!EDITOR_SIZES.includes(size)) return;
    state.settings.editorSize = size;
    persistSettings();
    applyEditorSize();
  });
  el['editor-size-reset'].addEventListener('click', () => {
    state.settings.editorSize = DEFAULT_EDITOR_SIZE;
    persistSettings();
    applyEditorSize();
  });

  el['tab-size-picker'].addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    const size = Number(button.dataset.tab);
    if (!TAB_SIZES.includes(size)) return;
    state.settings.tabSize = size;
    persistSettings();
    applyEditorPreferences();
  });

  el['wrap-toggle'].addEventListener('change', () => {
    state.settings.wrap = el['wrap-toggle'].checked;
    persistSettings();
    applyEditorPreferences();
  });
  el['spellcheck-toggle'].addEventListener('change', () => {
    state.settings.spellcheck = el['spellcheck-toggle'].checked;
    persistSettings();
    applyEditorPreferences();
  });
  el['autocorrect-toggle'].addEventListener('change', () => {
    state.settings.autocorrect = el['autocorrect-toggle'].checked;
    persistSettings();
    applyEditorPreferences();
  });

  el['quick-extensions'].addEventListener('click', (event) => {
    const button = event.target.closest('button[data-extension]');
    if (!button) return;
    state.settings.defaultExtension = button.dataset.extension;
    persistSettings();
    renderExtensions();
    el['extension-error'].textContent = '';
  });

  el['custom-extension'].addEventListener('change', () => {
    const raw = el['custom-extension'].value.trim();
    const value = raw.startsWith('.') ? raw : `.${raw}`;
    if (!isValidExtension(value)) {
      el['extension-error'].textContent = 'Use letters and numbers, like .txt or .md';
      return;
    }
    state.settings.defaultExtension = value;
    persistSettings();
    renderExtensions();
    el['extension-error'].textContent = '';
  });

  el['export-backup'].addEventListener('click', exportBackup);
  el['restore-backup'].addEventListener('click', () => {
    el['backup-input'].value = '';
    el['backup-input'].click();
  });
  el['backup-input'].addEventListener('change', () => {
    const file = el['backup-input'].files && el['backup-input'].files[0];
    if (file) restoreBackupFile(file);
  });
  el['clear-recovery'].addEventListener('click', clearRecovery);
  el['clear-data'].addEventListener('click', clearAllData);

  // 저장 시트
  el['save-name'].addEventListener('input', updateSavePreview);
  el['save-extension'].addEventListener('input', updateSavePreview);
  el['save-cancel'].addEventListener('click', () => settleSave(''));
  el['save-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    const full = updateSavePreview();
    if (full) settleSave(full);
  });
  el['save-dialog'].addEventListener('cancel', (event) => {
    event.preventDefault();
    settleSave('');
  });

  // 확인 시트
  el['confirm-cancel'].addEventListener('click', () => settleConfirm(false));
  el['confirm-accept'].addEventListener('click', () => settleConfirm(true));
  el['confirm-dialog'].addEventListener('cancel', (event) => {
    event.preventDefault();
    settleConfirm(false);
  });

  // 앱을 떠나기 전에 초안을 한 번 더 적어 둡니다.
  window.addEventListener('pagehide', () => {
    writeFallbackDraft({ text: state.text, fileName: state.fileName });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      writeFallbackDraft({ text: state.text, fileName: state.fileName });
      saveDraftNow();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

/* ── Service Worker ──────────────────────────────────────────────── */

function registerServiceWorker() {
  // 안전하지 않은 컨텍스트나 비공개 브라우징에서는 속성은 있는데 값이 없을 수 있습니다.
  const container = navigator.serviceWorker;
  if (!container || typeof container.register !== 'function') return;
  window.addEventListener('load', () => {
    container.register('./sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && container.controller) {
            toast('Update available — close and reopen Quill.');
          }
        });
      });
    }).catch(() => {
      // 등록에 실패해도 앱은 그대로 쓸 수 있습니다.
    });
  });
}

/* ── 시작 ────────────────────────────────────────────────────────── */

async function restoreDraft() {
  let stored = null;
  try {
    stored = await readDraft();
  } catch (error) {
    setStatus('Recovery data unavailable', 'warn');
  }
  const draft = newerDraft(stored, readFallbackDraft());
  if (!draft || (!draft.text && !draft.fileName)) return;
  setDocument(draft.text, draft.fileName, { dirty: true });
  setStatus('Draft restored', 'ok');
  toast('Draft restored — recovered from this device.');
}

// One-time reset for the 2026-09-05 "first release" restamp: wipes quill's
// own localStorage/IndexedDB so every device starts clean under the new
// version, exactly once. Gated on APP_BUILD so it never runs again after
// this deploy. Deliberately leaves 'sync.token.v1' untouched — that key is
// shared across all Published/* apps on the same github.io origin (see
// src/sync.js), not quill-only, so wiping it here would sign the user out
// of sync in every other app too.
const FRESH_START_MARKER = 'quill.freshStart.' + APP_BUILD;
function runFreshStartResetOnce() {
  try {
    if (localStorage.getItem(FRESH_START_MARKER)) return;
  } catch (error) {
    return; // localStorage unavailable — skip silently, nothing to migrate.
  }
  const quillOnlyKeys = [
    SETTINGS_KEY,                        // text-editor-settings-v1
    'text-editor-recovery-fallback-v1',
    'quill.journalEnabled.v1',
    'quill.journalActivity.v1',
    'quill.syncEnabled',
    'quill.lastSyncAt',
    'quill.settingsUpdatedAt',
  ];
  quillOnlyKeys.forEach((key) => { try { localStorage.removeItem(key); } catch (error) { /* 무시 */ } });
  try {
    if ('indexedDB' in window) indexedDB.deleteDatabase('text-editor-recovery');
  } catch (error) { /* 무시 */ }
  try { localStorage.setItem(FRESH_START_MARKER, '1'); } catch (error) { /* 무시 */ }
}

async function init() {
  runFreshStartResetOnce();
  collect();
  const today = new Date(); const start = new Date(); start.setDate(start.getDate() - 90); el['journal-from'].value = start.toISOString().slice(0, 10); el['journal-to'].value = today.toISOString().slice(0, 10);
  renderSettings();
  bind();
  setDocument('', '', { dirty: false });
  registerServiceWorker();
  await restoreDraft();

  el['app-version'].textContent = `Quill · App version ${APP_BUILD}`;
  if (await syncReady) {
    renderSyncStatus();
    renderJournalStatus();
    // 동기화가 꺼져 있으면 요청이 나가지 않습니다. 실패해도 앱은 그대로 씁니다.
    pullSettingsNow().catch(() => {});
  } else {
    el['sync-status'].textContent = 'Unavailable — the shared sync module could not be loaded.';
  }
}

/* ── Sync 화면 ───────────────────────────────────────────────────── */

function renderSyncStatus(message) {
  if (!Sync) return;
  el['sync-toggle'].textContent = Sync.isEnabled() ? 'Turn sync off' : 'Turn sync on';
  el['sync-toggle'].setAttribute('aria-pressed', String(Sync.isEnabled()));
  el['sync-device-name'].disabled = Boolean(Sync.getContextId());
  if (Sync.getContextLabel()) el['sync-device-name'].value = Sync.getContextLabel();
  el['sync-token'].placeholder = Sync.tokenHint() || 'github_pat_…';
  el['sync-now'].disabled = !Sync.isReady();

  if (message !== undefined) { el['sync-message'].textContent = message; return; }
  el['sync-message'].textContent = '';
  if (!Sync.isEnabled()) {
    el['sync-status'].textContent = 'Off — everything stays on this device.';
    return;
  }
  const last = Sync.getLastSyncAt();
  const ago = last ? `${Math.max(0, Math.round((Date.now() - last) / 60000))} min ago` : 'never';
  el['sync-status'].textContent = `On · device ${Sync.getContextId() || '—'} · last sync ${ago}`;
}

async function pullSettingsNow() {
  if (!Sync || !Sync.isReady()) return;
  const incoming = await Sync.pullSettings();
  if (!incoming) return;
  // 받은 쪽이 더 최신일 때만 null 이 아닙니다. 모르는 값은 기본값으로 떨어집니다.
  state.settings = normalizeSettings(incoming);
  saveSettings(state.settings);
  renderSettings();
  toast('Settings updated from another device.');
}

async function syncNow() {
  if (!Sync || !Sync.isReady()) return;
  renderSyncStatus('Syncing…');
  try {
    await pullSettingsNow();
    await Sync.pushSettings(state.settings);
    renderSyncStatus();
  } catch (error) {
    renderSyncStatus(Sync.describeError(error));
  }
}

async function toggleSync() {
  if (!Sync) return;
  if (Sync.isEnabled()) { Sync.setEnabled(false); renderSyncStatus(); return; }
  if (!Sync.getToken()) { renderSyncStatus('Save an access token first.'); return; }
  if (!Sync.getContextId()) {
    const typed = el['sync-device-name'].value.trim();
    if (!/[a-z0-9]/i.test(typed)) {
      renderSyncStatus('Enter a device name using English letters or numbers.');
      el['sync-device-name'].focus();
      return;
    }
    // ID 는 여기서 한 번 만들어지고 파일 이름으로 굳습니다.
    try { await Sync.ensureContext(typed); }
    catch (error) { renderSyncStatus(Sync.describeError(error)); return; }
    Sync.setContextLabel(typed);
  }
  Sync.setEnabled(true);
  renderSyncStatus();
  await syncNow();
}

function bindSync() {
  el['sync-save-token'].addEventListener('click', () => {
    if (!Sync) return;
    if (!Sync.saveToken(el['sync-token'].value)) { renderSyncStatus('Enter a token first.'); return; }
    el['sync-token'].value = '';
    renderSyncStatus('Token saved.');
  });
  el['sync-clear-token'].addEventListener('click', () => {
    if (!Sync) return;
    Sync.clearToken();
    Sync.setEnabled(false);
    renderSyncStatus('Token cleared.');
  });
  el['sync-toggle'].addEventListener('click', () => { void toggleSync(); });
  el['sync-now'].addEventListener('click', () => { void syncNow(); });
}

function renderJournalStatus(message) {
  const current = Journal.getJournalState();
  el['journal-toggle'].textContent = current.enabled ? 'Stop including in journal' : 'Include in journal';
  el['journal-toggle'].setAttribute('aria-pressed', String(current.enabled));
  if (message !== undefined) { el['journal-message'].textContent = message; return; }
  el['journal-message'].textContent = '';
  el['journal-status'].textContent = current.enabled
    ? `${current.status || 'Ready'}${current.pendingCount ? ` · ${current.pendingCount} pending` : ''}`
    : 'Off — document activity stays on this device.';
}

async function toggleJournal() {
  if (Journal.isJournalEnabled()) { await Journal.toggleJournal(false); renderJournalStatus(); return; }
  if (!Sync?.getToken()) { renderJournalStatus('Save an access token in Sync first.'); return; }
  const name = Sync.getContextLabel() || el['sync-device-name'].value.trim();
  if (!/[a-z0-9]/i.test(name)) { renderJournalStatus('Enter a device name in Sync first.'); return; }
  const result = await Journal.toggleJournal(true, name);
  renderJournalStatus(result.ok ? 'Quill is now included in Daybook.' : result.reason === 'status' ? 'Could not reach Daybook — check your connection and try again.' : 'Journal could not be enabled.');
}

init().catch(() => {
  setStatus('Quill could not start cleanly. Your text is not saved yet.', 'error');
});
