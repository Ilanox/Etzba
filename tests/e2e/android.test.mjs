// End-to-end. Android only: the widget, clocking in from it, notifications, arrival detection, and the support purchase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('Android: the on-phone tests pass against the pretend bridge (each plugin is called the right way)', async () => {
  const plugins = ['App', 'AppActions', 'Filesystem', 'Share', 'Haptics', 'LocalNotifications', 'SplashScreen', 'Notify', 'ShareIn', 'Billing'];
  const { page, ctx, errors } = await open({ native: true, plugins });
  const local = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  await ctx.route(/etzba\.co\.il\/data\/rules\.json/, r => r.fulfill({ body: local('data/rules.json'), contentType: 'application/json' }));
  await ctx.route(/etzba\.co\.il\/data\/lang\/en\.json/, r => r.fulfill({ body: local('data/lang/en.json'), contentType: 'application/json' }));
  const ids = ['support_5', 'support_10', 'support_15', 'support_20', 'support_30', 'support_50', 'support_75', 'support_100', 'support_200'];
  await page.evaluate(ids => {
    window.__answers = { 'App.getInfo': { version: '1.0.0', build: '1000004' }, 'AppActions.deviceId': { id: 'a1b2c3d4e5f6' },
      'Billing.products': { products: ids.map(id => ({ id, price: '₪10' })) }, 'Billing.owned': { supported: true, owned: [] } };
    window.__mem = { notify: [{ id: 100, at: Date.now() + 36e5, title: 'x', body: 'y' }], files: {} };   // one real shift notification
  }, ids);
  await page.evaluate(() => import('/js/state.js').then(m => m.save()));   // writes the app's copy (1.5 s later)
  const run = await page.evaluate(() => import('/js/device-tests.js').then(m => m.runDeviceTests()));
  const bad = run.results.filter(r => r.status === 'fail').map(r => `${r.area}/${r.id}: ${r.note}`);
  assert.deepEqual(bad, [], bad.join('\n'));
  assert.deepEqual(run.results.filter(r => r.status === 'skip').map(r => r.id), ['restart'], 'only the restart test waits for a restart');
  assert.deepEqual(await page.evaluate(() => window.__mem.notify.map(x => x.id)), [100], 'the real notification is back, the test one gone');
  assert.deepEqual(await page.evaluate(() => Object.keys(window.__mem.files)), ['DATA/etzba-data.json'], 'the test file was deleted');
  assert.deepEqual(errors, []); await ctx.close();
});

test('Android: before the app is on Play, the products test explains instead of failing; an unreachable Play fails clearly', async () => {
  const { page, ctx, errors } = await open({ native: true, plugins: ['App', 'AppActions', 'Billing'] });
  await page.evaluate(() => { window.__answers = { 'Billing.products': { products: [] }, 'Billing.owned': { supported: false, owned: [], error: 'setup 3 Billing unavailable' } }; });
  const run = await page.evaluate(() => import('/js/device-tests.js').then(m => m.runDeviceTests()));
  const get = id => run.results.find(r => r.id === id);
  assert.equal(get('products').status, 'skip'); assert.match(get('products').note, /expected until the app is on Play/);
  assert.equal(get('owned').status, 'fail'); assert.match(get('owned').note, /could not be reached: setup 3/);
  assert.deepEqual(errors, []); await ctx.close();
});
