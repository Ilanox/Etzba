// Tests that only mean something on the phone itself: the Android plugins, notifications, files, Google Play,
// the widget, and whether this phone's dates, time zone, calendar and number formats give the same answers as
// the computer that made js/device-fixtures.js. Run from the developer dashboard; the report can be shared as a file.
// Every test leaves the phone as it found it.
import * as native from './native-bridge.js';
import * as dbg from './diagnostics.js';
import BUILD from './build-info.js';
import FEATURES from './features.js';
import { S, save } from './state.js';
import { rules, validate as validRules, RULES_URL } from './rules.js';
import { shiftPay, defaultJob, computeAll } from './pay-engine.js';
import { holidaysOfGregorianYear, sunset, restWindows } from './hebrew-calendar.js';
import { money, hm } from './util.js';
import { translator } from './translate.js';
import { validate as validPack, PACK_URL } from './remote-packs.js';
import { syncWidget, lastWidget } from './widget.js';
import { SHIFTS, PLACE, EXPECT } from './device-fixtures.js';

const LAST = 'etzba.devtests', AFTER_RESTART = 'etzba.devtests.restart';
const ANDROID = native.PLATFORM === 'android';
const has = name => !!window.Capacitor?.isPluginAvailable?.(name);

class Skip extends Error {}
const skip = why => { throw new Skip(why); };
const check = (ok, msg) => { if (!ok) throw new Error(msg); };
const same = (got, want, what) => check(JSON.stringify(got) === JSON.stringify(want), `${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const android = () => { if (!ANDROID) skip('only in the Android app'); };

/* translations: skip-start (developer only) */
// [area, id, name, test]: the test returns a short note on success, throws to fail, or skip()s
const TESTS = [
  // the app shell
  ['app', 'plugins', 'כל התוספים של אנדרואיד נטענו', () => {
    android();
    const want = ['App', 'AppActions', 'Filesystem', 'Share', 'Haptics', 'LocalNotifications', 'SplashScreen', 'Notify', 'ShareIn',
      ...(FEATURES.support !== false ? ['Billing'] : []), ...(FEATURES.arrivalDetection ? ['Geo'] : [])];
    const missing = want.filter(n => !has(n));
    check(!missing.length, 'missing: ' + missing.join(', '));
    return `${want.length} plugins`;
  }],
  ['app', 'info', 'גרסה ומספר בנייה', async () => {
    android();
    const i = await native.appInfo();
    check(i, 'App.getInfo gave nothing');
    check(i.version === dbg.VERSION, `Android says ${i.version}, the web code says ${dbg.VERSION}`);
    check(+i.build > 0, 'no build number');
    return `${i.version} (${i.build}), built from ${BUILD.commit}`;
  }],
  ['app', 'device-id', 'מזהה מכשיר (לפתיחת מצב מפתח)', async () => { android(); const id = await native.appActions.deviceId(); check(id && id.length >= 8, 'no device id'); return 'ok'; }],
  ['app', 'haptics', 'רטט', async () => { android(); await native.raw('Haptics', 'impact', { style: 'LIGHT' }); return 'ok'; }],

  // saving data
  ['data', 'storage', 'שמירה בזיכרון האפליקציה', () => {
    const k = 'etzba.devtest.probe', v = String(Math.random());
    localStorage.setItem(k, v); const back = localStorage.getItem(k); localStorage.removeItem(k);
    check(back === v, 'localStorage returned something else');
    let bytes = 0; for (let i = 0; i < localStorage.length; i++) bytes += (localStorage.getItem(localStorage.key(i)) || '').length;
    return `${Math.round(bytes / 1024)} KB used`;
  }],
  ['data', 'save', 'שמירת הנתונים עובדת', () => { check(save() !== false, 'save() reported failure'); return `${S.shifts.length} shifts`; }],
  ['data', 'snapshot', 'העותק הגיבוי בקבצי האפליקציה', async () => {
    android();
    await new Promise(r => setTimeout(r, 1800));   // the copy is written 1.5 s after a save
    const json = await native.snapshot.load();
    check(json, 'no copy on disk');
    const d = JSON.parse(json);
    check(Array.isArray(d.shifts) && d.shifts.length === S.shifts.length, `copy has ${d.shifts?.length} shifts, the app ${S.shifts.length}`);
    return `${Math.round(json.length / 1024)} KB, ${d.shifts.length} shifts`;
  }],
  ['data', 'files', 'כתיבה וקריאה של קובץ', async () => {
    android();
    const path = 'etzba-devtest.txt', text = 'שלום ' + Date.now();
    await native.raw('Filesystem', 'writeFile', { path, data: text, directory: 'CACHE', encoding: 'utf8' });
    const { data } = await native.raw('Filesystem', 'readFile', { path, directory: 'CACHE', encoding: 'utf8' });
    await native.raw('Filesystem', 'deleteFile', { path, directory: 'CACHE' });
    same(data, text, 'read back');
    return 'ok';
  }],
  ['data', 'restart', 'הנתונים נשארים אחרי הפעלה מחדש', () => {
    const mark = localStorage.getItem(AFTER_RESTART);
    if (!mark) skip('press "בדיקה אחרי הפעלה מחדש" to run this one');
    const m = JSON.parse(mark); localStorage.removeItem(AFTER_RESTART);
    check(m.shifts === S.shifts.length, `before the restart ${m.shifts} shifts, after ${S.shifts.length}`);
    check(m.updatedAt === S.updatedAt, 'the saved data changed during the restart');
    return `${m.shifts} shifts kept, restart took ${Math.round((Date.now() - m.at) / 1000)} s`;
  }],

  // this phone gives the same answers
  ['math', 'timezone', 'אזור זמן ישראל', () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    check(tz === 'Asia/Jerusalem', `the phone is set to ${tz}: shifts are counted in its local time`);
    return tz;
  }],
  ['math', 'pay', 'חישובי שכר זהים למחשב', () => {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Asia/Jerusalem') skip('the phone is not on Israel time');
    const job = { ...defaultJob('test'), rate: 43.5 };
    const bad = [];
    SHIFTS.forEach(([name, start, hours], i) => {
      const p = shiftPay({ start, end: new Date(+new Date(start) + hours * 36e5).toISOString(), breakMin: 0 }, job, PLACE);
      const want = EXPECT.pay[i], got = Math.round(p.pay * 100) / 100;
      if (got !== want.pay || Math.round(p.hours * 60) !== want.minutes) bad.push(`${name}: ₪${got} / ${Math.round(p.hours * 60)} min, expected ₪${want.pay} / ${want.minutes} min`);
    });
    check(!bad.length, bad.join('; '));
    return `${SHIFTS.length} shifts, including a clock change and Yom Kippur`;
  }],
  ['math', 'calendar', 'חגים ושבת', () => {
    same(holidaysOfGregorianYear(2026).map(h => [h.name, new Date(h.date).toISOString()]), EXPECT.holidays, 'holidays 2026');
    const sun = new Date(sunset(2026, 5, 21, 32.085, 34.781)).toISOString();
    check(Math.abs(new Date(sun) - new Date(EXPECT.sun)) < 1000, `sunset ${sun}, expected ${EXPECT.sun}`);
    const rest = restWindows(new Date('2026-11-20T00:00:00+02:00'), new Date('2026-11-22T00:00:00+02:00'), PLACE, defaultJob('test'))
      .map(w => [new Date(w.from ?? w.start ?? w[0]).toISOString(), new Date(w.to ?? w.end ?? w[1]).toISOString()]);
    same(rest, EXPECT.rest, 'Shabbat 20–21.11.2026');
    return `${EXPECT.holidays.length} holidays, sunset, Shabbat times`;
  }],
  ['math', 'format', 'תצוגת סכומים ושעות', () => { same([money(1234.5), money(98765)], EXPECT.money, 'money'); same([hm(8.6), hm(12.25)], EXPECT.hm, 'hours'); return EXPECT.money.join(' · '); }],
  ['math', 'speed', 'מהירות: שנתיים של משמרות', () => {
    const job = { ...defaultJob('speed'), id: 'speed', rate: 40 + Math.random() }, shifts = [];   // a new rate: nothing from cache
    for (let i = 0; i < 600; i++) { const s = new Date(2025, 0, 1 + i, 8 + (i % 6)); shifts.push({ id: 'p' + i, jobId: 'speed', start: s.toISOString(), end: new Date(+s + (6 + i % 6) * 36e5).toISOString(), breakMin: 0 }); }
    const t = performance.now(); const n = [...computeAll(shifts, () => job, PLACE).values()].length; const ms = Math.round(performance.now() - t);
    check(n === shifts.length, `only ${n} of ${shifts.length} worked out`);
    check(ms < 4000, `${ms} ms for 600 shifts: too slow`);
    return `${ms} ms for 600 shifts`;
  }],

  // notifications
  ['notify', 'permission', 'הרשאת התראות', async () => {
    android();
    const s = await native.notifyStatus();
    check(s.display === 'granted', `notifications are "${s.display}": shift reminders won't show`);
    return 'granted';
  }],
  ['notify', 'schedule', 'תזמון התראה ומחיקתה', async () => {
    android(); if (!has('Notify')) skip('the Notify plugin is missing');
    const before = (await native.raw('Notify', 'pending'))?.items || [];
    const probe = { id: 990, at: Date.now() + 864e5, title: 'אצבע · בדיקה', body: 'נמחקת מיד' };
    try {
      await native.raw('Notify', 'schedule', { items: [...before, probe] });
      const during = (await native.raw('Notify', 'pending'))?.items || [];
      check(during.some(x => x.id === 990), 'the test notification was not scheduled');
    } finally { await native.raw('Notify', 'schedule', { items: before }); }   // put back exactly what was there
    const after = (await native.raw('Notify', 'pending'))?.items || [];
    check(!after.some(x => x.id === 990) && after.length === before.length, 'the scheduled notifications were not restored');
    return `${before.length} shift notifications kept`;
  }],

  // the widget, Google Play, the internet
  ['widget', 'update', 'עדכון הווידג׳ט', async () => {
    android(); if (FEATURES.widget === false) skip('the widget is off in this build');
    syncWidget();
    check(lastWidget, 'the app has nothing to send the widget');
    await native.raw('AppActions', 'updateWidget', JSON.parse(lastWidget));   // what it showed: nothing changes on screen
    return 'Android accepted the update';
  }],
  ['play', 'products', 'מוצרי התמיכה ב־Google Play', async () => {
    android(); if (!native.billing.available()) skip('billing is off in this build');
    const ids = ['support_5', 'support_10', 'support_15', 'support_20', 'support_30', 'support_50', 'support_75', 'support_100', 'support_200'];
    const found = await native.billing.products(ids);
    const missing = ids.filter(id => !found.some(p => p.id === id || p.productId === id));
    check(!missing.length, `${found.length}/${ids.length} found in Play Console; missing: ${missing.join(', ')}`);
    return `${found.length} products, e.g. ${found[0]?.price || ''}`;
  }],
  ['play', 'owned', 'קריאת רכישות קודמות', async () => {
    android(); if (!native.billing.available()) skip('billing is off in this build');
    const r = await native.billing.owned();
    check(r && r.supported !== false, 'Google Play billing is not available on this phone');
    return `${(r.owned || []).length} owned`;
  }],
  ['net', 'rules', 'הורדת נתוני השכר מהאתר', async () => {
    const d = await fetchJSON(RULES_URL); validRules(d);
    return `site v${d.version}, phone v${rules().version}`;
  }],
  ['net', 'pack', 'הורדת חבילת האנגלית', async () => {
    const d = await fetchJSON(PACK_URL('en')); validPack(d, 'en');
    const t = translator({ ...d, polish: [] });
    same(t('שמירה'), 'Save', 'translating a word with the downloaded pack');
    return `v${d.version}`;
  }],
];
/* translations: skip-end */

