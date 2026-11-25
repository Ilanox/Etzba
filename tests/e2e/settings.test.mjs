// End-to-end. Settings: the workplace sheet, release builds, export and backup, and developer mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
