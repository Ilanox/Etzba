// אצבע — sick days and vacation for hourly workers (Sick Pay Law, Annual Leave Law).
// Pure functions: the app passes in a job's shifts and absences; nothing here touches storage.
//
//   Sick days: 1.5 a month for a full month's work, less in proportion for fewer days, up to 90 saved.
//              Pay: first day 0%, second and third 50%, from the fourth 100%, per run of sick days.
//   Vacation:  a full year's days for 200 work days in a calendar year (240 when the job didn't run
//              the whole year), less in proportion for fewer days. Paid as an ordinary day's pay.
//   An ordinary day's pay: the average pay per day worked in the three months before.

const DAY = 864e5;
export const SICK_PER_MONTH = 1.5, SICK_MAX = 90;
export const dateKey = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

/** Vacation days for a full year's work, by the work week (first years at a job). */
export const lawVacDays = job => (+job.weekDays === 6 ? 14 : 12);
/** Work days that make a full month, for sick-day accrual. */
const fullMonthDays = job => (+job.weekDays === 6 ? 25 : 21.66);

/** Share of a day's pay for each sick day: { [absence id]: 0 | 0.5 | 1 }. Runs are consecutive dates. */
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

/**
 * The day each absence takes its pay from: the first day of its run. One vacation (or one illness)
 * is paid at one daily rate, worked out from the three months before it began, so its days don't
 * drift apart as old shifts fall out of the window. A weekend in the middle doesn't end a run.
 */
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

/** A day's pay for a vacation or sick day: the rate × the job's hours for a day, or (if the job says so)
    the average pay (hours only: no travel, tips or bonus) per day worked in the 90 days before `date`. */
export function dayValue(job, worked, date) {
  if (job.leaveMode !== 'avg') return (+job.leaveHours || 8) * (+job.rate || 0);   // the usual way: a day of hours at the rate
  const t = +fromKey(date), from = t - 90 * DAY, days = new Map();
  for (const { start, base } of worked) {
    const s = +new Date(start); if (s < from || s >= t) continue;
    const k = dateKey(s); days.set(k, (days.get(k) || 0) + base);
  }
  if (!days.size) return (+job.regHours || 8) * (+job.rate || 0);
  let sum = 0; for (const v of days.values()) sum += v;
  return sum / days.size;
}

/**
 * Sick and vacation balances on `today`.
 * worked: [{ start }] shifts of this job; absences: this job's [{ id, kind, date }].
 */
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
    if (next <= end) {   // a month counts once it's over
      const got = SICK_PER_MONTH * Math.min(1, daysIn(m, next) / fullMonthDays(job));
      sickAcc += got; sickLeft = Math.min(SICK_MAX, sickLeft + got);
    }
  }

  // vacation: year by year, in proportion to days worked so far
  const full = +job.vacDays || lawVacDays(job);
  let vacAcc = 0;
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    const wholeYear = start <= new Date(y, 0, 1);
    vacAcc += full * Math.min(1, daysIn(new Date(y, 0, 1), new Date(y + 1, 0, 1)) / (wholeYear ? 200 : 240));
  }
  const vacUsed = absences.filter(a => a.kind === 'vac' && fromKey(a.date) <= end).length;
  return {
    start: first,
    sick: { accrued: sickAcc, used: sickUsed, left: sickLeft },
    vac: { accrued: vacAcc, used: vacUsed, left: vacAcc - vacUsed, full },
  };
}
