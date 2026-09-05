/* ==========================================================================
   snapshots.js — 파일당 최대 10개의 수동 버전 기록

   원본 파일은 iOS 제약으로 덮어쓸 수 없으므로(quill은 편집기이지 문서
   라이브러리가 아님), 스냅샷은 오직 이 앱의 IndexedDB에만 존재합니다.
   같은 데이터베이스(`text-editor-recovery`)의 `snapshots` 스토어를 씁니다
   — recovery.js가 DB 연결을 열고 관리합니다.
   ========================================================================== */

import { SNAPSHOTS_STORE, runStoreTransaction } from './recovery.js';

export const MAX_SNAPSHOTS_PER_FILE = 10;

export function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.text !== 'string') return null;
  const savedAt = typeof raw.savedAt === 'string' && Number.isFinite(Date.parse(raw.savedAt))
    ? raw.savedAt
    : new Date().toISOString();
  return {
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    text: raw.text,
    charCount: typeof raw.charCount === 'number' ? raw.charCount : raw.text.length,
    savedAt,
  };
}

function byFileNameIndex(store) {
  return store.index('fileName');
}

export async function listSnapshots(fileName) {
  const rows = await runStoreTransaction(SNAPSHOTS_STORE, 'readonly', (store) => byFileNameIndex(store).getAll(IDBKeyRange.only(fileName)));
  return (rows || []).slice().sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

export async function getSnapshotById(id) {
  return runStoreTransaction(SNAPSHOTS_STORE, 'readonly', (store) => store.get(id));
}

// Saves a snapshot, then enforces the 10-per-file cap by deleting the
// oldest ones over the limit. Manual saves only — nothing calls this
// automatically.
export async function createSnapshot({ fileName, text }) {
  const payload = normalizeSnapshot({ fileName, text, savedAt: new Date().toISOString() });
  await runStoreTransaction(SNAPSHOTS_STORE, 'readwrite', (store) => store.add(payload));
  const all = await listSnapshots(fileName);
  const overflow = all.slice(MAX_SNAPSHOTS_PER_FILE);
  for (const row of overflow) await deleteSnapshot(row.id);
  return all.slice(0, MAX_SNAPSHOTS_PER_FILE);
}

export async function deleteSnapshot(id) {
  await runStoreTransaction(SNAPSHOTS_STORE, 'readwrite', (store) => store.delete(id));
}

export async function getAllSnapshots() {
  const rows = await runStoreTransaction(SNAPSHOTS_STORE, 'readonly', (store) => store.getAll());
  return rows || [];
}

export async function clearAllSnapshots() {
  await runStoreTransaction(SNAPSHOTS_STORE, 'readwrite', (store) => store.clear());
}

// Used by backup restore. Replaces every snapshot; rows are re-inserted with
// fresh auto-increment ids since ids are local-only and not part of the
// backup's public contract.
export async function replaceAllSnapshots(rows) {
  await clearAllSnapshots();
  const normalized = (Array.isArray(rows) ? rows : []).map(normalizeSnapshot).filter(Boolean);
  for (const row of normalized) await runStoreTransaction(SNAPSHOTS_STORE, 'readwrite', (store) => store.add(row));
  return normalized.length;
}
