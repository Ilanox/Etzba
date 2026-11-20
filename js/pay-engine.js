// אצבע — shift pay engine. Each job (workplace) carries its own rules.
import { restWindows, holidaysOfGregorianYear } from './hebrew-calendar.js';

export let MIN_WAGE_HOURLY = 35.40;
export function setMinWage(v) { MIN_WAGE_HOURLY = v; }

export function defaultJob(name = 'עבודה') {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    name, color: '#E4572E',
    rate: 40,
    otOn: true,
    shabbatOn: true,
    weekDays: 5,
    regHours: 8.6,
    shortDay: 4,
    shortHours: 7.6,
    weeklyRule: true,
    weeklyLimit: 42,
    nightRule: true,
    nightRegHours: 7,
    ot1Hours: 2,
    r: { reg: 100, ot1: 125, ot2: 150, rest: 150, restOt1: 175, restOt2: 200, chag: 150, chagOt1: 175, chagOt2: 200, elect: 200, electOt1: 250, electOt2: 300 },
    election: true,
    restMode: 'city',
    fixedStart: { day: 5, time: '16:00' },
    fixedEnd: { day: 0, time: '04:00' },
    chag: true,
    holidayPay: false,
    holidayPayHours: 8,
    travel: 0,
    travelMode: 'day',
    travelMonthCap: 0,
    breakMin: 0,
    tipsOn: false,
    tipsMode: 'own',
    startDate: '',
    vacDays: 0,
    leaveMode: 'hours',
    leaveHours: 8,
    havraaMode: 'year',
  };
}

export function normalizeJob(j) {
  const d = defaultJob(j.name);
  return { ...d, ...j, r: { ...d.r, ...(j.r || {}) }, fixedStart: { ...d.fixedStart, ...(j.fixedStart || {}) }, fixedEnd: { ...d.fixedEnd, ...(j.fixedEnd || {}) } };
}

export const TIERS = ['reg', 'ot1', 'ot2', 'rest', 'restOt1', 'restOt2', 'chag', 'chagOt1', 'chagOt2', 'elect', 'electOt1', 'electOt2', 'special'];
export const TIER_NAME = {
  reg: 'שעות רגילות', ot1: 'שעות נוספות', ot2: 'שעות נוספות', rest: 'שבת', restOt1: 'נוספות בשבת', restOt2: 'נוספות בשבת', chag: 'חג', chagOt1: 'נוספות בחג', chagOt2: 'נוספות בחג', elect: 'יום בחירות', electOt1: 'נוספות ביום בחירות', electOt2: 'נוספות ביום בחירות', special: 'תעריף מיוחד',
};

export let ELECTION_DAYS = ['2026-10-27'];
export function setElectionDays(list) { ELECTION_DAYS = list.slice(); PAY_CACHE.clear(); }
const ELECTION_NAME = 'יום הבחירות';
function electionWindows(start, end) {
  const out = [];
  for (const d of ELECTION_DAYS) {
    const [y, m, dd] = d.split('-').map(Number), a = +new Date(y, m - 1, dd), b = +new Date(y, m - 1, dd + 1);
    if (a < +end && b > +start) out.push({ start: a, end: b });
  }
  return out;
}

export function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }

