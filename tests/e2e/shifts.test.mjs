// End-to-end. Adding and editing shifts: by hand, special rates, planned and future shifts, the folded extras, tips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, open, startedAgo, wait } from './helpers.mjs';

setup();

const setPlans = (page, plans) => page.evaluate(p => {
  const s = JSON.parse(localStorage.getItem('etzba.v1')); s.plans = p.map(x => ({ id: x.id, jobId: s.jobs[0].id, breakMin: 0, ...x }));
  s.jobs[0].rateOk = true; localStorage.setItem('etzba.v1', JSON.stringify(s));
}, plans);

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

test('shift form: break, tips, bonus and travel start folded, with a summary', async () => {
  const { page, ctx, errors } = await open();
  await page.click('[data-v=shifts]'); await wait(page); await page.click('#fab'); await wait(page, 700);
  assert.equal(await page.locator('#f-more').getAttribute('open'), null, 'folded');
  await page.click('#f-more summary'); await wait(page);
  await page.click('#f-bq [data-b="30"]'); await wait(page);
  assert.match(await page.locator('#f-more-s').innerText(), /הפסקה 30/);
  assert.deepEqual(errors, []); await ctx.close();
});
