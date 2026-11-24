import { dateKey } from './util.js';

const DAY = 864e5;
export const SICK_PER_MONTH = 1.5, SICK_MAX = 90;
export { dateKey };
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

let YOUNG = () => false;
export function setYoungInYear(fn) { YOUNG = fn; }
export const lawVacDays = (job, y = new Date().getFullYear()) => YOUNG(y) ? (+job.weekDays === 6 ? 16 : 14) : (+job.weekDays === 6 ? 14 : 12);
const fullMonthDays = job => (+job.weekDays === 6 ? 25 : 21.66);

export function sickShares(absences) {
  const sick = absences.filter(a => a.kind === 'sick').sort((a, b) => a.date < b.date ? -1 : 1);
  const out = {}; let prev = null, n = 0;
  for (const a of sick) {
    n = prev && Math.round((fromKey(a.date) - fromKey(prev)) / DAY) === 1 ? n + 1 : 1;
    out[a.id] = n === 1 ? 0 : n <= 3 ? 0.5 : 1;
    prev = a.date;
  }
  return out;
}

export function runStarts(absences) {
  const out = {};
  for (const kind of ['sick', 'vac']) {
    const list = absences.filter(a => a.kind === kind).sort((a, b) => a.date < b.date ? -1 : 1);
    let start = null, prev = null;
    for (const a of list) {
      if (!prev || Math.round((fromKey(a.date) - fromKey(prev)) / DAY) > 3) start = a.date;
      out[a.id] = start; prev = a.date;
    }
  }
  return out;
}

export function dayValue(job, worked, date) {
  if (job.leaveMode !== 'avg') return (+job.leaveHours || 8) * (+job.rate || 0);
  const t = +fromKey(date), from = t - 90 * DAY, days = new Map();
  for (const { start, base } of worked) {
    const s = +new Date(start); if (s < from || s >= t) continue;
    const k = dateKey(s); days.set(k, (days.get(k) || 0) + base);
  }
  if (!days.size) return (+job.regHours || 8) * (+job.rate || 0);
  let sum = 0; for (const v of days.values()) sum += v;
  return sum / days.size;
}

export function balances(job, worked, absences, today = new Date()) {
  const end = new Date(today); end.setHours(23, 59, 59, 999);
  const workDays = new Set(worked.map(w => dateKey(w.start)));
  const shares = sickShares(absences);
  // paid sick days count as work days for vacation
  for (const a of absences) if (a.kind === 'sick' && shares[a.id] > 0) workDays.add(a.date);
  const first = job.startDate || [...workDays].sort()[0];
  if (!first) return { start: null, sick: { accrued: 0, used: 0, left: 0 }, vac: { accrued: 0, used: 0, left: 0, full: +job.vacDays || lawVacDays(job) } };
  const start = fromKey(first);
  const daysIn = (a, b) => { let n = 0; for (const k of workDays) { const d = fromKey(k); if (d >= a && d < b) n++; } return n; };

  // sick: month by month, used days come off as they happen, the balance never above 90
  let sickLeft = 0, sickAcc = 0, sickUsed = 0;
  const sickByMonth = new Map();
  for (const a of absences) if (a.kind === 'sick') { const k = a.date.slice(0, 7); sickByMonth.set(k, (sickByMonth.get(k) || 0) + 1); }
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const used = sickByMonth.get(dateKey(m).slice(0, 7)) || 0;
    sickLeft -= used; sickUsed += used;
    if (next <= end) {
      const got = SICK_PER_MONTH * Math.min(1, daysIn(m, next) / fullMonthDays(job));
      sickAcc += got; sickLeft = Math.min(SICK_MAX, sickLeft + got);
    }
  }

  // vacation: year by year, in proportion to days worked so far
  const full = +job.vacDays || lawVacDays(job, end.getFullYear());
  let vacAcc = 0;
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    const wholeYear = start <= new Date(y, 0, 1);
    vacAcc += (+job.vacDays || lawVacDays(job, y)) * Math.min(1, daysIn(new Date(y, 0, 1), new Date(y + 1, 0, 1)) / (wholeYear ? 200 : 240));
  }
  const vacUsed = absences.filter(a => a.kind === 'vac' && fromKey(a.date) <= end).length;
  return {
    start: first,
    sick: { accrued: sickAcc, used: sickUsed, left: sickLeft },
    vac: { accrued: vacAcc, used: vacUsed, left: vacAcc - vacUsed, full },
  };
}

export const FULL_MONTH_HOURS = 182;
export function havraa(job, worked, R, today = new Date()) {
  const first = job.startDate || [...worked].map(w => dateKey(w.start)).sort()[0];
  if (!first) return null;
  const start = fromKey(first), t = new Date(today);
  let years = t.getFullYear() - start.getFullYear();
  if (t.getMonth() < start.getMonth() || (t.getMonth() === start.getMonth() && t.getDate() < start.getDate())) years--;
  const from = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  if (years < 1) return { eligible: false, from, years: 0 };
  const table = R.havraaDays || [5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 9, 9, 9, 9, 10];
  const days = table[Math.min(years, table.length) - 1];
  const rates = R.havraa || {}, ys = Object.keys(rates).map(Number).sort((a, b) => a - b);
  const y = ys.filter(x => x <= t.getFullYear()).pop() ?? ys[0];
  const rate = rates[y] || 451.5;
  const yearAgo = +t - 365 * DAY;
  let hours = 0; for (const w of worked) { const s = +new Date(w.start); if (s >= yearAgo && s <= +t) hours += w.hours; }
  const scope = Math.min(1, hours / (12 * FULL_MONTH_HOURS));
  return { eligible: true, from, years, days, rate, scope, hours, year: y, amount: days * rate * scope };
}
