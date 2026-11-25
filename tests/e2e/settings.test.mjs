// End-to-end. Settings: the workplace sheet, release builds, export and backup, and developer mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, open, startedAgo, wait } from './helpers.mjs';

setup();

test('weekly limit is editable in the job settings and hidden when the weekly rule is off', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('[data-v=set]'); await wait(page);
  await page.locator('[data-job]').first().click(); await wait(page, 500);
  await page.locator('details.adv-sec summary').first().click(); await wait(page, 200);   // pay premiums are folded under the basics
  const field = page.locator('#j-weekly');
  assert.equal(await field.isVisible(), true);
  await field.locator('input').fill('45');
  await page.locator('label:has([data-k=weeklyRule])').click(); await wait(page, 200);
  assert.equal(await field.isVisible(), false, 'hidden with the rule off');
  await page.locator('label:has([data-k=weeklyRule])').click(); await wait(page, 200);
  await page.click('#j-save'); await wait(page, 500);
  const j = (await state()).jobs[0];
  assert.equal(+j.weeklyLimit, 45); assert.equal(j.weeklyRule, true);
  assert.deepEqual(errors, []); await ctx.close();
});

test('release: no developer screens, one notifications switch', async () => {
  const { page, ctx, errors, state } = await open({ native: true });
  await page.click('[data-v=set]'); await wait(page);
  assert.equal(await page.locator('#s-debug, #s-dev').count(), 0, 'no diagnostics or developer tools');
  for (let i = 0; i < 8; i++) await page.click('#s-ver');
  await wait(page); assert.equal(await page.locator('#s-dev').count(), 0, 'tapping the version does nothing');
  assert.equal(await page.locator('#ow-code').count(), 0, 'no code to type: developer mode comes only from npm run dev-unlock');
  assert.equal(await page.locator('#s-notif').count(), 1);
  await page.locator('label:has(#s-notif)').click(); await wait(page);
  assert.deepEqual((await state()).settings.notif, { rates: false, rest: false, long: false });
  await page.click('[data-v=home]'); await page.click('#punchBtn'); await wait(page, 800);
  const sched = await page.evaluate(() => __calls.filter(c => c.n === 'LocalNotifications' && c.m === 'schedule').at(-1)?.a?.notifications || []);
  assert.equal(sched.length, 0, 'nothing scheduled when off');
  assert.deepEqual(errors, []); await ctx.close();
});

test('export: every CSV and the backup build without errors, copied as text', async () => {
  const { page, ctx, errors } = await open();
  await startedAgo(page, 3); await page.click('#punchBtn'); await wait(page, 500); await page.click('#pd-ok'); await wait(page, 300);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } }, configurable: true }));
  for (const x of ['month', 'all', 'sum', 'backup']) {
    await page.click('[data-v=set]'); await wait(page);
    await page.evaluate(() => document.querySelector('#s-export').closest('details')?.setAttribute('open', '')); await page.click('#s-export'); await wait(page, 500);
    await page.click('#x-how [data-h=copy]'); await page.click(`[data-x=${x}]`); await wait(page, 400);
    const t = await page.evaluate(() => window.__copied || '');
    assert.ok(t.length > 20, `${x}: something was copied (${await page.locator('#toast').innerText()})`);
    if (x !== 'backup') assert.match(t, /,/, `${x}: CSV`);
    await page.evaluate(() => document.querySelector('#scrim').click()); await wait(page, 400);
  }
  assert.deepEqual(errors, []); await ctx.close();
});

