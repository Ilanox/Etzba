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
      if (window.__answers && (n + '.' + String(k)) in window.__answers) return window.__answers[n + '.' + String(k)];
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
  await page.fill('#ob-name', 'קפה'); await page.fill('#ob-rate', '29');
  assert.match(await page.locator('#ob-minw').innerText(), /הוסיפו תאריך לידה למטה/);
  const b = new Date(); b.setFullYear(b.getFullYear() - 17); b.setDate(b.getDate() - 20);
  const birth = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}`;
  await page.fill('#ob-birth', birth); await page.dispatchEvent('#ob-birth', 'change');
  assert.match(await page.locator('#ob-minw').innerText(), /30\.92/, 'youth minimum shown');
  await page.fill('#ob-rate', '45'); await page.dispatchEvent('#ob-rate', 'input');
  await page.click('#ob-next'); await page.click('#ob-next');
  await page.fill('#ob-start', '2024-03-01'); await page.click('[data-k=tipsOn] [data-v="1"]'); await page.click('[data-k=tipsMode] [data-v=wage]');
  await page.click('#ob-next'); await page.fill('#ob-goal', '6000'); await page.click('#ob-next'); await wait(page, 500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1')));
  assert.equal(st.jobs[0].name, 'קפה'); assert.equal(+st.jobs[0].rate, 45); assert.ok(st.settings.onboarded);
  assert.equal(st.jobs[0].startDate, '2024-03-01'); assert.ok(st.jobs[0].tipsOn); assert.equal(st.jobs[0].tipsMode, 'wage');
  assert.equal(st.settings.goal.amount, 6000); assert.equal(st.settings.birth, birth);
  assert.deepEqual(errors, []); await ctx.close();
});

test('clock in, clock out: saved at once, with a popup to edit or undo', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('#punchBtn'); await wait(page);
  assert.ok((await state()).active, 'running');
  await startedAgo(page, 3);
  await page.click('#punchBtn'); await wait(page, 500);
  let st = await state();
  assert.ok(!st.active, 'clocked out'); assert.equal(st.shifts.length, 1, 'saved without a form');
  assert.ok(await page.locator('#pop.on').isVisible(), 'popup');
  assert.equal(await page.locator('#sheet.on').count(), 0, 'no full form');
  await page.click('#pd-ok'); await wait(page, 400);
  assert.equal(await page.locator('#pop.on').count(), 0, 'closed');
  assert.deepEqual(errors, []); await ctx.close();
});

test('the popup after clock-out: undo carries the shift on, edit opens the form', async () => {
  const { page, ctx, errors, state } = await open();
  await startedAgo(page, 3); await page.click('#punchBtn'); await wait(page, 500);
  await page.click('#pd-undo'); await wait(page, 400);
  let st = await state();
  assert.ok(st.active, 'running again'); assert.equal(st.shifts.length, 0, 'not saved');
  await page.click('#punchBtn'); await wait(page, 500);
  await page.click('#pd-edit'); await wait(page, 500);
  assert.ok(await page.locator('#sheet.on #f-save').isVisible(), 'edit form');
  assert.equal(await page.locator('#f-del').count(), 1, 'editing the saved shift');
  assert.deepEqual(errors, []); await ctx.close();
});

test('delete a shift, then undo', async () => {
  const { page, ctx, errors, state } = await open();
  await startedAgo(page, 3); await page.click('#punchBtn'); await wait(page, 500); await page.click('#pd-ok'); await wait(page, 500);
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
  assert.ok(!(await state()).active, 'ended'); assert.ok(await page.locator('#pop.on').isVisible(), 'saved popup');
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
  assert.equal(await page.locator('#ow-code').count(), 0, 'no code to type: developer mode comes only from npm run dev-unlock');
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

test('English with a Hebrew job name never freezes (translating its own output in a loop)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem' });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.evaluate(() => localStorage.setItem('etzba.v1', JSON.stringify({ settings: { lang: 'en', onboarded: true }, jobs: [{ id: 'a', name: 'בולה', rate: 40 }],
    shifts: [{ id: 's1', jobId: 'a', start: '2026-11-16T08:00:00+02:00', end: '2026-11-16T16:00:00+02:00' }] })));
  page.reload().catch(() => {});
  await new Promise(r => setTimeout(r, 2500));
  const alive = await Promise.race([page.evaluate(() => document.querySelector('#tabs').innerText), new Promise(r => setTimeout(() => r(null), 4000))]);
  assert.ok(alive && /Settings/.test(alive), 'the page still responds, in English');
  await ctx.close();
});

test('Android: switching to English updates every widget text', async () => {
  const { page, ctx, errors } = await open({ native: true });
  await page.click('#punchBtn'); await wait(page, 500);
  await page.click('[data-v=set]'); await wait(page); await page.evaluate(() => document.querySelector('#s-lang').closest('details').open = true); await page.click('#s-lang [data-l=en]'); await wait(page, 800);
  const w = await page.evaluate(() => __calls.filter(c => c.n === 'AppActions' && c.m === 'updateWidget').at(-1).a);
  assert.equal(w.rtl, false);
  const texts = [w.extra.month.name, ...w.segs.map(s => s[2]), ...Object.values(w.labels)].join(' ');
  assert.doesNotMatch(texts, /[֐-׿]/, texts);
  assert.deepEqual(errors, []); await ctx.close();
});

test('a sick day from the summary, and the monthly report as a PDF', async () => {
  const { page, ctx, errors, state } = await open();
  await startedAgo(page, 4); await page.click('#punchBtn'); await wait(page, 500); await page.click('#pd-ok'); await wait(page, 400);
  await page.click('[data-v=sum]'); await wait(page);
  await page.click('#addLeave'); await wait(page);
  await page.click('#lv-kind [data-k=sick]'); await page.fill('#lv-n', '2'); await page.click('#lv-save'); await wait(page, 500);
  const st = await state();
  assert.equal(st.absences.length, 2); assert.ok(st.absences.every(a => a.kind === 'sick'));
  assert.equal(await page.locator('#leave [data-ab]').count() >= 1, true, 'listed this month');
  await page.click('#xReport'); await wait(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#rp-go')]);
  const buf = Buffer.from(await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c)));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-', 'a PDF'); assert.ok(buf.length > 20000, 'with a page image');
  assert.deepEqual(errors, []); await ctx.close();
});

test('tips: the field shows for a job with tips, and own tips stay out of gross', async () => {
  const { page, ctx, errors, state } = await open();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('etzba.v1')); s.jobs[0].tipsOn = true; localStorage.setItem('etzba.v1', JSON.stringify(s)); });
  await startedAgo(page, 4); await page.click('#punchBtn'); await wait(page, 500);
  await page.fill('#pd-tips', '150'); await page.click('#pd-ok'); await wait(page, 500);
  assert.equal((await state()).shifts[0].tips, 150, 'saved from the popup');
  await page.click('[data-v=sum]'); await wait(page);
  assert.match(await page.locator('#v-sum').innerText(), /טיפים שלך/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('a goal for the month: progress bar and shifts still needed, not counting Shabbat shifts', async () => {
  const { page, ctx, errors, state } = await open();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('etzba.v1')), j = s.jobs[0], now = new Date();
    j.rate = 50; j.shabbatOn = true;
    const mk = (daysAgo, h, sat) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); if (sat) d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); d.setHours(9, 0, 0, 0); return { id: crypto.randomUUID(), jobId: j.id, start: d.toISOString(), end: new Date(+d + h * 36e5).toISOString(), breakMin: 0, bonus: 0, note: '', rest: 'auto' }; };
    s.shifts = [mk(20, 8), mk(21, 8), mk(22, 8), mk(10, 8, true)];
    localStorage.setItem('etzba.v1', JSON.stringify(s));
  });
  await page.reload(); await wait(page, 700);
  await page.click('#goal'); await wait(page);
  await page.click('#g-kind [data-k=gross]'); await page.fill('#g-amt', '99999'); await page.click('#g-save'); await wait(page, 500);
  assert.deepEqual((await state()).settings.goal, { amount: 99999, kind: 'gross' });
  const txt = await page.locator('#goal').innerText();
  const have = (await page.evaluate(() => document.querySelector('#goal .goal-h b:last-child')?.textContent));
  // an ordinary shift here pays 8 × ₪50 = ₪400 (the Shabbat shift is left out of the average)
  const m = /עוד כ־(\d+)/.exec(txt); assert.ok(m, txt);
  assert.ok(+m[1] >= Math.floor((99999 - 4000) / 400) && +m[1] <= Math.ceil(99999 / 400), 'shifts at ₪400: ' + m[1]);
  assert.ok(await page.locator('.goal-bar i').count());
  await page.click('#goal'); await wait(page);
  assert.match(await page.locator('#sheet').innerText(), /רק משמרות רגילות/, 'the plan in the goal sheet');
  assert.deepEqual(errors, []); await ctx.close();
});

test('adding by hand: a special shift at 200%, and a vacation day in the same form', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('[data-v=shifts]'); await wait(page);
  await page.click('#fab'); await wait(page, 500);
  await page.click('#f-kind [data-k=special]'); await page.click('#f-pq [data-p="200"]'); await page.click('#f-save'); await wait(page, 500);
  let st = await state();
  assert.equal(st.shifts.length, 1); assert.equal(st.shifts[0].specialPct, 200);
  await page.click('#fab'); await wait(page, 500);
  await page.click('#f-kind [data-k=vac]'); await wait(page, 300);
  assert.ok(await page.locator('#f-ndays').isVisible(), 'days field in the same form');
  assert.equal(await page.locator('#f-shiftonly').isVisible(), false, 'times hidden');
  await page.click('#f-save'); await wait(page, 500);
  st = await state();
  assert.equal(st.absences.length, 1); assert.equal(st.absences[0].kind, 'vac');
  assert.deepEqual(errors, []); await ctx.close();
});

test('planned shifts: a shift ahead is saved as a plan; one that passed asks if you worked it', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('[data-v=shifts]'); await wait(page);
  await page.click('#fab'); await wait(page, 500);
  await page.locator('.day').filter({ hasText: 'נוב' }).last().click().catch(() => {});
  // pick a day after today on the strip
  const days = page.locator('#f-days .day, .days .day');
  const n = await days.count(); let picked = false;
  for (let i = 0; i < n; i++) { const d = +(await days.nth(i).getAttribute('data-d')); if (d > Date.now() + 864e5) { await days.nth(i).click(); picked = true; break; } }
  assert.ok(picked, 'a future day');
  await page.click('#f-save'); await wait(page, 500);
  let st = await state();
  assert.equal(st.shifts.length, 0, 'no pay yet'); assert.equal(st.plans.length, 1, 'planned');
  // a plan that already ended
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('etzba.v1')); const t = Date.now(); s.plans = [{ id: 'p1', jobId: s.jobs[0].id, start: new Date(t - 10 * 36e5).toISOString(), end: new Date(t - 2 * 36e5).toISOString(), breakMin: 0 }]; localStorage.setItem('etzba.v1', JSON.stringify(s)); });
  await page.reload(); await wait(page, 700);
  assert.ok(await page.locator('.plancell.missed').isVisible(), 'asks');
  await page.click('.plancell.missed [data-do=worked]'); await wait(page, 500);
  st = await state();
  assert.equal(st.plans.length, 0); assert.equal(st.shifts.length, 1, 'added as a shift');
  assert.deepEqual(errors, []); await ctx.close();
});

test('the year in Etzba: early for supporters, stories, and a picture to share', async () => {
  const { page, ctx, errors } = await open();
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('etzba.v1')); const j = s.jobs[0]; const y = new Date().getFullYear(); s.shifts = [];
    for (let m = 0; m < 3; m++) for (let d = 2; d < 20; d += 3) { const st = new Date(y, m, d, 9); s.shifts.push({ id: crypto.randomUUID(), jobId: j.id, start: st.toISOString(), end: new Date(+st + 8 * 36e5).toISOString(), breakMin: 0, bonus: 0, note: '', rest: 'auto' }); }
    s.settings.supported = true; s.ui = { ...(s.ui || {}), sumView: 'year' }; localStorage.setItem('etzba.v1', JSON.stringify(s)); });
  await page.reload(); await wait(page, 700);
  assert.ok(await page.locator('#en-later').isVisible(), 'was waiting for it, now a supporter: told once');
  await page.click('#en-later'); await wait(page, 300);
  await page.click('[data-v=sum]'); await wait(page, 500);
  assert.ok(await page.locator('#openRecap').isVisible(), 'a recap button in the year view');
  await page.click('#openRecap'); await wait(page, 600);
  assert.ok(await page.locator('.recap').isVisible(), 'stories open');
  for (let k = 0; k < 12; k++) { await page.mouse.click(80, 500); await wait(page, 150); }   // Hebrew: the left side is next
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#rc-share')]);
  assert.match(dl.suggestedFilename(), /\.png$/);
  assert.deepEqual(errors, []); await ctx.close();
});

/* ---- future shifts: plan → clock in → clock out → earnings ---- */
const setPlans = (page, plans) => page.evaluate(p => {
  const s = JSON.parse(localStorage.getItem('etzba.v1')); s.plans = p.map(x => ({ id: x.id, jobId: s.jobs[0].id, breakMin: 0, ...x }));
  s.jobs[0].rateOk = true; localStorage.setItem('etzba.v1', JSON.stringify(s));
}, plans);

test('future shift: saved with no end, shown as "from", edited, and the end is optional', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('[data-v=shifts]'); await wait(page); await page.click('#fab'); await wait(page, 700);
  await page.click('#f-kind [data-k=plan]'); await wait(page);
  assert.ok(await page.locator('#f-planbits').isVisible(), 'future-shift options');
  assert.equal(await page.locator('#f-paybits').isVisible(), false, 'no pay details for a plan');
  assert.equal(await page.locator('.tp-endpart').first().isVisible(), false, 'no end time by default');
  await page.click('#f-save'); await wait(page, 600);
  let st = await state();
  assert.equal(st.plans.length, 1); assert.equal(st.plans[0].end, null, 'end unknown');
  assert.ok(new Date(st.plans[0].start) > new Date(), 'in the future');
  await page.click('[data-v=home]'); await wait(page);
  assert.match(await page.locator('.plancell').innerText(), /מ־/, 'shown as "from …"');
  // edit: the end becomes known
  await page.click('.plancell'); await wait(page, 600); await page.click('#pl-edit'); await wait(page, 900);
  assert.ok(await page.locator('#f-kind [data-k=plan].on').count(), 'opens as a future shift');
  await page.click('#f-planend'); await wait(page);
  assert.ok(await page.locator('.tp-endpart').first().isVisible(), 'end time shown');
  await page.click('#f-save'); await wait(page, 600);
  st = await state();
  assert.equal(st.plans.length, 1, 'edited, not duplicated'); assert.ok(st.plans[0].end, 'end saved');
  assert.deepEqual(errors, []); await ctx.close();
});

test('future shift: clocking in turns it into a real shift, keeps the planned time, and undo brings the plan back', async () => {
  const { page, ctx, errors, state } = await open();
  const at = new Date(Date.now() + 30 * 6e4).toISOString();
  await setPlans(page, [{ id: 'p1', start: at, end: null }]); await page.reload(); await wait(page, 700);
  await page.click('#punchBtn'); await wait(page, 500);
  let st = await state();
  assert.ok(st.active, 'clocked in'); assert.equal(st.active.planned, at, 'planned start kept'); assert.equal(st.plans.length, 0, 'no longer a plan');
  await page.click('#toast .ta, #toast button').catch(() => {}); await wait(page, 500);   // undo the clock-in
  st = await state();
  assert.ok(!st.active, 'clock-in undone'); assert.equal(st.plans.length, 1, 'plan is back');
  await page.click('#punchBtn'); await wait(page, 500);
  await startedAgo(page, 5);
  await page.evaluate(at => { const s = JSON.parse(localStorage.getItem('etzba.v1')); s.active.planned = at; localStorage.setItem('etzba.v1', JSON.stringify(s)); }, at);
  await page.reload(); await wait(page, 700);
  await page.click('#punchBtn'); await wait(page, 600);
  st = await state();
  assert.equal(st.shifts.length, 1, 'shift saved'); assert.equal(st.shifts[0].planned, at, 'shift remembers its planned start');
  assert.ok(await page.locator('#pop.on').isVisible(), 'earnings popup');
  assert.match(await page.locator('#pop').innerText(), /₪/, 'shows the pay');
  assert.deepEqual(errors, []); await ctx.close();
});

test('future shift: a past one asks if it was worked: yes asks for the end, no marks it missed; across midnight keeps its end', async () => {
  const { page, ctx, errors, state } = await open();
  const y = new Date(); y.setDate(y.getDate() - 2); y.setHours(20, 0, 0, 0);
  const night = new Date(y); night.setDate(night.getDate() - 1);
  const nEnd = new Date(night); nEnd.setDate(nEnd.getDate() + 1); nEnd.setHours(2, 0, 0, 0);
  await setPlans(page, [{ id: 'p1', start: y.toISOString(), end: null }, { id: 'p2', start: night.toISOString(), end: nEnd.toISOString() }]);
  await page.reload(); await wait(page, 700);
  // the earliest missed one first: the night shift with a known end across midnight
  await page.click('.plancell [data-do=worked]'); await wait(page, 600);
  let st = await state();
  assert.equal(st.shifts.length, 1); assert.equal(st.shifts[0].end, nEnd.toISOString(), 'end after midnight kept');
  assert.equal(await page.locator('#sheet.on').count(), 0, 'known end: no question');
  // the next: no end known, "no" marks it as not worked
  await page.click('.plancell [data-do=missed]'); await wait(page, 500);
  st = await state();
  assert.equal(st.plans.length, 0, 'removed'); assert.equal(st.shifts.length, 1, 'not added as worked');
  // and a past one with no end, worked: opens the form to set the end
  await setPlans(page, [{ id: 'p3', start: y.toISOString(), end: null }]); await page.reload(); await wait(page, 700);
  await page.click('.plancell [data-do=worked]'); await wait(page, 800);
  assert.ok(await page.locator('#sheet.on').count(), 'asks when it ended');
  st = await state();
  assert.equal(st.shifts.length, 2); assert.ok(new Date(st.shifts[1].end) > new Date(st.shifts[1].start), 'a usual-length guess until corrected');
  assert.deepEqual(errors, []); await ctx.close();
});

test('net pay can be turned off: gross everywhere instead', async () => {
  const { page, ctx, errors, state } = await open();
  await startedAgo(page, 4); await page.click('#punchBtn'); await wait(page, 500); await page.click('#pd-ok'); await wait(page, 400);
  await page.click('[data-v=set]'); await wait(page);
  await page.click('label:has(#s-net)'); await wait(page, 500);
  assert.equal((await state()).settings.net, false);
  assert.equal(await page.locator('#s-sex').count(), 0, 'tax details hidden');
  assert.match(await page.locator('#chipNet').innerText(), /ברוטו החודש/);
  await page.click('[data-v=sum]'); await wait(page, 600);
  assert.match(await page.locator('.hero small').first().innerText(), /^ברוטו ל/);
  assert.equal(await page.locator('.hero .stack').count(), 0, 'no deductions bar');
  assert.doesNotMatch(await page.locator('#steps').innerText(), /מס הכנסה|נכנס לחשבון/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('age: a 17-year-old gets youth minimum wage, no NI from pay, no pension yet', async () => {
  const { page, ctx, errors, state } = await open();
  const b = new Date(); b.setFullYear(b.getFullYear() - 17); b.setDate(b.getDate() - 10);
  const birth = `${b.getFullYear()}-${String(b.getMonth() + 1).padStart(2, '0')}-${String(b.getDate()).padStart(2, '0')}`;
  await page.click('[data-v=set]'); await wait(page);
  await page.fill('#s-birth', birth); await page.dispatchEvent('#s-birth', 'change'); await wait(page, 500);
  assert.equal((await state()).settings.birth, birth);
  const txt = await page.locator('#v-set').textContent();
  assert.match(txt, /גיל 17: שכר מינימום לנוער ₪30\.92/);
  assert.match(txt, /חובה רק מגיל 21/);
  await startedAgo(page, 4); await page.click('[data-v=home]'); await wait(page); await page.click('#punchBtn'); await wait(page, 500); await page.click('#pd-ok'); await wait(page, 400);
  await page.click('[data-v=sum]'); await wait(page, 600);
  assert.match(await page.locator('#steps').innerText(), /עד גיל 18 לא יורד מהשכר/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('shift form: break, tips, bonus and travel start folded, with a summary', async () => {
  const { page, ctx, errors } = await open();
  await page.click('[data-v=shifts]'); await wait(page); await page.click('#fab'); await wait(page, 700);
  assert.equal(await page.locator('#f-more').getAttribute('open'), null, 'folded');
  await page.click('#f-more summary'); await wait(page);
  await page.click('#f-bq [data-b="30"]'); await wait(page);
  assert.match(await page.locator('#f-more-s').innerText(), /הפסקה 30/);
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

test('support on Android: choosing an amount buys it and thanks you', async () => {
  const { page, ctx, errors, state } = await open({ native: true, plugins: ['AppActions', 'LocalNotifications', 'App', 'Billing'] });
  await page.evaluate(() => { window.__answers = { ...(window.__answers || {}), 'Billing.buy': { ok: true }, 'Billing.products': { products: [{ id: 'support_10', price: '₪10' }, { id: 'support_20', price: '₪20' }, { id: 'support_50', price: '₪50' }] }, 'Billing.owned': { supported: true, owned: [] } }; });
  await page.click('[data-v=set]'); await wait(page);
  const btn = page.locator('#s-support'); if (!(await btn.count())) { await ctx.close(); return; }
  await btn.click(); await wait(page, 600);
  await page.click('#sheet [data-id]'); await wait(page, 300);
  if (await page.locator('#sp-pay').count()) { await page.click('#sp-pay'); await wait(page, 600); }
  assert.ok((await state()).settings.supported, 'marked as a supporter');
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
