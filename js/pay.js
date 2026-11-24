// Pay worked out from the user's data: per shift, per month, per period, and the rules that depend on age.
import { grossToNet, taxFor } from './net-pay.js';
import { setAgeOf, computeAll, shiftPay, holidayPayDays, TIERS, MIN_WAGE_HOURLY, weekStart, jobAt } from './pay-engine.js';
import { balances, dayValue, sickShares, runStarts, havraa, setYoungInYear } from './leave.js';
import { rules } from './rules.js';
import { pad } from './util.js';
import { S, jobById, place, MEMO, invalidate, index, inMonth, inWeek } from './state.js';

/** Whether net pay is shown (it can be turned off). */
export const NET = () => S.settings.net !== false;

/* ---- age ---- */
/** Age in whole years on a date, or null when no date of birth is set. */
export function ageAt(when, birth = S.settings.birth) {
  if (!birth) return null;
  const b = new Date(birth + 'T00:00'), d = new Date(when);
  const before = d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  return d.getFullYear() - b.getFullYear() - (before ? 1 : 0);
}
const YOUTH = [[16, .70], [17, .75], [18, .83]];
/** Hourly minimum wage on a date, by age. Youth rates are a share of the monthly minimum over 173 hours. */
export function minWage(when = new Date()) {
  const a = ageAt(when), y = a == null ? null : YOUTH.find(([u]) => a < u);
  return y ? Math.round(MIN_WAGE_HOURLY * 182.03 * y[1] / 173 * 100) / 100 : MIN_WAGE_HOURLY;
}
/** Pension becomes mandatory at 21 for men and 20 for women. */
export const pensionAge = () => +S.settings.sex === 2.75 ? 20 : 21;
/** Call after the date of birth changes, so cached pay is recalculated. */
export const refreshAge = () => setAgeOf(d => ageAt(d));
refreshAge();
setYoungInYear(y => (ageAt(new Date(y, 0, 1)) ?? 99) < 18);

/** What grossToNet needs for a month: credit points, pension, and whether the worker is a minor. */
export function netOpts(y, m) {
  const s = S.settings, b = s.birth;
  const minor = !!b && ageAt(new Date(y, m, 1)) < 18;
  const youthPoint = !!b && [16, 17].includes(y - +b.slice(0, 4)) ? 1 : 0;
  const pension = s.pension && !(b && ageAt(new Date(y, m + 1, 0)) < pensionAge());
  return { points: +s.sex + +s.extraPts + youthPoint, pension, pEmp: +s.pEmp, pEr: +s.pEr, sev: +s.sev, hish: s.hish, minor };
}

/** The next Knesset election day as d.m.yyyy, or ''. */
export function electionDate() {
  const today = new Date().toISOString().slice(0, 10);
  const d = rules().elections.map(e => e.date).sort().find(x => x >= today);
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number);
  return `${dd}.${m}.${y}`;
}

/* ---- shifts ---- */
/** Pay of every saved shift, by shift id. Recomputed after every change. */
export let PAY = new Map();
export function recompute() { invalidate(); PAY = computeAll(S.shifts, jobById, place()); }

/** Regular hours already used this week before a shift starts (for the 42-hour week). */
export function weekRegBefore(job, start) {
  const st = +new Date(start);
  let sum = 0;
  for (const s of inWeek(+weekStart(start))) if (s.jobId === job.id && index().t.get(s) < st) sum += PAY.get(s.id)?.regUsed || 0;
  return sum;
}

/** The running shift's pay so far, or null. */
export function livePay() {
  const a = S.active; if (!a) return null;
  const job = jobAt(jobById(a.jobId), a.start);
  const end = new Date(Math.max(Date.now(), +new Date(a.start)));
  return { job, p: shiftPay({ start: a.start, end, breakMin: 0 }, job, place(), weekRegBefore(job, a.start)) };
}

/** Gross, hours and count of shifts starting in [from, to). */
export function sumPeriod(from, to) {
  let g = 0, h = 0, c = 0;
  for (const s of S.shifts) {
    const d = new Date(s.start), p = d >= from && d < to && PAY.get(s.id);
    if (p) { g += p.pay; h += p.hours; c++; }
  }
  return { g, h, c };
}
/** This month against the last one; in the current month, only up to the same day. */
export function monthVsLast(y, m) {
  const now = new Date(), from = new Date(y, m, 1), cur = y === now.getFullYear() && m === now.getMonth();
  const to = cur ? now : new Date(y, m + 1, 1), pFrom = new Date(y, m - 1, 1);
  const pTo = cur ? new Date(Math.min(+from, +pFrom + (now - from))) : from;
  return { a: sumPeriod(from, to), b: sumPeriod(pFrom, pTo), pm: (m + 11) % 12, partial: cur ? now.getDate() : 0 };
}
/** This year against the last one; in the current year, only up to the same point. */
export function yearVsLast(y) {
  const now = new Date(), cur = y === now.getFullYear(), from = new Date(y, 0, 1), to = cur ? now : new Date(y + 1, 0, 1);
  const pFrom = new Date(y - 1, 0, 1), pTo = cur ? new Date(+pFrom + (now - from)) : from;
  return { a: sumPeriod(from, to), b: sumPeriod(pFrom, pTo), partial: cur };
}

