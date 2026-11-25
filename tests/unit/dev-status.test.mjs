// The developer dashboard's verdict (js/dev-status.js), the status file the deploy writes, and the deploy order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

globalThis.addEventListener ??= () => {};
globalThis.window ??= globalThis;
globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { verdict } = await import('../../js/dev-status.js');

const live = { commit: 'abc1234', data: { rules: 8, packs: { en: 53 } } };
const phone = { commit: 'abc1234', rules: 8, packs: { en: 53 } };
const run = (conclusion, jobs = [], status = 'completed') => ({ commit: 'abc1234', status, conclusion, jobs });
const job = (name, conclusion, step) => ({ name, conclusion, status: conclusion ? 'completed' : 'in_progress', step: step ? { name: step } : null });

test('dashboard verdict: every state says the right thing', () => {
  const ok = run('success', [job('test', 'success'), job('deploy', 'success'), job('live-check', 'success')]);
  assert.equal(verdict({ live, phone, latest: ok, lastDone: ok, behind: 0, errors: [] }).level, 'ok');

  const testsFailed = run('failure', [job('test', 'failure', 'Browser tests'), job('deploy', 'skipped'), job('live-check', 'skipped')]);
  const v = verdict({ live, phone, latest: testsFailed, lastDone: testsFailed, behind: 0, errors: [] });
  assert.equal(v.level, 'bad'); assert.match(v.headline, /בדיקות דפדפן/); assert.match(v.detail, /נשאר בגרסה הקודמת/);

  const liveFailed = run('failure', [job('test', 'success'), job('deploy', 'success'), job('live-check', 'failure', 'Open the live site')]);
  assert.match(verdict({ live, phone, latest: liveFailed, lastDone: liveFailed, behind: 0, errors: [] }).detail, /האתר עלה/);

  const busy = run(null, [job('test', null, 'Unit tests')], 'in_progress');
  assert.equal(verdict({ live, phone, latest: busy, lastDone: ok, behind: 0, errors: [] }).level, 'busy');

  const old = verdict({ live, phone: { ...phone, rules: 7 }, latest: ok, lastDone: ok, behind: 3, errors: [] });
  assert.equal(old.level, 'warn'); assert.match(old.detail, /מאחור ב־3/); assert.match(old.detail, /נתוני השכר/);

  assert.equal(verdict({ live: null, phone, latest: null, lastDone: null, errors: ['offline'] }).level, 'unknown');
});

test('the status file has what the dashboard reads', () => {
  const out = '/tmp/etzba-status-test.json';
  execFileSync(process.execPath, ['scripts/status.mjs', out], { env: { ...process.env, GITHUB_SHA: 'abcdef1234', UNIT_PASS: '84', UNIT_FAIL: '0', TR_TEXTS: '753', TR_MISSING: '0' } });
  const s = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(s.commit, 'abcdef1'); assert.equal(s.tests.unit.pass, 84); assert.equal(s.tests.translations.texts, 753);
  assert.ok(Number.isInteger(s.data.rules)); assert.ok(Number.isInteger(s.data.packs.en));
});

test('the website deploys only after the tests pass, and is checked after', () => {
  const wf = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(wf, /\n  deploy:\n    needs: test\n/, 'deploy waits for the tests');
  assert.match(wf, /\n  live-check:\n    needs: deploy\n/, 'the live check runs after the deploy');
  for (const step of ['scripts/test.mjs 2>&1', 'scripts/test.mjs e2e', 'check-translations.mjs --strict', 'scripts/status.mjs', 'scripts/live-check.mjs']) assert.ok(wf.includes(step), step);
});

test('the phone-test answers are current: regenerated from the pay engine and calendar, they match js/device-fixtures.js', () => {
  const now = readFileSync(new URL('../../js/device-fixtures.js', import.meta.url), 'utf8');
  execFileSync(process.execPath, ['scripts/device-fixtures.mjs']);
  assert.equal(readFileSync(new URL('../../js/device-fixtures.js', import.meta.url), 'utf8'), now, 'run: node scripts/device-fixtures.mjs');
});

test('dashboard verdict: offline, website down, GitHub down and a rollback are told apart', () => {
  const ok = run('success', [job('test', 'success'), job('deploy', 'success'), job('live-check', 'success')]);
  assert.match(verdict({ online: false, live: null, phone, latest: null, lastDone: null, errors: [] }).headline, /לא מחובר/);
  const down = verdict({ online: true, live: null, phone, latest: ok, lastDone: ok, errors: ['status.json: HTTP 404'] });
  assert.equal(down.level, 'bad'); assert.match(down.headline, /האתר לא עונה/);
  const noGit = verdict({ online: true, live, phone, latest: null, lastDone: null, behind: 0, errors: ['GitHub: HTTP 500'] });
  assert.equal(noGit.level, 'warn'); assert.match(noGit.detail, /GitHub לא ענה/);
  const back = { ...ok, rollback: 'abc1234', event: 'workflow_dispatch' };
  const v = verdict({ online: true, live, phone, latest: back, lastDone: back, rolledBackFrom: { commit: 'f00ba12' }, behind: 0, errors: [] });
  assert.equal(v.level, 'bad'); assert.match(v.headline, /חזר אוטומטית לגרסה abc1234/); assert.match(v.detail, /f00ba12/);
});

test('a failed live check publishes the last good version again, once', () => {
  const wf = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(wf, /\n  rollback:\n    needs: live-check\n    if: failure\(\) && needs\.live-check\.result == 'failure' && !inputs\.ref\n/, 'only after a failed live check, and never from a rollback itself');
  assert.match(wf, /event=push&status=success/, 'goes back to a pushed version that passed everything');
  assert.match(wf, /gh workflow run pages\.yml .*-f ref=/);
});
