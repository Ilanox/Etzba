// Reminders during a shift and before planned shifts: what to schedule, asking permission, and the status line.
import { S, jobById, place } from './state.js';
import { jobAt, shiftPay, rateChanges } from './pay-engine.js';
import { weekRegBefore } from './pay.js';
import { money, tm, hm, $ } from './util.js';
import { hrs } from './views/recap.js';
import * as native from './native-bridge.js';
import { I } from './svg-icons.js';
import { planReminders, renderHome } from './views/home.js';
import * as dbg from './diagnostics.js';
import { tr } from './translate.js';
import { view, persist } from './nav.js';

export const notifOn = () => { const n = S.settings.notif || {}; return n.rates !== false || n.rest !== false || n.long !== false; };

export function buildNotifications(a, N = { rates: true, rest: true, long: true, ...(S.settings.notif || {}) }) {
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

export let NOTIF = { state: 'unknown', next: null, exact: null };

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

let planTimer = null;
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

export async function askFirstPerms() {
  if (!native.NATIVE || S.settings.askedPerms) return;
  S.settings.askedPerms = true; persist();
  const ok = await native.notifyAllowed(true);
  dbg.log('info', 'notification permission: ' + (ok ? 'allowed' : 'not allowed'));
  planNotifications();
}
