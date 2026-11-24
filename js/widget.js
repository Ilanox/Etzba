// The home-screen widget: what it shows, sent to Android whenever something changes.
import * as native from './native-bridge.js';
import { S, jobById, place } from './state.js';
import { jobAt, shiftPay, rateChanges } from './pay-engine.js';
import { LANG, MONTHS, EN } from './lang.js';
import { weekRegBefore, monthCalc } from './pay.js';
import { tr } from './translate.js';
import { tierLabel } from './views/common.js';
import { isSup } from './theme.js';
import { money } from './util.js';

export let lastWidget = '';

export function cssHex(name) {
  try {
    const el = document.createElement('i'); el.style.color = `var(${name})`; el.style.display = 'none'; document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/[\d.]+/g); el.remove();
    if (!m || m.length < 3) return '';
    return '#' + m.slice(0, 3).map(x => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch { return ''; }
}

export function syncWidget() {
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