/* ---- leave ---- */
/** Base pay of a job's shifts in the 3 months before a date (to value a sick or vacation day). */
export function workedFor(jobId, date) {
  const t = +new Date(date + 'T00:00:00'), from = t - 91 * 864e5, out = [];
  for (const s of S.shifts) {
    const st = +new Date(s.start), p = s.jobId === jobId && st >= from && st < t && PAY.get(s.id);
    if (p) out.push({ start: s.start, base: p.base });
  }
  return out;
}
export function havraaOf(job, today = new Date()) {
  const worked = [];
  for (const s of S.shifts) { const p = s.jobId === job.id && PAY.get(s.id); if (p) worked.push({ start: s.start, hours: p.hours }); }
  return havraa(job, worked, rules(), today);
}
export const leaveOf = (job, today = new Date()) =>
  balances(job, S.shifts.filter(s => s.jobId === job.id), S.absences.filter(a => a.jobId === job.id), today);

/* ---- months ---- */
/** A month's totals, remembered until the data changes. */
export function monthCalc(y, m) {
  const k = y * 12 + m;
  if (!MEMO.has(k)) MEMO.set(k, calcMonth(y, m));
  return MEMO.get(k);
}
/** A month's totals including the shift running now, if it started in that month. */
export function withLive(M) {
  const L = livePay(); if (!L) return M;
  const st = new Date(S.active.start); if (st.getFullYear() !== M.y || st.getMonth() !== M.m) return M;
  const gross = M.gross + L.p.base;
  return { ...M, gross, hours: M.hours + L.p.hours, live: L, net: grossToNet(gross, netOpts(M.y, M.m), taxFor(M.y)) };
}

const emptyJob = job => ({ job, hours: 0, b: {}, money: {}, travel: 0, travelDays: 0, bonus: 0, tips: 0, tipsOwn: 0, tipsOver: 0, count: 0, holiday: 0, holDays: [], sick: 0, sickDays: 0, vac: 0, vacDays: 0 });

function calcMonth(y, m) {
  const monthEnd = new Date(y, m + 1, 0, 23, 59);
  const per = new Map(), entry = (job0, at = monthEnd) => per.get(job0.id) || per.set(job0.id, emptyJob(jobAt(job0, at))).get(job0.id);
  const shifts = [...inMonth(y, m)];
  let gross = 0, hours = 0;

  // worked shifts
  for (const s of shifts) {
    const p = PAY.get(s.id); if (!p) continue;
    const J = entry(jobById(s.jobId));
    J.hours += p.hours; J.travel += p.travel; J.bonus += p.bonus; J.tips += p.tips; J.count++;
    if (p.travel) J.travelDays++;
    gross += p.pay; hours += p.hours;
    if (p.tipsInPay) J.tipsOver += p.pay - p.base - p.travel - p.bonus; else J.tipsOwn += p.tips;
    for (const k of TIERS) { J.b[k] = (J.b[k] || 0) + p.b[k]; J.money[k] = (J.money[k] || 0) + p.money[k]; }
  }

  // holiday pay, for jobs that pay it
  for (const job0 of S.jobs) {
    const days = holidayPayDays(y, m, { ...job0, holidayPay: true }).filter(h => jobAt(job0, h.date).holidayPay);
    if (!days.length) continue;
    const J = entry(job0);
    J.holDays = days;
    J.holiday = days.reduce((sum, h) => { const r = jobAt(job0, h.date); return sum + r.holidayPayHours * r.rate; }, 0);
    gross += J.holiday;
  }

  // travel never more than the monthly pass, when one is set
  for (const J of per.values()) {
    const cap = +J.job.travelMonthCap || 0;
    if (cap > 0 && J.travel > cap) { gross -= J.travel - cap; J.travelFull = J.travel; J.travel = cap; }
  }

  // sick and vacation days, paid from an ordinary day's pay
  const absent = S.absences.filter(a => a.date.startsWith(`${y}-${pad(m + 1)}`)), absPay = new Map();
  for (const a of absent) {
    const job0 = S.jobs.find(j => j.id === a.jobId); if (!job0) continue;
    const mine = S.absences.filter(x => x.jobId === a.jobId);
    const share = a.kind === 'sick' ? sickShares(mine)[a.id] ?? 0 : 1;
    const from = runStarts(mine)[a.id] || a.date;
    const v = dayValue(jobAt(job0, from), workedFor(a.jobId, from), from) * share;
    const J = entry(job0);
    if (a.kind === 'sick') { J.sick += v; J.sickDays++; } else { J.vac += v; J.vacDays++; }
    absPay.set(a.id, { pay: v, share });
    gross += v;
  }

  // recuperation pay spread over the year, for jobs that pay it monthly
  for (const J of per.values()) {
    const H = J.job.havraaMode === 'month' && havraaOf(J.job, monthEnd);
    J.havraa = H?.eligible ? H.amount / 12 : 0;
    gross += J.havraa;
  }

  let tipsOwn = 0;
  for (const J of per.values()) {
    J.total = Object.values(J.money).reduce((a, b) => a + b, 0) + J.travel + J.bonus + J.holiday + J.tipsOver + J.sick + J.vac + J.havraa;
    tipsOwn += J.tipsOwn;
  }
  return { y, m, shifts, absent, absPay, perJob: [...per.values()], gross, hours, net: grossToNet(gross, netOpts(y, m), taxFor(y)), tipsOwn };
}
