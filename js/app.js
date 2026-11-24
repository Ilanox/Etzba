// אצבע — app
import { rateChanges, computeAll, shiftPay, jobAt } from './pay-engine.js';
import { I, mark } from './svg-icons.js';
import { loadRules, checkForUpdates, rules } from './rules.js';
import { preferPack, checkPack } from './remote-packs.js';
import { usePack, startTranslating, stopTranslating, tr } from './translate.js';
import { LANGS, loadPack, langInfo } from '../languages/index.js';
import * as dbg from './diagnostics.js';
import * as native from './native-bridge.js';
import { buzz, toast, openSheet, closeSheet, sheetOpen } from './ui.js';
import { LANG, EN, MONTHS, useLanguage } from './lang.js';
import { view, viewY, viewM, showMonth, setView, VIEWS, setRenderHooks, go, render, onSave, setSaveFailed, persist, commit } from './nav.js';
import { viewAs, isSup, applyTheme, startTheme } from './theme.js';
import { NET, recompute, weekRegBefore, monthCalc, withLive } from './pay.js';
import { S, setState, save, hadLocal, jobById, place, index } from './state.js';
import { $, $$, esc, nm, uid, pad, money, hm, tm } from './util.js';
import DEV_KEY from './dev-key.js';
import { setSpeech, startA11y } from './a11y.js';
import FEATURES from './features.js';
import { openShiftSheet } from './views/shift-form.js';
import { tierLabel, countUp } from './views/common.js';
import { renderHome, renderRestCard, tickHome, planReminders, onPunch } from './views/home.js';
import { renderShifts } from './views/shifts.js';
import { renderSum } from './views/summary.js';
import { recapBanner, hrs } from './views/recap.js';
import { checkEarly } from './early.js';
import { renderRights } from './views/rights.js';
import { openOnboarding } from './views/onboarding.js';
import { renderSet, openLegal } from './views/settings.js';
import { deliver, copyText } from './files.js';
import { openFileImport, takeSharedFile, backupNow, updateBackupDot } from './views/data.js';

export const VERSION = '1.0.0';
dbg.log('boot', 'v' + VERSION);

loadRules();
document.documentElement.lang = LANG; document.documentElement.dir = langInfo(LANG).dir;

startTheme(() => syncWidget());
onSave(() => planNotifications()); onSave(() => syncGeo()); onSave(() => syncWidget());
setSaveFailed(() => toast('לא הצלחתי לשמור בטלפון. כדאי לגבות', 'err', { label: 'גיבוי עכשיו', fn: () => backupNow() }));

/* ================= helpers ================= */


/* ================= HOME ================= */


/* ================= SHIFT SHEET ================= */

/* ================= SHIFTS ================= */

/* ================= SUMMARY (תלוש) ================= */

/* ================= sick days and vacation ================= */

/* ================= monthly report (PDF) ================= */


/* ================= STATS ================= */

/* ================= RIGHTS ================= */


export const devOK = () => FEATURES.devTools || !!S.settings.owner;
async function devUnlock(sig) {
  try {
    if (!DEV_KEY || !sig) throw new Error(DEV_KEY ? 'no signature' : 'no public key in this build');
    const id = await native.appActions.deviceId(); if (!id) throw new Error('no device id');
    const key = await crypto.subtle.importKey('jwk', DEV_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, new TextEncoder().encode('etzba-dev:' + id));
    if (!ok) throw new Error('bad signature');
    S.settings.owner = true; S.settings.dev = true; S.settings.supported = true; S.settings.supportedAt ||= new Date().toISOString();
    persist(); applyTheme(); buzz(40); toast('מצב מפתח פעיל: הכול פתוח', 'ok'); go('set');
  } catch (e) { dbg.log('warn', 'dev unlock: ' + (e?.message || e)); toast('לא הצלחתי להפעיל מצב מפתח', 'err'); }
}

/* ================= RETROACTIVE OR NOT ================= */


/* ================= JOB SHEET ================= */

/* ================= CSV / EXPORT ================= */