export function shiftPay(sh, job, place, weekRegBefore = 0) {
  const start = new Date(sh.start), end = new Date(sh.end);
  const total = Math.max(0, Math.round((end - start) / 6e4));
  const brk = Math.min(total, Math.max(0, Math.round(+sh.breakMin || 0)));
  const paid = total - brk, bs = Math.floor((total - brk) / 2), be = bs + brk, f = 1;
  const off = sh.forceRest === false;
  const shabWins = off || job.shabbatOn === false ? [] : restWindows(start, end, place, { ...job, chag: false });
  const chagWins = off || job.chag === false ? [] : restWindows(start, end, place, { ...job, shabbatOn: false });
  const names = new Set();
  const elWins = off || job.election === false ? [] : electionWindows(start, end);
  const otOn = job.otOn !== false;

  let night = 0;
  if (job.nightRule && total) {
    const s0 = +start, cnt = x => Math.min(total, Math.max(0, Math.ceil((x - s0) / 6e4)));
    const d = new Date(start); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
    for (; +d < +end; d.setDate(d.getDate() + 1)) {
      const a = new Date(d); a.setHours(22, 0, 0, 0);
      const b = new Date(d); b.setDate(b.getDate() + 1); b.setHours(6, 0, 0, 0);
      night += cnt(+b) - cnt(+a);
    }
  }
  const isNight = job.nightRule && night >= 120;
  const isShort = !isNight && start.getDay() === +job.shortDay;
  const threshold = isNight ? job.nightRegHours : isShort ? job.shortHours : job.regHours;
  const regMin = threshold * 60, ot1Min = regMin + job.ot1Hours * 60;
  const weekCap = otOn && job.weeklyRule ? job.weeklyLimit * 60 : Infinity;

  const b = { reg: 0, ot1: 0, ot2: 0, rest: 0, restOt1: 0, restOt2: 0, chag: 0, chagOt1: 0, chagOt2: 0, elect: 0, electOt1: 0, electOt2: 0, special: 0 };
  const specialPct = Math.max(0, +sh.specialPct || 0);
  const forced = sh.forceRest === true, chagFirst = job.r.chag >= job.r.rest, s0 = +start;
  let ei = 0, si = 0, ci = 0, cum = 0, wk = weekRegBefore * 60, weeklyOT = 0, restStart = null, lastKey = null, lastSw = null, lastCw = null;
  for (let i = 0; i < total; i++) {
    if (i >= bs && i < be) continue;
    if (specialPct) { b.special += f / 60; lastKey = 'special'; cum += f; continue; }
    const t = s0 + i * 6e4 + 3e4;
    while (si < shabWins.length && shabWins[si].end <= t) si++;
    while (ci < chagWins.length && chagWins[ci].end <= t) ci++;
    const sw = si < shabWins.length && shabWins[si].start <= t ? shabWins[si] : null;
    const cw = ci < chagWins.length && chagWins[ci].start <= t ? chagWins[ci] : null;
    while (ei < elWins.length && elWins[ei].end <= t) ei++;
    const ew = ei < elWins.length && elWins[ei].start <= t;
    if (ew) { names.add(ELECTION_NAME); if (!restStart) restStart = new Date(elWins[ei].start); }
    // names and the earliest window start only change when the window does
    if (sw && sw !== lastSw) { for (const n of sw.names) names.add(n); if (!restStart || sw.start < restStart) restStart = sw.start; lastSw = sw; }
    if (cw && cw !== lastCw) { for (const n of cw.names) names.add(n); if (!restStart || cw.start < restStart) restStart = cw.start; lastCw = cw; }
    let kind = null;
    if (forced) kind = 'rest';
    else if (sw && cw) kind = chagFirst ? 'chag' : 'rest';
    else if (cw) kind = 'chag'; else if (sw) kind = 'rest';
    // election day: whichever pays more if it falls on Shabbat or a holiday
    if (ew && !forced && (!kind || job.r.elect > job.r[kind])) kind = 'elect';
    let tier = !otOn ? 'reg' : cum < regMin ? 'reg' : cum < ot1Min ? 'ot1' : 'ot2';
    if (tier === 'reg' && wk >= weekCap) { tier = 'ot1'; weeklyOT += f / 60; }
    if (tier === 'reg') wk += f;
    const key = kind ? (tier === 'reg' ? kind : kind + (tier === 'ot1' ? 'Ot1' : 'Ot2')) : tier;
    b[key] += f / 60; lastKey = key;
    cum += f;
  }
  if (sh.forceRest === true && !names.size && !specialPct) names.add('סומן ידנית');
  const rate = +(sh.rate ?? job.rate);
  const money = {}; let base = 0;
  for (const k of TIERS) { money[k] = b[k] * rate * (k === 'special' ? specialPct : job.r[k]) / 100; base += money[k]; }
  const travel = +(sh.travel ?? job.travel) || 0, bonus = +sh.bonus || 0, tips = Math.max(0, +sh.tips || 0);
  const tipsInPay = tips > 0 && job.tipsMode === 'wage';
  const topUp = tipsInPay ? Math.max(0, base - tips) : 0;
  const wage = tipsInPay ? Math.max(base, tips) : base;
  const sum = ks => ks.reduce((a, k) => a + b[k], 0);
  return {
    hours: paid / 60, total: total / 60, b, money, base, travel, bonus, tips, specialPct, tipsInPay, topUp, pay: wage + travel + bonus, rate,
    isNight, isShort, threshold, weeklyOT, regUsed: wk / 60 - weekRegBefore, lastKey, otOn,
    names: [...names], restStart,
    otHours: sum(['ot1', 'ot2', 'restOt1', 'restOt2', 'chagOt1', 'chagOt2', 'electOt1', 'electOt2']),
    restHours: sum(['rest', 'restOt1', 'restOt2', 'chag', 'chagOt1', 'chagOt2', 'elect', 'electOt1', 'electOt2']),
  };
}

