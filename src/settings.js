/* ==========================================================================
   settings.js — 설정 저장·복원

   저장 위치: localStorage `text-editor-settings-v1`
   기존 Quill(React 버전)과 같은 키를 씁니다. 기존 설정을 그대로 이어받되,
   모르는 값은 조용히 기본값으로 되돌립니다.
   ========================================================================== */

export const SETTINGS_KEY = 'text-editor-settings-v1';

// WebApp_House_Style.md 3장: 앱 UI 글자 크기 4단계. 기본은 12px.
export const INTERFACE_SIZES = Object.freeze([6, 8, 10, 12]);
export const DEFAULT_INTERFACE_SIZE = 12;

// 에디터 본문은 UI와 별개로 조절합니다.
// 2026-09-12: 사용자 요청으로 WebApp_House_Style.md의 "입력창 16px 고정"
// 규칙에 대한 명시적 예외를 Quill 에디터에 적용합니다. iPhone Safari에서
// 12px 이하로 설정한 상태로 에디터를 탭하면 화면이 자동 확대될 수 있습니다.
export const EDITOR_SIZES = Object.freeze([6, 8, 10, 12]);
export const DEFAULT_EDITOR_SIZE = 12;

export const TAB_SIZES = Object.freeze([2, 4, 8]);
export const DEFAULT_TAB_SIZE = 2;

export const DEFAULTS = Object.freeze({
  interfaceSize: DEFAULT_INTERFACE_SIZE,
  editorSize: DEFAULT_EDITOR_SIZE,
  tabSize: DEFAULT_TAB_SIZE,
  wrap: true,
  spellcheck: false,
  autocorrect: false,
  defaultExtension: '.txt',
  // Snapshots can make a backup file noticeably larger, so this is a plain
  // local preference — deliberately not part of Sync's SETTING_KEYS list.
  includeSnapshotsInBackup: true
});

// 확장자는 사용자가 직접 입력할 수 있으므로 파일명에 쓸 수 없는 문자를 막습니다.
const EXTENSION_PATTERN = /^\.[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/;

export function isValidExtension(value) {
  return typeof value === 'string' && EXTENSION_PATTERN.test(value);
}

function pick(list, value, fallback) {
  const number = Number(value);
  return list.includes(number) ? number : fallback;
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeSettings(raw) {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  return {
    // 기존 React 버전은 Small/Standard/Large/Extra Large 4단계를 썼습니다.
    // 값이 숫자가 아니면 여기서 기본값(12px)으로 떨어집니다 — 의도된 동작입니다.
    interfaceSize: pick(INTERFACE_SIZES, source.interfaceSize, DEFAULT_INTERFACE_SIZE),
    editorSize: pick(EDITOR_SIZES, source.editorSize, DEFAULT_EDITOR_SIZE),
    tabSize: pick(TAB_SIZES, source.tabSize, DEFAULT_TAB_SIZE),
    wrap: bool(source.wrap, DEFAULTS.wrap),
    spellcheck: bool(source.spellcheck, DEFAULTS.spellcheck),
    autocorrect: bool(source.autocorrect, DEFAULTS.autocorrect),
    defaultExtension: isValidExtension(source.defaultExtension)
      ? source.defaultExtension
      : DEFAULTS.defaultExtension,
    includeSnapshotsInBackup: bool(source.includeSnapshotsInBackup, DEFAULTS.includeSnapshotsInBackup)
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch (error) {
    return normalizeSettings(null);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch (error) {
    // 사파리 비공개 모드나 저장 공간 부족에서 실패할 수 있습니다.
    return false;
  }
}