async function fetchJSON(url) {
  if (!navigator.onLine) skip('no internet');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
  try { const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal }); check(r.ok, 'HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/** Runs every test, one after another; onStep(results so far) after each. Saves and returns the result. */
export async function runDeviceTests(onStep) {
  const results = [], t0 = Date.now();
  dbg.log('info', 'device tests: start');
  for (const [area, id, name, fn] of TESTS) {
    const t = performance.now(); let status = 'pass', note = '';
    try {
      note = await Promise.race([Promise.resolve().then(fn), new Promise((_, no) => setTimeout(() => no(new Error('no answer within 15 s')), 15000))]) || '';
    } catch (e) {
      if (e instanceof Skip) { status = 'skip'; note = e.message; }
      else { status = 'fail'; note = e?.message || String(e); dbg.log('warn', `device test ${area}/${id}: ${note}`); }
    }
    results.push({ area, id, name, status, ms: Math.round(performance.now() - t), note });
    onStep?.(results);
  }
  const run = { at: t0, took: Date.now() - t0, results, device: await deviceInfo() };
  try { localStorage.setItem(LAST, JSON.stringify(run)); } catch {}
  dbg.log('info', `device tests: ${count(run).pass} passed, ${count(run).fail} failed`);
  return run;
}

/** Remembers the data, then restarts the app; the restart test checks it on the way back. */
export function restartTest() {
  localStorage.setItem(AFTER_RESTART, JSON.stringify({ at: Date.now(), shifts: S.shifts.length, updatedAt: S.updatedAt }));
  localStorage.setItem('etzba.devtests.auto', '1');
  location.reload();
}
/** After a restart test: true once, so the app reopens the results. */
export function pendingAfterRestart() {
  const v = localStorage.getItem('etzba.devtests.auto'); localStorage.removeItem('etzba.devtests.auto'); return !!v;
}

export const lastRun = () => { try { return JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { return null; } };
export const count = run => { const c = { pass: 0, fail: 0, skip: 0 }; for (const r of run?.results || []) c[r.status]++; return c; };
export const testCount = TESTS.length;

async function deviceInfo() {
  const info = native.NATIVE ? await native.appInfo() : null, e = dbg.env();
  return { app: `${dbg.VERSION}${info?.build ? ' (' + info.build + ')' : ''}`, commit: BUILD.commit, built: BUILD.built, where: e.where, webview: e.webview,
    ua: e.ua, screen: e.screen, memory: e.deviceMemory, cores: e.cores, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language, online: e.online, shifts: S.shifts.length };
}

/** The report to send: what ran, what failed and why, the phone, and the end of the app's log. */
export function reportText(run) {
  const c = count(run), d = run.device || {};
  const line = r => `${r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIP'}  ${r.area}/${r.id}  ${r.name}  (${r.ms} ms)${r.note ? '\n      ' + r.note : ''}`;
  const log = dbg.getLog().slice(-80).map(x => `${new Date(x.t).toISOString().slice(11, 23)} ${x.k.padEnd(5)} ${x.m}${x.d !== undefined ? ' ' + JSON.stringify(x.d) : ''}`);
  return [
    `Etzba device tests · ${new Date(run.at).toISOString()} · took ${(run.took / 1000).toFixed(1)} s`,
    `${c.pass} passed · ${c.fail} failed · ${c.skip} skipped`,
    '', '== Phone ==', ...Object.entries(d).map(([k, v]) => `${k}: ${v}`),
    '', '== Results ==', ...run.results.filter(r => r.status === 'fail').map(line), ...run.results.filter(r => r.status !== 'fail').map(line),
    '', '== Last 80 log lines ==', ...log, '',
  ].join('\n');
}
