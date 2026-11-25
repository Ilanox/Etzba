// Shared by the end-to-end tests: a local server, a real browser (phone-sized) and a pretend Android bridge.
//   npm run test:e2e        (first time: npx playwright install chromium)
import { before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 5000 + Math.floor(Math.random() * 1000);
export const URL_ = `http://localhost:${PORT}/`;
export let browser;
let server;

/** Starts the server and the browser for this test file, and stops them after. */
export function setup() {
  before(async () => {
    server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { if ((await fetch(URL_)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  });
  after(async () => { await browser?.close(); server?.kill(); });
}

// A pretend Capacitor on Android: records every native call, lets the test fire native events.
export const MOCK = ({ plugins }) => {
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
      // a little memory, like the real plugins: scheduled notifications and files
      const mem = window.__mem ||= { notify: [], files: {} };
      if (n === 'Notify' && k === 'schedule') { mem.notify = (a.items || []).filter(x => x.at > Date.now()); return { count: mem.notify.length }; }
      if (n === 'Notify' && k === 'pending') return { items: mem.notify };
      if (n === 'Filesystem' && k === 'writeFile') { mem.files[a.directory + '/' + a.path] = a.data; return { uri: 'file://' + a.path }; }
      if (n === 'Filesystem' && k === 'readFile') { const f = mem.files[a.directory + '/' + a.path]; if (f == null) throw new Error('File does not exist'); return { data: f }; }
      if (n === 'Filesystem' && k === 'deleteFile') { delete mem.files[a.directory + '/' + a.path]; return {}; }
      return {};
    };
  } });
  window.__fire = (n, e, d) => (L[n + ':' + e] || []).forEach(cb => cb(d));
  window.__mk = mk;
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {}, isPluginAvailable: n => plugins.includes(n), registerPlugin: n => mk(n) };
};

/** Opens the app in a fresh browser profile, past the welcome screen. native: with the pretend Android bridge. */
export async function open({ native = false, plugins = ['AppActions', 'LocalNotifications', 'App'], lang, offline = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', serviceWorkers: 'block' });
  if (offline) await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());   // nothing outside this computer: proves it works with no internet
  if (native) await ctx.addInitScript(MOCK, { plugins });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL_); await page.waitForTimeout(700);
  if (lang) { await page.click(`#ob-lang [data-l=${lang}]`); await page.waitForTimeout(500); }
  if (await page.locator('#ob-skip').count()) { await page.click('#ob-skip'); await page.waitForTimeout(300); }
  return { page, ctx, errors, state: () => page.evaluate(() => JSON.parse(localStorage.getItem('etzba.v1'))) };
}
/** A shift that started some hours ago, as if clocked in then. */
export async function startedAgo(page, hours) {
  await page.evaluate(h => {
    const s = JSON.parse(localStorage.getItem('etzba.v1'));
    s.active = { jobId: s.jobs[0].id, start: new Date(Date.now() - h * 36e5).toISOString() };
    localStorage.setItem('etzba.v1', JSON.stringify(s));
  }, hours);
  await page.reload(); await page.waitForTimeout(700);
}
export const wait = (page, ms = 350) => page.waitForTimeout(ms);
