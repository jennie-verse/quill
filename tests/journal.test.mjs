import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocumentActivity } from '../src/journal-record.js';

const document = { id: 'fixture-session', title: 'Fixture.md', text: 'private words must not leave' };

test('Quill projection contains title and activity but never document text', () => {
  let record = mergeDocumentActivity(null, document, 'opened', '2026-08-17T09:00:00-05:00');
  record = mergeDocumentActivity(record, document, 'edited', '2026-08-17T10:00:00-05:00');
  record = mergeDocumentActivity(record, document, 'export-requested', '2026-08-17T11:00:00-05:00');
  assert.deepEqual(record.data.actions, ['opened', 'edited', 'export-requested']);
  assert.equal(record.data.openCount, 1);
  assert.equal(JSON.stringify(record).includes('private words must not leave'), false);
});

test('new document sessions, explicit opens, edits, and exports are connected', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /journalSessionId/);
  assert.match(app, /documentFingerprint/);
  for (const action of ['created', 'opened']) assert.match(app, new RegExp(`beginJournalSession\\(['"]${action}['"]\\)`));
  for (const action of ['edited', 'export-requested']) assert.match(app, new RegExp(`recordActivity\\([^\\n]+['"]${action}['"]`));
});
