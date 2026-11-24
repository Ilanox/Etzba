import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { esc, hm, pad, pctChange, niceMax, dateKey, money2 } from '../../js/util.js';

test('util: text and numbers', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(hm(8.6), '8:36'); assert.equal(hm(0.999), '1:00');
  assert.equal(pad(7), '07');
  assert.equal(pctChange(113, 100), 13); assert.equal(pctChange(5, 0), null);
  assert.equal(niceMax(7.3), 10); assert.equal(niceMax(140), 200); assert.equal(niceMax(0), 1);
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.match(money2(5.5), /5\.50/);
});

test('offline cache lists every app module', () => {
  const sw = readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  for (const f of readdirSync(new URL('../../js/', import.meta.url), { recursive: true }).filter(f => f.endsWith('.js')))
    assert.ok(sw.includes(`'js/${f}'`), `js/${f} missing from service-worker.js`);
});

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
