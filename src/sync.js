/* ==========================================================================
   sync.js — webapp-data(비공개 저장소)와 설정을 주고받는 부분.

   다루는 것은 하나뿐입니다.
     quill/settings.<ctx>.json     설정만 (편집 중 초안은 제외)

   **편집 중인 초안은 올리지 않습니다.** 초안은 한 기기에서 쓰는 중인 글이라,
   기기 간에 섞이면 덮어쓰기 사고가 나기 쉽습니다. 얻는 것보다 위험이 큽니다.
   이벤트(B층)와 백업(C층)도 없습니다 — 설정은 "한 일"이 아니고, 백업은
   기존 `Export backup` 이 그대로 담당합니다.

   ── 설정 동기화에서 가장 조심할 것 ────────────────────────────────────

   **기본값이 남의 설정을 덮는 것**입니다. 앱을 새로 깐 기기가 켜지자마자
   기본 설정을 최신 시각으로 올리면, 다른 기기에서 맞춰 둔 값이 사라집니다.

   그래서 **사용자가 설정을 실제로 바꿨을 때만** 시각 도장을 찍고, 도장이
   없으면 아예 올리지 않습니다. 받을 때도 원격 도장이 내 도장보다 최신일
   때만 적용합니다.

   ── 공용 모듈은 필요할 때만 부릅니다 ─────────────────────────────────

   정적 `import` 로 부르면 그 파일 하나를 못 받는 순간 모듈 그래프가 통째로
   실패해 앱이 빈 화면이 됩니다. (2026-08-10 loom 에서 실제로 재현한 문제)
   ========================================================================== */

let sharedPromise = null;

async function api() {
  if (!sharedPromise) {
    sharedPromise = import('../../shared/v1/sync.js').catch((cause) => {
      sharedPromise = null; // 다음에 다시 시도합니다.
      const error = new Error('The shared sync module could not be loaded.');
      error.type = 'network';
      error.cause = cause;
      throw error;
    });
  }
  return sharedPromise;
}

const NAMESPACE = 'quill';

const REPO = Object.freeze({
  owner: 'jennie-verse',
  repo: 'webapp-data',
  branch: 'main'
});

export const KEYS = Object.freeze({
  token: 'sync.token.v1',
  enabled: 'quill.syncEnabled',
  lastSyncAt: 'quill.lastSyncAt',
  settingsUpdatedAt: 'quill.settingsUpdatedAt'
});

const MAX_FILE_BYTES = 1000000;

/* ── localStorage 도우미 ───────────────────────────────────────────────── */

function readItem(key, fallback = '') {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function writeItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // 사파리 비공개 모드에서는 저장이 막힐 수 있습니다.
  }
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

/* ── 토큰과 켜짐 여부 ──────────────────────────────────────────────────── */

export function getToken() {
  return readItem(KEYS.token, '');
}

export function saveToken(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) return false;
  return writeItem(KEYS.token, trimmed);
}

export function clearToken() {
  removeItem(KEYS.token);
}

/** 화면에는 마지막 네 자리만 보여 줍니다. */
export function tokenHint() {
  const token = getToken();
  return token ? `••••${token.slice(-4)}` : '';
}

export function isEnabled() {
  return readItem(KEYS.enabled) === '1';
}

export function setEnabled(enabled) {
  writeItem(KEYS.enabled, enabled ? '1' : '0');
}

/* 컨텍스트 값은 localStorage 만 읽고 씁니다. 통신이 없으므로 공용 모듈을 부르지
   않고 여기서 처리합니다. shared/v1 은 고정이라 키 이름이 바뀌지 않고, 검사
   스크립트가 실제 shared/v1 소스와 대조해 어긋나면 실패합니다. */

const CONTEXT_KEY = `${NAMESPACE}.syncContextId`;
const CONTEXT_LABEL_KEY = `${NAMESPACE}.syncContextLabel`;

export function getContextId() {
  return readItem(CONTEXT_KEY, '');
}

export function getContextLabel() {
  return readItem(CONTEXT_LABEL_KEY, '');
}

function contextFilePath(basePath, contextId) {
  const dot = basePath.lastIndexOf('.');
  if (dot === -1) return `${basePath}.${contextId}`;
  return `${basePath.slice(0, dot)}.${contextId}${basePath.slice(dot)}`;
}

/** 컨텍스트 ID 를 만듭니다.

    **ID 는 만들 때 정해지고 이후 바뀌지 않습니다.** 파일 이름에 들어가기 때문입니다.
    그래서 동기화를 켜기 전에 받은 이름을 여기로 넘겨 ID 에 반영합니다.
    공용 모듈은 이름에서 영문 소문자와 숫자만 남깁니다. */
export async function ensureContext(preferredName) {
  const Shared = await api();
  return Shared.ensureContextId(NAMESPACE, () => String(preferredName || '').trim());
}

/** 사용자가 붙이는 이름입니다. 한글도 그대로 저장됩니다. 파일 이름과는 무관합니다. */
export function setContextLabel(label) {
  writeItem(CONTEXT_LABEL_KEY, String(label || '').trim());
}

export function getLastSyncAt() {
  return Number(readItem(KEYS.lastSyncAt, '0')) || 0;
}

/** 동기화가 실제로 동작할 수 있는 상태인지. 셋 중 하나라도 없으면 조용히 쉽니다. */
export function isReady() {
  return Boolean(isEnabled() && getToken() && getContextId());
}

