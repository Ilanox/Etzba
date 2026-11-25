// The saved data (js/state.js): whatever is in storage is checked before the app uses it.
import test from 'node:test';
import assert from 'node:assert/strict';

test('state: bad data is repaired, not trusted', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem() {} };
  globalThis.addEventListener ??= () => {}; globalThis.window ??= globalThis;
  const { normalizeState, fresh } = await import('../../js/state.js');
  const d = normalizeState({ jobs: [{ id: '"><img>', color: 'red;x', name: 'א' }], shifts: [{ jobId: '"><img>', start: 'x', end: 'y' }, { jobId: '"><img>', start: '2026-01-01T08:00', end: '2026-01-01T16:00' }], settings: { birth: 'nope' } });
  assert.match(d.jobs[0].id, /^[\w.:-]+$/); assert.match(d.jobs[0].color, /^#/);
  assert.equal(d.shifts.length, 1); assert.equal(d.shifts[0].jobId, d.jobs[0].id);
  assert.equal(d.settings.birth, ''); assert.deepEqual(d.settings.notif, fresh().settings.notif);
  assert.equal(normalizeState(null).jobs.length, 1);
});

// A backup as an early version wrote it: no format number, newest-first sorting, travel copied onto imported shifts.
const oldBackup = () => ({
  jobs: [{ id: 'j1', name: 'קפה', rate: 40, travel: 12 }],
  shifts: [
    { id: 's1', jobId: 'j1', start: '2025-03-02T08:00:00.000Z', end: '2025-03-02T16:00:00.000Z', src: 'import', travel: 12 },
    { id: 's2', jobId: 'j1', start: '2025-03-03T08:00:00.000Z', end: '2025-03-03T16:00:00.000Z', src: 'import', travel: 12 },
    { id: 's3', jobId: 'j1', start: '2025-03-04T08:00:00.000Z', end: '2025-03-04T12:00:00.000Z', travel: 30 },
  ],
  absences: [{ id: 'a1', date: '2025-03-05', kind: 'sick' }],
  settings: { city: 'חיפה' }, ui: { sort: 'new' },
});

test('state: an old backup is upgraded step by step, and nothing in it is lost', async () => {
  const { normalizeState, FORMAT } = await import('../../js/state.js');
  const d = normalizeState(oldBackup());
  assert.equal(d.format, FORMAT);
  assert.equal(d.ui.sort, 'old');
  assert.deepEqual(d.shifts.map(s => s.id), ['s1', 's2', 's3']);
  assert.equal(d.shifts[0].travel, undefined, 'the copied travel is dropped');
  assert.equal(d.shifts[2].travel, 30, 'travel set on a shift by hand stays');
  assert.equal(d.absences.length, 1); assert.equal(d.settings.city, 'חיפה');
});

test('state: data upgraded before formats were numbered is not upgraded again', async () => {
  const { normalizeState, FORMAT } = await import('../../js/state.js');
  const b = oldBackup(); b.settings.migSort = 1; b.settings.migTravel = 1;
  const d = normalizeState(b);
  assert.equal(d.format, FORMAT); assert.equal(d.ui.sort, 'new', 'chosen after the upgrade: kept');
  assert.equal(d.shifts[0].travel, 12); assert.equal(d.settings.migSort, undefined);
});

test('state: opening the same data twice changes nothing, and data from a newer version keeps its format', async () => {
  const { normalizeState, FORMAT } = await import('../../js/state.js');
  const once = normalizeState(oldBackup()), twice = normalizeState(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
  const newer = normalizeState({ ...oldBackup(), format: FORMAT + 5 });
  assert.equal(newer.format, FORMAT + 5); assert.equal(newer.shifts.length, 3);
});
