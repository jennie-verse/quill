/* ==========================================================================
   settings.js — 설정 저장·복원

   저장 위치: localStorage `text-editor-settings-v1`
   기존 Quill(React 버전)과 같은 키를 씁니다. 기존 설정을 그대로 이어받되,
   모르는 값은 조용히 기본값으로 되돌립니다.
   ========================================================================== */

export const SETTINGS_KEY = 'text-editor-settings-v1';

// WebApp_House_Style.md 3장: 앱 UI 글자 크기 6단계. 기본은 4단계(12px).
export const INTERFACE_SIZES = Object.freeze([6, 8, 10, 12, 14, 17]);
export const DEFAULT_INTERFACE_SIZE = 12;

// 에디터 본문은 UI와 별개로 조절합니다.
// 16px 아래로 내리지 않는 이유: iPhone Safari가 16px 미만 입력창을 탭할 때
// 화면을 자동 확대합니다 (WebApp_House_Style.md 3장, 예외 없는 규칙).
export const EDITOR_SIZES = Object.freeze([16, 18, 20, 24, 28, 32]);
export const DEFAULT_EDITOR_SIZE = 16;

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
