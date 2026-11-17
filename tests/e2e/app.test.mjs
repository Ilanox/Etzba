// End-to-end: the real app in a real browser (phone-sized), with a pretend Android bridge for the native parts.
//   npm run test:e2e        (first time: npx playwright install chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 5000 + Math.floor(Math.random() * 1000), URL_ = `http://localhost:${PORT}/`;
let server, browser;

before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL_)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
});
after(async () => { await browser?.close(); server?.kill(); });

// A pretend Capacitor on Android: records every native call, lets the test fire native events.
const MOCK = ({ plugins }) => {
  window.__calls = []; const L = {};
  const mk = n => new Proxy({}, { get: (t, k) => {
    if (k === 'then') return undefined;
    if (k === 'addListener') return (e, cb) => { (L[n + ':' + e] ||= []).push(cb); return Promise.resolve({ remove() {} }); };
    return async a => {
      __calls.push({ n, m: String(k), a });
      if (n === 'AppActions' && k === 'take') { const d = window.__pending; window.__pending = null; return d || {}; }
      if (n === 'LocalNotifications' && k === 'checkPermissions') return { display: 'granted' };
      if (n === 'LocalNotifications' && k === 'getPending') return { notifications: [] };
      return {};
    };
  } });
  window.__fire = (n, e, d) => (L[n + ':' + e] || []).forEach(cb => cb(d));
  window.__mk = mk;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {}, isPluginAvailable: n => plugins.includes(n), registerPlugin: n => mk(n) };
};

async function open({ native = false, plugins = ['AppActions', 'LocalNotifications', 'App'], lang, offline = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', serviceWorkers: 'block' });
  if (offline) await ctx.route(/github\.io|googleapis|gstatic/, r => r.abort());   // proves it works with no internet
  if (native) await ctx.addInitScript(MOCK, { plugins });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_); await page.waitForTimeout(700);
  if (lang) { await page.click(`#ob-lang [data-l=${lang}]`); await page.waitForTimeout(500); }
  if (await page.locator('#ob-skip').count()) { await page.click('#ob-skip'); await page.waitForTimeout(300); }
  return { page, ctx, errors, state: () => page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1'))) };
}
/** A shift that started some hours ago, as if clocked in then. */
async function startedAgo(page, hours) {
  await page.evaluate(h => {
    const s = JSON.parse(localStorage.getItem('etzba.v1'));
    s.active = { jobId: s.jobs[0].id, start: new Date(Date.now() - h * 36e5).toISOString() };
    localStorage.setItem('etzba.v1', JSON.stringify(s));
  }, hours);
  await page.reload(); await page.waitForTimeout(700);
}
const wait = (page, ms = 350) => page.waitForTimeout(ms);

test('first launch, offline: welcome, set up a job, no errors', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_); await wait(page, 800);
  assert.equal(await page.locator('#onboard').count(), 1, 'welcome shows');
  await page.click('#ob-next');
  await page.fill('#ob-name', 'קפה'); await page.fill('#ob-rate', '45');
  await page.click('#ob-next'); await page.click('#ob-next'); await page.click('#ob-next'); await wait(page, 500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1')));
  assert.equal(st.jobs[0].name, 'קפה'); assert.equal(+st.jobs[0].rate, 45); assert.ok(st.settings.onboarded);
  assert.deepEqual(errors, []); await ctx.close();
});

test('clock in, clock out, the shift is saved', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('#punchBtn'); await wait(page);
  assert.ok((await state()).active, 'running');
  await startedAgo(page, 3);
  await page.click('#punchBtn'); await wait(page, 500);
  await page.click('#f-save'); await wait(page, 500);
  const st = await state();
  assert.ok(!st.active); assert.equal(st.shifts.length, 1);
  assert.deepEqual(errors, []); await ctx.close();
});

test('delete a shift, then undo', async () => {
  const { page, ctx, errors, state } = await open();
  await startedAgo(page, 3); await page.click('#punchBtn'); await wait(page, 500); await page.click('#f-save'); await wait(page, 500);
  await page.click('[data-v=shifts]'); await wait(page);
  await page.locator('#v-shifts .srow').first().click(); await wait(page);
  await page.click('#f-del'); await wait(page);
  assert.equal((await state()).shifts.length, 0, 'one tap deletes');
  await page.click('.t-act'); await wait(page);
  assert.equal((await state()).shifts.length, 1, 'undo restores');
  assert.deepEqual(errors, []); await ctx.close();
});