function config() {
  return { ...REPO, token: getToken() };
}

/** 화면에 그대로 보여 줄 수 있는 영문 한 줄로 바꿉니다. */
export function describeError(error) {
  if (!error) return 'Sync failed.';
  if (error.type === 'auth') return 'Token may be expired or lacks permission.';
  if (error.type === 'network') return 'Network unavailable. Try again later.';
  if (error.type === 'notfound') return 'The repository path was not found.';
  if (error.type === 'conflict') return 'Another device wrote first. Try again.';
  if (error.type === 'toolarge') return 'The settings file is too large to sync.';
  return 'Sync failed. Check the token and repository access.';
}

/* ── 설정이 바뀐 시각 ──────────────────────────────────────────────────── */

/** 사용자가 설정을 바꿨습니다. **이 함수를 부른 기기만 설정을 올릴 수 있습니다.**

    앱이 시작할 때나 기본값을 그리기만 할 때는 절대 부르지 않습니다.
    그것이 "새로 깐 기기의 기본값이 남의 설정을 덮는" 사고를 막는 유일한 장치입니다. */
export function markSettingsChanged() {
  writeItem(KEYS.settingsUpdatedAt, String(Date.now()));
}

export function getSettingsUpdatedAt() {
  return Number(readItem(KEYS.settingsUpdatedAt, '0')) || 0;
}

function setSettingsUpdatedAt(value) {
  writeItem(KEYS.settingsUpdatedAt, String(Number(value) || 0));
}

/* ── 설정 주고받기 ─────────────────────────────────────────────────────── */

function settingsPath(contextId) {
  return contextFilePath(`${NAMESPACE}/settings.json`, contextId);
}

/* 올릴 설정은 **필드를 하나씩 골라 담습니다.**

   넘어온 객체를 그대로 쓰면, 호출하는 쪽이 실수로 초안이나 파일 이름이 섞인
   객체를 넘겼을 때 그것이 그대로 저장소에 올라갑니다. 지금은 앱이 `state.settings`
   만 넘기지만, 나중에 누가 한 줄 잘못 고쳐도 개인 글이 새 나가지 않도록
   이 목록이 마지막 벽이 됩니다. (vault 의 `metaFor()` 와 같은 이유) */

const SETTING_KEYS = Object.freeze([
  'interfaceSize', 'editorSize', 'tabSize',
  'wrap', 'spellcheck', 'autocorrect', 'defaultExtension'
]);

export function pickSettings(settings) {
  const source = (settings && typeof settings === 'object') ? settings : {};
  const picked = {};
  for (const key of SETTING_KEYS) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}

/** 모든 기기의 설정 파일 중 **가장 최근에 바뀐 것**을 돌려줍니다.
    내 것보다 오래됐으면 null 을 돌려주어 화면이 그대로 유지되게 합니다. */
export async function pullSettings() {
  if (!isReady()) return null;
  const Shared = await api();
  const cfg = config();

  const entries = await Shared.listDir(cfg, NAMESPACE);
  const files = entries.filter((entry) => (
    entry.type === 'file' && /^settings\.[a-z0-9-]+\.json$/i.test(entry.name)
  ));

  let newest = null;
  for (const entry of files) {
    const read = await Shared.readFile(cfg, entry.path);
    if (!read.exists) continue;
    const payload = parseJson(read.content, null);
    const settings = payload && payload.data ? payload.data.settings : null;
    if (!settings || typeof settings !== 'object') continue;
    const at = Number(payload.data.settingsUpdatedAt) || 0;
    if (!newest || at > newest.at) newest = { at, settings };
  }

  writeItem(KEYS.lastSyncAt, String(Date.now()));
  if (!newest || newest.at <= getSettingsUpdatedAt()) return null;
  // 받은 쪽이 더 최신입니다. 도장도 그 시각으로 맞춰 두어야 이 기기가
  // 곧바로 되돌려 올리지 않습니다.
  setSettingsUpdatedAt(newest.at);
  return newest.settings;
}

/** 이 기기의 설정을 올립니다.

    **사용자가 한 번도 설정을 바꾸지 않았다면 아무것도 올리지 않습니다.**
    기본값을 최신 시각으로 올려 다른 기기에서 맞춰 둔 값을 덮는 것을 막습니다. */
export async function pushSettings(settings) {
  if (!isReady()) return false;
  const updatedAt = getSettingsUpdatedAt();
  if (!updatedAt) return false;
  if (!settings || typeof settings !== 'object') return false;

  const Shared = await api();
  const cfg = config();
  const contextId = getContextId();
  const path = settingsPath(contextId);

  const body = `${JSON.stringify({
    v: 1,
    app: NAMESPACE,
    context: contextId,
    updatedAt: new Date().toISOString(),
    data: { settings: pickSettings(settings), settingsUpdatedAt: updatedAt }
  }, null, 2)}\n`;

  if (body.length > MAX_FILE_BYTES) {
    const error = new Error('The settings file is too large to sync.');
    error.type = 'toolarge';
    throw error;
  }

  const existing = await Shared.readFile(cfg, path);
  await Shared.writeFile(cfg, path, body, {
    sha: existing.sha || undefined,
    message: `quill: update ${path}`
  });
  writeItem(KEYS.lastSyncAt, String(Date.now()));
  return true;
}
