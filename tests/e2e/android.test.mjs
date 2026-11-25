// End-to-end. Android only: the widget, clocking in from it, notifications, arrival detection, and the support purchase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, open, wait } from './helpers.mjs';

setup();

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
