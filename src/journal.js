import * as sync from './sync.js';
import { localDate, localIso, mergeDocumentActivity } from './journal-record.js';
const HOSTNAME = globalThis.location?.hostname || '';
const ENABLED = 'quill.journalEnabled.v1'; const ACTIVITY = 'quill.journalActivity.v1'; const REPO = {
  owner: HOSTNAME.endsWith('.github.io')
    ? HOSTNAME.slice(0, -'.github.io'.length)
    : '',
  repo: 'webapp-data', branch: 'main'
};
let clientPromise = null; let lastState = { status: 'not reported', pendingCount: 0, errorCode: '' };
const read = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } }; const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const parse = value => { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } };
export const isJournalEnabled = () => read(ENABLED) === '1'; export const getJournalState = () => ({ enabled: isJournalEnabled(), ...lastState });
async function client() { if (clientPromise) return clientPromise; clientPromise = (async () => { const context = sync.getContextId(); if (!context) return null; const v2 = await import('../../shared/v2/journal.js'); return v2.createJournalClient({ app: 'quill', context, namespace: 'quill-journal', isEnabled: isJournalEnabled, resolveConfig: async () => { const token = sync.getToken(); if (!token) throw Object.assign(new Error('Journal authentication unavailable'), { code: 'AUTH' }); return { ...REPO, token }; }, onState: state => { lastState = { ...lastState, status: state.status, pendingCount: state.pendingCount, errorCode: state.errorCode || '' }; } }); })().catch(() => null); return clientPromise; }
export async function toggleJournal(enabled, name = '') { if (enabled) { if (!sync.getToken()) return { ok: false, reason: 'token' }; try { if (!sync.getContextId()) await sync.ensureContext(name); if (name) sync.setContextLabel(name); } catch { return { ok: false, reason: 'context' }; } } write(ENABLED, enabled ? '1' : '0'); clientPromise = null; lastState = { ...lastState, status: enabled ? 'ready' : 'disabled', errorCode: '' }; await reportStatus(); return { ok: true }; }
export async function reportStatus(extra = {}) { const c = await client(); if (!c) return false; try { await c.reportStatus({ journalEnabled: isJournalEnabled(), ...extra }); return true; } catch { return false; } }
export async function recordActivity(document, action, options = {}) { if (!isJournalEnabled() || !document?.id) return false; const at = options.at || new Date(); const date = localDate(at); const items = parse(read(ACTIVITY)); const key = `${date}:${document.id}`; const record = mergeDocumentActivity(items[key], document, action, at, options); items[key] = record; write(ACTIVITY, JSON.stringify(items)); const c = await client(); if (!c) return false; try { await c.enqueue(record, { date }); return true; } catch { return false; } }
export async function refreshJournalState() { const c = await client(); if (c) { try { lastState.pendingCount = await c.pendingCount(); } catch {} } return getJournalState(); }
export { localIso };
