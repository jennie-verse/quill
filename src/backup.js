/* ==========================================================================
   backup.js — 초안과 설정만 담은 JSON 백업·복원

   문서 라이브러리가 아니므로 백업에 들어가는 것은 두 가지뿐입니다.
     1. 편집 중이던 초안 1건
     2. 설정
   실제 파일은 iOS Files 앱에 있습니다. 백업으로 문서를 보관하지 않습니다.
   ========================================================================== */

import { normalizeSettings } from './settings.js';
import { normalizeDraft } from './recovery.js';

export const BACKUP_KIND = 'quill-backup';
export const BACKUP_VERSION = 1;

// 10MB를 넘으면 iOS에서 내보내기가 실패하는 경우가 있어 미리 막습니다.
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export function backupFileName(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `quill-backup-${year}-${month}-${day}.json`;
}

export function buildBackup({ draft, settings }) {
  return JSON.stringify({
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    draft: draft ? normalizeDraft(draft) : null,
    settings: normalizeSettings(settings)
  }, null, 2);
}

export function checkBackupSize(text) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BACKUP_BYTES) throw new Error('Backup is too large');
  return bytes;
}

/* 가져오기 전에 형식을 검사합니다. 형식이 맞지 않으면 예외를 던지고,
   호출부가 사용자에게 알린 뒤 기존 데이터를 건드리지 않습니다. */
export function parseBackup(rawText) {
  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    throw new Error('Invalid Quill backup.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Quill backup.');
  }

  // 기존 React 버전이 만든 백업도 받아들입니다.
  const kind = typeof payload.kind === 'string' ? payload.kind : '';
  const looksLikeOldBackup = 'draft' in payload || 'settings' in payload;
  if (kind !== BACKUP_KIND && !looksLikeOldBackup) {
    throw new Error('Invalid Quill backup.');
  }

  return {
    draft: normalizeDraft(payload.draft),
    settings: normalizeSettings(payload.settings),
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : ''
  };
}

export function describeBackup(backup) {
  const parts = [];
  parts.push(backup.draft ? 'Draft included' : 'No draft');
  parts.push('Settings included');
  if (backup.exportedAt && Number.isFinite(Date.parse(backup.exportedAt))) {
    parts.push(new Date(backup.exportedAt).toLocaleString());
  }
  return parts.join(' · ');
}
