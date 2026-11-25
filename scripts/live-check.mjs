// Opens the live website like a visitor and fails if anything is broken: the home page, the app, every guide,
// the privacy page, and the data the phones download. After a deploy it waits until the new commit is live.
//   npm run live-check            check etzba.co.il now
//   node scripts/live-check.mjs <commit>   (the deploy) wait for that commit first, up to 5 minutes
import { chromium } from 'playwright';
import { PAGES } from './site/guides.mjs';

// the app's own checks for downloaded data; they expect a browser around them
globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { validate: validRules } = await import('../js/rules.js');
const { validate: validPack } = await import('../js/remote-packs.js');

const SITE = process.env.SITE || 'https://etzba.co.il';
const want = process.argv[2];
const problems = [], notes = new Set();
// added by Cloudflare, not by us; the site's security policy blocks it, so it's harmless noise: noted, not a failure
const HARMLESS = /cloudflareinsights\.com/;
const get = async path => { const r = await fetch(SITE + path + (path.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r; };

// 1. the deploy has reached the site (GitHub's servers can take a minute)
if (want) {
  for (let i = 0; ; i++) {
    const live = await get('/data/status.json').then(r => r.json()).catch(() => ({}));
    if (live.commit === want.slice(0, 7)) break;
    if (i >= 30) { console.error(`✗ after 5 minutes the site still shows ${live.commit || 'nothing'}, not ${want.slice(0, 7)}`); process.exit(1); }
    await new Promise(r => setTimeout(r, 10000));
  }
}

// the app on the site is this very commit (its build stamp), not a cached older copy
if (want) {
  const stamp = await get('/app/js/build-info.js').then(r => r.text()).catch(e => e.message);
  if (!stamp.includes(`commit: '${want.slice(0, 7)}'`)) problems.push(`/app/js/build-info.js: not stamped with ${want.slice(0, 7)}`);
}

// 2. the data files the phones download pass the same checks the app runs
for (const [path, check] of [['/data/rules.json', validRules], ['/data/lang/en.json', d => validPack(d, 'en')], ['/data/early.json', d => { if (!d || typeof d !== 'object') throw new Error('not an object'); }]]) {
  try { check(await get(path).then(r => r.json())); } catch (e) { problems.push(`${path}: ${e.message}`); }
}

// 3. every page opens without errors; the app gets as far as its clock screen
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const pages = ['/', '/app/', '/privacy', ...PAGES.map(p => `/${p.slug}/`)];
for (const path of pages) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error' || /favicon|Failed to load resource/.test(m.text())) return;
    if (HARMLESS.test(m.text())) notes.add('Cloudflare adds its analytics script to the pages and the security policy blocks it: turn off Web Analytics for etzba.co.il in Cloudflare');
    else errors.push(m.text());
  });   // failed loads: our own are caught below
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(SITE)) errors.push(`${r.status()} ${r.url().slice(SITE.length)}`); });
  try {
    const res = await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 30000 });
    if (!res?.ok()) errors.push('HTTP ' + res?.status());
    if (path === '/app/') await page.waitForSelector('#punchBtn, #onboard', { timeout: 15000 });
    else if (!(await page.locator('h1').count())) errors.push('no heading');
  } catch (e) { errors.push(e.message.split('\n')[0]); }
  if (errors.length) problems.push(`${path}: ${[...new Set(errors)].join('; ')}`);
  else console.log(`✓ ${path}`);
  await ctx.close();
}
await browser.close();

// notes show as warnings on the GitHub run
for (const n of notes) console.log(process.env.GITHUB_ACTIONS ? `::warning::${n}` : `! ${n}`);
if (problems.length) { console.error('\n✗ ' + problems.join('\n✗ ')); process.exit(1); }
console.log(`\nAll ${pages.length} pages and the phone data are fine.`);