export const RULE_KEYS = ['election', 'rate', 'weekDays', 'regHours', 'shortDay', 'shortHours', 'weeklyRule', 'weeklyLimit', 'nightRule', 'nightRegHours',
  'ot1Hours', 'r', 'restMode', 'fixedStart', 'fixedEnd', 'chag', 'shabbatOn', 'otOn', 'holidayPay', 'holidayPayHours', 'travel', 'travelMode', 'travelMonthCap', 'tipsMode', 'leaveMode', 'leaveHours'];
export const rulesOf = job => JSON.parse(JSON.stringify(Object.fromEntries(RULE_KEYS.map(k => [k, job[k]]))));
let AGE_OF = null;
export function setAgeOf(fn) { AGE_OF = fn; PAY_CACHE.clear(); }
const MINOR = new WeakMap();
function forAge(job, when) {
  const a = AGE_OF?.(when);
  if (a == null || a >= 18) return job;
  const b = a < 16 ? 'u16' : 'u18';
  let m = MINOR.get(job); if (!m) MINOR.set(job, m = {});
  return m[b] ||= { ...job, minor: true, weeklyRule: true, weeklyLimit: Math.min(+job.weeklyLimit || 40, 40),
    regHours: Math.min(+job.regHours, b === 'u18' && +job.weekDays === 5 ? 9 : 8), shortHours: Math.min(+job.shortHours, 7), nightRegHours: Math.min(+job.nightRegHours, 7) };
}
export const jobAt = (job, when) => forAge(rawJobAt(job, when), when);
function rawJobAt(job, when) {
  const vs = job.versions; if (!vs || !vs.length) return job;
  const t = +new Date(when);
  let best = null;
  for (const v of vs) if (t < +new Date(v.until) && (!best || +new Date(v.until) < +new Date(best.until))) best = v;
  return best ? { ...job, ...best.rules, r: { ...job.r, ...best.rules.r } } : job;
}
export function applyRulesFrom(oldJob, newJob, from) {
  const out = { ...newJob };
  if (from == null) { out.versions = []; return out; }
  const f = +new Date(from);
  const kept = (oldJob.versions || []).filter(v => +new Date(v.until) <= f);
  const runningAtFrom = rawJobAt(oldJob, new Date(f - 1));
  kept.push({ until: new Date(f).toISOString(), rules: rulesOf(runningAtFrom) });
  out.versions = kept.sort((a, b) => +new Date(a.until) - +new Date(b.until));
  return out;
}
export function rulesChanged(a, b) { return JSON.stringify(rulesOf(a)) !== JSON.stringify(rulesOf(b)); }