test('developer mode: diagnostics self-test, demo shifts and the problem bar work', async () => {
  const { page, ctx, errors, state } = await open();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('etzba.v1')); s.settings.owner = true; s.settings.dev = true; localStorage.setItem('etzba.v1', JSON.stringify(s)); });
  await page.reload(); await wait(page, 700);
  await page.evaluate(() => document.querySelector('#scrim.on')?.click()); await wait(page, 400);   // owners first see the early Wrapped invitation
  await page.click('[data-v=set]'); await wait(page);
  await page.evaluate(() => document.querySelector('#s-debug').closest('details')?.setAttribute('open', '')); await page.click('#s-debug'); await wait(page, 400);
  await page.click('#d-test'); await wait(page, 1500);
  assert.match(await page.locator('#d-test-out').innerText(), /^✓ pay \d+/, 'self-test passes');
  await page.evaluate(() => document.querySelector('#scrim').click()); await wait(page, 400);
  await page.click('[data-v=set]'); await wait(page);
  await page.evaluate(() => document.querySelector('#s-dev').closest('details')?.setAttribute('open', '')); await page.click('#s-dev'); await wait(page, 400);
  await page.click('#dv-demo'); await wait(page, 300);
  assert.ok((await state()).shifts.some(x => x.src === 'demo'), 'demo shifts added');
  await page.click('#dv-undemo'); await wait(page, 300);
  assert.ok(!(await state()).shifts.some(x => x.src === 'demo'), 'demo shifts removed');
  await page.click('#dv-err'); await wait(page, 300);
  assert.equal(await page.locator('#probbar').count(), 1, 'the problem bar shows');
  assert.deepEqual(errors, []); await ctx.close();
});

// pretend answers from the website and GitHub for the developer dashboard
const sha = 'abc1234def5678';
const STATUS = { commit: 'abc1234', message: 'Fix', deployed: new Date().toISOString(), tests: { unit: { pass: 84, fail: 0 }, browser: { pass: 31, fail: 0 }, translations: { texts: 753, missing: 0 } },
  data: { rules: 8, packs: { en: 53 }, early: {} } };
const run = (over = {}) => ({ id: 7, status: 'completed', conclusion: 'success', head_sha: sha, head_commit: { message: 'Fix the widget' }, run_started_at: new Date().toISOString(), html_url: 'https://github.com/x', ...over });
const jobs = (test = 'success', step = null) => ({ jobs: [
  { name: 'test', status: 'completed', conclusion: test, steps: step ? [{ name: step, status: 'completed', conclusion: 'failure' }] : [] },
  { name: 'deploy', status: 'completed', conclusion: test === 'success' ? 'success' : 'skipped', steps: [] },
  { name: 'live-check', status: 'completed', conclusion: test === 'success' ? 'success' : 'skipped', steps: [] }] });
async function devApp(answers) {
  const app = await open();
  await app.ctx.route(/etzba\.co\.il\/data\/status\.json/, r => r.fulfill({ json: answers.status ?? STATUS }));
  await app.ctx.route(/api\.github\.com\/.*\/runs\?/, r => r.fulfill({ json: { workflow_runs: answers.runs } }));
  await app.ctx.route(/api\.github\.com\/.*\/jobs$/, r => r.fulfill({ json: answers.jobs }));
  await app.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('etzba.v1')); s.settings.owner = true; s.settings.dev = true; localStorage.setItem('etzba.v1', JSON.stringify(s)); localStorage.removeItem('etzba.devstatus'); });
  await app.page.reload(); await wait(app.page, 900);
  await app.page.evaluate(() => document.querySelector('#scrim.on')?.click()); await wait(app.page, 300);   // owners first see the Wrapped invitation
  return app;
}
const openDash = async page => { await page.click('[data-v=set]'); await wait(page); await page.click('#s-dash'); await wait(page, 900); return page.locator('#db-body').innerText(); };

test('dashboard: all good shows green, the test counts and this phone', async () => {
  const { page, ctx, errors } = await devApp({ runs: [run()], jobs: jobs() });
  await page.click('[data-v=set]'); await wait(page, 600);
  assert.match(await page.locator('#s-dash-sub').innerText(), /הכול תקין/, 'the Settings row says it too');
  const text = await openDash(page);
  assert.match(text, /הכול תקין/); assert.match(text, /84/); assert.match(text, /31/); assert.match(text, /753 טקסטים/);
  assert.match(text, /כל הדפים נפתחים/); assert.match(text, /v8 \/ v8/);
  assert.ok(!(await page.locator('#tabs [data-v=set]').evaluate(b => b.classList.contains('dot'))), 'no alarm dot');
  assert.deepEqual(errors, []); await ctx.close();
});