export const notifOn = () => { const n = S.settings.notif || {}; return n.rates !== false || n.rest !== false || n.long !== false; };
function buildNotifications(a, N = { rates: true, rest: true, long: true, ...(S.settings.notif || {}) }) {
  const job = jobAt(jobById(a.jobId), a.start), start = +new Date(a.start), items = [], wb = weekRegBefore(job, a.start);
  const special = k => /^(rest|chag|elect)/.test(k);
  const perHour = k => money(job.rate * (job.r[k] ?? 100) / 100);
  const earned = at => money(shiftPay({ start: a.start, end: new Date(at), breakMin: 0 }, job, place(), wb).base);
  const changes = rateChanges(a.start, job, place(), wb, 14);
  changes.forEach((c, i) => {
    const pct = job.r[c.key] ?? 100;
    if (special(c.key) && !special(c.from)) {
      if (!N.rest) return;
      const until = changes.slice(i + 1).find(x => !special(x.key));
      const tail = until ? `, עד ${tm(until.at)}` : '';
      if (c.key.startsWith('rest')) items.push({ at: c.at, title: 'שבת שלום · התוספת התחילה', body: `מעכשיו ${pct}% (${perHour(c.key)} לשעה)${tail}.` });
      else if (c.key.startsWith('elect')) items.push({ at: c.at, title: 'יום הבחירות · התוספת התחילה', body: `מעכשיו ${pct}% (${perHour(c.key)} לשעה)${tail}.` });
      else items.push({ at: c.at, title: `חג שמח${c.names[0] ? ' · ' + c.names[0] : ''}`, body: `התוספת התחילה: ${pct}% (${perHour(c.key)} לשעה)${tail}.` });
    } else if (special(c.from) && !special(c.key)) {
      if (!N.rest) return;
      const title = c.from.startsWith('rest') ? 'שבוע טוב · השבת יצאה' : c.from.startsWith('elect') ? 'יום הבחירות נגמר' : 'החג יצא';
      items.push({ at: c.at, title, body: `חוזרים ל־${pct}% (${perHour(c.key)} לשעה). עד עכשיו: ${earned(c.at)}.` });
    } else if (N.rates && pct !== job.r[c.from]) {
      const hrs = hm((+c.at - start) / 3.6e6);
      if (c.weekly) items.push({ at: c.at, title: `עברת ${job.weeklyLimit} שעות השבוע`, body: `מעכשיו זה שעות נוספות: ${pct}% (${perHour(c.key)} לשעה). עד עכשיו: ${earned(c.at)}.` });
      else if (/ot1$/i.test(c.key)) items.push({ at: c.at, title: 'השעות הנוספות התחילו', body: `${hrs} שעות במשמרת. מעכשיו ${pct}% (${perHour(c.key)} לשעה). עד עכשיו: ${earned(c.at)}.` });
      else items.push({ at: c.at, title: `שעות נוספות · ${pct}%`, body: `${hrs} שעות במשמרת. מעכשיו ${perHour(c.key)} לשעה. עד עכשיו: ${earned(c.at)}.` });
    }
  });
  if (N.long) items.push({ at: new Date(start + 12 * 3.6e6), title: 'עדיין במשמרת?', body: 'המשמרת פתוחה כבר 12 שעות. אם כבר יצאת, אפשר לסיים אותה ולתקן את שעת היציאה.' });
  return items;
}
var planTimer = null;
let NOTIF = { state: 'unknown', next: null, exact: null };
export async function drawNotifStatus() {
  const box = $('#s-nstat'); if (!box || !native.NATIVE) return;
  if (!notifOn()) { box.innerHTML = ''; return; }
  const st = await native.notifyStatus();
  // a line under the switch, lined up with its title
  const row = (icon, text, btn) => `<div class="nline${icon === I.check ? ' ok' : ''}">${icon}<span>${text}</span>${btn ? `<button class="btn soft mini" type="button" data-n="${btn[0]}">${btn[1]}</button>` : ''}</div>`;
  box.innerHTML = st.display === 'denied' ? row(I.bellOff, 'חסומות בהגדרות הטלפון, אז לא יגיעו.', ['open', 'לאפשר'])
    : st.display !== 'granted' ? row(I.bell, 'הטלפון יבקש אישור בפעם הבאה שנכנסים למשמרת.')
    : row(I.check, 'מאושרות. מגיעות גם כשהאפליקציה סגורה. כשהטלפון במנוחה או בחיסכון בסוללה הן יכולות לאחר בכמה דקות.');
}
export function notifLine() {
  if (!native.NATIVE || !S.active) return '';
  if (NOTIF.state === 'denied') return `<button class="nstat warn" type="button" data-n="open">${I.bellOff}ההתראות חסומות בטלפון · לפתוח הגדרות</button>`;
  if (NOTIF.state === 'error') return `<span class="nstat warn">${I.bellOff}לא הצלחתי לקבוע התראות</span>`;
  if (NOTIF.state === 'ok' && NOTIF.next) return `<span class="nstat">${I.bell}${'התראה הבאה בסביבות '}${tm(NOTIF.next.at)}</span>`;
  return '';
}
export function planNotifications(ask = false) {
  if (!native.NATIVE) return;
  clearTimeout(planTimer);
  planTimer = setTimeout(async () => {
    try {
      const a = S.active, N = { rates: true, rest: true, long: true, ...(S.settings.notif || {}) };
      const on = N.rates || N.rest || N.long, ahead = on ? planReminders() : [];
      if (!on || (!a && !ahead.length)) { NOTIF = { state: 'off', next: null, exact: null }; if (planNotifications.last !== '[]') await native.scheduleNotifications([]); planNotifications.last = '[]'; return; }
      if (!(await native.notifyAllowed(ask))) { NOTIF = { state: 'denied', next: null, exact: null }; dbg.log('warn', 'notifications: not allowed'); return; }
      const st = await native.notifyStatus();
      const items = [...(a ? buildNotifications(a, N) : []), ...ahead].filter(x => +x.at > Date.now() + 5000).sort((x, y) => x.at - y.at);
      const send = items.map(x => ({ ...x, title: tr(x.title), body: tr(x.body) })), sig = JSON.stringify(send.map(x => [+x.at, x.title, x.body]));
      const n = sig === planNotifications.last ? items.length : await native.scheduleNotifications(send);
      planNotifications.last = sig;
      NOTIF = { state: 'ok', next: items[0] || null, exact: st.exact, count: n };
      dbg.log('info', `notifications: ${n} scheduled`);
    } catch (e) {
      NOTIF = { state: 'error', next: null, exact: null };
      dbg.log('error', 'notifications: ' + (e?.message || e));
    } finally { if (view === 'home') renderHome(); if (view === 'set') drawNotifStatus(); }
  }, 400);
}