const PAY_CACHE = new Map();
export function computeAll(shifts, jobById, place) {
  const pk = place.city + '|' + place.candleMin + '|' + place.havdalahMin;
  const byId = new Map(), weekOf = new Map(), weeks = new Map(), done = new Map();
  for (const s of shifts) {
    const t = +new Date(s.start), w = +weekStart(t);
    byId.set(s.id, s); weekOf.set(s.id, w);
    let g = weeks.get(w); if (!g) weeks.set(w, g = []); g.push([t, s]);
  }
  const keys = new Map(), periods = new Map();
  const jobKey = j => { let k = keys.get(j); if (k === undefined) { k = JSON.stringify(j); keys.set(j, k); } return k; };
  // the rules in force for a shift, resolved once per rule period rather than once per shift
  const at = (j, when) => {
    const vs = j.versions; if (!vs || !vs.length) return forAge(j, when);
    const tt = +new Date(when); let best = null;
    for (const v of vs) if (tt < +new Date(v.until) && (!best || +new Date(v.until) < +new Date(best.until))) best = v;
    if (!best) return forAge(j, when);
    const k = j.id + '|' + best.until; let r = periods.get(k);
    if (!r || r.src !== j) { r = { src: j, job: rawJobAt(j, when) }; periods.set(k, r); }
    return forAge(r.job, when);
  };
  function week(w) {
    const g = weeks.get(w).sort((a, b) => a[0] - b[0]), reg = new Map(), travelDays = new Set();
    for (let [, s] of g) {
      const job = at(jobById(s.jobId), s.start);
      // travel is paid once per work day: a second shift the same day doesn't get it again
      if (job.travelMode !== 'shift' && s.travel == null) {
        const dk = job.id + '|' + new Date(s.start).toDateString();
        if (travelDays.has(dk)) s = { ...s, travel: 0 }; else travelDays.add(dk);
      }
      const before = reg.get(job.id) || 0;
      const ck = s.start + '|' + s.end + '|' + s.breakMin + '|' + s.bonus + '|' + s.tips + '|' + s.specialPct + '|' + s.rate + '|' + s.travel + '|' + s.forceRest + '|' + before + '|' + pk + '|' + jobKey(job);
      let p = PAY_CACHE.get(ck);
      if (!p) { p = shiftPay(s, job, place, before); if (PAY_CACHE.size > 50000) PAY_CACHE.clear(); PAY_CACHE.set(ck, p); }
      reg.set(job.id, before + p.regUsed);
      done.set(s.id, p);
    }
  }
  return {
    get(id) {
      let p = done.get(id); if (p) return p;
      if (!byId.has(id)) return undefined;
      week(weekOf.get(id)); return done.get(id);
    },
    has(id) { return byId.has(id); },
    values() { for (const w of weeks.keys()) week(w); return done.values(); },
    get size() { return byId.size; },
  };
}

export function shiftKind(sh, p) {
  if (p.names.some(n => n !== 'שבת' && n !== 'סומן ידנית')) return 'chag';
  if (p.names.length) return 'shabbat';
  const h = new Date(sh.start).getHours();
  if (p.isNight || h >= 21 || h < 4) return 'night';
  if (h < 11) return 'morning';
  if (h < 15) return 'noon';
  return 'evening';
}
export const KIND_NAME = { morning: 'בוקר', noon: 'צהריים', evening: 'ערב', night: 'לילה', shabbat: 'שבת', chag: 'חג' };

export function holidayPayDays(year, month, job) {
  if (!job.holidayPay) return [];
  return holidaysOfGregorianYear(year).filter(h => h.date.getMonth() === month && h.dow !== 6);
}

export function rateChanges(start, job, place, weekRegBefore = 0, hours = 16) {
  const s0 = +new Date(start), out = [];
  let prev = null, prevNames = [];
  for (let m = 1; m <= hours * 60; m++) {
    const p = shiftPay({ start: new Date(s0).toISOString(), end: new Date(s0 + m * 6e4).toISOString(), breakMin: 0 }, job, place, weekRegBefore);
    const key = p.lastKey;
    if (prev && key !== prev) out.push({ at: new Date(s0 + (m - 1) * 6e4), key, from: prev, weekly: p.weeklyOT > 0 && prev === 'reg' && key === 'ot1', names: p.names.filter(n => !prevNames.includes(n)), threshold: p.threshold });
    prev = key; prevNames = p.names;
  }
  return out;
}
