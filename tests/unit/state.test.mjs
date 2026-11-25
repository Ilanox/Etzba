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