test('weekly limit is editable in the job settings and hidden when the weekly rule is off', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('[data-v=set]'); await wait(page);
  await page.locator('[data-job]').first().click(); await wait(page, 500);
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

test('English: no Hebrew left on the main screens', async () => {
  const { page, ctx, errors } = await open({ lang: 'en' });
  for (const v of ['home', 'shifts', 'sum', 'set']) {
    await page.click(`[data-v=${v}]`); await wait(page);
    const heb = (await page.locator('.view.on').innerText()).split('\n').filter(t => /[֐-׿]/.test(t));
    // job and city names are the user's own; the language picker and the app's name stay Hebrew
    assert.deepEqual(heb.filter(t => !/עבודה|תל אביב|ירושלים|עברית|אצבע/.test(t)), [], v);
  }
  assert.deepEqual(errors, []); await ctx.close();
});

test('Android: the widget follows the running shift', async () => {
  const { page, ctx, errors } = await open({ native: true });
  const widget = () => page.evaluate(() => __calls.filter(c => c.n === 'AppActions' && c.m === 'updateWidget').map(c => c.a));
  await wait(page, 400);
  assert.equal((await widget()).at(-1)?.active, false, 'idle at start');
  await page.click('#punchBtn'); await wait(page);
  const on = (await widget()).at(-1);
  assert.equal(on.active, true); assert.ok(on.start > Date.now() - 6e4, 'start time sent'); assert.ok(on.labels.since);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Android: tapping the widget clocks in, and asks before clocking out', async () => {
  const { page, ctx, errors, state } = await open({ native: true });
  await page.evaluate(() => { window.__pending = { action: 'toggle' }; __fire('AppActions', 'action', {}); }); await wait(page);
  assert.ok((await state()).active, 'started from the widget');
  await page.evaluate(() => { window.__pending = { action: 'toggle' }; __fire('AppActions', 'action', {}); }); await wait(page);
  assert.ok((await state()).active, 'not ended without asking');
  await page.click('#wa-end'); await wait(page, 500);
  assert.equal(await page.locator('#f-save').count(), 1, 'end-shift screen');
  assert.deepEqual(errors, []); await ctx.close();
});

test('Android: arrival detection is hidden when the build has it switched off', async () => {
  for (const [plugins, shown] of [[['AppActions'], false], [['AppActions', 'Geo'], true]]) {
    const { page, ctx, errors } = await open({ native: true, plugins });
    await page.click('[data-v=set]'); await wait(page);
    await page.locator('[data-job]').first().click(); await wait(page, 500);
    assert.equal((await page.locator('#sheet').innerText()).includes('מיקום העבודה'), shown, plugins.join());
    assert.deepEqual(errors, []); await ctx.close();
  }
});

test('Android: notifications are scheduled for a running shift', async () => {
  const { page, ctx, errors } = await open({ native: true });
  await page.click('#punchBtn'); await wait(page, 800);
  const sched = await page.evaluate(() => __calls.filter(c => c.n === 'LocalNotifications' && c.m === 'schedule').at(-1)?.a?.notifications || []);
  assert.ok(sched.length >= 1, 'at least the overtime notification');
  assert.ok(sched.every(n => n.id >= 100 && n.title && n.body && n.schedule?.at));
  assert.deepEqual(errors, []); await ctx.close();
});

test('back button: closes a sheet, then asks before leaving', async () => {
  const { page, ctx, errors } = await open({ native: true });
  await page.click('[data-v=sum]'); await wait(page);
  await page.evaluate(() => __fire('App', 'backButton', {})); await wait(page);
  assert.equal(await page.evaluate(() => document.querySelector('.view.on').id), 'v-home');
  await page.evaluate(() => __fire('App', 'backButton', {})); await wait(page);
  assert.equal(await page.locator('#x-exit').count(), 1, 'asks');
  assert.deepEqual(errors, []); await ctx.close();
});

test('release: no developer screens, one notifications switch', async () => {
  const { page, ctx, errors, state } = await open({ native: true });
  await page.click('[data-v=set]'); await wait(page);
  assert.equal(await page.locator('#s-debug, #s-dev').count(), 0, 'no diagnostics or developer tools');
  for (let i = 0; i < 8; i++) await page.click('#s-ver');
  await wait(page); assert.equal(await page.locator('#s-dev').count(), 0, 'tapping the version does nothing');
  assert.equal(await page.locator('#s-notif').count(), 1);
  await page.locator('label:has(#s-notif)').click(); await wait(page);
  assert.deepEqual((await state()).settings.notif, { rates: false, rest: false, long: false });
  await page.click('[data-v=home]'); await page.click('#punchBtn'); await wait(page, 800);
  const sched = await page.evaluate(() => __calls.filter(c => c.n === 'LocalNotifications' && c.m === 'schedule').at(-1)?.a?.notifications || []);
  assert.equal(sched.length, 0, 'nothing scheduled when off');
  assert.deepEqual(errors, []); await ctx.close();
});

test('a language that failed to start falls back to Hebrew, with the details to copy', async () => {
  const { page, ctx, errors } = await open({ native: true, lang: 'en' });
  await wait(page, 4500);   // a good start clears the mark
  assert.equal(await page.evaluate(() => localStorage.getItem('etzba.langBoot')), null);
  // pretend the last start in English never finished
  await page.evaluate(() => localStorage.setItem('etzba.langBoot', 'en'));
  await page.reload(); await wait(page, 1500);
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1')).settings.lang), 'he');
  assert.match(await page.locator('.toast').innerText(), /השפה הוחזרה לעברית/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('Android: English survives a restart', async () => {
  const { page, ctx, errors } = await open({ native: true, lang: 'en' });
  await page.click('#punchBtn'); await wait(page, 500);
  await page.reload(); await wait(page, 1500);
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
  assert.ok(await page.locator('#tabs .tic svg').count() >= 5, 'the app drew');
  assert.match(await page.locator('#tabs').innerText(), /Settings/);
  assert.deepEqual(errors, []); await ctx.close();
});
