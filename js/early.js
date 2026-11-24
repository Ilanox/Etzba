// Early access: which features open when, for supporters and for everyone, read from the server.
import { rules } from './rules.js';
import { dateKey, dShort } from './util.js';
import { isSup } from './theme.js';
import { announceEarly } from './views/recap.js';
import { render } from './nav.js';
import * as dbg from './diagnostics.js';
export const EARLY_URL = 'https://etzba.co.il/data/early.json';
/** Dates per feature: a date for everyone, or { supporters, all }. A date in 2090 or later means not scheduled yet. */
let EARLY = (() => { try { return JSON.parse(localStorage.getItem('etzba.early') || 'null'); } catch { return null; } })();
const earlyDates = () => EARLY || rules().early || {};
const earlyEntry = name => { const v = earlyDates()[name]; return v && typeof v === 'object' ? v : { all: v }; };
export const earlyDate = (name, who = 'all') => earlyEntry(name)[who];
const isDate = d => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d);
const earlyOpen = (name, who = 'all') => { const d = earlyDate(name, who); return !d || dateKey(new Date()) >= d; };
const earlyLater = (name, who = 'all') => (earlyDate(name, who) || '') >= '2090';
/** Whether a feature is open for this user: supporters get their own, earlier date. */
export const openForMe = name => isSup() ? earlyOpen(name, 'supporters') || earlyOpen(name) : earlyOpen(name);

/** A line saying when a locked feature opens, for this user. */
export const earlyWhen = name => {
  const all = earlyLater(name) ? null : earlyDate(name), sup = earlyDate(name, 'supporters'), supOpen = earlyOpen(name, 'supporters');
  if (isSup()) return sup && !earlyLater(name, 'supporters') ? `ייפתח לך ב־${dShort(sup)}, לפני כולם` : 'עוד לא נקבע מתי ייפתח';
  if (!all) return supOpen ? 'בינתיים לתומכים בלבד' : sup && !earlyLater(name, 'supporters') ? `לתומכים מ־${dShort(sup)}` : 'עוד לא נקבע מתי ייפתח';
  return supOpen ? `ייפתח לכולם ב־${dShort(all)} · לתומכים כבר עכשיו` : sup ? `ייפתח לכולם ב־${dShort(all)} · לתומכים כבר ב־${dShort(sup)}` : `ייפתח לכולם ב־${dShort(all)}`;
};
let earlyChecked = 0;

/** Reads the latest dates from the server (at most every 5 minutes), then shows any news. */
export async function checkEarly() {
  if (!navigator.onLine || Date.now() - earlyChecked < 5 * 60e3) return announceEarly();
  earlyChecked = Date.now();
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(EARLY_URL + '?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const e = await res.json();
    if (!e || typeof e !== 'object' || !Object.values(e).every(v => isDate(v) || (v && typeof v === 'object' && Object.values(v).every(isDate)))) throw new Error('bad file');
    if (JSON.stringify(e) !== JSON.stringify(EARLY)) { EARLY = e; try { localStorage.setItem('etzba.early', JSON.stringify(e)); } catch {} render(); }
  } catch (err) { dbg.log('info', 'early: ' + err.message); }
  announceEarly();
}