var geoSent = '';
export function syncGeo(force = false) {
  if (!native.geo.available()) return;
  const fences = S.jobs.filter(j => j.place && j.place.on !== false).map(j => ({ id: j.id, name: j.name, lat: j.place.lat, lng: j.place.lng, radius: j.place.radius || 300 }));
  const texts = { inTitle: tr('הגעת לעבודה?'), inBody: tr('{job} · להתחיל משמרת עכשיו?'), inAction: tr('להתחיל משמרת'),
    outTitle: tr('יצאת מהעבודה?'), outBody: tr('{job} · המשמרת עדיין רצה. לסיים אותה?'), outAction: tr('לסיים משמרת'), channel: tr('הגעה ויציאה מהעבודה') };
  const key = JSON.stringify([fences, texts, !!S.active, S.active?.jobId]);
  if (key === geoSent && !force) return;
  geoSent = key;
  native.geo.setFences(fences, texts).then(r => dbg.log('info', `geofences: ${fences.length}${r.registered ? '' : ' (not allowed)'}`));
  native.geo.setActive(!!S.active, S.active?.jobId);
}
let lastWidget = '';
function cssHex(name) {
  try {
    const el = document.createElement('i'); el.style.color = `var(${name})`; el.style.display = 'none'; document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/[\d.]+/g); el.remove();
    if (!m || m.length < 3) return '';
    return '#' + m.slice(0, 3).map(x => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch { return ''; }
}
function syncWidget() {
  if (!native.NATIVE) return;
  const a = S.active, job = a ? jobAt(jobById(a.jobId), a.start) : jobById(S.settings.lastJob);
  let segs = [], thr = job?.regHours || 8.6;
  if (a) {
    const k = JSON.stringify([a.start, a.jobId, LANG, job, place(), S.settings.birth]);
    if (syncWidget.k !== k) {
      const wb = weekRegBefore(job, a.start), p1 = shiftPay({ start: a.start, end: new Date(+new Date(a.start) + 6e4).toISOString(), breakMin: 0 }, job, place(), wb);
      const per = key => Math.round(job.rate * job.r[key]) / 100, lab = key => tr(tierLabel(key, job));
      syncWidget.segs = [[+new Date(a.start), per(p1.lastKey || 'reg'), lab(p1.lastKey || 'reg')], ...rateChanges(a.start, job, place(), wb, 16).map(c => [+new Date(c.at), per(c.key), lab(c.key)])];
      syncWidget.thr = p1.threshold; syncWidget.k = k;
    }
    segs = syncWidget.segs; thr = syncWidget.thr;
  }
  const now = new Date(), M = monthCalc(now.getFullYear(), now.getMonth());
  const theme = Object.fromEntries([['bg', '--bg'], ['surface', '--surface'], ['line', '--line'], ['ink', '--ink'], ['ink3', '--ink3'],
    ['accent', '--accent'], ['rega', '--g-money-a'], ['regb', '--g-money-b'], ['ot1a', '--g-ot-a'], ['ot1b', '--g-ot-b'], ['ot2a', '--g-hot-a'], ['ot2b', '--g-hot-b'], ['hub', '--g-acc-a']]
    .map(([k, v]) => [k, cssHex(v)]));
  const state = { active: !!a, start: a ? +new Date(a.start) : 0, job: job?.name || '', rate: +job?.rate || 0, rtl: document.documentElement.dir === 'rtl', segs,
    extra: { thr, ot1: job?.ot1Hours ?? 2, otOn: job?.otOn !== false, theme: isSup() ? { ...theme, ring: (S.settings.theme === 'gold' ? '#D9A93F' : cssHex('--accent')) } : theme, wstyle: isSup() ? (S.settings.widgetStyle || 'classic') : 'classic', month: { name: MONTHS[now.getMonth()], gross: money(M.gross), count: M.shifts.length } },
    labels: EN
      ? { idle: 'Not on shift', starts: 'Starts ', since: 'since ', perHour: 'per hour', toOt: 'Overtime in {t}', now: 'Now: ', shortReg: 'regular', shortOt: 'overtime',
          tapStart: 'Tap the dial to clock in', tapShort: 'Tap to start', gross: 'gross', shifts: 'shifts' }
      : { idle: 'לא במשמרת', starts: 'מתחילה ב־', since: 'מ־', perHour: 'לשעה', toOt: 'עוד {t} לשעות נוספות', now: 'עכשיו ', shortReg: 'רגילות', shortOt: 'נוספות',
          tapStart: 'נגיעה בחוגה כדי להתחיל', tapShort: 'נגיעה להתחלה', gross: 'ברוטו', shifts: 'משמרות' } };
  const k = JSON.stringify(state); if (k === lastWidget) return; lastWidget = k;
  native.appActions.updateWidget(state);
}
function appAction({ action, jobId, sig }) {
  dbg.log('info', 'app action ' + action);
  if (action === 'dev_unlock') return devUnlock(sig);
  if (action === 'toggle') {
    go('home');
    if (S.active) openSheet(`<h2>לסיים את המשמרת?</h2><p class="shsub">${nm(jobById(S.active.jobId).name)} · ${hm((Date.now() - new Date(S.active.start)) / 36e5)}</p>
      <div class="btnrow"><button class="btn primary" id="wa-end">${I.check}סיום משמרת</button><button class="btn soft" id="wa-no">עדיין לא</button></div>`, root => {
      $('#wa-end', root).onclick = () => { closeSheet(); if (S.active) onPunch(); };
      $('#wa-no', root).onclick = closeSheet;
    });
    else onPunch();
    return;
  }
  const job = S.jobs.find(j => j.id === jobId); if (!job) return;
  go('home');
  if (action === 'start' && !S.active) { S.settings.lastJob = job.id; onPunch(); return; }
  if ((action === 'end' || action === 'ask_end') && S.active) { onPunch(); return; }
  if (action === 'ask_start' && !S.active) openSheet(`<h2>הגעת לעבודה?</h2><p class="shsub">${nm(job.name)}</p>
    <div class="btnrow"><button class="btn primary" id="ga-yes">${I.check}להתחיל משמרת</button><button class="btn soft" id="ga-no">לא עכשיו</button></div>`, root => {
    $('#ga-yes', root).onclick = () => { closeSheet(); S.settings.lastJob = job.id; onPunch(); };
    $('#ga-no', root).onclick = closeSheet;
  });
}

/* translations: skip-start (developer tools stay in Hebrew) */
export function openDevTools() {
  const scen = {
    weekday: ['יום חול ארוך מ־08:00', () => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; }],
    friday: ['שישי מ־10:00, לתוך השבת', () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); d.setHours(10, 0, 0, 0); return d; }],
    current: ['המשמרת שרצה עכשיו', () => S.active ? new Date(S.active.start) : null],
  };
  let pick = S.active ? 'current' : 'friday', items = [];
  const jobId = S.active?.jobId || S.settings.lastJob;
  openSheet(`<div data-keep><h2>כלי פיתוח</h2><p class="shsub">לבדיקות בלבד. לא משנה את החישובים.</p>
    ${S.settings.owner ? `<div class="sec"><span>להציג את האפליקציה כמו</span></div>
    <div class="seg" id="dv-view">${[['regular', 'משתמש רגיל'], ['supporter', 'תומך'], ['dev', 'מפתח']].map(([k, n]) => `<button data-v="${k}" class="${viewAs() === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <p class="hint">רק התצוגה משתנה. מצב המפתח נשאר, וכלי הפיתוח תמיד כאן.</p>` : ''}
    <div class="sec"><span>התראות</span></div>
    <div class="card">
      <button class="cell" id="dv-one"><span class="grow">התראה אחת לבדיקה<div class="sub">מגיעה בעוד 3 שניות</div></span></button>
      <button class="cell" id="dv-soon"><span class="grow">משמרת שמגיעה לשעות נוספות בעוד 2 דקות<div class="sub">מתחילה משמרת אמיתית שהתחילה מוקדם, וההתראה תגיע כרגיל</div></span></button>
      <button class="cell" id="dv-pend"><span class="grow">ההתראות שמתוזמנות עכשיו</span></button>
      ${native.geo.available() ? `<button class="cell" id="dv-geo-in"><span class="grow">התראת "הגעת לעבודה?" לבדיקה</span></button>
      <button class="cell" id="dv-geo-out"><span class="grow">התראת "יצאת מהעבודה?" לבדיקה</span></button>` : ''}
    </div>
    <div class="sec"><span>כל ההתראות של משמרת</span></div>
    <div class="seg" id="dv-scen">${Object.entries(scen).filter(([k]) => k !== 'current' || S.active).map(([k, [l]]) => `<button data-s="${k}">${l}</button>`).join('')}</div>
    <div class="card pad" id="dv-list" style="margin-top:10px"></div>
    <button class="btn soft" id="dv-send" style="margin-top:10px">לשלוח את כולן עכשיו, כל 6 שניות</button>
    <div class="sec"><span>עוד</span></div>
    <div class="card">
      <button class="cell" id="dv-onb"><span class="grow">להציג שוב את מסך הפתיחה</span></button>
      <button class="cell" id="dv-demo"><span class="grow">להוסיף משמרות לדוגמה (3 חודשים)</span></button>
      <button class="cell" id="dv-undemo"><span class="grow">למחוק את משמרות הדוגמה</span></button>
      <button class="cell" id="dv-err"><span class="grow">שגיאה לבדיקה<div class="sub">מציג את פס התקלה</div></span></button>
      <button class="cell" id="dv-reload"><span class="grow">טעינה מחדש של האפליקציה</span></button>
      <button class="cell" id="dv-off"><span class="grow">כיבוי מצב מפתח</span></button>
    </div></div>`, root => {
    const draw = () => {
      $$('#dv-scen button', root).forEach(b => b.classList.toggle('on', b.dataset.s === pick));
      const start = scen[pick][1]();
      items = start ? buildNotifications({ jobId, start: start.toISOString() }) : [];
      $('#dv-list', root).innerHTML = items.length ? items.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(tr(x.title))}</b><span class="num" style="color:var(--ink3)">${tm(x.at)}</span></div><div style="color:var(--ink2);font-size:.9rem">${esc(tr(x.body))}</div></div>`).join('') : '<div class="hint">אין התראות למשמרת הזאת</div>';
    };
    $$('#dv-scen button', root).forEach(b => b.onclick = () => { pick = b.dataset.s; draw(); });
    const send = async list => { if (!native.NATIVE) return toast('התראות עובדות רק באפליקציה לאנדרואיד', 'err');
      const ok = await native.testNotifications(list.map(x => ({ title: tr(x.title), body: tr(x.body) })));
      planNotifications.last = null;
      toast(ok ? `נשלחו ${list.length} התראות` : 'אין הרשאה להתראות. אפשר לאשר בהגדרות הטלפון', ok ? 'ok' : 'err'); };
    $('#dv-one', root).onclick = () => send([{ title: 'אצבע · בדיקה', body: 'ככה נראית התראה. אם רואים את זה, הכל עובד.' }]);
    $('#dv-send', root).onclick = () => send(items);
    $('#dv-soon', root).onclick = () => {
      const job = jobAt(jobById(jobId), new Date());
      S.active = { jobId, start: new Date(Date.now() - (job.regHours * 60 - 2) * 6e4).toISOString() };
      persist(); closeSheet(); go('home'); planNotifications(true); toast('משמרת בדיקה התחילה. ההתראה תגיע בעוד כ־2 דקות', 'ok');
    };
    $('#dv-pend', root).onclick = async () => {
      const p = await native.pendingNotifications();
      $('#dv-list', root).innerHTML = p.length ? p.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(x.title)}</b> <span class="num" style="color:var(--ink3)">${x.at ? tm(x.at) : ''}</span><div style="color:var(--ink2);font-size:.9rem">${esc(x.body)}</div></div>`).join('') : `<div class="hint">${native.NATIVE ? 'אין התראות מתוזמנות' : 'רק באפליקציה לאנדרואיד'}</div>`;
    };
    const geoTest = kind => { if (!native.geo.available()) return toast('רק באפליקציה לאנדרואיד', 'err'); const j = jobById(jobId); syncGeo(true); setTimeout(() => native.geo.test(kind, j.id, j.name), 300); toast('נשלחה התראה', 'ok'); };
    $('#dv-geo-in', root) && ($('#dv-geo-in', root).onclick = () => geoTest('in'));
    $('#dv-geo-out', root) && ($('#dv-geo-out', root).onclick = () => geoTest('out'));
    $$('#dv-view button', root).forEach(b => b.onclick = () => {
      S.settings.viewAs = b.dataset.v; persist(); applyTheme(); render(); buzz(10);
      $$('#dv-view button', root).forEach(x => x.classList.toggle('on', x === b));
      toast(`מוצג כמו ${b.textContent}`, 'ok');
    });
    $('#dv-onb', root).onclick = () => { closeSheet(); openOnboarding(); };
    $('#dv-demo', root).onclick = () => {
      const days = 90, out = []; const now = new Date();
      for (let i = days; i > 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); if (d.getDay() === 6 || Math.random() < .3) continue;
        const h = [8, 10, 14, 16][i % 4], st = new Date(d); st.setHours(h, [0, 15, 30][i % 3], 0, 0); const en = new Date(+st + (6 + (i % 5)) * 3.6e6);
        out.push({ id: uid(), jobId, start: st.toISOString(), end: en.toISOString(), breakMin: i % 3 ? 0 : 30, bonus: 0, note: '', rest: 'auto', src: 'demo' }); }
      S.shifts.push(...out); commit(); toast(`נוספו ${out.length} משמרות לדוגמה`, 'ok');
    };
    $('#dv-undemo', root).onclick = () => { const n = S.shifts.length; S.shifts = S.shifts.filter(x => x.src !== 'demo'); commit(); toast(`נמחקו ${n - S.shifts.length} משמרות לדוגמה`, 'ok'); };
    $('#dv-err', root).onclick = () => { closeSheet(); report(new Error('שגיאה לבדיקה מכלי הפיתוח')); };
    $('#dv-reload', root).onclick = () => location.reload();
    $('#dv-off', root).onclick = () => { S.settings.dev = false; persist(); closeSheet(); renderSet(); toast('מצב מפתח כבוי'); };
    draw();
  });
}
/* translations: skip-end */

export async function askFirstPerms() {
  if (!native.NATIVE || S.settings.askedPerms) return;
  S.settings.askedPerms = true; persist();
  const ok = await native.notifyAllowed(true);
  dbg.log('info', 'notification permission: ' + (ok ? 'allowed' : 'not allowed'));
  planNotifications();
}

/* ================= diagnostics ================= */
function debugReport() {
  const e = dbg.env(), c = dbg.lastCrash();
  const lines = [
    `Etzba ${VERSION} · ${e.where} · ${e.webview} · lite ${e.lite ? 'on' : 'off'} · ${LANG} · view ${view}`,
    `shifts ${S.shifts.length} · jobs ${S.jobs.length} · phone storage ${e.localStorage}`,
    `screen ${e.screen} · memory ${e.deviceMemory} · cores ${e.cores} · heap ${e.heap} · online ${e.online}`,
    c ? `LAST SESSION ENDED DURING: ${c.step} (${new Date(c.at).toLocaleString('en-GB')})` : 'last session ended normally',
    'timings ms: ' + Object.entries(dbg.timingSummary()).map(([k, v]) => `${k} ${v.last}/${v.max}`).join(', '),
    PROBLEMS.length ? 'errors:\n' + PROBLEMS.slice(-3).join('\n---\n') : 'errors: none',
    'log:', ...dbg.getLog().slice(-40).map(x => `${new Date(x.t).toTimeString().slice(0, 8)} ${x.k.padEnd(5)} ${x.m}${x.d !== undefined ? ' ' + JSON.stringify(x.d) : ''}`),
    e.ua,
  ];
  return lines.join('\n');
}
function liteSetting() { try { return localStorage.getItem('etzba.lite') || 'auto'; } catch { return 'auto'; } }
export function openDebug() {
  const e = dbg.env(), c = dbg.lastCrash(), T = dbg.timingSummary(), lite = liteSetting();
  let meterOn = false; try { meterOn = localStorage.getItem('etzba.meter') === '1'; } catch {}
  const row = (l, v) => `<div class="ln flat"><span class="l">${l}</span><span class="v num" data-keep style="direction:ltr">${esc(String(v))}</span></div>`;
  openSheet(`<h2>אבחון ותקלות</h2>
    <p class="shsub">אם משהו נתקע או נסגר, להעתיק את הדוח ולשלוח אותו. אין בו משמרות, שכר או שמות, רק מידע טכני.</p>
    ${c ? `<div class="note" style="margin-top:12px">${I.warn}<span>בפעם הקודמת האפליקציה נסגרה באמצע: <b data-keep style="direction:ltr">${esc(c.step)}</b></span></div>` : ''}
    <div class="card" style="margin-top:12px">
      <button class="cell" id="d-copy"><span class="cell-ic t-blue">${I.file}</span><span class="grow">העתקת דוח אבחון</span></button>
      <button class="cell" id="d-save"><span class="cell-ic t-blue">${I.download}</span><span class="grow">שמירת הדוח כקובץ</span></button>
    </div>
    <div class="sec"><span>המכשיר</span></div>
    <div class="card pad">${row('גרסה', VERSION)}${row('רץ ב־', e.where)}${row('דפדפן', e.webview)}${row('מסך', e.screen)}${row('זיכרון', e.deviceMemory + ' · ' + e.heap)}${row('אחסון בטלפון', e.localStorage)}${row('משמרות', S.shifts.length)}</div>
    <div class="sec"><span>תצוגה</span></div>
    <div class="seg" id="d-lite"><button data-l="auto" class="${lite === 'auto' ? 'on' : ''}">אוטומטי</button><button data-l="on" class="${lite === 'on' ? 'on' : ''}">קלה</button><button data-l="off" class="${lite === 'off' ? 'on' : ''}">מלאה</button></div>
    <p class="fine" style="margin-top:6px">תצוגה קלה מכבה רקע זז, טשטוש ואנימציות. עוזרת בטלפונים חלשים.</p>
    <label class="cell" style="margin-top:8px"><span class="grow">מד ביצועים על המסך</span><input type="checkbox" id="d-meter" ${meterOn ? 'checked' : ''}></label>
    <div class="sec"><span>בדיקה עצמית</span></div>
    <div class="card"><button class="cell" id="d-test"><span class="cell-ic t-green">${I.check}</span><span class="grow">להריץ בדיקה<div class="sub" id="d-test-out">מצייר כל מסך ומחשב את כל המשמרות, ומודד זמנים</div></span></button></div>
    <div class="sec"><span>זמנים (מ״ש, אחרון / הכי איטי)</span></div>
    <div class="card pad">${Object.keys(T).length ? Object.entries(T).map(([k, v]) => row(k, v.last + ' / ' + v.max)).join('') : row('—', '')}</div>
    <div class="sec"><span>יומן</span></div>
    <pre data-keep style="white-space:pre-wrap;direction:ltr;text-align:left;font-size:11px;line-height:1.35;max-height:40vh;overflow:auto;background:var(--surface);border:1px solid var(--line);padding:8px">${esc(dbg.getLog().slice(-60).reverse().map(x => `${new Date(x.t).toTimeString().slice(0, 8)} ${x.k} ${x.m}${x.d !== undefined ? ' ' + JSON.stringify(x.d) : ''}`).join('\n'))}</pre>
    <div class="card" style="margin-top:12px"><button class="cell" id="d-clear"><span class="grow">ניקוי היומן</span></button></div>`, root => {
    $('#d-copy', root).onclick = () => copyText(debugReport());
    $('#d-save', root).onclick = () => deliver(`etzba-debug-${Date.now()}.txt`, debugReport(), 'text/plain;charset=utf-8');
    $$('#d-lite button', root).forEach(b => b.onclick = () => {
      try { b.dataset.l === 'auto' ? localStorage.removeItem('etzba.lite') : localStorage.setItem('etzba.lite', b.dataset.l); } catch {}
      const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
      const on = b.dataset.l === 'on' || (b.dataset.l === 'auto' && (framed || (navigator.deviceMemory && navigator.deviceMemory <= 2)));
      document.documentElement.classList.toggle('lite', on); dbg.log('info', 'lite ' + b.dataset.l);
      $$('#d-lite button', root).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#d-meter', root).onchange = ev => { try { localStorage.setItem('etzba.meter', ev.target.checked ? '1' : '0'); } catch {} dbg.setMeter(ev.target.checked); };
    $('#d-clear', root).onclick = () => { dbg.clearLog(); closeSheet(); toast('היומן נוקה'); };
    $('#d-test', root).onclick = () => selfTest($('#d-test-out', root));
  });
}
function selfTest(out) {
  out.textContent = 'בודק…';
  setTimeout(() => {
    const res = [], keep = { view, viewY, viewM, sumView: S.ui.sumView };
    const t0 = performance.now();
    try { const P = computeAll(S.shifts, jobById, place()); let n = 0; for (const x of P.values()) n += x.pay > -1 ? 1 : 0; res.push(`pay ${n}/${S.shifts.length} ${Math.round(performance.now() - t0)}ms`); }
    catch (e) { res.push('pay FAIL ' + e.message); dbg.log('error', 'selftest pay: ' + e.message); }
    for (const v of ['home', 'shifts', 'sum', 'rights']) {
      const t = performance.now();
      try { setView(v); VIEWS[v](); res.push(`${v} ${Math.round(performance.now() - t)}ms`); }
      catch (e) { res.push(`${v} FAIL ${e.message}`); dbg.log('error', 'selftest ' + v + ': ' + e.message); }
    }
    for (const sv of ['weeks', 'year', 'month']) {
      const t = performance.now();
      try { S.ui.sumView = sv; setView('sum'); renderSum(); res.push(`sum/${sv} ${Math.round(performance.now() - t)}ms`); }
      catch (e) { res.push(`sum/${sv} FAIL ${e.message}`); dbg.log('error', 'selftest sum ' + sv + ': ' + e.message); }
    }
    setView(keep.view); showMonth(keep.viewY, keep.viewM); S.ui.sumView = keep.sumView;
    try { VIEWS[view](); } catch {}
    const txt = res.join(' · '); dbg.log('perf', 'selftest ' + txt);
    out.textContent = (res.some(r => r.includes('FAIL')) ? '✗ ' : '✓ ') + txt;
  }, 50);
}

export async function setLang(l, save = true) {
  const info = langInfo(l);
  const pack = preferPack(info.code, await loadPack(info.code).catch(() => null));
  useLanguage(info, pack);
  stopTranslating(); usePack(pack);
  if (pack) startTranslating();
  if (save) { S.settings.lang = LANG; persist(); }
  render(); updateBackupDot();
  syncGeo(true); planNotifications(); syncWidget();
}

/* ================= router ================= */
Object.assign(VIEWS, { home: renderHome, shifts: renderShifts, sum: renderSum, rights: renderRights, set: renderSet });
setRenderHooks(drawHeader, (el, e) => showFailure(el, e));
/** The figures in the top bar, redrawn after every screen. */
function drawHeader() {
  try {
    const now = new Date(), M = withLive(monthCalc(now.getFullYear(), now.getMonth()));
    countUp($('#barNet'), NET() ? M.net.net : M.gross);
    { const l = $('#chipNet small'); if (l) l.textContent = NET() ? 'נטו משוער' : 'ברוטו החודש'; $('#chipNet')?.setAttribute('aria-label', NET() ? 'נטו משוער החודש, לסיכום' : 'ברוטו החודש, לסיכום'); }
    $('#brandMark').innerHTML = mark({ t: now, sw: 5.4 });
    recapBanner();
  } catch (e) { report(e); }
}

const PROBLEMS = [];
function describe(e) { return ((e && (e.stack || e.message)) || String(e)).split('\n').slice(0, 4).join('\n'); }
function problemText() { return debugReport(); }
export function report(e) {
  const d = describe(e); if (PROBLEMS[PROBLEMS.length - 1] === d) return;
  PROBLEMS.push(d); console.error(e); dbg.log('error', d);
  let bar = $('#probbar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'probbar'; bar.setAttribute('role', 'alert'); bar.dataset.keep = '';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span>${EN ? 'Something went wrong. Your data is safe.' : 'משהו השתבש. הנתונים שלך בטוחים.'}</span>
    <button id="pb-copy">${EN ? 'Copy details' : 'העתקת פרטים'}</button><button id="pb-x" aria-label="${EN ? 'Close' : 'סגירה'}">✕</button>`;
  $('#pb-copy', bar).onclick = async () => { if (!(await copyText(problemText())) && !$('pre', bar)) bar.insertAdjacentHTML('beforeend', `<pre style="flex-basis:100%;white-space:pre-wrap;direction:ltr;font-size:11px;user-select:all">${esc(problemText())}</pre>`); };
  $('#pb-x', bar).onclick = () => bar.remove();
}
function showFailure(el, e) {
  report(e);
  if (!el) return;
  el.innerHTML = `<div class="card" style="margin-top:16px" data-keep><div class="empty">${EN ? 'This screen couldn’t be drawn.' : 'לא הצלחתי להציג את המסך הזה.'}
    <pre style="white-space:pre-wrap;direction:ltr;text-align:left;font-size:11px;margin:10px 0">${esc(describe(e))}</pre>
    <button class="btn" id="fail-copy">${EN ? 'Copy details' : 'העתקת פרטים'}</button></div></div>`;
  $('#fail-copy', el).onclick = () => copyText(problemText());
}
addEventListener('error', e => { if (window.__etzbaReady && e.error) report(e.error); });
addEventListener('unhandledrejection', e => { if (window.__etzbaReady) report(e.reason); });
$$('#tabs button').forEach(b => { b.querySelector('.tic').innerHTML = I[b.querySelector('.tic').dataset.i]; b.onclick = () => go(b.dataset.v); });
$('#fab').innerHTML = I.plus;
{ let lastY = scrollY; addEventListener('scroll', () => { const y = scrollY; if (Math.abs(y - lastY) > 6) { $('#fab').classList.toggle('tuck', y > lastY && y > 80); lastY = y; } }, { passive: true }); }
$('#fab').onclick = () => {
  const job = jobById(S.settings.lastJob), end = new Date(); end.setMinutes(0, 0, 0);
  const start = new Date(+end - Math.round(job.regHours) * 3.6e6);
  openShiftSheet({ id: null, jobId: job.id, start: start.toISOString(), end: end.toISOString(), breakMin: job.breakMin, bonus: 0, note: '', rest: 'auto' }, 'new');
};

