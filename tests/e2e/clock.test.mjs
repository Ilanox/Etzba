// End-to-end. The clock screen: first launch, clocking in and out, undo, delete, and the back button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, browser, URL_, open, startedAgo, wait } from './helpers.mjs';

setup();

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

test('back button: closes a sheet, then asks before leaving', async () => {
  const { page, ctx, errors } = await open({ native: true });
  await page.click('[data-v=sum]'); await wait(page);
  await page.evaluate(() => __fire('App', 'backButton', {})); await wait(page);
  assert.equal(await page.evaluate(() => document.querySelector('.view.on').id), 'v-home');
  await page.evaluate(() => __fire('App', 'backButton', {})); await wait(page);
  assert.equal(await page.locator('#x-exit').count(), 1, 'asks');
  assert.deepEqual(errors, []); await ctx.close();
});

test('first launch: the pay field starts empty, not with a made-up number, and empty means the minimum wage', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_); await wait(page, 800);
  await page.click('#ob-next');
  assert.equal(await page.inputValue('#ob-rate'), '');
  assert.equal(await page.inputValue('#ob-name'), '');
  assert.match(await page.locator('#ob-minw').innerText(), /ריק = שכר המינימום/);
  for (let i = 0; i < 3; i++) await page.click('#ob-next');
  assert.match(await page.locator('.ob-sub').first().innerText(), /שכר מינימום/);
  await page.click('#ob-next'); await wait(page, 500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1')));
  assert.ok(+st.jobs[0].rate > 30, 'the minimum wage was saved');
  assert.deepEqual(errors, []); await ctx.close();
});
