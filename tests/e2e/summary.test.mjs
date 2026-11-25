// End-to-end. The summary: sick days, the monthly report, the month goal, net or gross, age rules, and the year in Etzba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, open, startedAgo, wait } from './helpers.mjs';

setup();

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