test('dashboard: failed tests show red, say which, and put a dot on the Settings tab', async () => {
  const { page, ctx, errors } = await devApp({ runs: [run({ conclusion: 'failure' })], jobs: jobs('failure', 'Browser tests') });
  assert.ok(await page.locator('#tabs [data-v=set]').evaluate(b => b.classList.contains('dot')), 'alarm dot on the Settings tab');
  const text = await openDash(page);
  assert.match(text, /נכשל: בדיקות דפדפן/); assert.match(text, /נשאר בגרסה הקודמת/); assert.match(text, /לא רץ: הבדיקות נכשלו/);
  assert.equal(await page.locator('[data-go=run]').count(), 1, 'a button to the failed run');
  assert.deepEqual(errors, []); await ctx.close();
});

test('dashboard: a running deploy says what it is doing; no internet says so', async () => {
  const busy = { jobs: [{ name: 'test', status: 'in_progress', conclusion: null, steps: [{ name: 'Unit tests', status: 'in_progress', conclusion: null }] }] };
  let { page, ctx, errors } = await devApp({ runs: [run({ status: 'in_progress', conclusion: null }), run({ id: 6 })], jobs: busy });
  assert.match(await openDash(page), /פרסום רץ עכשיו[\s\S]*בדיקות יחידה/);
  assert.deepEqual(errors, []); await ctx.close();
  ({ page, ctx, errors } = await open());   // everything outside blocked
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('etzba.v1')); s.settings.owner = true; s.settings.dev = true; localStorage.setItem('etzba.v1', JSON.stringify(s)); });
  await page.reload(); await wait(page, 900); await page.evaluate(() => document.querySelector('#scrim.on')?.click()); await wait(page, 300);
  assert.match(await openDash(page), /לא הצלחתי להגיע לאתר ול־GitHub/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('device tests: run from the dashboard, Android-only ones skip in a browser, the report can be copied', async () => {
  const { page, ctx, errors } = await devApp({ runs: [run()], jobs: jobs() });
  const local = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  await ctx.route(/etzba\.co\.il\/data\/rules\.json/, r => r.fulfill({ body: local('data/rules.json'), contentType: 'application/json' }));
  await ctx.route(/etzba\.co\.il\/data\/lang\/en\.json/, r => r.fulfill({ body: local('data/lang/en.json'), contentType: 'application/json' }));
  await page.evaluate(() => { window.__copied = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); });
  await openDash(page);
  await page.click('[data-go=device]');
  await page.waitForFunction(() => /הכול עבר|נכשלו/.test(document.querySelector('#dc-head')?.textContent || ''), null, { timeout: 60000 });
  const head = await page.locator('#dc-head').innerText(), list = await page.locator('#dc-list').innerText();
  assert.match(head, /הכול עבר/, head + '\n' + list);
  assert.match(list, /חישובי שכר זהים למחשב/); assert.match(list, /only in the Android app/);
  await page.click('#dc-copy'); await wait(page, 300);
  const report = await page.evaluate(() => window.__copied);
  assert.match(report, /^Etzba device tests/); assert.match(report, /PASS {2}math\/pay/); assert.match(report, /== Last 80 log lines ==/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('device tests: the restart test survives a real reload, and passes even though other tests save', async () => {
  const { page, ctx, errors } = await devApp({ runs: [run()], jobs: jobs() });
  await startedAgo(page, 2); await page.reload(); await wait(page, 900);
  await page.evaluate(() => document.querySelector('#scrim.on')?.click()); await wait(page, 300);
  await page.evaluate(() => import('/js/device-tests.js').then(m => m.restartTest()));
  await page.waitForFunction(() => { try { const r = JSON.parse(localStorage.getItem('etzba.devtests')); return r && r.results.some(x => x.id === 'restart'); } catch { return false; } }, null, { timeout: 30000 });
  const r = await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.devtests')).results.find(x => x.id === 'restart'));
  assert.equal(r.status, 'pass', r.note);
  assert.equal(await page.locator('#dc-head').count(), 1, 'the results opened by themselves after the restart');
  assert.deepEqual(errors, []); await ctx.close();
});
