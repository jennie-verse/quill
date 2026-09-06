/* ==========================================================================
   recovery.js — 편집 중이던 초안 1건을 IndexedDB에 보관

   기존 Quill(React 버전)과 같은 이름을 씁니다. 이름을 바꾸면 기존 초안을
   잃어버리므로 바꾸지 않습니다.
     데이터베이스: text-editor-recovery
     스토어:      drafts
     키:          active-draft
   ========================================================================== */

const DB_NAME = 'text-editor-recovery';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'active-draft';
// v2 adds the 'snapshots' store (see snapshots.js) alongside the untouched
// 'drafts' store — the existing active-draft recovery behavior does not change.
const DB_VERSION = 2;
export const SNAPSHOTS_STORE = 'snapshots';

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Recovery data unavailable'));
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new Error('Recovery storage failed.'));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const store = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('fileName', 'fileName', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Recovery storage failed.'));
    request.onblocked = () => reject(new Error('Recovery storage upgrade is blocked.'));
  });

  // 실패한 약속을 캐시하면 이후 시도가 전부 같은 오류로 막히므로 비웁니다.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function runTransaction(mode, action) {
  return runStoreTransaction(STORE_NAME, mode, action);
}

// Shared by recovery (drafts) and snapshots.js — same database connection.
export function runStoreTransaction(storeName, mode, action) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(storeName, mode);
    } catch (error) {
      reject(new Error('Recovery storage failed.'));
      return;
    }
    const store = transaction.objectStore(storeName);
    let result;
    try {
      result = action(store);
    } catch (error) {
      reject(new Error('Recovery storage failed.'));
      return;
    }
    transaction.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    transaction.onerror = () => reject(new Error('Recovery storage failed.'));
    transaction.onabort = () => reject(new Error('Recovery storage was aborted.'));
  }));
}

export function normalizeDraft(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.text !== 'string') return null;
  const savedAt = typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt))
    ? raw.savedAt
    : '';
  return {
    text: raw.text,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    savedAt
  };
}

export async function readDraft() {
  const stored = await runTransaction('readonly', (store) => store.get(DRAFT_KEY));
  return normalizeDraft(stored);
}

export async function writeDraft(draft) {
  const payload = {
    text: typeof draft.text === 'string' ? draft.text : '',
    fileName: typeof draft.fileName === 'string' ? draft.fileName : '',
    savedAt: new Date().toISOString()
  };
  await runTransaction('readwrite', (store) => store.put(payload, DRAFT_KEY));
  return payload;
}

export async function clearDraft() {
  await runTransaction('readwrite', (store) => store.delete(DRAFT_KEY));
}

/* 페이지를 떠날 때는 비동기 트랜잭션이 끝나기 전에 문서가 사라질 수 있습니다.
   그래서 마지막 안전망으로 localStorage 에 한 번 더 적어 둡니다.
   다음 실행에서 IndexedDB 초안보다 이 값이 더 새것이면 그쪽을 씁니다. */
const FALLBACK_KEY = 'text-editor-recovery-fallback-v1';

export function writeFallbackDraft(draft) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify({
      text: typeof draft.text === 'string' ? draft.text : '',
      fileName: typeof draft.fileName === 'string' ? draft.fileName : '',
      savedAt: new Date().toISOString()
    }));
    return true;
  } catch (error) {
    return false;
  }
}

export function readFallbackDraft() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return normalizeDraft(raw ? JSON.parse(raw) : null);
  } catch (error) {
    return null;
  }
}

export function clearFallbackDraft() {
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch (error) {
    // 지우지 못해도 다음 저장에서 덮어씁니다.
  }
}

export function newerDraft(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const timeA = Date.parse(a.savedAt || '') || 0;
  const timeB = Date.parse(b.savedAt || '') || 0;
  return timeB > timeA ? b : a;
}
