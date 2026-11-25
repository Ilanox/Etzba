// End-to-end. What the website hands to the app, and what the app hands back out: a shift from a calculator's link,
// the month as a picture, and "send to a friend".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, open, browser, URL_, wait } from './helpers.mjs';

setup();
const p2 = n => String(n).padStart(2, '0');
const day = new Date(Date.now() - 864e5), D = `${day.getFullYear()}-${p2(day.getMonth() + 1)}-${p2(day.getDate())}`;

test('a calculator link on a first visit: the welcome screens first, then the shift, ready to save', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${URL_}?add=${D},08:00,19:30`); await wait(page, 800);
  assert.ok(await page.locator('#onboard').count(), 'welcome screens first');
  assert.ok(!page.url().includes('add='), 'the link is taken off the address bar');
  await page.click('#ob-skip'); await wait(page, 900);
  assert.ok(await page.locator('#f-save').isVisible(), 'the new-shift form opened');
  await page.click('#f-save'); await wait(page, 500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1')));
  assert.equal(st.shifts.length, 1);
  const s = new Date(st.shifts[0].start), e = new Date(st.shifts[0].end);
  assert.deepEqual([s.getHours(), s.getMinutes(), (e - s) / 36e5], [8, 0, 11.5]);
  await page.reload(); await wait(page, 800);
  assert.equal(await page.locator('#f-save').count(), 0, 'not again after a reload');
  assert.deepEqual(errors, []); await ctx.close();
});

test('a calculator link when the app is set up: the form opens straight away; a bad link does nothing', async () => {
  const { page, ctx, errors } = await open();
  await page.goto(`${URL_}?add=${D},22:00,06:00`); await wait(page, 1000);
  assert.ok(await page.locator('#f-save').isVisible());
  await page.click('#f-save'); await wait(page, 500);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1')));
  assert.equal((new Date(st.shifts[0].end) - new Date(st.shifts[0].start)) / 36e5, 8, 'a night shift into the next day');
  await page.goto(`${URL_}?add=nonsense`); await wait(page, 1000);
  assert.equal(await page.locator('#f-save').count(), 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test('the month as a picture, and sending the app to a friend', async () => {
  const { page, ctx, errors } = await open();
  await page.evaluate(() => {
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async d => { window.__shared.push({ files: (d.files || []).map(f => [f.name, f.type, f.size]), url: d.url, text: d.text }); };
  });
  await page.click('[data-v=shifts]'); await wait(page);
  await page.click('#fab'); await wait(page, 500); await page.click('#f-save'); await wait(page, 500);
  await page.click('[data-v=sum]'); await wait(page);
  await page.click('#xCard'); await wait(page, 1500);
  let shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.length, 1);
  const [name, type, size] = shared[0].files[0];
  assert.match(name, /^etzba-\d{4}-\d\d\.png$/); assert.equal(type, 'image/png'); assert.ok(size > 20000, `${size} bytes`);
  await page.click('[data-v=set]'); await wait(page);
  await page.click('#s-friend'); await wait(page, 500);
  shared = await page.evaluate(() => window.__shared);
  assert.equal(shared[1].url, 'https://etzba.co.il/');
  assert.deepEqual(errors, []); await ctx.close();
});