const step = (name, fn) => { try { fn(); } catch (e) { (window.__etzbaErr || []).push(name + ': ' + (e && e.message)); console.error(name, e); } };
step('recompute', recompute);
step('render', render);
if (LANG !== 'he') step('language', () => { setLang(LANG, false); });
step('langCheck', () => {
  let failed = null; try { failed = localStorage.getItem('etzba.langFailed'); localStorage.removeItem('etzba.langFailed'); } catch {}
  if (failed) {
    dbg.log('error', `language ${failed}: the last start didn't finish, back to Hebrew`);
    let errs = ''; try { errs = localStorage.getItem('etzba.bootErr') || ''; } catch {}
    const report = [`language ${failed} failed to start · v${VERSION}`, errs || '(no error recorded: it stopped responding)', ...dbg.getLog().slice(-40).map(e => JSON.stringify(e)), navigator.userAgent].join('\n');
    setTimeout(() => toast('השפה הוחזרה לעברית בגלל תקלה. אפשר לנסות שוב בהגדרות', 'err', { label: 'העתקת פרטים', fn: () => copyText(report).then(() => toast('הועתק', 'ok')) }), 800);
  }
  setTimeout(() => { try { localStorage.removeItem('etzba.langBoot'); } catch {} }, 4000);
});
window.__etzbaReady = true;
dbg.log('perf', 'ready', dbg.sinceStart());
step('crashNote', () => { const c = dbg.lastCrash(); if (c) { dbg.log('warn', 'last session ended during: ' + c.step); if (FEATURES.devTools) toast(`בפעם הקודמת האפליקציה נסגרה (${c.step}). פרטים באבחון`, 'err', { label: 'פרטים', fn: openDebug }); } });
step('debugHash', () => { if (!FEATURES.devTools) return; if (location.hash === '#debug') openDebug(); addEventListener('hashchange', () => { if (location.hash === '#debug') openDebug(); }); });
step('restore', async () => {
  if (!native.NATIVE || hadLocal) return;
  const json = await native.snapshot.load(); if (!json) return;
  let d; try { d = JSON.parse(json); } catch (e) { dbg.log('error', 'snapshot unreadable'); return; }
  if (!d || !Array.isArray(d.shifts) || (!d.shifts.length && !d.active)) return;
  setState(d, json);
  $('#onboard')?.remove(); applyTheme(); recompute(); render();
  dbg.log('warn', `restored ${S.shifts.length} shifts from the app's copy`);
  toast(`שוחזרו ${S.shifts.length} משמרות מהעותק השמור בטלפון`, 'ok');
});
step('welcome', () => { if (!S.settings.onboarded && !S.shifts.length && !S.active) openOnboarding(); });
step('shared', () => {
  takeSharedFile();
  native.onSharedFile(f => { dbg.log('info', 'native share: ' + f.name); $('#onboard')?.remove(); go('set'); openFileImport(f); });
});
step('back', () => native.onBack(() => {
  if (sheetOpen()) { closeSheet(); return true; }
  if ($('#onboard')) return false;
  if (view !== 'home') { go('home'); return true; }
  openSheet(`<h2>לצאת מאצבע?</h2>${S.active ? '<p class="shsub">המשמרת ממשיכה להיספר גם כשהאפליקציה סגורה.</p>' : ''}
    <div class="btnrow"><button class="btn primary" id="x-stay">להישאר</button><button class="btn soft" id="x-exit">יציאה מהאפליקציה</button></div>`, root => {
    $('#x-stay', root).onclick = closeSheet;
    $('#x-exit', root).onclick = () => { closeSheet(); native.exitApp(); };
  });
  return true;
}));
step('splash', native.ready);
step('perms', () => { if (S.settings.onboarded) setTimeout(askFirstPerms, 1200); });
step('notifications', () => {
  planNotifications();
  document.addEventListener('click', e => {
    if (e.target.closest('[data-legal]')) return openLegal();
    const b = e.target.closest('[data-n="open"]'); if (!b) return;
    native.openNotificationSettings();
  });
});
function measureTextZoom() {
  let z = 1;
  try {
    const o = +localStorage.getItem('etzba.tz');
    if (o) { z = o; document.documentElement.style.fontSize = (o * 100) + '%'; }
    else {
      const t = document.createElement('span');
      t.style.cssText = 'position:absolute;visibility:hidden;font:100px/1 sans-serif;white-space:nowrap';
      t.textContent = '0'; document.body.appendChild(t); z = t.getBoundingClientRect().height / 100; t.remove();
    }
  } catch { }
  z = Math.max(1, Math.round(z * 100) / 100);
  const h = document.documentElement;
  h.style.setProperty('--tz', z); h.classList.toggle('tz-big', z >= 1.3); h.classList.toggle('tz-huge', z >= 1.65);
  dbg.log('info', 'text zoom ' + z);
}
step('textzoom', measureTextZoom);
step('billing', () => {
  if (!native.billing.available()) return;
  native.billing.onPaid(() => { if (S.settings.supported) return; S.settings.supported = true; persist(); applyTheme(); render(); toast('התשלום עבר. תודה על התמיכה!', 'ok'); });
  if (!S.settings.supported && !S.settings.histChecked) native.billing.owned().then(r => {
    S.settings.histChecked = 1;
    if (r.supported) { S.settings.supported = true; applyTheme(); render(); toast('התמיכה שלך שוחזרה. תודה!', 'ok'); }
    persist();
  });
});
step('a11y', () => { setSpeech(S.settings.speech || 'en', LANGS.find(l => l.code === 'en')?.pack); startA11y(); });
step('rules', () => {
  const changed = () => { recompute(); render(); toast('עודכנו נתוני השכר והחגים', 'ok'); };
  const packChanged = () => { if (LANG !== 'he') setLang(LANG, false); };
  const both = () => { checkForUpdates(changed); checkPack(LANG, packChanged); };
  both(); checkEarly();
  addEventListener('online', () => { both(); checkEarly(); });
});
step('geo', () => { syncGeo(true); native.appActions.onAction(appAction); syncWidget(); });
step('meter', () => { try { if (localStorage.getItem('etzba.meter') === '1') dbg.setMeter(true); } catch {} });
step('backupDot', updateBackupDot);
setInterval(() => { if (document.hidden) return; tickHome(false); if (new Date().getSeconds() === 0) { renderRestCard(); $('#brandMark').innerHTML = mark({ t: new Date(), sw: 5.4 }); } }, 1000);
$('#chipNet') && ($('#chipNet').onclick = () => { const n = new Date(); showMonth(n.getFullYear(), n.getMonth()); S.ui.sumView = 'month'; go('sum'); setTimeout(() => $('#steps')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); planNotifications(); checkEarly(); } });

const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
try {
  if (!native.NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    if (framed) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    else navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
} catch {}
