// End-to-end. English: nothing left in Hebrew, falling back when a language breaks, surviving restarts, the widget texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, browser, URL_, open, wait } from './helpers.mjs';

setup();

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
