// אצבע — app
import { grossToNet, taxFor } from './net-pay.js';
import { rateChanges, computeAll, shiftPay, defaultJob, normalizeJob, holidayPayDays, shiftKind, KIND_NAME, TIERS, TIER_NAME, MIN_WAGE_HOURLY, weekStart, jobAt, applyRulesFrom, rulesChanged } from './pay-engine.js';
import { readSheets } from './file-reader.js';
import { rowsToShifts, guessYear } from './shift-import.js';
import { CITIES, nextRest, restWindows, holidaysOfGregorianYear } from './hebrew-calendar.js';
import { I, mark, ridges, handAngles } from './svg-icons.js';
import { loadRules, checkForUpdates, rules } from './rules.js';
import { preferPack, checkPack } from './remote-packs.js';
import { usePack, startTranslating, stopTranslating, tr } from './translate.js';
import { LANGS, loadPack, langInfo } from '../languages/index.js';
import * as dbg from './diagnostics.js';
import * as native from './native-bridge.js';
import { balances, dayValue, sickShares, runStarts, dateKey, havraa } from './leave.js';
import { drawReport, pagesToPDF } from './report.js';
import FEATURES from './features.js';

const VERSION = '1.0.0';
dbg.log('boot', 'v' + VERSION);

/* ================= state ================= */
const KEY = 'etzba.v1', OLD_KEY = 'shifts.v1';
function fresh() {
  const job = defaultJob('העבודה שלי');
  return {
    settings: { city: 'תל אביב', candleMin: 20, havdalahMin: 40, sex: 2.25, extraPts: 0, pension: false, pEmp: 6, pEr: 6.5, sev: 8.33, hish: false, theme: 'auto', lang: 'he', lastJob: job.id, notif: { rates: true, rest: true, long: true } },
    jobs: [job], shifts: [], absences: [], plans: [], active: null, ui: {},
  };
}
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)); } catch {}
  return normalizeState(d);
}
function normalizeState(d) {
  if (!d || !Array.isArray(d.jobs) || !d.jobs.length) d = fresh();
  const f = fresh();
  d.jobs = d.jobs.map(normalizeJob);
  d.settings = { ...f.settings, ...d.settings };
  d.shifts = (d.shifts || []).filter(s => s && s.start && s.end);
  d.absences = (d.absences || []).filter(a => a && a.date && (a.kind === 'sick' || a.kind === 'vac'));
  d.plans = (d.plans || []).filter(x => x && x.start && x.end && x.jobId);
  d.ui = { sort: 'old', filter: 'all', ...(d.ui || {}) };
  if (!d.settings.migSort) { if (d.ui.sort === 'new') d.ui.sort = 'old'; d.settings.migSort = 1; }   // 1.26: oldest first is the default
  if (d.settings.onboarded == null && (d.shifts.length || d.active)) d.settings.onboarded = true;   // existing users skip the welcome
  // 1.16: earlier imports stamped the file's travel on every shift, which locked it against the job
  // setting. Shifts carrying their job's usual imported value now follow the job instead.
  if (!d.settings.migTravel) {
    const byJob = new Map();
    for (const s of d.shifts) if (s.src === 'import' && s.travel != null) { const m = byJob.get(s.jobId) || new Map(); m.set(s.travel, (m.get(s.travel) || 0) + 1); byJob.set(s.jobId, m); }
    for (const [jid, m] of byJob) {
      const common = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0], job = d.jobs.find(j => j.id === jid);
      if (!job) continue;
      // follow the job when it pays travel (the person set it) or already pays the same amount;
      // a job with no travel set keeps the file's amount on each shift, so nothing is lost
      for (const s of d.shifts) if (s.jobId === jid && s.src === 'import' && s.travel === common) {
        const jt = +jobAt(job, s.start).travel || 0;
        if (jt > 0 || jt === common) delete s.travel;
      }
    }
    d.settings.migTravel = 1;
  }
  return d;
}
let S = load();
const hadLocal = (() => { try { return !!localStorage.getItem(KEY); } catch { return false; } })();
loadRules();   // yearly figures: built in, or a newer saved copy
/** The next election day (or the most recent), as d.m.yyyy. */
function electionDate() {
  const list = rules().elections.map(e => e.date).sort(), today = new Date().toISOString().slice(0, 10);
  const d = list.find(x => x >= today) || list[list.length - 1];
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number); return `${dd}.${m}.${y}`;
}
let LANG = langInfo(S.settings.lang || 'he').code;
let EN = LANG !== 'he';          // any language other than Hebrew (built-in English texts are used where the app has them)
let PACK = null;
document.documentElement.lang = LANG; document.documentElement.dir = langInfo(LANG).dir;
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = S.settings.theme || 'auto', r = t === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = r;
  const bg = { light: '#F1EEE6', dark: '#141518', blurple: '#1E1F22' }[r];
  document.querySelectorAll('meta[name=theme-color]').forEach(m => { m.removeAttribute('media'); m.content = bg; });
  native.setBars(r !== 'light');
  try { syncWidget(); } catch {}
}
applyTheme(); darkMQ.addEventListener?.('change', applyTheme);
let PAY = new Map();
const persist = () => { invalidate(); S.updatedAt = Date.now(); planNotifications(); syncGeo(); syncWidget(); const json = JSON.stringify(S); native.snapshot.save(json); try { localStorage.setItem(KEY, json); localOk = true; } catch {
  // no phone storage (blocked in some frames, or full): keep working; the account copy or a backup keeps the data
  localOk = false;
  if (!warnedLocal) { warnedLocal = true; toast('לא הצלחתי לשמור בטלפון. כדאי לגבות', 'err', { label: 'גיבוי עכשיו', fn: () => backupNow() }); }
}
  return true; };
let localOk = true, warnedLocal = false;
const recompute = () => { invalidate(); PAY = computeAll(S.shifts, jobById, place()); };
/* Shift lookups by month and week, built once per change instead of scanning every shift on
   every screen. Month results are remembered until the next change. */
let IDX = null; const MEMO = new Map();
function invalidate() { IDX = null; MEMO.clear(); }
function index() {
  if (IDX) return IDX;
  const month = new Map(), week = new Map(), t = new Map();
  for (const s of S.shifts) {
    const d = new Date(s.start), k = d.getFullYear() * 12 + d.getMonth(), w = +weekStart(d);
    t.set(s, +d);
    (month.get(k) || month.set(k, []).get(k)).push(s);
    (week.get(w) || week.set(w, []).get(w)).push(s);
  }
  for (const a of month.values()) a.sort((x, y) => t.get(x) - t.get(y));
  for (const a of week.values()) a.sort((x, y) => t.get(x) - t.get(y));
  const newest = [...S.shifts].sort((x, y) => t.get(y) - t.get(x));
  const byId = new Map(S.shifts.map(s => [s.id, s]));
  return (IDX = { month, week, newest, byId, t });
}
const inMonth = (y, m) => index().month.get(y * 12 + m) || [];
const inWeek = ws => index().week.get(+ws) || [];
function commit() { persist(); recompute(); render(); }

/* ================= helpers ================= */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '₪' + Math.round(n).toLocaleString('he-IL');
const money2 = n => '₪' + (+n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const pad = n => String(n).padStart(2, '0');
const tm = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dShort = d => { d = new Date(d); return `${d.getDate()}.${d.getMonth() + 1}`; };
const dFull = d => { d = new Date(d); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const toInput = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random());
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
let DAYS = HE_DAYS;
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
let MONTHS = HE_MONTHS;
const COLORS = ['#E4572E', '#1E7A4A', '#4B5BD0', '#C98E00', '#1F8F84', '#A1458F', '#5E574C', '#2A6FB0'];
const place = () => ({ city: S.settings.city, candleMin: S.settings.candleMin, havdalahMin: S.settings.havdalahMin });
const jobById = id => S.jobs.find(j => j.id === id) || S.jobs[0];
const buzz = ms => { if (native.haptic(+ms >= 30 || Array.isArray(ms) ? 'medium' : 'light')) return; try { navigator.vibrate?.(ms); } catch {} };
/** A name the person typed (job, note), kept apart from the text around it so mixed Hebrew/English reads in order. */
const nm = t => `<bdi>${esc(t)}</bdi>`;
// a special shift's rate is its own; in month totals several special rates add up under one line
const tierLabel = (k, job, pct) => k === 'special' ? (pct ? `${TIER_NAME[k]} ${pct}%` : TIER_NAME[k]) : `${TIER_NAME[k]} ${job.r[k]}%`;

let viewY = new Date().getFullYear(), viewM = new Date().getMonth();
let view = 'home';

function toast(msg, kind = '', action = null) {
  const t = $('#toast'); t.className = 'toast ' + kind + (action ? ' act' : '');
  t.innerHTML = (kind === 'ok' ? I.check : kind === 'err' ? I.warn : '') + `<span>${esc(msg)}</span>` + (action ? `<button type="button" class="t-act">${esc(action.label)}</button>` : '');
  if (action) {
    $('.t-act', t).onclick = () => { t.classList.remove('on'); clearTimeout(toast.t); action.fn(); };
    // an action message waits while the finger or keyboard focus is on it
    const hold = () => clearTimeout(toast.t), go = () => { clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4000); };
    t.onpointerdown = t.onfocusin = hold; t.onpointerup = t.onpointercancel = t.onfocusout = go;
  } else t.onpointerdown = t.onfocusin = t.onpointerup = t.onpointercancel = t.onfocusout = null;
  void t.offsetWidth; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), action ? 8000 : 2400);
}
/** Spoken by screen readers (polite), never shown. */
function announce(msg) { const el = $('#sr'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 60); }

/* ================= month math ================= */
function monthCalc(y, m) {
  const mk = y * 12 + m; if (MEMO.has(mk)) return MEMO.get(mk);
  const r = monthCalcRaw(y, m); MEMO.set(mk, r); return r;
}
/** The month including the shift that's running now (if it's this month), so every screen shows the same totals. */
function withLive(M) {
  const L = livePay(); if (!L) return M;
  const st = new Date(S.active.start); if (st.getFullYear() !== M.y || st.getMonth() !== M.m) return M;
  const gross = M.gross + L.p.base, s = S.settings;
  return { ...M, gross, hours: M.hours + L.p.hours, live: L,
    net: grossToNet(gross, { points: +s.sex + +s.extraPts, pension: s.pension, pEmp: +s.pEmp, pEr: +s.pEr, sev: +s.sev, hish: s.hish }, taxFor(M.y)) };
}
function monthCalcRaw(y, m) {
  const shifts = [...inMonth(y, m)];
  const per = new Map();
  let gross = 0, hours = 0;
  const J0 = job => ({ job, hours: 0, b: {}, money: {}, travel: 0, travelDays: 0, bonus: 0, tips: 0, tipsOwn: 0, tipsOver: 0, count: 0, holiday: 0, holDays: [], sick: 0, sickDays: 0, vac: 0, vacDays: 0 });
  const monthEnd = new Date(y, m + 1, 0, 23, 59);
  for (const s of shifts) {
    const job = jobAt(jobById(s.jobId), monthEnd), p = PAY.get(s.id); if (!p) continue;
    const J = per.get(job.id) || J0(job);
    J.hours += p.hours; J.travel += p.travel; J.bonus += p.bonus; J.count++;
    if (p.travel) J.travelDays++;
    J.tips += p.tips;
    if (p.tipsInPay) J.tipsOver += p.pay - p.base - p.travel - p.bonus; else J.tipsOwn += p.tips;
    for (const k of TIERS) { J.b[k] = (J.b[k] || 0) + p.b[k]; J.money[k] = (J.money[k] || 0) + p.money[k]; }
    per.set(job.id, J); gross += p.pay; hours += p.hours;
  }
  for (const job0 of S.jobs) {
    // holiday pay follows the rules that were in force on each holiday
    const days = holidayPayDays(y, m, { ...job0, holidayPay: true }).filter(h => jobAt(job0, h.date).holidayPay); if (!days.length) continue;
    const job = jobAt(job0, monthEnd), J = per.get(job.id) || J0(job);
    J.holDays = days; J.holiday = days.reduce((sum, h) => { const r = jobAt(job0, h.date); return sum + r.holidayPayHours * r.rate; }, 0);
    per.set(job.id, J); gross += J.holiday;
  }
  // travel: never more than the monthly pass, when one is set
  for (const J of per.values()) {
    const cap = +J.job.travelMonthCap || 0;
    if (cap > 0 && J.travel > cap) { gross -= J.travel - cap; J.travelFull = J.travel; J.travel = cap; }
  }
  // sick and vacation days: paid from an ordinary day's pay
  const mk = `${y}-${pad(m + 1)}`, absent = S.absences.filter(a => a.date.startsWith(mk)), absPay = new Map();
  for (const a of absent) {
    const job0 = S.jobs.find(j => j.id === a.jobId); if (!job0) continue;
    const job = jobAt(job0, a.date), J = per.get(job0.id) || J0(jobAt(job0, monthEnd));
    const share = a.kind === 'sick' ? sickShares(S.absences.filter(x => x.jobId === a.jobId))[a.id] ?? 0 : 1;
    const from = runStarts(S.absences.filter(x => x.jobId === a.jobId))[a.id] || a.date;
    const v = dayValue(jobAt(job0, from), workedFor(a.jobId, from), from) * share;
    if (a.kind === 'sick') { J.sick += v; J.sickDays++; } else { J.vac += v; J.vacDays++; }
    absPay.set(a.id, { pay: v, share });
    per.set(job0.id, J); gross += v;
  }
  // recuperation pay paid monthly: a twelfth of the year's amount, once the first year is done
  for (const J of per.values()) {
    if (J.job.havraaMode !== 'month') { J.havraa = 0; continue; }
    const H = havraaOf(J.job, monthEnd);
    J.havraa = H?.eligible ? H.amount / 12 : 0; gross += J.havraa;
  }
  let tipsOwn = 0;
  for (const J of per.values()) { J.total = Object.values(J.money).reduce((a, b) => a + b, 0) + J.travel + J.bonus + J.holiday + J.tipsOver + J.sick + J.vac + J.havraa; tipsOwn += J.tipsOwn; }
  const st = S.settings;
  const net = grossToNet(gross, { points: +st.sex + +st.extraPts, pension: st.pension, pEmp: +st.pEmp, pEr: +st.pEr, sev: +st.sev, hish: st.hish }, taxFor(y));
  return { y, m, shifts, absent, absPay, perJob: [...per.values()], gross, hours, net, tipsOwn };
}
/** A job's shifts in the 90 days before a date, with what the hours paid (for an ordinary day's pay). */
function workedFor(jobId, date) {
  const t = +new Date(date + 'T00:00:00'), from = t - 91 * 864e5, out = [];
  for (const s of S.shifts) {
    if (s.jobId !== jobId) continue;
    const st = +new Date(s.start); if (st < from || st >= t) continue;
    const p = PAY.get(s.id); if (p) out.push({ start: s.start, base: p.base });
  }
  return out;
}
function havraaOf(job, today = new Date()) {
  const worked = [];
  for (const s of S.shifts) if (s.jobId === job.id) { const p = PAY.get(s.id); if (p) worked.push({ start: s.start, hours: p.hours }); }
  return havraa(job, worked, rules(), today);
}
function leaveOf(job, today = new Date()) {
  return balances(job, S.shifts.filter(s => s.jobId === job.id), S.absences.filter(a => a.jobId === job.id), today);
}
function weekRegBefore(job, start) {
  const ws = +weekStart(start); let sum = 0;
  const st = +new Date(start);
  for (const s of inWeek(ws)) if (s.jobId === job.id && index().t.get(s) < st) sum += PAY.get(s.id)?.regUsed || 0;
  return sum;
}
function livePay() {
  const a = S.active; if (!a) return null;
  const job = jobAt(jobById(a.jobId), a.start);
  return { job, p: shiftPay({ start: a.start, end: new Date(Math.max(Date.now(), +new Date(a.start))), breakMin: 0 }, job, place(), weekRegBefore(job, a.start)) };
}

/* ================= sheets ================= */
const sheet = $('#sheet'), scrim = $('#scrim');
function openSheet(html, mount) {
  dbg.log('tap', 'sheet: ' + (/<h2[^>]*>([^<]*)/.exec(html)?.[1] || '?'));
  $('#toast').classList.remove('on');   // a message would cover the sheet's buttons
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.scrollTop = 0; sheet.style.transform = '';
  scrim.classList.add('on'); sheet.classList.add('on');
  mount?.(sheet);
}
function closeSheet() { scrim.classList.remove('on'); sheet.classList.remove('on'); sheet.style.transform = ''; }
scrim.onclick = () => { if (pop.classList.contains('on')) return closePop(); closeSheet(); };
(() => { // swipe down to close
  let y0 = null, dy = 0;
  // only a drag that starts on the handle area (top of the sheet) closes it; scrolling the content never does
  sheet.addEventListener('touchstart', e => {
    const top = sheet.getBoundingClientRect().top, y = e.touches[0].clientY;
    if (y - top < 56 && !e.target.closest('button,input,select,.wheel,.qchips,.chips,.daystrip')) { y0 = y; dy = 0; sheet.style.transition = 'none'; }
  }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  const end = () => { sheet.style.transition = ''; if (y0 != null && dy > 90) closeSheet(); else sheet.style.transform = ''; y0 = null; };
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
})();

/* ================= shared bits ================= */
function monthBar() {
  return `<div class="monthbar"><button class="ibtn" data-mn="-1" aria-label="חודש קודם">${I.chevR}</button>
    <b>${MONTHS[viewM]} ${viewY}</b><button class="ibtn" data-mn="1" aria-label="חודש הבא">${I.chevL}</button></div>`;
}
function bindMonthBar(root) {
  $$('[data-mn]', root).forEach(b => b.onclick = () => {
    viewM += +b.dataset.mn;
    if (viewM < 0) { viewM = 11; viewY--; } if (viewM > 11) { viewM = 0; viewY++; }
    render();
  });
}
function shiftRow(s) {
  const job = jobById(s.jobId), p = PAY.get(s.id); if (!p) return '';
  const k = shiftKind(s, p), d = new Date(s.start);
  const pills = [
    p.restHours > 0.01 ? `<span class="pill rest">${esc(p.names[0])}</span>` : '',
    p.otHours > 0.01 ? `<span class="pill ot">+${hm(p.otHours)} נוספות</span>` : '',
    p.specialPct ? `<span class="pill special">${p.specialPct}%</span>` : '',
  ].join('');
  const second = [S.jobs.length > 1 ? `<span class="jobp"><i style="background:${job.color}"></i>${nm(job.name)}</span>` : esc(KIND_NAME[k]), s.note ? nm(s.note) : ''].filter(Boolean);
  // small marks on the icon's corner, one color each, for what makes this shift different
  const marks = [p.specialPct ? ['special', 'pct'] : null, p.otHours > 0.01 ? ['ot', 'ot'] : null, p.tips ? ['tips', 'coins'] : null].filter(Boolean).slice(0, 2);
  return `<button class="srow" data-id="${s.id}">
    <span class="kic k-${k}" title="${KIND_NAME[k]}">${I[k]}${marks.length ? `<span class="marks">${marks.map(([c, i]) => `<i class="mk c-${c}">${I[i]}</i>`).join('')}</span>` : ''}</span>
    <span class="mid"><span class="t1">${DAYS[d.getDay()]} ${dShort(d)} ${pills}</span>
      <span class="t2 num tline"><bdi dir="ltr" class="trange">${tm(s.start)}–${tm(s.end)}</bdi><span class="tmore">${second.map(x => `<span class="sep">·</span>${x}`).join('')}</span></span></span>
    <span class="end"><span class="amt num">${money(p.pay)}</span><br><span class="t2 num">${hm(p.hours)} ש׳</span></span></button>`;
}
function bindRows(root) { $$('.srow', root).forEach(r => r.onclick = () => openShiftSheet(index().byId.get(r.dataset.id), 'edit')); }

/** Plain-language explanation of a shift's pay. */
function explain(sh, job, p) {
  const lines = TIERS.filter(k => p.b[k] > 0.004).map(k => `<div class="ln"><span class="l">${tierLabel(k, job, p.specialPct)}<small class="num">${hm(p.b[k])} ש׳ × ${money2(p.rate * (k === 'special' ? p.specialPct : job.r[k]) / 100)}</small></span><span class="v num">${money2(p.money[k])}</span></div>`);
  if (p.travel) lines.push(`<div class="ln"><span class="l">נסיעות</span><span class="v num">${money2(p.travel)}</span></div>`);
  if (p.bonus) lines.push(`<div class="ln"><span class="l">בונוס</span><span class="v num">${money2(p.bonus)}</span></div>`);
  if (p.tipsInPay) lines.push(`<div class="ln"><span class="l">טיפים דרך המעסיק<small class="num">${p.topUp > 0 ? `המעסיק משלים ${money2(p.topUp)}` : `${money2(p.tips - p.base)} מעל השכר לשעות`}</small></span><span class="v num">${money2(p.tips)}</span></div>`);
  else if (p.tips) lines.push(`<div class="ln"><span class="l">טיפים<small>שלך, מעבר לשכר</small></span><span class="v num">+${money2(p.tips)}</span></div>`);
  const why = [];
  const w = (ic, txt, bad) => why.push(`<div class="why${bad ? ' bad' : ''}">${I[ic]}<span>${txt}</span></div>`);
  const kind = p.isNight ? ' (משמרת לילה)' : p.isShort ? ` (יום ${DAYS[job.shortDay]} הוא היום המקוצר)` : '';
  if (p.restHours > 0.01) w(p.b.chag + p.b.chagOt1 + p.b.chagOt2 + p.b.elect + p.b.electOt1 + p.b.electOt2 > 0 ? 'chag' : 'shabbat', `${hm(p.restHours)} ש׳ בתוך ${esc(p.names.join(EN ? ' and ' : ' ו'))}${p.restStart ? ` (נכנס ב־${tm(p.restStart)})` : ''}, ולכן בתוספת.`);
  if (p.specialPct) w('info', `משמרת מיוחדת: כל השעות ב־${p.specialPct}%, בלי חישוב של שעות נוספות, שבת או חג.`);
  else if (!p.otOn) w('info', 'שעות נוספות כבויות בהגדרות של העבודה הזו, אז כל השעות בתעריף הרגיל.');
  else if (p.otHours - p.weeklyOT > 0.01) w('ot', `מעבר ל־${hm(p.threshold)} ש׳ ביום${kind} משלמים שעות נוספות.`);
  else if (p.hours > 0 && p.otHours < 0.01) w('info', `שעות נוספות מתחילות רק אחרי ${hm(p.threshold)} ש׳ ביום${kind}, גם אם עבדת יותר ממה שתוכנן לך.`);
  if (p.weeklyOT > 0.01 && !p.specialPct) w('ot', `עברת ${job.weeklyLimit} שעות רגילות השבוע, אז ${hm(p.weeklyOT)} ש׳ מהמשמרת נספרו כשעות נוספות.`);
  if (+sh.breakMin > 0) w('coffee', `הפסקה של ${sh.breakMin} דק׳ לא נספרת בשעות.`);
  else if (p.hours >= 6) w('coffee', 'במשמרת ארוכה מגיעה הפסקה. הפסקה שבה מותר לצאת לא בתשלום, אז אם לקחת אחת כדאי לרשום אותה.');
  if (p.rate < MIN_WAGE_HOURLY) w('warn', `התעריף נמוך משכר המינימום (₪${MIN_WAGE_HOURLY} לשעה).`, true);
  return `<div class="explain"><div class="ehead"><b class="num">${money2(p.pay)}</b><span class="num">${hm(p.hours)} שעות</span></div>${lines.join('')}${why.join('')}</div>`;
}

/* ================= HOME ================= */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let heroV = 0;
function countUp(el, to, fmt = money) {
  const from = el._v ?? 0; el._v = to;
  if (from === to || reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); cancelAnimationFrame(el._raf);
  const step = t => { const k = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}
function burst(el, n = 26) {
  if (reduced || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const cols = ['#FF5A3C', '#FF9F1C', '#12A150', '#FFD23F', '#4B5BD0', '#1F8F84'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'bit';
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 130;
    s.style.cssText = `left:${cx}px;top:${cy}px;background:${cols[i % cols.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 30}px;--rot:${Math.random() * 540 - 270}deg;animation-delay:${Math.random() * 90}ms`;
    if (i % 3 === 0) s.style.borderRadius = '50%';
    document.body.appendChild(s); setTimeout(() => s.remove(), 1200);
  }
}

function punchSVG() {
  const R = ridges();
  const paths = cls => R.map(d => `<path class="${cls}" d="${d}" pathLength="1"/>`).join('');
  const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style="stop-color:var(${a})"/><stop offset="1" style="stop-color:var(${b})"/></linearGradient>`;
  return `<svg viewBox="0 0 200 200">
    <defs>${grad('gReg', '--g-money-a', '--g-money-b')}${grad('gOt1', '--g-ot-a', '--g-ot-b')}${grad('gOt2', '--g-hot-a', '--g-hot-b')}</defs>
    <circle class="punch-face" cx="100" cy="100" r="90"/>
    <g transform="translate(30 36) scale(1.4)" fill="none" stroke-linecap="round" stroke-width="2.6">
      <g>${paths('ridge')}</g><g id="rUnder">${paths('runder')}</g><g id="rFill">${paths('rfill')}</g>
      <line class="hand" id="hM" x1="50" y1="52" x2="50" y2="31" stroke-width="3.6"/>
      <line class="hand" id="hH" x1="50" y1="52" x2="50" y2="40" stroke-width="4.2"/>
      <circle class="hub" cx="50" cy="52" r="3.4" stroke="none"/>
    </g></svg>`;
}
let ridgeLens = null;
function setFill(p) {
  const els = $$('#rFill .rfill'); if (!els.length) return;
  if (!ridgeLens || ridgeLens.length !== els.length) ridgeLens = els.map(e => e.getTotalLength());
  let target = Math.max(0, Math.min(1, p)) * ridgeLens.reduce((a, b) => a + b, 0);
  els.forEach((e, i) => {
    const f = Math.max(0, Math.min(1, target / ridgeLens[i])); target -= ridgeLens[i];
    e.style.strokeDasharray = `${f} 1`; e.style.opacity = f > 0.001 ? 1 : 0;
  });
}
function renderHome() {
  const el = $('#v-home');
  const multi = S.jobs.length > 1;
  el.innerHTML = `
    <div class="punch" id="punch" data-phase="idle">
      <button class="punch-btn" id="punchBtn" aria-label="לחיצה להתחלת משמרת">${punchSVG()}</button>
      <div class="punch-time num" id="pTime" aria-hidden="true">00:00:00</div>
      <div class="earn-cap" id="pEarnCap">ברוטו עד עכשיו</div>
      <div class="earn num" id="pEarn"></div>
      <div class="punch-label" id="pLabel"></div>
      <button class="punch-edit" id="pEdit" hidden>${I.clockEdit}שינוי שעת הכניסה</button>
      <div id="pTier"></div>
      ${multi ? `<div class="jobchips" id="jobChips">${S.jobs.map(j => `<button class="chip${j.id === (S.active?.jobId || S.settings.lastJob) ? ' on' : ''}" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="tiles" id="tiles"></div>
    <div class="card rest-card" id="restCard" style="margin-top:12px"></div>
    <div class="sec"><span>${secIc('list', 'blue')}משמרות אחרונות</span><button id="seeAll">לכל המשמרות</button></div>
    <div class="card" id="recent"></div>`;
  ridgeLens = null;
  $('#punchBtn').onclick = onPunch;
  $('#pEdit').onclick = openStartTime;
  if (multi) $$('#jobChips .chip').forEach(c => c.onclick = () => {
    if (S.active) return toast('אי אפשר להחליף עבודה באמצע משמרת');
    S.settings.lastJob = c.dataset.j; persist(); renderHome();
  });
  $('#seeAll').onclick = () => go('shifts');
  const recent = index().newest.slice(0, 3);
  $('#recent').innerHTML = recent.length ? recent.map(shiftRow).join('') :
    `<div class="empty" style="padding:28px"><div class="eic">${I.home}</div>עוד אין משמרות.<br>לוחצים על האצבע כשמתחילים לעבוד.</div>`;
  bindRows($('#recent'));
  renderRestCard();
  tickHome(true);
}
function renderRestCard() {
  const el = $('#restCard'); if (!el) return;
  const now = new Date(), w = nextRest(now, place());
  if (!w) { el.classList.add('hidden'); return; }
  const isChag = w.names.some(n => n !== 'שבת'), inNow = w.start <= now;
  el.innerHTML = `<span class="ri${isChag ? ' chag' : ''}">${isChag ? I.chag : I.shabbat}</span>
    <span style="flex:1"><small style="color:var(--ink3);font-size:.75rem;font-weight:600">${inNow ? 'עכשיו' : 'הבא'} · ${esc(S.settings.city)}</small><b>${esc(w.names.join(' · '))}</b></span>
    <span class="times num">כניסה ${DAYS[w.start.getDay()]} ${tm(w.start)}<br>יציאה ${DAYS[w.end.getDay()]} ${tm(w.end)}</span>`;
}
function tickHome(full) {
  if (view !== 'home' || !$('#pTime')) return;
  const now = new Date(), a = S.active, punch = $('#punch');
  const { h, m } = handAngles(now);
  $('#hM')?.setAttribute('transform', `rotate(${m} 50 52)`);
  $('#hH')?.setAttribute('transform', `rotate(${h} 50 52)`);
  punch.classList.toggle('live', !!a);
  const job = a ? jobAt(jobById(a.jobId), a.start) : jobAt(jobById(S.settings.lastJob), new Date());
  if (a) {
    // timer and amount are both computed from the same whole second, so they always agree
    const st = new Date(a.start), sec = Math.floor(Math.max(0, now - st) / 1000), ms = sec * 1000;
    const mNow = Math.floor(ms / 6e4), wb = weekRegBefore(job, a.start);
    const p = shiftPay({ start: a.start, end: new Date(+st + mNow * 6e4), breakMin: 0 }, job, place(), wb);
    // the rate for the minute in progress decides the label and the per-second ticking
    const key = shiftPay({ start: a.start, end: new Date(+st + (mNow + 1) * 6e4), breakMin: 0 }, job, place(), wb).lastKey || 'reg';
    $('#pTime').textContent = `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
    $('#pEarn').textContent = money2(p.base + ((ms % 6e4) / 3.6e6) * p.rate * job.r[key] / 100);
    $('#pLabel').textContent = `${+st > +now ? 'המשמרת מתחילה ב־' : 'במשמרת מ־'}${tm(a.start)}${S.jobs.length > 1 ? ' · ' + job.name : ''}`;
    $('#pEdit').hidden = false;
    // fingerprint fills over the regular day, then refills in overtime colours
    const hrs = ms / 3.6e6, T = p.threshold;
    let phase = 'reg', frac;
    if (!p.otOn || hrs < T) frac = hrs / T;
    else if (hrs < T + job.ot1Hours) { phase = 'ot1'; frac = (hrs - T) / (job.ot1Hours || 1); }
    else { phase = 'ot2'; frac = (hrs - T - job.ot1Hours) / 2; }
    punch.dataset.phase = phase; setFill(frac);
    const sayH = Math.floor(hrs), sayM = Math.floor((hrs - sayH) * 60);
    const aria = `משמרת פעילה, ${sayH} שעות ו־${sayM} דקות, ${money(p.base)} ברוטו, ${key === 'reg' ? 'שעות רגילות' : tierLabel(key, job)}. לחיצה לפתיחת סיום משמרת`;
    const btn = $('#punchBtn'); if (btn.getAttribute('aria-label') !== aria) btn.setAttribute('aria-label', aria);
    if (tickHome.key && tickHome.key !== key && key !== 'reg') { announce(`עכשיו ${tierLabel(key, job)}`); buzz([30, 60, 30]); }
    tickHome.key = key;
    const isRest = /^(rest|chag|elect)/.test(key), isOt = /ot/i.test(key);
    if (hrs >= 14) { $('#pTier').innerHTML = `<span class="tier warn" id="forgot">${I.warn}משמרת פתוחה ${hm(hrs)} שעות · שכחת להחתים יציאה?</span>`; $('#forgot').onclick = onPunch; return; }
    const txt = key === 'reg' ? (p.otOn ? `שעות רגילות · עוד ${hm(Math.max(0, T - hrs))} עד שעות נוספות` : `שעות רגילות ${job.r.reg}%`) : `עכשיו: ${tierLabel(key, job)}`;
    $('#pTier').innerHTML = `<span class="tier${isRest ? ' rest' : isOt ? ' ot' : ''}">${isRest ? (key.startsWith('chag') || key.startsWith('elect') ? I.chag : I.shabbat) : isOt ? I.ot : I.check}${txt}</span>${notifLine()}`;
  } else {
    $('#pTime').textContent = tm(now);
    $('#pEarn').textContent = '';
    $('#pLabel').textContent = 'שמים אצבע כדי להתחיל משמרת';
    $('#pEdit').hidden = true;
    punch.dataset.phase = 'idle'; setFill(0); tickHome.key = null;
    $('#punchBtn').setAttribute('aria-label', `לא במשמרת. לחיצה להתחלת משמרת · ${job.name}`);
    $('#pTier').innerHTML = S.jobs.length > 1 ? '' : `<span class="tier plain">${I.briefcase}${nm(job.name)} · ₪${job.rate} לשעה</span>`;
  }
  if (full || now.getSeconds() % 15 === 0) renderTiles(livePay());
}
function renderTiles(L) {
  const el = $('#tiles'); if (!el) return;
  const now = new Date(), ws = +weekStart(now), H = [0, 0, 0, 0, 0, 0, 0];
  let tH = 0, tP = 0;
  for (const s of inWeek(ws)) {
    const p = PAY.get(s.id); if (!p) continue;
    if (sameDay(s.start, now)) { tH += p.hours; tP += p.pay; }
    H[new Date(s.start).getDay()] += p.hours;
  }
  if (L) { tH += L.p.hours; tP += L.p.base; if (+weekStart(S.active.start) === ws) H[new Date(S.active.start).getDay()] += L.p.hours; }
  const wH = H.reduce((x, y) => x + y, 0), lim = jobById(S.settings.lastJob).weeklyLimit || 42, mx = Math.max(10, ...H);
  const M = withLive(monthCalc(now.getFullYear(), now.getMonth()));
  el.innerHTML = `${planCell()}
    <div class="today"><small>היום · ברוטו</small><b class="num">${money(tP)}</b><span class="num">${hm(tH)} ש׳</span></div>
    <button class="monthcell" id="mcell"><small>${MONTHS[now.getMonth()]} · ברוטו</small><b class="num">${money(M.gross)}</b><span class="num">${M.shifts.length} משמרות</span></button>
    <div class="wkb"><div class="wkb-h"><b>השבוע</b><span class="num"><b>${hm(wH)}</b> מתוך ${lim} ש׳</span></div>
      <div class="wkb-days">${H.map((h, i) => `<div class="wkb-d${i === now.getDay() ? ' on' : ''}"><i style="height:${h / mx * 100}%"></i><em>${DAY_SHORT[i]}</em></div>`).join('')}</div>
      <div class="wkb-sub num">${wH > lim ? `${hm(wH - lim)} מעל המכסה השבועית` : `נשארו ${hm(lim - wH)} עד המכסה השבועית`}</div></div>
    ${goalCell(M)}`;
  $('#mcell', el).onclick = () => { viewY = now.getFullYear(); viewM = now.getMonth(); S.ui.sumView = 'month'; go('sum'); };
  $('#goal', el).onclick = openGoal;
  $$('[data-plan]', el).forEach(b => b.onclick = e => { e.stopPropagation(); planAction(b.dataset.plan, b.dataset.do); });
}

/* ================= planned shifts: the schedule ahead, a reminder before each ================= */
const PLAN_EARLY = 2 * 36e5;   // "start" shows up to two hours before a planned shift
const planPay = x => { const j = jobAt(jobById(x.jobId), x.start); return shiftPay({ ...x, rest: 'auto' }, j, place(), weekRegBefore(j, x.start)).pay; };
function planNow(jobId, t = Date.now()) {
  return S.plans.find(x => (!jobId || x.jobId === jobId) && +new Date(x.start) - PLAN_EARLY <= t && t <= +new Date(x.end));
}
const dayWord = d => { const t = new Date(); t.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0); const n = Math.round((x - t) / 864e5);
  return n === 0 ? 'היום' : n === 1 ? 'מחר' : n === -1 ? 'אתמול' : `${DAYS[x.getDay()]} ${dShort(x)}`; };
function planCell() {
  if (S.active || !S.plans.length) return '';
  const now = Date.now(), sorted = [...S.plans].sort((a, b) => new Date(a.start) - new Date(b.start));
  const missed = sorted.find(x => +new Date(x.end) < now);
  const x = missed || sorted.find(x => +new Date(x.end) >= now); if (!x) return '';
  const j = jobById(x.jobId), when = `${dayWord(x.start)} <span class="num" dir="ltr">${tm(x.start)}–${tm(x.end)}</span>${S.jobs.length > 1 ? ' · ' + nm(j.name) : ''}`;
  if (missed) return `<div class="plancell missed"><span class="kic k-plan">${I.cal}</span><span class="grow"><small>עבדת במשמרת המתוכננת?</small><b>${when}</b></span>
    <button class="btn primary mini" data-plan="${x.id}" data-do="worked">כן</button><button class="btn soft mini" data-plan="${x.id}" data-do="drop">לא</button></div>`;
  const near = +new Date(x.start) - PLAN_EARLY <= now;
  return `<div class="plancell" data-plan="${x.id}" data-do="open"><span class="kic k-plan">${I.cal}</span><span class="grow"><small>המשמרת הבאה</small><b>${when}</b></span>
    ${near ? `<button class="btn primary mini" data-plan="${x.id}" data-do="start">התחלה</button>` : `<span class="num plan-pay" dir="ltr">~${money(planPay(x))}</span>`}</div>`;
}
function planAction(id, act) {
  const x = S.plans.find(p => p.id === id); if (!x) return;
  const drop = () => { S.plans = S.plans.filter(p => p.id !== id); };
  if (act === 'start') {
    if (S.active) return;
    drop(); S.settings.lastJob = x.jobId; S.active = { jobId: x.jobId, start: new Date().toISOString() };
    commit(); buzz(35); planNotifications(true); toast(`נכנסת למשמרת ב־${tm(S.active.start)}`, 'ok'); return;
  }
  if (act === 'worked') {
    drop(); S.shifts.push({ id: uid(), jobId: x.jobId, start: x.start, end: x.end, breakMin: x.breakMin || 0, bonus: 0, note: '', rest: 'auto', ...(x.specialPct ? { specialPct: x.specialPct } : {}) });
    commit(); buzz(25); toast('המשמרת נוספה', 'ok', { label: 'עריכה', fn: () => { const sh = S.shifts[S.shifts.length - 1]; openShiftSheet(sh, 'edit'); } }); return;
  }
  if (act === 'drop') { const was = { ...x }; drop(); commit(); toast('הוסרה', '', { label: 'ביטול', fn: () => { S.plans.push(was); commit(); } }); return; }
  // open: what you can do with a planned shift
  const past = +new Date(x.start) <= Date.now(), near = +new Date(x.start) - PLAN_EARLY <= Date.now();
  openSheet(`<h2>משמרת מתוכננת</h2><p class="shsub"><span>${dayWord(x.start)}</span> <span class="num" dir="ltr">${tm(x.start)}–${tm(x.end)}</span> · ${nm(jobById(x.jobId).name)} · <span>בערך ${money(planPay(x))}</span></p>
    <p class="hint">${notifOn() ? 'תגיע תזכורת שעה לפני.' : 'ההתראות כבויות, אז לא תגיע תזכורת.'} כשנכנסים למשמרת סביב השעה הזו, היא נרשמת כרגיל.</p>
    <div class="btnrow">${near && !S.active ? `<button class="btn primary" id="pl-start">התחלת המשמרת</button>` : ''}${past ? `<button class="btn soft" id="pl-worked">עבדתי בה, להוסיף</button>` : ''}<button class="btn danger" id="pl-del">${I.trash}הסרה</button></div>`, root => {
    $('#pl-start', root) && ($('#pl-start', root).onclick = () => { closeSheet(); planAction(id, 'start'); });
    $('#pl-worked', root) && ($('#pl-worked', root).onclick = () => { closeSheet(); planAction(id, 'worked'); });
    $('#pl-del', root).onclick = () => { closeSheet(); planAction(id, 'drop'); };
  });
}
function planReminders() {
  const lead = 60 * 6e4, out = [];
  for (const x of S.plans) {
    const at = +new Date(x.start) - lead; if (at < Date.now() + 5000) continue;
    const j = jobById(x.jobId);
    out.push({ at: new Date(at), title: 'משמרת בעוד שעה', body: `${tm(x.start)}–${tm(x.end)}${S.jobs.length > 1 ? ' · ' + j.name : ''}` });
  }
  return out;
}

/* ================= the month's goal ================= */
/** What an ordinary shift pays: the average of the last 8 weeks, leaving out Shabbat, holiday and
    election-day shifts (they pay more and would make the count too hopeful). Hours, travel and bonus. */
function typicalShift(now = new Date()) {
  const from = +now - 56 * 864e5, list = [];
  for (const s of S.shifts) {
    const t = +new Date(s.start); if (t < from || t > +now) continue;
    const p = PAY.get(s.id); if (!p || p.restHours > 0.01) continue;
    list.push(p.pay);
  }
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}
/** Shabbat, holiday and election days still ahead this month (from tomorrow, or today if nothing worked yet). */
function restDaysLeft(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), last = new Date(y, m + 1, 0).getDate();
  const workedToday = S.shifts.some(s => sameDay(s.start, now)) || S.active;
  const first = now.getDate() + (workedToday ? 1 : 0), out = [];
  const hol = new Map(holidaysOfGregorianYear(y).filter(h => h.date.getMonth() === m).map(h => [h.date.getDate(), h.name]));
  for (const e of rules().elections || []) { const [ey, em, ed] = e.date.split('-').map(Number); if (ey === y && em - 1 === m) hol.set(ed, 'יום הבחירות'); }
  for (let d = first; d <= last; d++) {
    const dt = new Date(y, m, d);
    if (hol.has(d)) out.push({ date: dt, name: hol.get(d) }); else if (dt.getDay() === 6) out.push({ date: dt, name: 'שבת' });
  }
  return { list: out, daysLeft: last - first + 1 };
}
/** What a Shabbat or holiday shift pays: the average of such shifts in the last 90 days, or else
    an ordinary shift at the job's Shabbat rate. Null when the job doesn't pay extra on Shabbat. */
function typicalRestShift(avg, now = new Date()) {
  const job = jobById(S.settings.lastJob);
  if (job.shabbatOn === false && job.chag === false) return null;
  const from = +now - 90 * 864e5, list = [];
  for (const s of S.shifts) {
    const t = +new Date(s.start); if (t < from || t > +now) continue;
    const p = PAY.get(s.id); if (p && p.restHours > 0.01) list.push(p.pay);
  }
  if (list.length) return { pay: list.reduce((a, b) => a + b, 0) / list.length, guessed: false };
  return avg ? { pay: avg * (job.r.rest || 150) / 100, guessed: true } : null;
}
function goalState(M) {
  const g = S.settings.goal; if (!g || !(+g.amount > 0)) return null;
  const st = S.settings, opts = { points: +st.sex + +st.extraPts, pension: st.pension, pEmp: +st.pEmp, pEr: +st.pEr, sev: +st.sev, hish: st.hish }, T = taxFor(M.y);
  const isNet = g.kind !== 'gross', value = gross => isNet ? grossToNet(gross, opts, T).net : gross;
  const have = isNet ? M.net.net : M.gross, goal = +g.amount, left = Math.max(0, goal - have);
  const avg = typicalShift(), now = new Date(), R = restDaysLeft(now), rest = typicalRestShift(avg, now);
  // fewest ordinary shifts that reach the goal on top of k Shabbat/holiday shifts
  const ordinaryWith = k => {
    if (!avg) return null;
    for (let r = 0; r <= 500; r++) if (value(M.gross + r * avg + k * (rest?.pay || 0)) >= goal) return r;
    return null;
  };
  let shifts = null; const options = [];
  if (left > 0 && avg > 0) {
    shifts = ordinaryWith(0);
    if (rest && rest.pay > avg * 1.02) for (let k = 1; k <= R.list.length; k++) {
      const r = ordinaryWith(k); if (r == null) break;
      options.push({ k, ordinary: r, total: r + k });
      if (r === 0) break;   // the goal is reached with Shabbat shifts alone; more add nothing
    }
  }
  const best = options.reduce((b, o) => !b || o.total < b.total ? o : b, null);
  return { goal, have, left, avg, shifts, kind: isNet ? 'net' : 'gross', pct: Math.min(1, have / goal),
    rest, restLeft: R.list, daysLeft: R.daysLeft, options, best: best && shifts != null && best.total < shifts ? best : null,
    perDay: left > 0 && R.daysLeft > 0 ? left / R.daysLeft : 0, tight: shifts != null && (best ? best.total : shifts) > R.daysLeft };
}
const nShifts = n => `${n} ${n === 1 ? 'משמרת' : 'משמרות'}`;
const restWord = list => list.every(d => d.name === 'שבת') ? (list.length === 1 ? 'שבת' : 'שבתות') : 'שבת וחג';
function goalCell(M) {
  const G = goalState(M);
  if (!G) return `<button class="goal empty-goal" id="goal">${I.plus}<span>הצבת יעד לחודש</span></button>`;
  const done = G.left <= 0;
  let tip = '';
  if (!done && G.tight) tip = `נשארו בחודש ${G.daysLeft} ימים, פחות מהמשמרות שצריך. אפשר לשקול יעד נמוך יותר או משמרות ארוכות.`;
  else if (!done && G.best) tip = `או ${nShifts(G.best.total)} אם ${G.best.k === 1 ? 'אחת מהן' : G.best.k + ' מהן'} ב${restWord(G.restLeft)} (נשארו ${G.restLeft.length} החודש)`;
  return `<button class="goal${done ? ' done' : ''}" id="goal">
    <div class="goal-h"><b>יעד ${G.kind === 'net' ? 'נטו' : 'ברוטו'}</b><span class="num"><b>${money(G.have)}</b> מתוך ${money(G.goal)}</span></div>
    <div class="goal-bar"><i style="width:${(G.pct * 100).toFixed(1)}%"></i></div>
    <div class="goal-sub num">${done ? 'הגעת ליעד של החודש' : `נשארו ${money(G.left)}${G.shifts ? ` · עוד כ־${nShifts(G.shifts)}` : ''}`}</div>
    ${tip ? `<div class="goal-tip${G.tight ? ' warn' : ''}">${G.tight ? I.warn : I.shabbat}<span>${tip}</span></div>` : ''}
  </button>`;
}
/** The plan behind the goal: every way to get there with the Shabbat and holiday days left. */
function goalPlan(G) {
  if (!G || G.left <= 0 || !G.avg) return '';
  const L = (l, v, sub = '') => `<div class="ln"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
  const rows = [L('רק משמרות רגילות', nShifts(G.shifts ?? 0), `כ־${money(G.avg)} ברוטו כל אחת`)];
  for (const o of G.options) rows.push(L(o.k === 1 ? 'אחת מהן בשבת או חג' : `${o.k} מהן בשבת או חג`, nShifts(o.total), o.ordinary ? `${o.ordinary} רגילות + ${o.k} בתוספת` : 'רק בתוספת'));
  const days = G.restLeft.map(d => `${d.name === 'שבת' ? 'שבת' : d.name} ${dShort(d.date)}`).join(' · ');
  return `<div class="card" style="margin-top:14px">${rows.join('')}</div>
    <p class="hint"><span>${G.restLeft.length ? `נשארו החודש: ${days}.` : 'לא נשארו שבתות או חגים החודש.'}</span> <span>${G.rest ? (G.rest.guessed ? `משמרת בשבת לפי ${jobById(S.settings.lastJob).r.rest}% מהתעריף: כ־${money(G.rest.pay)}.` : `משמרת שבת או חג שלך שווה בערך ${money(G.rest.pay)}.`) : ''}</span> <span>${G.daysLeft > 0 ? `כדי להגיע ליעד: כ־${money(G.perDay)} ליום עד סוף החודש.` : ''}</span></p>`;
}
function openGoal() {
  const g = S.settings.goal || { amount: '', kind: 'net' };
  let kind = g.kind || 'net';
  const avg = typicalShift();
  openSheet(`<h2>יעד לחודש</h2><p class="shsub">כמה רוצים להרוויח החודש. הפס בבית מראה כמה נשאר וכמה משמרות עוד צריך.</p>
    <div class="seg" id="g-kind" style="margin-top:14px"><button type="button" data-k="net">נטו</button><button type="button" data-k="gross">ברוטו</button></div>
    <label class="field"><span>היעד (₪)</span><input class="input num" type="number" inputmode="numeric" id="g-amt" value="${+g.amount || ''}" placeholder="5000"></label>
    <p class="hint">${avg ? `משמרת רגילה שלך שווה בערך ${money(avg)} ברוטו (ממוצע 8 השבועות האחרונים, בלי שבתות וחגים).` : 'אחרי כמה משמרות נדע להגיד כמה משמרות עוד צריך.'}</p>
    ${goalPlan(goalState(withLive(monthCalc(new Date().getFullYear(), new Date().getMonth()))))}
    <div class="btnrow"><button class="btn primary" id="g-save">${I.check}שמירה</button>${+g.amount ? `<button class="btn soft" id="g-del">הסרת היעד</button>` : ''}</div>`, root => {
    const ui = () => $$('#g-kind button', root).forEach(b => b.classList.toggle('on', b.dataset.k === kind));
    $$('#g-kind button', root).forEach(b => b.onclick = () => { kind = b.dataset.k; ui(); }); ui();
    $('#g-save', root).onclick = () => {
      const amount = Math.round(+$('#g-amt', root).value || 0);
      if (!(amount > 0)) return toast('צריך לכתוב סכום', 'err');
      S.settings.goal = { amount, kind }; closeSheet(); commit(); toast('היעד נשמר', 'ok');
    };
    $('#g-del', root) && ($('#g-del', root).onclick = () => { S.settings.goal = null; closeSheet(); commit(); });
  });
}
function onPunch() {
  const btn = $('#punchBtn');
  if (!S.active) {
    const jobId = S.settings.lastJob && S.jobs.some(j => j.id === S.settings.lastJob) ? S.settings.lastJob : S.jobs[0].id;
    S.active = { jobId, start: new Date().toISOString() };
    const plan = planNow(jobId);   // clocking in for a planned shift: it's happening, so it's no longer a plan
    if (plan) S.plans = S.plans.filter(x => x !== plan);
    if (!persist()) { S.active = null; if (plan) S.plans.push(plan); return; }
    buzz(35); askPersist(); planNotifications(true);
    announce(`משמרת התחילה ב־${tm(S.active.start)}`);
    toast(`נכנסת למשמרת ב־${tm(S.active.start)} · אפשר לשנות את השעה`, 'ok', { label: 'ביטול', fn: () => { S.active = null; persist(); renderHome(); toast('הכניסה בוטלה'); announce('הכניסה בוטלה'); } });
    renderHome();
  } else {
    // clocking out saves the shift straight away; a small popup shows it, with a way to edit or undo
    const a = S.active, job = jobById(a.jobId);
    let end = new Date();
    if (end - new Date(a.start) < 6e4) end = new Date(+new Date(a.start) + 6e4);
    const sh = { id: uid(), jobId: a.jobId, start: a.start, end: end.toISOString(), breakMin: job.breakMin || 0, bonus: 0, note: '', rest: 'auto' };
    S.shifts.push(sh); S.active = null;
    const d = new Date(sh.start); viewY = d.getFullYear(); viewM = d.getMonth();
    commit(); buzz(25); announce('המשמרת נשמרה');
    openShiftDone(sh, a);
  }
}

/* ================= after clock-out: a popup instead of a full form ================= */
const pop = $('#pop');
function closePop() { if (!pop.classList.contains('on')) return; pop.classList.remove('on'); if (!sheet.classList.contains('on')) scrim.classList.remove('on'); pop._close?.(); pop._close = null; }
function openShiftDone(sh, was) {
  const job = jobAt(jobById(sh.jobId), sh.start), p = PAY.get(sh.id);
  $('#toast').classList.remove('on');
  pop.innerHTML = `<div class="pop-ic">${I.check}</div>
    <h2 id="pop-h">המשמרת נשמרה</h2>
    <div class="pop-pay num">${money(p.pay)}</div>
    <p class="pop-sub"><span class="num" dir="ltr">${tm(sh.start)}–${tm(sh.end)}</span> · <span class="num">${hm(p.hours)}</span> ש׳${S.jobs.length > 1 ? ' · ' + nm(job.name) : ''}${+sh.breakMin ? ` · הפסקה ${+sh.breakMin} דק׳` : ''}</p>
    ${job.tipsOn ? `<label class="field pop-tips"><span>טיפים במשמרת (₪)</span><input class="input num" type="number" inputmode="decimal" id="pd-tips" placeholder="0"></label>` : ''}
    <div class="pop-btns">
      <button class="btn primary" id="pd-ok">${I.check}אישור</button>
      <button class="btn soft" id="pd-edit">עריכה</button>
      <button class="btn ghost" id="pd-undo">ביטול, המשמרת ממשיכה</button>
    </div>`;
  const tipsIn = $('#pd-tips', pop);
  const keepTips = () => {   // tips typed here are saved however the popup closes
    const v = tipsIn ? Math.max(0, +tipsIn.value || 0) : 0, cur = S.shifts.find(x => x.id === sh.id);
    if (cur && v !== (+cur.tips || 0)) { cur.tips = v || undefined; commit(); }
  };
  pop._close = keepTips;
  scrim.classList.add('on'); void pop.offsetWidth; pop.classList.add('on');
  $('#pd-ok', pop).onclick = () => { closePop(); toast(`נשמר · ${money(PAY.get(sh.id).pay)} על ${hm(PAY.get(sh.id).hours)} ש׳`, 'ok'); };
  $('#pd-edit', pop).onclick = () => { closePop(); const cur = S.shifts.find(x => x.id === sh.id); if (cur) openShiftSheet(cur, 'edit'); };
  $('#pd-undo', pop).onclick = () => {
    pop._close = null; closePop();
    S.shifts = S.shifts.filter(x => x.id !== sh.id); S.active = was; commit(); buzz(15);
    toast('המשמרת ממשיכה', 'ok'); announce('המשמרת ממשיכה');
  };
}

/* ================= SHIFT SHEET ================= */
const HE_DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
let DAY_SHORT = HE_DAY_SHORT;
function openShiftSheet(sh, mode) {
  const job = jobById(sh.jobId);
  const st0 = new Date(sh.start), en0 = new Date(sh.end), today = new Date(); today.setHours(0, 0, 0, 0);
  const T = { date: new Date(st0.getFullYear(), st0.getMonth(), st0.getDate()), s: [st0.getHours(), st0.getMinutes()], e: [en0.getHours(), en0.getMinutes()], active: mode === 'end' ? 'e' : 's' };
  const mstep = [T.s[1], T.e[1]].every(x => x % 5 === 0) ? 5 : 1;
  const wheel = (id, n, st) => `<div class="wheel" id="w-${id}" data-step="${st}">${Array.from({ length: n / st }, (_, i) => `<div class="wi num" data-v="${i * st}">${pad(i * st)}</div>`).join('')}</div>`;
  const title = mode === 'end' ? 'סיום משמרת' : mode === 'new' ? 'משמרת חדשה' : 'עריכת משמרת';
  const sub = mode === 'end' ? `${nm(job.name)} · אם שכחת להחתים בזמן, אפשר לתקן את השעות.` : '';
  const d0 = new Date(Math.min(+today - 45 * 864e5, +T.date - 3 * 864e5)), d1 = new Date(Math.max(+today + 7 * 864e5, +T.date + 3 * 864e5));
  let days = '';
  // oldest first: in Hebrew the days run right to left, like reading
  d0.setHours(0, 0, 0, 0); d1.setHours(0, 0, 0, 0);   // whole days, also across a clock change
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    const diff = Math.round((today - d) / 864e5);
    days += `<button type="button" class="day${d.getDay() === 6 ? ' sat' : ''}" data-d="${+d}"><small>${diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : diff === -1 ? 'מחר' : DAY_SHORT[d.getDay()]}</small><b class="num">${d.getDate()}</b><em class="num">${MONTHS[d.getMonth()].slice(0, 3)}${EN ? '' : '׳'}</em></button>`;
  }
  openSheet(`
    <h2 id="f-title">${title}</h2>${sub ? `<p class="shsub">${sub}</p>` : ''}
    ${mode !== 'end' ? `<div class="seg kinds" id="f-kind">${[['shift', 'משמרת', 'ot'], ['special', 'מיוחדת', 'pct'], ...(mode === 'new' ? [['vac', 'חופשה', 'vac'], ['sick', 'מחלה', 'sick']] : [])].map(([k, l, i]) => `<button type="button" data-k="${k}" class="c-${k}"><span class="ki">${I[i]}</span>${l}</button>`).join('')}</div>` : ''}
    <div id="f-special" class="hidden">
      <h3>תעריף לכל השעות</h3>
      <div class="qchips" id="f-pq">${[125, 150, 175, 200, 250].map(v => `<button type="button" class="num" data-p="${v}">${v}%</button>`).join('')}
        <input class="input num mini" type="number" inputmode="numeric" id="f-pct" value="${+sh.specialPct || 200}" aria-label="אחוז"></div>
      <p class="hint">כל שעה במשמרת הזו משולמת באחוז הזה מהתעריף, בלי שעות נוספות ובלי תוספת שבת. למשל משמרת של 3 שעות שכולה ב־200%.</p>
    </div>
    ${S.jobs.length > 1 ? `<div class="chips" id="f-jobs">${S.jobs.map(j => `<button type="button" class="chip" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}</div>` : ''}
    <h3>יום</h3>
    <div class="daystrip" id="f-days">${days}</div>
    <div id="f-leave" class="hidden">
      <label class="field"><span>כמה ימים</span><input class="input num" type="number" min="1" max="60" inputmode="numeric" id="f-ndays" value="1"></label>
      <p class="hint" id="f-lhint"></p>
    </div>
    <div id="f-shiftonly">
    <h3>שעות</h3>
    <div class="tp">
      <div class="tp-col"><div class="tp-cap">כניסה</div><div class="wheels" dir="ltr">${wheel('sh', 24, 1)}<span class="colon">:</span>${wheel('sm', 60, mstep)}</div></div>
      <div class="tp-arrow">${I.chevL}</div>
      <div class="tp-col"><div class="tp-cap">יציאה <em id="tNext"></em></div><div class="wheels" dir="ltr">${wheel('eh', 24, 1)}<span class="colon">:</span>${wheel('em', 60, mstep)}</div></div>
    </div>
    <div class="tp-sum">סה״כ <b class="num" id="tDur"></b> שעות · גוללים כדי לשנות</div>
    <h3>הפסקה לא בתשלום</h3>
    <div class="qchips" id="f-bq">${[0, 15, 30, 45, 60].map(b => `<button type="button" data-b="${b}">${b ? b + ' דק׳' : 'בלי'}</button>`).join('')}
      <input class="input num mini" type="number" inputmode="numeric" id="f-break" value="${+sh.breakMin || 0}" aria-label="דקות הפסקה"></div>
    <div class="grid2">
      <label class="field" id="f-tips-w"><span>טיפים (₪)</span><input class="input num" type="number" inputmode="decimal" id="f-tips" value="${+sh.tips || ''}" placeholder="0"></label>
      <label class="field"><span>בונוס (₪)</span><input class="input num" type="number" inputmode="decimal" id="f-bonus" value="${+sh.bonus || ''}" placeholder="0"></label>
      <label class="field"><span>נסיעות (₪)</span><input class="input num" type="number" step="0.5" inputmode="decimal" id="f-travel" value="${sh.travel ?? ''}" placeholder="${jobAt(job, sh.start).travel || 0}"><small class="fhint">ריק: לפי הגדרות העבודה</small></label>
    </div>
    <label class="field"><span>הערה</span><input class="input" type="text" id="f-note" value="${esc(sh.note)}" placeholder="אופציונלי"></label>
    <details class="adv"><summary>${I.chevDown}שבת / חג ידני</summary>
      <div class="seg" id="f-rest" style="margin-top:10px">
        <button type="button" data-r="auto">אוטומטי</button><button type="button" data-r="yes">הכל בתוספת שבת</button><button type="button" data-r="no">בלי תוספת</button></div>
      <p class="hint">"אוטומטי" מחשב לפי זמני כניסת ויציאת שבת וחג בעיר שבחרת.</p></details>
    <div id="f-explain"></div>
    </div>
    <div class="btnrow">
      <button class="btn ${mode === 'end' ? 'accent' : 'primary'}" id="f-save">${I.check}${mode === 'end' ? 'סיום ושמירה' : 'שמירה'}</button>
      ${mode === 'end' ? `<button class="btn soft" id="f-cont">חזרה, המשמרת ממשיכה</button><button class="btn danger" id="f-discard">${I.trash}מחיקת המשמרת</button><p class="hint" style="text-align:center">מחיקה: המשמרת לא נשמרת, כאילו לא נכנסת. אפשר לבטל מיד אחרי.</p>` : ''}
      ${mode === 'edit' ? `<button class="btn danger" id="f-del">${I.trash}מחיקה</button>` : ''}
    </div>`, root => {
    let rest = sh.rest || 'auto', jobId = sh.jobId, kind = +sh.specialPct > 0 ? 'special' : 'shift';
    const IH = 44, W = { sh: [T.s, 0], sm: [T.s, 1], eh: [T.e, 0], em: [T.e, 1] };
    const setWheel = (id, smooth) => { const w = $('#w-' + id, root), [arr, i] = W[id]; w.scrollTo({ top: Math.round(arr[i] / +w.dataset.step) * IH, behavior: smooth ? 'smooth' : 'auto' }); };
    const read = () => {
      const st = new Date(T.date); st.setHours(T.s[0], T.s[1], 0, 0);
      const en = new Date(T.date); en.setHours(T.e[0], T.e[1], 0, 0);
      if (en < st) en.setDate(en.getDate() + 1);
      return { ...sh, jobId, start: st.toISOString(), end: en.toISOString(),
        breakMin: Math.max(0, +$('#f-break', root).value || 0), bonus: +$('#f-bonus', root).value || 0,
        tips: jobById(jobId).tipsOn || +$('#f-tips', root).value ? Math.max(0, +$('#f-tips', root).value || 0) || undefined : undefined, note: $('#f-note', root).value.trim(), rest,
        travel: $('#f-travel', root).value === '' ? undefined : Math.max(0, +$('#f-travel', root).value || 0),
        forceRest: kind === 'special' ? undefined : rest === 'yes' ? true : rest === 'no' ? false : undefined,
        specialPct: kind === 'special' ? Math.max(1, Math.min(1000, +$('#f-pct', root).value || 200)) : undefined };
    };
    const upd = () => {
      const s = read();
      $$('.wheels', root).forEach(w => w.classList.remove('bad'));
      $('#tNext', root).textContent = sameDay(s.start, s.end) ? '' : '· למחרת';
      $('#tDur', root).textContent = hm((new Date(s.end) - new Date(s.start)) / 3.6e6);
      for (const id in W) $$('.wi', $('#w-' + id, root)).forEach(it => it.classList.toggle('on', +it.dataset.v === W[id][0][W[id][1]]));
      $$('.day', root).forEach(b => b.classList.toggle('on', +b.dataset.d === +T.date));
      $$('#f-rest button', root).forEach(b => b.classList.toggle('on', b.dataset.r === rest));
      $$('#f-jobs .chip', root).forEach(b => b.classList.toggle('on', b.dataset.j === jobId));
      $('#f-tips-w', root).classList.toggle('hidden', !jobById(jobId).tipsOn && !+$('#f-tips', root).value);
      $$('#f-bq button', root).forEach(b => b.classList.toggle('on', +b.dataset.b === s.breakMin));
      $$('#f-kind button', root).forEach(b => b.classList.toggle('on', b.dataset.k === kind));
      $('#f-special', root).classList.toggle('hidden', kind !== 'special');
      $$('#f-pq button', root).forEach(b => b.classList.toggle('on', +b.dataset.p === s.specialPct));
      $('details.adv', root)?.classList.toggle('hidden', kind === 'special');
      const leave = kind === 'vac' || kind === 'sick';
      $('#f-shiftonly', root).classList.toggle('hidden', leave);
      $('#f-leave', root).classList.toggle('hidden', !leave);
      if (mode === 'new') $('#f-title', root).textContent = kind === 'vac' ? 'יום חופשה' : kind === 'sick' ? 'יום מחלה' : title;
      if (leave) { $('#f-lhint', root).textContent = leaveHint(kind); return; }
      const j = jobAt(jobById(jobId), s.start), p = shiftPay(s, j, place(), weekRegBefore(j, s.start));
      $('#f-explain', root).innerHTML = explain(s, j, p);
    };
    for (const id in W) {
      const w = $('#w-' + id, root); let t;
      w.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => {
        const [arr, i] = W[id], st = +w.dataset.step, idx = Math.max(0, Math.min(w.children.length - 1, Math.round(w.scrollTop / IH)));
        if (arr[i] !== idx * st) { arr[i] = idx * st; buzz(5); upd(); }
      }, 80); }, { passive: true });
      $$('.wi', w).forEach(it => it.onclick = () => { W[id][0][W[id][1]] = +it.dataset.v; setWheel(id, true); upd(); });
    }
    $$('.day', root).forEach(b => b.onclick = () => { T.date = new Date(+b.dataset.d); upd(); });
    $$('#f-jobs .chip', root).forEach(b => b.onclick = () => { jobId = b.dataset.j; upd(); });
    $$('#f-rest button', root).forEach(b => b.onclick = () => { rest = b.dataset.r; upd(); });
    $$('#f-bq button', root).forEach(b => b.onclick = () => { $('#f-break', root).value = b.dataset.b; upd(); });
    $$('#f-pq button', root).forEach(b => b.onclick = () => { $('#f-pct', root).value = b.dataset.p; upd(); });
    $$('#f-kind button', root).forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      kind = k; upd();
    });
    $$('input', root).forEach(i => i.addEventListener('input', upd));
    upd();
    for (const id in W) setWheel(id, false);
    // bring the chosen day to the middle of the strip (works the same right-to-left and left-to-right)
    const centerDay = () => { const st = $('#f-days', root), on = $('.day.on', root); if (!st || !on) return;
      const a = on.getBoundingClientRect(), b = st.getBoundingClientRect(); st.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2); };
    centerDay(); requestAnimationFrame(() => requestAnimationFrame(centerDay)); setTimeout(centerDay, 350);
    $('#f-save', root).onclick = () => {
      if (kind === 'vac' || kind === 'sick') {   // a vacation or sick day isn't a shift: days off from the day chosen
        const n = addLeave(jobId, kind, dateKey(T.date), +$('#f-ndays', root).value);
        const d = new Date(T.date); viewY = d.getFullYear(); viewM = d.getMonth();
        closeSheet(); commit(); buzz(20); return toast(n === 1 ? 'נשמר יום אחד' : `נשמרו ${n} ימים`, 'ok');
      }
      const s = read(), len = new Date(s.end) - new Date(s.start);
      if (mode === 'new' && +new Date(s.start) > Date.now() + 10 * 6e4 && len > 0) {   // a shift ahead is a plan, not pay yet
        S.plans.push({ id: uid(), jobId: s.jobId, start: s.start, end: s.end, breakMin: s.breakMin, ...(s.specialPct ? { specialPct: s.specialPct } : {}) });
        closeSheet(); commit(); planNotifications(true); buzz(20);
        return toast(`נשמרה משמרת מתוכננת ל${dayWord(s.start)} · תזכורת שעה לפני`, 'ok');
      }
      if (len < 6e4) { $$('.wheels', root).forEach(w => w.classList.add('bad')); return toast('המשמרת קצרה מדי. אפשר לבטל אותה', 'err'); }
      if (len > 24 * 3.6e6) { $$('.wheels', root).forEach(w => w.classList.add('bad')); return toast('משמרת לא יכולה להיות יותר מ־24 שעות', 'err'); }
      if (!s.id) { s.id = uid(); S.shifts.push(s); } else S.shifts[S.shifts.findIndex(x => x.id === s.id)] = s;
      if (mode === 'end') { S.active = null; announce(`המשמרת נשמרה`); }
      S.settings.lastJob = s.jobId;
      const d = new Date(s.start); viewY = d.getFullYear(); viewM = d.getMonth();
      closeSheet(); commit(); buzz(25);
      toast(`נשמר · ${money(PAY.get(s.id).pay)} על ${hm(PAY.get(s.id).hours)} ש׳`, 'ok');
    };
    $('#f-cont', root) && ($('#f-cont', root).onclick = closeSheet);
    $('#f-discard', root) && ($('#f-discard', root).onclick = () => {
      const was = S.active; S.active = null; closeSheet(); commit(); buzz(20); announce('המשמרת נמחקה');
      toast('המשמרת נמחקה', '', { label: 'ביטול', fn: () => { S.active = was; commit(); toast('המשמרת חזרה', 'ok'); } });
    });
    $('#f-del', root) && ($('#f-del', root).onclick = () => {
      const i = S.shifts.findIndex(x => x.id === sh.id), was = S.shifts[i];
      if (i < 0) return closeSheet();
      S.shifts.splice(i, 1); closeSheet(); commit(); buzz(20); announce('המשמרת נמחקה');
      toast('המשמרת נמחקה', '', { label: 'ביטול', fn: () => { S.shifts.push(was); commit(); toast('המשמרת חזרה', 'ok'); } });
    });
  });
}
/** Change when the running shift started: earlier (forgot to clock in) or later (clocked in early). */
function openStartTime() {
  const a = S.active; if (!a) return;
  $('#toast').classList.remove('on');   // the clock-in message would cover the wheels
  const now = new Date(), st0 = new Date(a.start);
  const T = [st0.getHours(), st0.getMinutes()];
  const IH = 44;
  const wheel = (id, n) => `<div class="wheel" id="w-${id}" data-step="1">${Array.from({ length: n }, (_, i) => `<div class="wi num" data-v="${i}">${pad(i)}</div>`).join('')}</div>`;
  const QUICK = [['עכשיו', 0], ['לפני 15 דק׳', -15], ['לפני 30 דק׳', -30], ['לפני שעה', -60], ['בעוד 15 דק׳', 15], ['בעוד 30 דק׳', 30]];
  // the chosen clock time, on whichever day puts it closest to now (yesterday for a night shift, never more than 12h ahead)
  const pick = () => {
    const d = new Date(now); d.setHours(T[0], T[1], 0, 0);
    if (+d - +now > 12 * 3.6e6) d.setDate(d.getDate() - 1);
    else if (+now - +d > 20 * 3.6e6) d.setDate(d.getDate() + 1);
    return d;
  };
  openSheet(`<h2>שעת הכניסה</h2>
    <p class="shsub">התחלת קודם או מאוחר יותר? בוחרים את השעה שבה המשמרת באמת התחילה.</p>
    <div class="qchips" id="st-q">${QUICK.map(([l, m]) => `<button type="button" data-m="${m}">${l}</button>`).join('')}</div>
    <div class="tp tp-one"><div class="tp-col"><div class="tp-cap">כניסה</div><div class="wheels" dir="ltr">${wheel('xh', 24)}<span class="colon">:</span>${wheel('xm', 60)}</div></div></div>
    <div class="tp-sum" id="st-sum"></div>
    <div class="btnrow"><button class="btn primary" id="st-save">${I.check}שמירה</button></div>`, root => {
    const W = { xh: 0, xm: 1 };
    const setW = (id, smooth) => { const w = $('#w-' + id, root); w.scrollTo({ top: T[W[id]] * IH, behavior: smooth ? 'smooth' : 'auto' }); };
    const upd = () => {
      const d = pick(), diff = (+d - +now) / 6e4;
      for (const id in W) $$('.wi', $('#w-' + id, root)).forEach(it => it.classList.toggle('on', +it.dataset.v === T[W[id]]));
      $('#st-sum', root).textContent = Math.abs(diff) < 1 ? 'מעכשיו' : diff > 0 ? `המשמרת תתחיל בעוד ${hm(diff / 60)} שעות` : `${sameDay(d, now) ? 'היום' : 'אתמול'} · במשמרת כבר ${hm(-diff / 60)} שעות`;
    };
    for (const id in W) {
      const w = $('#w-' + id, root); let t;
      w.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => {
        const v = Math.max(0, Math.min(w.children.length - 1, Math.round(w.scrollTop / IH)));
        if (T[W[id]] !== v) { T[W[id]] = v; buzz(5); upd(); }
      }, 80); }, { passive: true });
      $$('.wi', w).forEach(it => it.onclick = () => { T[W[id]] = +it.dataset.v; setW(id, true); upd(); });
    }
    $$('#st-q button', root).forEach(b => b.onclick = () => {
      const d = new Date(Math.round((+now + +b.dataset.m * 6e4) / 6e4) * 6e4); T[0] = d.getHours(); T[1] = d.getMinutes();
      for (const id in W) setW(id, true); upd();
    });
    upd(); for (const id in W) setW(id, false);
    $('#st-save', root).onclick = () => {
      const d = pick();
      if (+d - Date.now() > 12 * 3.6e6) return toast('אפשר לקבוע עד 12 שעות קדימה', 'err');
      S.active.start = d.toISOString(); persist(); closeSheet(); renderHome(); buzz(15);
      toast(`שעת הכניסה: ${tm(d)}`, 'ok'); announce(`שעת הכניסה עודכנה ל־${tm(d)}`);
      dbg.log('info', 'start time changed');
    };
  });
}
function confirmBtn(btn, msg, fn) {
  if (btn.dataset.armed) return fn();
  btn.dataset.armed = '1'; btn.classList.add('armed'); const old = btn.innerHTML; btn.innerHTML = msg; buzz(20);
  setTimeout(() => { btn.dataset.armed = ''; btn.classList.remove('armed'); btn.innerHTML = old; }, 3000);
}

/* ================= SHIFTS ================= */
const FILTERS = [['all', 'הכל'], ['morning', 'בוקר'], ['noon', 'צהריים'], ['evening', 'ערב'], ['night', 'לילה'], ['rest', 'שבת וחג'], ['ot', 'עם נוספות']];
const SORTS = [['old', 'מהישן לחדש'], ['new', 'מהחדש לישן'], ['pay', 'הכי משתלמות'], ['hours', 'הכי ארוכות']];
function renderShifts() {
  const el = $('#v-shifts');
  if (!SORTS.some(x => x[0] === S.ui.sort)) S.ui.sort = 'old';
  if (!FILTERS.some(x => x[0] === S.ui.filter)) S.ui.filter = 'all';
  const M = monthCalc(viewY, viewM), f = S.ui.filter, so = S.ui.sort;
  let list = M.shifts.filter(s => {
    const p = PAY.get(s.id), k = shiftKind(s, p);
    return f === 'all' || (f === 'rest' ? (k === 'shabbat' || k === 'chag') : f === 'ot' ? p.otHours > 0.01 : k === f);
  });
  const by = { new: (a, b) => new Date(b.start) - new Date(a.start), old: (a, b) => new Date(a.start) - new Date(b.start),
    pay: (a, b) => PAY.get(b.id).pay - PAY.get(a.id).pay, hours: (a, b) => PAY.get(b.id).hours - PAY.get(a.id).hours };
  list.sort(by[so]);
  const tot = list.reduce((a, s) => (a.h += PAY.get(s.id).hours, a.p += PAY.get(s.id).pay, a), { h: 0, p: 0 });
  let body = '';
  const abs = f === 'all' && (so === 'new' || so === 'old') ? M.absent : [];
  const mk = `${viewY}-${pad(viewM + 1)}`, plans = f === 'all' && (so === 'new' || so === 'old') ? S.plans.filter(x => dateKey(x.start).startsWith(mk)) : [];
  const planRow = x => { const d = new Date(x.start), j = jobById(x.jobId);
    return `<button class="srow planned" data-planrow="${x.id}"><span class="kic k-plan">${I.cal}</span>
      <span class="mid"><span class="t1">${DAYS[d.getDay()]} ${dShort(d)}</span><span class="t2 num tline"><bdi dir="ltr" class="trange">${tm(x.start)}–${tm(x.end)}</bdi><span class="tmore"><span class="sep">·</span>מתוכננת${S.jobs.length > 1 ? `<span class="sep">·</span>${nm(j.name)}` : ''}</span></span></span>
      <span class="end"><span class="amt num" dir="ltr">~${money(planPay(x))}</span></span></button>`; };
  const absRow = a => { const d = new Date(a.date + 'T12:00:00'), P = M.absPay.get(a.id), j = jobById(a.jobId);
    return `<button class="srow" data-abs="${a.id}"><span class="kic k-${a.kind}">${I[a.kind]}</span>
      <span class="mid"><span class="t1">${DAYS[d.getDay()]} ${dShort(d)}</span><span class="t2">${a.kind === 'sick' ? 'יום מחלה' : 'יום חופשה'}${a.kind === 'sick' && P ? ` · ${Math.round(P.share * 100)}%` : ''}${S.jobs.length > 1 ? ` · ${nm(j.name)}` : ''}</span></span>
      <span class="end"><span class="amt num">${money(P?.pay || 0)}</span></span></button>`; };
  if (!list.length && !abs.length && !plans.length) body = `<div class="card"><div class="empty"><div class="eic">${I.list}</div>${M.shifts.length ? 'אין משמרות שמתאימות לסינון' : 'אין משמרות בחודש הזה'}</div></div>`;
  else if (so === 'new' || so === 'old') {
    const groups = new Map(), items = [...list.map(s => ({ t: +new Date(s.start), s })), ...abs.map(a => ({ t: +new Date(a.date + 'T12:00:00'), a })), ...plans.map(x => ({ t: +new Date(x.start), x }))];
    items.sort((x, y) => so === 'new' ? y.t - x.t : x.t - y.t);
    for (const it of items) { const k = +weekStart(it.t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    for (const [k, arr] of groups) {
      const ws = new Date(k), we = new Date(k + 6 * 864e5);
      let wh = 0; for (const s of inWeek(k)) wh += PAY.get(s.id).hours;
      const lim = jobById((arr[0].s || arr[0].a || arr[0].x).jobId).weeklyLimit;
      body += `<div class="week-h"><span>שבוע ${dShort(ws)}–${dShort(we)}</span><span class="wk num${wh > lim ? ' over' : ''}">${hm(wh)} ש׳ מתוך ${lim}</span></div>
        <div class="card">${arr.map(it => it.s ? shiftRow(it.s) : it.a ? absRow(it.a) : planRow(it.x)).join('')}</div>`;
    }
  } else body = `<div class="card" style="margin-top:12px">${list.map(shiftRow).join('')}</div>`;
  el.innerHTML = `<h1 class="title">משמרות</h1>${monthBar()}
    <div class="chips" id="fchips">${FILTERS.map(([k, n]) => `<button class="chip${f === k ? ' on' : ''}" data-f="${k}">${k !== 'all' && k !== 'ot' && k !== 'rest' ? I[k] : k === 'rest' ? I.shabbat : k === 'ot' ? I.ot : ''}${n}</button>`).join('')}</div>
    <div class="toolrow"><span class="num">${list.length} משמרות · ${hm(tot.h)} ש׳ · ${money(tot.p)}</span>
      <button class="sortbtn" id="sortBtn">${I.sort}${SORTS.find(x => x[0] === so)[1]}</button></div>
    ${body}`;
  bindMonthBar(el); bindRows(el);
  $$('[data-planrow]', el).forEach(b => b.onclick = () => planAction(b.dataset.planrow, 'open'));
  $$('[data-abs]', el).forEach(b => b.onclick = () => {
    const a = S.absences.find(x => x.id === b.dataset.abs); if (!a) return;
    openSheet(`<h2>${a.kind === 'sick' ? 'יום מחלה' : 'יום חופשה'}</h2><p class="shsub">${DAYS[new Date(a.date + 'T12:00:00').getDay()]} ${dFull(a.date + 'T12:00:00')}</p>
      <div class="btnrow"><button class="btn danger" id="ab-del">${I.trash}מחיקה</button><button class="btn soft" id="ab-no">סגירה</button></div>`, root => {
      $('#ab-no', root).onclick = closeSheet;
      $('#ab-del', root).onclick = () => { const was = a; S.absences = S.absences.filter(x => x.id !== a.id); closeSheet(); commit(); toast('נמחק', '', { label: 'ביטול', fn: () => { S.absences.push(was); commit(); } }); };
    });
  });
  $$('#fchips .chip', el).forEach(c => c.onclick = () => { S.ui.filter = c.dataset.f; persist(); renderShifts(); });
  $('#sortBtn', el).onclick = () => openSheet(`<h2>מיון</h2><div class="card" style="margin-top:12px">${SORTS.map(([k, n]) =>
    `<button class="cell" data-s="${k}"><span class="grow">${n}</span>${so === k ? `<span style="width:20px;color:var(--accent)">${I.check}</span>` : ''}</button>`).join('')}</div>`, root =>
    $$('[data-s]', root).forEach(b => b.onclick = () => { S.ui.sort = b.dataset.s; persist(); closeSheet(); renderShifts(); }));
}

/* ================= SUMMARY (תלוש) ================= */
function sumMonth(el) {
  const M = withLive(monthCalc(viewY, viewM)), n = M.net;
  const ded = n.tax + n.ni + n.health + n.pEmp + n.hEmp;
  const parts = [[n.net, 'var(--hero-net)', 'נטו'], [n.tax, 'var(--accent)', 'מס הכנסה'], [n.ni + n.health, 'var(--gold)', 'ביטוח לאומי ובריאות'], [n.pEmp + n.hEmp, 'var(--ink3)', 'חיסכון (פנסיה)']].filter(x => x[0] > 0);
  const L = (l, v, cls = '', sub = '') => `<div class="ln ${cls}"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
  const hol = holidaysOfGregorianYear(viewY).filter(h => h.date.getMonth() === viewM);
  el.innerHTML = `${monthBar()}
    <div class="card hero" style="margin-top:12px"><small>נטו משוער ל${MONTHS[viewM]}<button type="button" class="estimate" data-legal aria-label="הערכה: מה החישוב כן ולא">הערכה ⓘ</button></small><div class="big num">${money(n.net)}</div>
      <div class="meta num"><b>ברוטו ${money(M.gross)}</b>${M.tipsOwn ? ` · טיפים ${money(M.tipsOwn)}` : ''}<br>${M.shifts.length} משמרות${M.live ? ' + המשמרת הנוכחית' : ''} · ${hm(M.hours)} שעות</div>
      ${M.gross ? `<div class="stack">${parts.map(([v, c]) => `<span style="flex:${v};background:${c}"></span>`).join('')}</div>
      <div class="legend">${parts.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>` : ''}</div>
    ${M.gross ? `
    <div class="sec"><span>${secIc('cal', 'blue')}לפי ימים</span></div>
    <div class="card pad">${metricSeg()}<div id="dayChart"></div></div>
    <div class="sec"><span>${secIc('receipt', 'green')}איך זה מחושב</span></div>
    <div class="card steps">
      ${L('עבדת', hm(M.hours) + ' ש׳')}
      ${L('הרווחת ברוטו', money(M.gross), '', 'לפני ניכויים, כולל שעות נוספות, תוספות ונסיעות')}
      ${L('מס הכנסה', n.tax ? '−' + money(n.tax) : '₪0', n.tax ? 'neg' : '', n.tax ? `אחרי ${(+S.settings.sex + +S.settings.extraPts)} נקודות זיכוי (${money(n.pointsCredit)})` : 'נקודות הזיכוי מכסות את כל המס')}
      ${L('ביטוח לאומי ובריאות', '−' + money(n.ni + n.health), 'neg', 'יורד מכל שכר')}
      ${n.pEmp + n.hEmp ? L('חיסכון לפנסיה' + (n.hEmp ? ' והשתלמות' : ''), '−' + money(n.pEmp + n.hEmp), 'neg', 'הכסף נשאר שלך, בקרן') : ''}
      ${L('נכנס לחשבון', money(n.net), 'tot money')}
      ${M.tipsOwn ? L('טיפים שלך', '+' + money(M.tipsOwn), '', 'במזומן או מהלקוחות, לא בתלוש') + L('סה״כ בכיס', money(n.net + M.tipsOwn), 'tot') : ''}
    </div>
    <div class="sec"><span>${secIc('ot', 'orange')}פירוט שעות ותוספות</span></div>
    ${M.perJob.map(J => `<div class="card">
      ${S.jobs.length > 1 ? `<div class="ln"><span class="l" style="color:${J.job.color};font-weight:700">${nm(J.job.name)}</span><span class="v num mutedv">₪${J.job.rate} לשעה</span></div>` : ''}
      ${TIERS.filter(k => J.b[k] > 0.004).map(k => L(tierLabel(k, J.job), money2(J.money[k]), '', `${hm(J.b[k])} ש׳`)).join('')}
      ${J.travel ? L('נסיעות', money2(J.travel), '', J.travelFull ? `עד התקרה החודשית (במקום ${money2(J.travelFull)})` : `${J.travelDays} ימי עבודה`) : ''}
      ${J.bonus ? L('בונוסים', money2(J.bonus)) : ''}
      ${J.tipsOver ? L('טיפים מעל השכר', money2(J.tipsOver), '', `מתוך ${money2(J.tips)} טיפים דרך המעסיק`) : ''}
      ${J.sickDays ? L('דמי מחלה', money2(J.sick), '', `${J.sickDays} ימים · יום ראשון בלי תשלום, שני ושלישי 50%`) : ''}
      ${J.vacDays ? L('דמי חופשה', money2(J.vac), '', `${J.vacDays} ימים`) : ''}
      ${J.havraa ? L('דמי הבראה', money2(J.havraa), '', 'חלק חודשי') : ''}
      ${J.holiday ? L('דמי חגים', money2(J.holiday), '', J.holDays.map(h => h.name).join(', ')) : ''}
      ${L('סה״כ ברוטו', money2(J.total), 'tot')}</div>`).join('')}
    <div class="sec"><span>${secIc('coins', 'green')}מה המעסיק מפריש בנוסף</span></div>
    <div class="card">
      ${n.employer.pension ? L('פנסיה (מעסיק)', money(n.employer.pension)) + L('פיצויים', money(n.employer.severance)) : ''}
      ${n.employer.hish ? L('קרן השתלמות (מעסיק)', money(n.employer.hish)) : ''}
      ${L('ביטוח לאומי (מעסיק)', money(n.employer.bl))}
      ${L('עלות המעסיק בסה״כ', money(n.cost), 'tot')}</div>` : `<div class="card" style="margin-top:12px"><div class="empty"><div class="eic">${I.receipt}</div>אין משמרות בחודש הזה</div></div>`}
    <div class="sec"><span>${secIc('vac', 'teal')}מחלה, חופשה והבראה</span></div>
    <div class="card" id="leave">${leaveCard(M)}</div>
    ${hol.length ? `<div class="sec"><span>${secIc('chag', 'gold')}חגים החודש</span></div><div class="card">${hol.map(h => L(h.name, `${DAYS[h.dow]} ${dShort(h.date)}`, '', h.dow === 6 ? 'חל בשבת' : '')).join('')}</div>` : ''}
    <div class="sec"><span>${secIc('share', 'blue')}ייצוא</span></div>
    <div class="card">
      <button class="cell" id="xReport"><span class="cell-ic t-green">${I.receipt}</span><span class="grow">דוח חודשי (PDF)<div class="sub">שעות ושכר של ${MONTHS[viewM]}, לשליחה למעסיק</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="xMonth"><span class="cell-ic t-blue">${I.file}</span><span class="grow">משמרות ${MONTHS[viewM]} (CSV)<div class="sub">נפתח באקסל ובגוגל שיטס</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="xMore"><span class="cell-ic t-blue">${I.download}</span><span class="grow">עוד אפשרויות ייצוא</span><span class="chev">${I.chevL}</span></button>
    </div>
    <p class="fine">הערכה לפי מדרגות מס וביטוח לאומי 2026. התלוש בפועל יכול להיות שונה (הטבות, זקיפות, הסכמים).</p>`;
  bindMonthBar(el);
  { const big = $('.hero .big', el); big._v = heroV; countUp(big, n.net); heroV = n.net; }
  if ($('#dayChart', el)) {
    const nd = new Date(viewY, viewM + 1, 0).getDate(), items = [];
    for (let d = 1; d <= nd; d++) { const A = agg(M.shifts.filter(s => new Date(s.start).getDate() === d)); items.push({ ...A, title: `${DAYS[new Date(viewY, viewM, d).getDay()]} ${d}.${viewM + 1}`, label: d === 1 || d % 5 === 0 ? d : '' }); }
    mountChart($('#dayChart', el), items); bindMetric(el);
  }
  $('#xMonth', el).onclick = () => exportShifts('month');
  $('#xReport', el).onclick = () => openReport();
  bindLeave(el);
  $('#xMore', el).onclick = openExport;
}

/* ================= sick days and vacation ================= */
function leaveCard(M) {
  const L = (l, v, cls = '', sub = '') => `<div class="ln ${cls}"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
  const one = n => (Math.floor(n * 10) / 10).toLocaleString('he-IL');
  const jobs = S.jobs.filter(j => S.shifts.some(s => s.jobId === j.id) || S.absences.some(a => a.jobId === j.id) || j.startDate);
  const rows = jobs.map(j => {
    const b = leaveOf(j);
    return `${S.jobs.length > 1 ? `<div class="ln"><span class="l" style="color:${j.color};font-weight:700">${nm(j.name)}</span><span class="v"></span></div>` : ''}
      ${L('חופשה', `נותרו ${one(b.vac.left)}`, '', `נצברו ${one(b.vac.accrued)}, נוצלו ${b.vac.used} · ${b.vac.full} ימים לשנה מלאה`)}
      ${L('מחלה', `נותרו ${one(b.sick.left)}`, '', `נצברו ${one(b.sick.accrued)}, נוצלו ${b.sick.used} · עד 90 ימים`)}
      ${havraaLine(j, L)}`;
  }).join('');
  const list = [...M.absent].sort((a, b) => a.date < b.date ? -1 : 1).map(a => {
    const d = new Date(a.date + 'T12:00:00'), j = jobById(a.jobId);
    return `<div class="ln"><span class="l">${a.kind === 'sick' ? 'יום מחלה' : 'יום חופשה'}<small class="num">${DAYS[d.getDay()]} ${dShort(d)}${S.jobs.length > 1 ? ' · ' + nm(j.name) : ''}</small></span><button type="button" class="iconbtn" data-ab="${a.id}" aria-label="מחיקה">${I.trash}</button></div>`;
  }).join('');
  return `${rows || `<p class="hint" style="margin:10px 14px">היתרה מופיעה אחרי המשמרת הראשונה.</p>`}
    ${list ? `<div class="ln"><span class="l" style="font-weight:700;color:var(--ink)">${MONTHS[viewM]}</span><span class="v"></span></div>${list}` : ''}
    <button class="cell" id="addLeave"><span class="cell-ic">${I.plus}</span><span class="grow">הוספת יום מחלה או חופשה</span></button>`;
}
function havraaLine(j, L) {
  const H = havraaOf(j); if (!H) return '';
  if (!H.eligible) return L('דמי הבראה', 'אחרי שנה', '', `מגיעים מ־${dFull(H.from)}, אחרי שנת עבודה מלאה`);
  return L('דמי הבראה', `${money(H.amount)} לשנה`, '', `${H.days} ימים (שנה ${H.years + 1} בעבודה) × ₪${H.rate} × היקף משרה ${Math.round(H.scope * 100)}%${j.havraaMode === 'month' ? ' · נכנס כל חודש' : ''}`);
}
function bindLeave(root) {
  $('#addLeave', root) && ($('#addLeave', root).onclick = () => openLeaveSheet());
  $$('[data-ab]', root).forEach(b => b.onclick = () => {
    const i = S.absences.findIndex(a => a.id === b.dataset.ab); if (i < 0) return;
    const was = S.absences[i]; S.absences.splice(i, 1); commit(); buzz(15);
    toast('נמחק', '', { label: 'ביטול', fn: () => { S.absences.push(was); commit(); } });
  });
}
const leaveHint = kind => kind === 'sick'
  ? 'דמי מחלה: היום הראשון בלי תשלום, השני והשלישי 50%, ומהרביעי 100%. צריך אישור מחלה. ימים ברצף נספרים יחד.'
  : 'ימי עבודה בלבד: בלי שבתות וחגים שלא עובדים בהם.';
/** Adds n sick or vacation days from a date (YYYY-MM-DD). Returns how many. */
function addLeave(jobId, kind, from, n) {
  n = Math.min(60, Math.max(1, Math.round(+n || 1)));
  const job = jobById(jobId), [y, m, dd] = from.split('-').map(Number);
  let added = 0;
  for (let d = new Date(y, m - 1, dd); added < n; d.setDate(d.getDate() + 1)) {
    // vacation counts work days only; sick days run on in a row, as the law counts them
    if (kind === 'vac' && (d.getDay() === 6 || (+job.weekDays !== 6 && d.getDay() === 5))) continue;
    const k = dateKey(d);
    if (!S.absences.some(a => a.jobId === jobId && a.date === k)) S.absences.push({ id: uid(), jobId, kind, date: k });
    added++;
  }
  return n;
}
function openLeaveSheet(pre = {}) {
  let kind = pre.kind || 'sick', jobId = pre.jobId || (S.settings.lastJob && S.jobs.some(j => j.id === S.settings.lastJob) ? S.settings.lastJob : S.jobs[0].id);
  const today = new Date(), inView = viewY === today.getFullYear() && viewM === today.getMonth();
  const d0 = pre.date || dateKey(inView ? today : new Date(viewY, viewM, 1));
  openSheet(`<h2>יום מחלה או חופשה</h2><p class="shsub">ימים שלא עבדת ושמשלמים עליהם. כל יום משולם לפי הגדרות העבודה, בדרך כלל שעות של יום × התעריף.</p>
    ${S.jobs.length > 1 ? `<div class="chips" id="lv-jobs" style="margin-top:14px">${S.jobs.map(j => `<button type="button" class="chip" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}</div>` : ''}
    <div class="seg" id="lv-kind" style="margin-top:14px"><button type="button" data-k="sick">מחלה</button><button type="button" data-k="vac">חופשה</button></div>
    <div class="grid2">
      <label class="field"><span>מתאריך</span><input class="input num" type="date" id="lv-date" value="${d0}"></label>
      <label class="field"><span>כמה ימים</span><input class="input num" type="number" min="1" max="60" inputmode="numeric" id="lv-n" value="1"></label>
    </div>
    <p class="hint" id="lv-hint"></p>
    <div class="btnrow"><button class="btn primary" id="lv-save">${I.check}שמירה</button></div>`, root => {
    const ui = () => {
      $$('#lv-kind button', root).forEach(b => b.classList.toggle('on', b.dataset.k === kind));
      $$('#lv-jobs .chip', root).forEach(b => b.classList.toggle('on', b.dataset.j === jobId));
      $('#lv-hint', root).textContent = leaveHint(kind);
    };
    $$('#lv-kind button', root).forEach(b => b.onclick = () => { kind = b.dataset.k; ui(); });
    $$('#lv-jobs .chip', root).forEach(b => b.onclick = () => { jobId = b.dataset.j; ui(); });
    ui();
    $('#lv-save', root).onclick = () => {
      const v = $('#lv-date', root).value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return toast('צריך לבחור תאריך', 'err');
      const n = addLeave(jobId, kind, v, +$('#lv-n', root).value), [y, m, dd] = v.split('-').map(Number);
      const d = new Date(y, m - 1, dd); viewY = d.getFullYear(); viewM = d.getMonth();
      closeSheet(); commit(); buzz(20); toast(n === 1 ? 'נשמר יום אחד' : `נשמרו ${n} ימים`, 'ok');
    };
  });
}

/* ================= monthly report (PDF) ================= */
function openReport() {
  const M0 = monthCalc(viewY, viewM);
  if (!M0.shifts.length && !M0.absent.length) return toast('אין משמרות בחודש הזה');
  const used = S.jobs.filter(j => M0.shifts.some(s => s.jobId === j.id) || M0.absent.some(a => a.jobId === j.id));
  let jobId = used.length === 1 ? used[0].id : 'all';
  openSheet(`<h2>דוח חודשי</h2><p class="shsub">${MONTHS[viewM]} ${viewY}: כל המשמרות, השעות לפי סוג והשכר, בקובץ PDF שאפשר לשלוח למעסיק או לשמור.</p>
    ${used.length > 1 ? `<div class="chips" id="rp-jobs" style="margin-top:14px"><button type="button" class="chip" data-j="all">כל העבודות</button>${used.map(j => `<button type="button" class="chip" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}</div>` : ''}
    <label class="cell flat" style="margin-top:10px"><span class="grow">עם נטו משוער<div class="sub">בלי זה הדוח מראה רק שעות וברוטו</div></span><span class="switch"><input type="checkbox" id="rp-net"><i></i></span></label>
    <div class="btnrow"><button class="btn primary" id="rp-go">${I.share}שיתוף הדוח</button></div>`, root => {
    const ui = () => $$('#rp-jobs .chip', root).forEach(b => b.classList.toggle('on', b.dataset.j === jobId));
    $$('#rp-jobs .chip', root).forEach(b => b.onclick = () => { jobId = b.dataset.j; ui(); }); ui();
    $('#rp-go', root).onclick = async () => {
      const btn = $('#rp-go', root); btn.disabled = true;
      try {
        const bytes = await buildReport(viewY, viewM, jobId, $('#rp-net', root).checked);
        const job = jobId === 'all' ? null : jobById(jobId);
        const name = `${EN ? 'Etzba-report' : 'אצבע-דוח'}-${viewY}-${pad(viewM + 1)}${job ? '-' + job.name.replace(/[\\/:*?"<>|]/g, '') : ''}.pdf`;
        if (await deliver(name, bytes, 'application/pdf')) closeSheet();
      } catch (e) { report(e); toast('לא הצלחתי ליצור את הדוח', 'err'); }
      finally { btn.disabled = false; }
    };
  });
}
async function buildReport(y, m, jobId, withNet) {
  const M = monthCalc(y, m), T = t => tr(t);
  const pick = x => jobId === 'all' || x.jobId === jobId;
  const shifts = M.shifts.filter(pick).sort((a, b) => new Date(a.start) - new Date(b.start));
  const absent = M.absent.filter(pick).sort((a, b) => a.date < b.date ? -1 : 1);
  const Js = M.perJob.filter(J => jobId === 'all' || J.job.id === jobId);
  const one = jobId !== 'all' ? jobById(jobId) : S.jobs.length === 1 ? S.jobs[0] : null;
  const gross = Js.reduce((a, J) => a + J.total, 0), hours = Js.reduce((a, J) => a + J.hours, 0), tips = Js.reduce((a, J) => a + J.tipsOwn, 0);
  const lines = [];
  for (const J of Js) {
    if (Js.length > 1) lines.push({ label: J.job.name, value: '', sub: `${T('₪')}${J.job.rate} ${T('לשעה')}` });
    for (const k of TIERS) if (J.b[k] > 0.004) lines.push({ label: T(tierLabel(k, J.job)), sub: `${hm(J.b[k])} ${T('ש׳')}`, value: money2(J.money[k]) });
    if (J.travel) lines.push({ label: T('נסיעות'), sub: `${J.travelDays} ${T('ימי עבודה')}`, value: money2(J.travel) });
    if (J.bonus) lines.push({ label: T('בונוסים'), value: money2(J.bonus) });
    if (J.tipsOver) lines.push({ label: T('טיפים מעל השכר'), value: money2(J.tipsOver) });
    if (J.holiday) lines.push({ label: T('דמי חגים'), sub: J.holDays.map(h => T(h.name)).join(', '), value: money2(J.holiday) });
    if (J.sickDays) lines.push({ label: T('דמי מחלה'), sub: `${J.sickDays} ${T('ימים')}`, value: money2(J.sick) });
    if (J.vacDays) lines.push({ label: T('דמי חופשה'), sub: `${J.vacDays} ${T('ימים')}`, value: money2(J.vac) });
    if (J.havraa) lines.push({ label: T('דמי הבראה'), sub: T('חלק חודשי'), value: money2(J.havraa) });
  }
  lines.push({ label: T('סה״כ ברוטו'), value: money2(gross), strong: true });
  const tiles = [[T('שעות'), hm(hours)], [T('משמרות'), String(shifts.length)], [T('ברוטו'), money(gross)]];
  if (withNet) {
    const st = S.settings, n = grossToNet(gross, { points: +st.sex + +st.extraPts, pension: st.pension, pEmp: +st.pEmp, pEr: +st.pEr, sev: +st.sev, hish: st.hish }, taxFor(y));
    lines.push({ label: T('מס הכנסה, ביטוח לאומי ובריאות'), value: '−' + money2(n.tax + n.ni + n.health), neg: true });
    if (n.pEmp + n.hEmp) lines.push({ label: T('חיסכון לפנסיה'), value: '−' + money2(n.pEmp + n.hEmp), neg: true });
    lines.push({ label: T('נטו משוער'), value: money2(n.net), strong: true });
    tiles.push([T('נטו משוער'), money(n.net)]);
  }
  if (tips) lines.push({ label: T('טיפים שלך'), sub: T('במזומן או מהלקוחות, לא בתלוש'), value: money2(tips) });
  const rows = [];
  for (const s of shifts) {
    const p = PAY.get(s.id), d = new Date(s.start);
    const what = [p.names.length ? p.names.map(T).join(' / ') : '', p.otHours > 0.01 ? `${T('נוספות')} ${hm(p.otHours)}` : '', s.note || ''].filter(Boolean).join(' · ');
    const row = [dFull(s.start), DAYS[d.getDay()], tm(s.start), tm(s.end), +s.breakMin ? String(+s.breakMin) : '', hm(p.hours), money2(p.pay), what];
    if (jobId === 'all' && S.jobs.length > 1) row[7] = [jobById(s.jobId).name, what].filter(Boolean).join(' · ');
    rows.push(row);
  }
  for (const a of absent) {
    const d = new Date(a.date + 'T12:00:00');
    rows.push([dFull(d), DAYS[d.getDay()], '', '', '', '', '', T(a.kind === 'sick' ? 'יום מחלה' : 'יום חופשה')]);
  }
  rows.sort((a, b) => { const k = r => r[0].split('/').reverse().join(''); return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0; });
  const sumPay = shifts.reduce((a, s) => a + PAY.get(s.id).pay, 0), sumH = shifts.reduce((a, s) => a + PAY.get(s.id).hours, 0);
  try { await document.fonts.load('700 24px Heebo'); await document.fonts.load('800 24px Heebo'); await document.fonts.load('400 24px Heebo'); } catch {}
  const pages = drawReport({
    dir: EN ? 'ltr' : 'rtl', font: 'Heebo, "Noto Sans Hebrew", Arial, sans-serif',
    brand: EN ? 'Etzba · אצבע' : 'אצבע',
    title: `${T('דוח שעות ושכר')} · ${MONTHS[m]} ${y}`,
    subtitle: one ? `${one.name} · ${T('₪')}${jobAt(one, new Date(y, m + 1, 0)).rate} ${T('לשעה')}` : Js.map(J => J.job.name).join(' · '),
    tiles, lines,
    cols: [{ title: T('תאריך'), w: .14 }, { title: T('יום'), w: .09 }, { title: T('כניסה'), w: .09 }, { title: T('יציאה'), w: .09 }, { title: T('הפסקה'), w: .10 }, { title: T('שעות'), w: .09 }, { title: T('שכר'), w: .13 }, { title: T('הערות'), w: .27 }],
    rows, total: [T('סה״כ'), '', '', '', '', hm(sumH), money2(sumPay), ''],
    footer: T('הופק באצבע · etzba.ilanox.dev · חישוב לפי החוק וההגדרות שהוזנו, לא תלוש שכר רשמי'),
    pageLabel: (i, n) => `${i} / ${n}`,
  });
  return pagesToPDF(pages);
}

/* ================= STATS ================= */
const GROUPS = ['רגיל', 'נוספות', 'שבת וחג'];
function agg(list) {
  const A = { h: [0, 0, 0], m: [0, 0, 0], hours: 0, gross: 0, count: 0 };
  for (const s of list) {
    const p = PAY.get(s.id); if (!p) continue;
    for (const k of TIERS) { const g = /^(rest|chag|elect)/.test(k) ? 2 : /^ot|special/.test(k) ? 1 : 0; A.h[g] += p.b[k]; A.m[g] += p.money[k]; }
    A.m[0] += p.travel + p.bonus; A.hours += p.hours; A.gross += p.pay; A.count++;
  }
  return A;
}
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const metricSeg = () => `<div class="c-head"><div class="seg sm" data-metric><button data-m="h" class="${S.ui.metric === 'm' ? '' : 'on'}">שעות</button><button data-m="m" class="${S.ui.metric === 'm' ? 'on' : ''}">ברוטו</button></div><div class="c-leg">${GROUPS.map((g, j) => `<span><i class="cg${j}"></i>${g}</span>`).join('')}</div></div>`;
const bindMetric = root => $$('[data-metric] button', root).forEach(b => b.onclick = () => { S.ui.metric = b.dataset.m; persist(); renderSum(); });
function mountChart(el, items, sel) {
  const met = S.ui.metric === 'm' ? 'm' : 'h', fmt = met === 'm' ? money : hm;
  const tot = it => it[met][0] + it[met][1] + it[met][2];
  if (sel == null) { sel = items.length - 1; for (let i = items.length - 1; i >= 0; i--) if (tot(items[i]) > 0) { sel = i; break; } }
  const max = niceMax(Math.max(...items.map(tot), met === 'm' ? 100 : 1));
  const read = i => { const it = items[i]; return `<div class="c-r1"><b>${it.title}</b><span class="num c-tot">${fmt(tot(it))}</span></div><div class="c-parts">${GROUPS.map((g, j) => it[met][j] > 0.004 ? `<span><i class="cg${j}"></i>${g} <b class="num">${fmt(it[met][j])}</b></span>` : '').join('') || '<span>אין משמרות</span>'}</div>`; };
  el.innerHTML = `<div class="c-read">${read(sel)}</div>
    <div class="c-plot"><div class="c-grid">${[1, .5, 0].map(f => `<span style="bottom:${f * 100}%"><em class="num">${fmt(max * f)}</em></span>`).join('')}</div>
    <div class="c-bars${items.length > 14 ? ' thin' : ''}">${items.map((it, i) => {
      const parts = it[met], last = parts.reduce((a, v, j) => v > 0.004 ? j : a, -1);
      return `<button class="c-col${i === sel ? ' on' : ''}" data-i="${i}" aria-label="${it.title}"><span class="c-stack" style="height:${tot(it) / max * 100}%">${parts.map((v, j) => v > 0.004 ? `<i class="cg${j}${j === last ? ' top' : ''}" style="flex:${v}"></i>` : '').join('')}</span><em class="num">${it.label ?? ''}</em></button>`;
    }).join('')}</div></div>`;
  // tapping anywhere over the plot picks the nearest column, so thin month columns are still easy to hit
  const cols = $$('.c-col', el), pick = b => { cols.forEach(x => x.classList.toggle('on', x === b)); $('.c-read', el).innerHTML = read(+b.dataset.i); };
  $('.c-bars', el).addEventListener('click', e => {
    let best = null, d = 1e9;
    for (const c of cols) { const r = c.getBoundingClientRect(), dx = Math.abs(e.clientX - (r.left + r.width / 2)); if (dx < d) { d = dx; best = c; } }
    if (best) pick(best);
  });
}
function renderSum() {
  const el = $('#v-sum'), v = S.ui.sumView || 'month';
  el.innerHTML = `<h1 class="title">סיכום</h1><div class="seg" id="sumSeg">${[['weeks', 'שבועות'], ['month', 'חודש'], ['year', 'שנה']].map(([k, n]) => `<button data-s="${k}" class="${k === v ? 'on' : ''}">${n}</button>`).join('')}</div><div id="sumBody" style="margin-top:12px"></div>`;
  $$('#sumSeg button', el).forEach(b => b.onclick = () => { S.ui.sumView = b.dataset.s; persist(); renderSum(); });
  ({ month: sumMonth, weeks: sumWeeks, year: sumYear })[v]($('#sumBody', el));
}
function sumWeeks(el) {
  const items = [], N = 10;
  for (let i = N - 1; i >= 0; i--) {
    const ws = weekStart(new Date()); ws.setDate(ws.getDate() - i * 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const list = inWeek(ws);
    items.push({ ...agg(list), title: `שבוע ${dShort(ws)}–${dShort(we)}`, label: dShort(ws), lim: list.length ? jobById(list[0].jobId).weeklyLimit : 42 });
  }
  const worked = items.filter(x => x.count), avgH = worked.length ? worked.reduce((a, x) => a + x.hours, 0) / worked.length : 0, avgG = worked.length ? worked.reduce((a, x) => a + x.gross, 0) / worked.length : 0;
  el.innerHTML = `<div class="kpis"><div class="kpi"><small>ממוצע שעות לשבוע</small><b class="num">${hm(avgH)}</b></div><div class="kpi"><small>ממוצע ברוטו לשבוע</small><b class="num">${money(avgG)}</b></div></div>
    <div class="sec"><span>${secIc('cal', 'blue')}${N} שבועות אחרונים</span></div>
    <div class="card pad">${metricSeg()}<div id="wkChart"></div></div>
    <div class="sec"><span>${secIc('receipt', 'green')}פירוט</span></div>
    <div class="card">${[...items].reverse().map(x => `<div class="ln"><span class="l" style="color:var(--ink)">${x.title}<small>${x.count ? x.count + ' משמרות' : 'בלי משמרות'}${x.hours > x.lim ? ` · מעל ${x.lim} ש׳` : ''}</small></span><span class="v num">${hm(x.hours)} ש׳<small style="display:block;font-weight:400;color:var(--ink3)">${money(x.gross)}</small></span></div>`).join('')}</div>`;
  mountChart($('#wkChart', el), items); bindMetric(el);
}
function sumYear(el) {
  const Ms = Array.from({ length: 12 }, (_, m) => monthCalc(viewY, m));
  const items = Ms.map((M, m) => { const A = agg(M.shifts); A.m[0] += M.perJob.reduce((a, J) => a + (J.holiday || 0), 0); return { ...A, title: `${MONTHS[m]} ${viewY}`, label: m + 1 }; });
  const T = Ms.reduce((a, M) => (a.gross += M.gross, a.net += M.gross ? M.net.net : 0, a.tax += M.net.tax, a.hours += M.hours, a.count += M.shifts.length, a), { gross: 0, net: 0, tax: 0, hours: 0, count: 0 });
  const best = Ms.reduce((a, M) => M.gross > a.gross ? M : a, Ms[0]), act = Ms.filter(M => M.gross > 0).length;
  const H = items.reduce((a, x) => (a[0] += x.h[0], a[1] += x.h[1], a[2] += x.h[2], a), [0, 0, 0]);
  const k = (l, v, s = '') => `<div class="kpi"><small>${l}</small><b class="num">${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
  el.innerHTML = `<div class="monthbar"><button class="ibtn" data-yn="-1" aria-label="שנה קודמת">${I.chevR}</button><b class="num">${viewY}</b><button class="ibtn" data-yn="1" aria-label="שנה הבאה">${I.chevL}</button></div>
    ${T.count ? `<div class="kpis" style="margin-top:12px">
      ${k('ברוטו שנתי', money(T.gross))}${k('נטו משוער', money(T.net), `מס הכנסה ${money(T.tax)}`)}
      ${k('שעות', hm(T.hours), `${T.count} משמרות`)}${k('ממוצע לשעה', money2(T.hours ? T.gross / T.hours : 0), 'כולל תוספות')}
      ${k('ממוצע לחודש', money(act ? T.gross / act : 0), `${act} חודשי עבודה`)}${k('חודש שיא', MONTHS[best.m], money(best.gross))}</div>
    <div class="sec"><span>${secIc('cal', 'blue')}לפי חודשים</span></div>
    <div class="card pad">${metricSeg()}<div id="yrChart"></div></div>
    <div class="sec"><span>${secIc('ot', 'orange')}חלוקת השעות בשנה</span></div>
    <div class="card pad"><div class="split">${H.map((v, j) => v > 0.004 ? `<i class="cg${j}" style="flex:${v}"></i>` : '').join('')}</div>
      ${GROUPS.map((g, j) => `<div class="ln flat"><span class="l"><i class="dotc cg${j}"></i>${g}</span><span class="v num">${hm(H[j])} ש׳ · ${T.hours ? Math.round(H[j] / T.hours * 100) : 0}%</span></div>`).join('')}</div>
    <div class="sec"><span>${secIc('cal', 'blue')}חודשים</span></div>
    <div class="card">${Ms.map((M, m) => M.shifts.length || M.gross ? `<button class="cell" data-gm="${m}"><span class="grow">${MONTHS[m]}<div class="sub num">${M.shifts.length} משמרות · ${hm(M.hours)} ש׳</div></span><span class="val num" style="text-align:end;color:var(--ink)"><b>${money(M.gross)}</b><div class="sub">נטו ${money(M.net.net)}</div></span><span class="chev">${I.chevL}</span></button>` : '').join('')}</div>
    <div class="card" style="margin-top:12px"><button class="cell" id="xYear"><span class="cell-ic t-blue">${I.file}</span><span class="grow">ייצוא סיכום חודשי (CSV)</span><span class="chev">${I.chevL}</span></button></div>`
    : `<div class="card" style="margin-top:12px"><div class="empty"><div class="eic">${I.receipt}</div>אין משמרות ב־${viewY}</div></div>`}
    <p class="fine">הנטו השנתי הוא סכום ההערכות החודשיות. החישוב הסופי נעשה בתיאום מס שנתי.</p>`;
  $$('[data-yn]', el).forEach(b => b.onclick = () => { viewY += +b.dataset.yn; renderSum(); });
  if (!T.count) return;
  mountChart($('#yrChart', el), items, viewY === new Date().getFullYear() ? new Date().getMonth() : undefined); bindMetric(el);
  $$('[data-gm]', el).forEach(b => b.onclick = () => { viewM = +b.dataset.gm; S.ui.sumView = 'month'; persist(); renderSum(); scrollTo(0, 0); });
  $('#xYear', el).onclick = () => deliver('אצבע-סיכום-חודשי.csv', summaryCSV(), 'text/csv;charset=utf-8');
}

/* ================= RIGHTS ================= */
function renderRights() {
  const el = $('#v-rights'), y = new Date().getFullYear();
  const low = S.jobs.filter(j => j.rate < MIN_WAGE_HOURLY);
  const w = nextRest(new Date(), place());
  const job = jobById(S.settings.lastJob);
  if (EN) { el.innerHTML = rightsEN(y, low, w, qaEN); return; }
  /* translations: skip-start (Hebrew-only page; other languages get the English page above) */
  const qa = (ic, q, a, open) => `<details class="qa"${open ? ' open' : ''}><summary><span class="cell-ic">${I[ic]}</span>${q}<span class="cv">${I.chevDown}</span></summary><div class="ans">${a}</div></details>`;
  el.innerHTML = `<h1 class="title">מה מגיע לי</h1>
    ${low.map(j => `<div class="note">${I.warn}<span>השכר ב"${esc(j.name)}" (₪${j.rate}) נמוך משכר המינימום, ₪${MIN_WAGE_HOURLY} לשעה מ־1.4.2026.</span></div>`).join('')}
    <div class="note info">${I.info}<span>אצבע מחשבת לפי החוק הכללי. אם במקום העבודה שלך יש הסכם קיבוצי או תנאים טובים יותר, אפשר לשנות את האחוזים בהגדרות העבודה.</span></div>
    ${qa('ot', 'מתי מתחילות שעות נוספות?', `
      <p>בשבוע של <b>5 ימים</b>: אחרי <b>8:36 שעות</b> ביום (ביום המקוצר אחרי 7:36).</p>
      <p>בשבוע של <b>6 ימים</b>: אחרי <b>8 שעות</b> ביום (ביום שישי אחרי 7).</p>
      <p>וגם כל שעה מעבר ל־<b>42 שעות רגילות בשבוע</b>, גם אם בכל יום בנפרד לא עברת את המכסה.</p>
      <p>שעתיים נוספות ראשונות: <b>125%</b>. מהשעה השלישית: <b>150%</b>.</p>`, true)}
    ${qa('info', 'עבדתי יותר מהמתוכנן. למה זה לא שעות נוספות?', `
      <p>זה מבלבל הרבה עובדים שעתיים: שעות נוספות נספרות לפי <b>יום העבודה המלא בחוק</b>, לא לפי המשמרת שתכננו לך.</p>
      <p>אם קבעו לך 5 שעות ונשארת 7, השעתיים הנוספות משולמות ב־100%. התוספת מתחילה רק אחרי 8:36 שעות ביום או 42 שעות בשבוע.</p>
      <p>מה שכן חשוב: <b>כל דקה שעבדת משולמת.</b> תרשמו כל משמרת, כי התיעוד שלכם הוא ההוכחה.</p>`)}
    ${qa('shabbat', 'כמה משלמים על שבת וחג?', `
      <div class="rate-grid"><span>כל שעה בשבת או בחג</span><span>150%</span><span>שעתיים נוספות ראשונות</span><span>175%</span><span>מהשעה הנוספת השלישית</span><span>200%</span></div>
      <p style="margin-top:10px">מי שעבד במנוחה השבועית זכאי גם ליום מנוחה חלופי של 36 שעות במהלך השבוע.</p>
      <p>ערב חג: 100% עד כניסת החג, ו־150% מהכניסה.</p>`)}
    ${qa('pin', 'מתי בדיוק מתחילה ונגמרת שבת?', `
      <p>אצבע מחשבת לפי <b>הדלקת נרות</b> ועד <b>צאת השבת</b> בעיר שבחרת (${esc(S.settings.city)}).</p>
      ${w ? `<p>הקרוב: <b>${esc(w.names.join(' · '))}</b>, מ${DAYS[w.start.getDay()]} ${tm(w.start)} עד ${DAYS[w.end.getDay()]} ${tm(w.end)}.</p>` : ''}
      <p>יש מקומות עבודה שמגדירים שעות קבועות בחוזה (למשל שישי 16:00 עד ראשון 04:00 בשמירה). את זה משנים בהגדרות העבודה.</p>`)}
    ${qa('chag', `חגים ודמי חגים ${y}`, `
      <div class="rate-grid">${holidaysOfGregorianYear(y).map(h => `<span>${h.name}</span><span style="font-weight:600">${DAYS[h.dow]} ${dShort(h.date)}</span>`).join('')}</div>
      <p style="margin-top:10px">עובד שעתי עם <b>3 חודשי ותק</b> מקבל בדרך כלל תשלום על חג שלא חל בשבת, גם בלי לעבוד, אם לא נעדר ביום שלפני החג וביום שאחריו בלי הסכמת המעסיק.</p>
      <p>ומי שעבד בחג מקבל את דמי החג <b>וגם</b> 150% על השעות שעבד.</p>`)}
    ${qa('check', 'עבדתי ביום הבחירות. כמה מגיע לי?', `
      <p>יום הבחירות לכנסת (<b>${electionDate()}</b>) הוא יום שבתון. מי שעובד אצל אותו מעסיק לפחות 14 ימים ברציפות מקבל עליו שכר מלא גם בלי לעבוד.</p>
      <p>מי שכן עבד מקבל לפי <b>נוהג מקובל</b>, שלא כתוב בחוק, <b>200%</b>, ובשעות נוספות 250% ו־300%. יש מעסיקים שמשלמים במקום זה שכר רגיל ונותנים יום חופש אחר.</p>
      <p>אצבע מחשבת 200% על כל שעה שעבדת באותו יום. אפשר לשנות או לכבות בהגדרות העבודה.</p>`)}
    ${qa('coffee', 'הפסקות: מתי משלמים עליהן?', `
      <p>ביום עבודה ארוך מגיעות <b>45 דקות הפסקה</b>, ומתוכן חצי שעה רצופה. בעבודת כפיים זה מ־6 שעות, ובעבודה אחרת מיום של 9 שעות (בשבוע של 5 ימים).</p>
      <p>אם <b>מותר לך לצאת</b> בהפסקה, המעסיק לא חייב לשלם עליה. אם <b>דורשים ממך להישאר</b> במקום העבודה, ההפסקה בתשלום.</p>`)}
    ${qa('night', 'משמרת לילה', `
      <p>משמרת עם לפחות שעתיים בין 22:00 ל־06:00 נחשבת משמרת לילה, ושם יום העבודה הרגיל קצר יותר: <b>7 שעות</b>. מעבר לזה יש שעות נוספות.</p>
      <p>בין יום עבודה ליום הבא מגיעות לפחות <b>8 שעות מנוחה</b>.</p>`)}
    ${qa('receipt', 'סכומים חשובים ל־2026', `
      <div class="rate-grid"><span>שכר מינימום לשעה (מ־1.4.2026)</span><span>₪35.40</span><span>שכר מינימום חודשי</span><span>₪6,443.85</span>
      <span>דמי הבראה ליום (מגזר פרטי)</span><span>₪451.5</span><span>נקודת זיכוי ממס</span><span>₪242</span></div>`)}
    <p class="fine">מידע כללי בלבד, לא ייעוץ משפטי. מבוסס על חוק שעות עבודה ומנוחה וצווי ההרחבה. מקורות: כל זכות, משרד העבודה, ביטוח לאומי.</p>`;
}
/* translations: skip-end */

const qaEN = (ic, q, a, open) => `<details class="qa"${open ? ' open' : ''}><summary><span class="cell-ic">${I[ic]}</span>${q}<span class="cv">${I.chevDown}</span></summary><div class="ans">${a}</div></details>`;
function rightsEN(y, low, w, qa) {
  return `<h1 class="title">My rights</h1>
    ${low.map(j => `<div class="note">${I.warn}<span>The wage at "${nm(j.name)}" (₪${j.rate}) is below minimum wage, ₪${MIN_WAGE_HOURLY} an hour since 1.4.2026.</span></div>`).join('')}
    <div class="note info">${I.info}<span>Etzba follows the general law. If your workplace has a collective agreement or better terms, change the percentages in the job settings.</span></div>
    ${qa('ot', 'When does overtime start?', `
      <p>On a <b>5-day week</b>: after <b>8:36 hours</b> a day (7:36 on the short day).</p>
      <p>On a <b>6-day week</b>: after <b>8 hours</b> a day (7 on Friday).</p>
      <p>Also every hour past <b>42 regular hours a week</b>, even if no single day went over.</p>
      <p>First two overtime hours: <b>125%</b>. From the third: <b>150%</b>.</p>`, true)}
    ${qa('info', 'I worked longer than planned. Why isn’t it overtime?', `
      <p>This confuses many hourly workers: overtime is counted against the <b>full legal work day</b>, not the shift you were scheduled for.</p>
      <p>If you were booked for 5 hours and stayed 7, the extra two are paid at 100%. The premium starts only after 8:36 hours a day or 42 hours a week.</p>
      <p>What matters: <b>every minute you worked is paid.</b> Log every shift; your record is your proof.</p>`)}
    ${qa('shabbat', 'What do Shabbat and holidays pay?', `
      <div class="rate-grid"><span>Every hour on Shabbat or a holiday</span><span>150%</span><span>First two overtime hours</span><span>175%</span><span>From the third overtime hour</span><span>200%</span></div>
      <p style="margin-top:10px">If you worked during the weekly rest you also get a substitute rest of 36 hours that week.</p>
      <p>Holiday eve: 100% until the holiday starts, 150% from then.</p>`)}
    ${qa('pin', 'When exactly does Shabbat start and end?', `
      <p>Etzba counts from <b>candle lighting</b> to <b>the end of Shabbat</b> in your city (${esc(S.settings.city)}).</p>
      ${w ? `<p>Next: <b>${esc(w.names.join(' · '))}</b>, ${DAYS[w.start.getDay()]} ${tm(w.start)} to ${DAYS[w.end.getDay()]} ${tm(w.end)}.</p>` : ''}
      <p>Some workplaces set fixed hours in the contract (security: Friday 16:00 to Sunday 04:00). Change that in the job settings.</p>`)}
    ${qa('chag', `Holidays and holiday pay ${y}`, `
      <div class="rate-grid">${holidaysOfGregorianYear(y).map(h => `<span>${h.name}</span><span style="font-weight:600">${DAYS[h.dow]} ${dShort(h.date)}</span>`).join('')}</div>
      <p style="margin-top:10px">An hourly worker with <b>3 months</b> at the job usually gets paid for a holiday that isn’t on Shabbat, without working it, if they weren’t absent the day before and after without the employer’s consent.</p>
      <p>If you did work the holiday you get the holiday pay <b>and</b> 150% for the hours worked.</p>`)}
    ${qa('check', 'I worked on election day. What am I owed?', `
      <p>Knesset election day (<b>${electionDate()}</b>) is a day off by law. If you’ve worked for the same employer for at least 14 days in a row, you’re paid for it even without working.</p>
      <p>If you did work, <b>accepted practice</b> (not written in the law) is <b>200%</b>, with overtime at 250% and 300%. Some employers pay a regular wage plus another day off instead.</p>
      <p>Etzba pays 200% for every hour you worked that day. You can change or turn this off in the job settings.</p>`)}
    ${qa('coffee', 'Breaks: when are they paid?', `
      <p>A long work day comes with a <b>45-minute break</b>, half an hour of it continuous. For manual work that’s from 6 hours; otherwise from a 9-hour day (5-day week).</p>
      <p>If you’re <b>free to leave</b> during the break, it doesn’t have to be paid. If you’re <b>required to stay</b>, it is paid.</p>`)}
    ${qa('night', 'Night shifts', `
      <p>A shift with at least two hours between 22:00 and 06:00 is a night shift, and the regular day is shorter: <b>7 hours</b>. Past that is overtime.</p>
      <p>Between one work day and the next you’re owed at least <b>8 hours of rest</b>.</p>`)}
    ${qa('receipt', 'Key amounts for 2026', `
      <div class="rate-grid"><span>Minimum hourly wage (from 1.4.2026)</span><span>₪35.40</span><span>Minimum monthly wage</span><span>₪6,443.85</span>
      <span>Convalescence pay per day (private sector)</span><span>₪451.5</span><span>Tax credit point</span><span>₪242</span></div>`)}
    <p class="fine">General information only, not legal advice. Based on the Hours of Work and Rest Law and extension orders. Sources: Kol Zchut, Ministry of Labor, National Insurance.</p>`;
}

/* ================= SETTINGS ================= */
// a small colored icon before a section title; the same colors as the rows below it
const secIc = (i, t) => `<i class="sec-ic t-${t}">${I[i]}</i>`;
function renderSet() {
  const el = $('#v-set'), st = S.settings;
  const sw = (id, on) => `<span class="switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><i></i></span>`;
  el.innerHTML = `<h1 class="title">הגדרות</h1>
    <div class="sec"><span>${secIc('briefcase', 'blue')}מקומות עבודה</span></div>
    <div class="card">${S.jobs.map(j => `<button class="cell" data-job="${j.id}"><span class="cell-ic" style="color:${j.color}">${I.briefcase}</span>
      <span class="grow">${nm(j.name)}<div class="sub num">₪${j.rate} לשעה · שבוע של ${j.weekDays} ימים${j.restMode === 'fixed' ? ' · שבת לפי חוזה' : ''}</div></span><span class="chev">${I.chevL}</span></button>`).join('')}
      <button class="cell" id="addJob"><span class="cell-ic">${I.plus}</span><span class="grow" style="color:var(--accent);font-weight:600">הוספת מקום עבודה</span></button></div>

    <div class="sec"><span>${secIc('noon', 'gold')}מראה</span></div>
    <div class="card pad"><div class="themes" id="s-theme">${[['auto', 'אוטומטי', 'linear-gradient(90deg,#F1EEE6 50%,#141518 50%)'], ['light', 'בהיר', '#F1EEE6'], ['dark', 'כהה', '#141518'], ['blurple', 'בלרפל', 'linear-gradient(90deg,#1E1F22 60%,#5865F2 60%)']].map(([k, n, bg]) => `<button data-t="${k}" class="${(st.theme || 'auto') === k ? 'on' : ''}"><i style="background:${bg}"></i>${n}</button>`).join('')}</div>
      <div class="field"><span>שפה</span><div class="seg" id="s-lang">${LANGS.map(l => `<button data-l="${l.code}" class="${l.code === LANG ? 'on' : ''}" data-keep>${l.name}</button>`).join('')}</div></div></div>

    <div class="sec"><span>${secIc('shabbat', 'gold')}זמני שבת וחג</span></div>
    <div class="card">
      <label class="cell"><span class="cell-ic t-orange">${I.pin}</span><span class="grow">עיר</span>
        <select class="val" id="s-city" style="border:0;background:none;text-align:end;font-weight:600">${Object.keys(CITIES).map(c => `<option value="${c}"${c === st.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="cell"><span class="cell-ic t-gold">${I.shabbat}</span><span class="grow">הדלקת נרות<div class="sub">דקות לפני השקיעה</div></span>
        <input class="input num" style="width:76px;height:44px;text-align:center" type="number" id="s-candleMin" value="${st.candleMin}"></label>
      <label class="cell"><span class="cell-ic t-indigo">${I.night}</span><span class="grow">צאת שבת<div class="sub">דקות אחרי השקיעה</div></span>
        <input class="input num" style="width:76px;height:44px;text-align:center" type="number" id="s-havdalahMin" value="${st.havdalahMin}"></label>
    </div>

    <div class="sec"><span>${secIc('coins', 'green')}מס ונטו</span></div>
    <div class="card pad">
      <div class="seg" id="s-sex"><button data-v="2.25">גבר · 2.25 נק׳</button><button data-v="2.75">אישה · 2.75 נק׳</button></div>
      <label class="field"><span>נקודות זיכוי נוספות</span><input class="input num" type="number" step="0.25" inputmode="decimal" id="s-extraPts" value="${st.extraPts}">
        <p class="hint">למשל: ילדים, תואר אקדמי, חייל/ת משוחרר/ת, צעירים עד גיל 23. אפשר לבדוק בטופס 101.</p></label>
    </div>
    <div class="card">
      <label class="cell"><span class="cell-ic t-green">${I.coins}</span><span class="grow">פנסיה<div class="sub">לעובד שעתי בדרך כלל אחרי 6 חודשים</div></span>${sw('s-pension', st.pension)}</label>
      <div class="cell ${st.pension ? '' : 'hidden'}" id="penRow"><span class="grow">עובד / מעסיק / פיצויים %</span>
        <input class="input num" style="width:64px;height:44px;text-align:center;padding:0 4px" type="number" step="0.5" id="s-pEmp" value="${st.pEmp}">
        <input class="input num" style="width:64px;height:44px;text-align:center;padding:0 4px" type="number" step="0.5" id="s-pEr" value="${st.pEr}">
        <select class="input num" style="width:76px;height:44px" id="s-sev"><option${+st.sev === 8.33 ? ' selected' : ''}>8.33</option><option${+st.sev === 6 ? ' selected' : ''}>6</option></select></div>
      <label class="cell"><span class="cell-ic t-teal">${I.book}</span><span class="grow">קרן השתלמות<div class="sub">2.5% עובד · 7.5% מעסיק</div></span>${sw('s-hish', st.hish)}</label>
    </div>

    <div class="sec"><span>${secIc('download', 'blue')}נתונים וגיבוי</span></div>
    ${backupDue() ? `<div class="note" style="margin-bottom:10px">${I.warn}<span>${S.settings.lastBackup ? `הגיבוי האחרון לפני ${Math.floor((Date.now() - new Date(S.settings.lastBackup)) / 864e5)} ימים.` : 'עוד לא גיבית.'} יש ${S.shifts.length} משמרות שקיימות רק בטלפון הזה.</span></div>` : ''}
    <div class="card">
      <button class="cell" id="s-backup"><span class="cell-ic t-blue">${I.download}</span><span class="grow">גיבוי מלא עכשיו<div class="sub">${S.settings.lastBackup ? 'גיבוי אחרון: ' + dFull(S.settings.lastBackup) : 'עוד לא גיבית'}</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-import"><span class="cell-ic t-blue">${I.file}</span><span class="grow">שחזור או העברה מטלפון אחר<div class="sub">מציג מה בקובץ לפני שמשנים משהו</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-fimport"><span class="cell-ic t-teal">${I.list}</span><span class="grow">ייבוא משמרות מקובץ<div class="sub">Excel או CSV, גם מאפליקציות אחרות</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-export"><span class="cell-ic t-green">${I.receipt}</span><span class="grow">ייצוא ל־CSV<div class="sub">לאקסל או לגוגל שיטס</div></span><span class="chev">${I.chevL}</span></button>
    </div>
    <div class="note info" style="margin-top:10px" id="storeNote">${storeNote()}</div>
    ${native.NATIVE ? `<div class="card" style="margin-top:12px"><label class="cell"><span class="cell-ic t-orange">${I.bell}</span><span class="grow">התראות במשמרת<div class="sub">כשמתחילות שעות נוספות, בכניסת שבת וחג, ואם שכחת לצאת</div></span><span class="switch"><input type="checkbox" id="s-notif"${notifOn() ? ' checked' : ''}><i></i></span></label><div id="s-nstat"></div></div>` : ''}
    ${FEATURES.devTools ? `<div class="card" style="margin-top:12px"><button class="cell" id="s-debug"><span class="cell-ic t-violet">${I.info}</span><span class="grow">אבחון ותקלות<div class="sub">${dbg.lastCrash() ? 'האפליקציה נסגרה בפעם הקודמת · פרטים כאן' : 'מידע טכני לשליחה כשמשהו לא עובד'}</div></span><span class="chev">${I.chevL}</span></button></div>` : ''}
    ${FEATURES.devTools && S.settings.dev ? `<div class="card" style="margin-top:12px" data-keep><button class="cell" id="s-dev"><span class="cell-ic t-gray">${I.gear}</span><span class="grow">כלי פיתוח<div class="sub">בדיקת התראות, משמרות לדוגמה ועוד</div></span><span class="chev">${I.chevL}</span></button></div>` : ''}
    <div class="card" style="margin-top:12px"><button class="cell" id="s-legal"><span class="cell-ic t-gray">${I.lock}</span><span class="grow">פרטיות ומשפטי<div class="sub">מה נשמר, ומה החישוב כן ולא</div></span><span class="chev">${I.chevL}</span></button></div>
    <p class="fine" id="s-ver"><b>אצבע</b> · גרסה ${VERSION}<br>An Edvin Studios Project</p>`;
  $$('[data-job]', el).forEach(b => b.onclick = () => openJobSheet(jobById(b.dataset.job), false));
  $('#addJob', el).onclick = () => { const j = defaultJob('עבודה ' + (S.jobs.length + 1)); j.color = COLORS[S.jobs.length % COLORS.length]; openJobSheet(j, true); };
  const set = (k, v) => { S.settings[k] = v; commit(); };
  $('#s-city', el).onchange = e => { S.settings.candleMin = CITIES[e.target.value][2]; set('city', e.target.value); };
  for (const k of ['candleMin', 'havdalahMin', 'extraPts', 'pEmp', 'pEr', 'sev']) $('#s-' + k, el).onchange = e => set(k, +e.target.value || 0);
  for (const k of ['pension', 'hish']) $('#s-' + k, el).onchange = e => set(k, e.target.checked);
  $$('#s-sex button', el).forEach(b => { b.classList.toggle('on', +b.dataset.v === +st.sex); b.onclick = () => set('sex', +b.dataset.v); });
  $$('#s-theme button', el).forEach(b => b.onclick = () => { S.settings.theme = b.dataset.t; applyTheme(); commit(); });
  $$('#s-lang button', el).forEach(b => b.onclick = () => {
    if (b.dataset.l === LANG) return;
    try { localStorage.setItem('etzba.langBoot', b.dataset.l); } catch {}
    setLang(b.dataset.l).then(() => setTimeout(() => { try { localStorage.removeItem('etzba.langBoot'); } catch {} }, 4000));
  });
  $('#s-export', el).onclick = openExport;
  $('#s-import', el).onclick = openImport;
  $('#s-debug', el) && ($('#s-debug', el).onclick = openDebug);
  $('#s-dev', el) && ($('#s-dev', el).onclick = openDevTools);
  if (FEATURES.devTools) { let taps = 0, t; $('#s-ver', el).onclick = () => { clearTimeout(t); t = setTimeout(() => taps = 0, 1500);
      if (++taps >= 7 && !S.settings.dev) { S.settings.dev = true; persist(); buzz(30); toast('מצב מפתח פעיל', 'ok'); renderSet(); } }; }
  $('#s-notif', el) && ($('#s-notif', el).onchange = e => {
    const on = e.target.checked; S.settings.notif = { rates: on, rest: on, long: on };
    persist(); if (on) planNotifications(true); drawNotifStatus();
  });
  drawNotifStatus();
  $('#s-backup', el).onclick = () => backupNow();
  $('#s-legal', el).onclick = openLegal;
  $('#s-fimport', el).onclick = openFileImport;
  persistState().then(v => { const pl = $('#persistLine', el); if (pl && v !== null) pl.textContent = v ? 'הדפדפן אישר אחסון קבוע, כך שלא ימחק את הנתונים כשחסר מקום.' : 'הדפדפן עוד לא אישר אחסון קבוע, ועלול למחוק נתונים כשחסר מקום בטלפון.'; });
}

/* ================= RETROACTIVE OR NOT ================= */
const rulesDiffer = (rules, job) => JSON.stringify({ ...rules, rate: 0 }) !== JSON.stringify({ ...Object.fromEntries(Object.keys(rules).map(k => [k, job[k]])), rate: 0 });
/** Saving changed pay rules: choose from when they apply. Earlier shifts keep the rules they were paid under. */
function openApplyFrom(old, nj) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1), yearStart = new Date(today.getFullYear(), 0, 1);
  const mine = S.shifts.filter(s => s.jobId === old.id);
  const first = new Date(Math.min(...mine.map(s => +new Date(s.start))));
  const effect = from => {
    const tmp = applyRulesFrom(old, nj, from ? from.toISOString() : null);
    const after = computeAll(mine, () => tmp, place());
    let n = 0, before = 0, aft = 0;
    for (const s of mine) { const x = PAY.get(s.id)?.pay || 0, y2 = after.get(s.id)?.pay || 0; before += x; aft += y2; if (Math.abs(x - y2) > 0.005) n++; }
    return { n, diff: aft - before };
  };
  const opts = [
    ['today', 'מהיום והלאה', `${dFull(today)}. משמרות קודמות נשארות כמו שהן`, today],
    ['month', `מתחילת ${MONTHS[monthStart.getMonth()]}`, dFull(monthStart), monthStart],
    ['year', `מתחילת ${yearStart.getFullYear()}`, dFull(yearStart), yearStart],
    ['all', 'על כל המשמרות, גם אחורה', `${mine.length} משמרות, החל מ־${dFull(first)}`, null],
  ];
  const line = e => e.n ? `${e.n} משמרות יחושבו מחדש · ${e.diff >= 0 ? '+' : '−'}${money(Math.abs(e.diff))}` : 'אף משמרת קיימת לא משתנה';
  const ys = [...new Set(mine.map(s => new Date(s.start).getFullYear()))].concat(today.getFullYear()).sort();
  openSheet(`<h2>ממתי זה חל?</h2><p class="shsub">שינית כללי שכר ב"${esc(nj.name)}". משמרות שלפני התאריך שתבחרו ימשיכו להיות מחושבות לפי הכללים הישנים.</p>
    <div class="card" style="margin-top:14px">${opts.map(([k, t, sub, d]) => { const e = effect(d); return `<button class="cell" data-from="${k}"><span class="grow">${t}<div class="sub num">${sub}</div><div class="sub num" style="color:${e.n ? 'var(--accent-ink)' : 'var(--ink3)'}">${line(e)}</div></span><span class="chev">${I.chevL}</span></button>`; }).join('')}
      <div class="cell" style="flex-wrap:wrap"><span class="grow">מתאריך אחר<div class="sub" id="af-eff"></div></span>
        <span class="datepick"><select class="input num" id="af-d">${Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select><select class="input num" id="af-m">${MONTHS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select><select class="input num" id="af-y">${ys.map(y => `<option>${y}</option>`).join('')}</select></span>
        <button class="btn soft" id="af-go" style="height:44px;margin-top:8px">החלה מהתאריך הזה</button></div></div>
    <div class="btnrow"><button class="btn soft" id="af-back">חזרה לעריכה</button></div>`, root => {
    const pick = () => new Date(+$('#af-y', root).value, +$('#af-m', root).value, +$('#af-d', root).value);
    $('#af-d', root).value = monthStart.getDate(); $('#af-m', root).value = monthStart.getMonth(); $('#af-y', root).value = monthStart.getFullYear();
    const upd = () => { $('#af-eff', root).textContent = line(effect(pick())); };
    $$('#af-d,#af-m,#af-y', root).forEach(x => x.onchange = upd); upd();
    const save = (from, label) => {
      const out = applyRulesFrom(old, nj, from ? from.toISOString() : null);
      S.jobs[S.jobs.findIndex(x => x.id === old.id)] = out;
      closeSheet(); commit(); toast(label, 'ok');
    };
    $$('[data-from]', root).forEach(b => b.onclick = () => { const o = opts.find(x => x[0] === b.dataset.from); save(o[3], o[3] ? `נשמר. חל מ־${dFull(o[3])}` : 'נשמר. חל על כל המשמרות'); });
    $('#af-go', root).onclick = () => save(pick(), `נשמר. חל מ־${dFull(pick())}`);
    $('#af-back', root).onclick = () => openJobSheet(nj, false);
  });
}

/* ================= IMPORT FROM FILE ================= */
/** f: an optional File (or {name, arrayBuffer()}) to read straight away, e.g. one shared from another app. */
function openFileImport(f0) {
  let parsed = null, sheetIx = 0, year = null, jobId = S.settings.lastJob, newJobName = null, fileName = '';
  openSheet(`<h2>ייבוא משמרות מקובץ</h2><p class="shsub">Excel (xls, xlsx) או CSV, גם מאפליקציות משמרות אחרות. קודם רואים מה ייכנס, ורק אז מייבאים.</p>
    <label class="btn soft" style="margin-top:14px">${I.file}בחירת קובץ<input type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" id="fi-file" hidden></label>
    <div id="fi-prev"></div>`, root => {
    const draw = () => {
      const el = $('#fi-prev', root);
      if (!parsed) return;
      const sheets = parsed.filter(s => s.res && !s.res.error && s.res.shifts.length);
      if (!sheets.length) { el.innerHTML = `<div class="note">${I.warn}<span>${esc(parsed.find(s => s.res?.error)?.res.error || 'לא מצאתי משמרות בקובץ.')} צריך עמודות של תאריך, כניסה ויציאה.</span></div>`; return; }
      const sh = sheets[Math.min(sheetIx, sheets.length - 1)];
      const res = rowsToShifts(sh.rows, { year: year ?? sh.year });
      const job = jobId === '__new' ? null : jobById(jobId);
      const jid = job ? job.id : '__new';
      const rates = res.shifts.map(s => s.rate).filter(x => x != null), common = k => { const c = {}; for (const s of res.shifts) if (s[k] != null) c[s[k]] = (c[s[k]] || 0) + 1; const e = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; return e ? +e[0] : null; };
      const draftJob = job || Object.assign(defaultJob(newJobName || 'מיובא'), { rate: common('rate') ?? 40, travel: common('travel') ?? 0 });
      // build the shifts exactly as they would be saved
      const sig = s => `${jid}|${+new Date(s.start)}|${+new Date(s.end)}`, have = new Set(S.shifts.map(s => `${s.jobId}|${+new Date(s.start)}|${+new Date(s.end)}`));
      const fresh = [], dup = [];
      for (const s of res.shifts) {
        const out = { id: uid(), jobId: draftJob.id, start: s.start, end: s.end, breakMin: s.breakMin, bonus: s.bonus, note: s.note, rest: 'auto', src: 'import' };
        if (s.tips) out.tips = s.tips;
        if (s.rate != null && s.rate !== jobAt(draftJob, s.start).rate) out.rate = s.rate;
        if (s.travel != null && s.travel !== jobAt(draftJob, s.start).travel) out.travel = s.travel;
        (have.has(sig(s)) ? dup : fresh).push(out);
      }
      const odd = fresh.filter(s => s.rate != null).length;
      const pays = computeAll(fresh, () => draftJob, place());
      const gross = fresh.reduce((x, s) => x + pays.get(s.id).pay, 0), hours = fresh.reduce((x, s) => x + pays.get(s.id).hours, 0);
      const allHours = res.shifts.reduce((x, s) => x + ((new Date(s.end) - new Date(s.start)) / 6e4 - s.breakMin) / 60, 0);
      const ts = res.shifts.map(s => +new Date(s.start));
      const fileH = res.summary.hours, hoursOk = fileH != null && Math.abs(fileH - allHours) < 1 / 60;
      const yearsSel = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
      const L = (l, v, sub = '', cls = '') => `<div class="ln ${cls}"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
      el.innerHTML = `
        ${sheets.length > 1 ? `<div class="chips">${sheets.map((s, i) => `<button class="chip${i === sheetIx ? ' on' : ''}" data-sh="${i}"><bdi data-keep>${esc(s.name)}</bdi></button>`).join('')}</div>` : ''}
        <div class="card" style="margin-top:14px">
          ${L('קובץ', `<bdi data-keep>${esc(fileName)}</bdi>`, sheets.length === 1 && sh.name ? `גיליון: <bdi data-keep>${esc(sh.name)}</bdi>` : '')}
          ${L('משמרות בקובץ', res.shifts.length, ts.length ? `${dFull(Math.min(...ts))} – ${dFull(Math.max(...ts))}` : '')}
          ${L('שעות', hm(allHours) + ' ש׳', fileH != null ? (hoursOk ? '✓ תואם לסיכום שבקובץ' : `הסיכום בקובץ: ${hm(fileH)}. כדאי לבדוק`) : '', fileH != null && !hoursOk ? 'neg' : '')}
          ${res.skippedEmpty ? L('ימים בלי שעות', res.skippedEmpty, `לא יובאו${res.summary.sick ? ` (בקובץ: ${res.summary.sick} ימי מחלה)` : ''}`) : ''}
          ${res.skippedBad.length ? L('שורות שלא הבנתי', res.skippedBad.length, 'שורות ' + res.skippedBad.slice(0, 6).map(x => x.row).join(', '), 'neg') : ''}
          ${dup.length ? L('כבר קיימות', dup.length, 'אותן שעות באותה עבודה. ידלגו') : ''}
          ${odd ? L('תעריף אחר', odd, 'תעריף מהקובץ נשמר לכל משמרת כזו') : ''}
        </div>
        ${res.needsYear ? `<label class="field"><span>שנה</span><div class="seg" id="fi-year">${yearsSel.map(y => `<button type="button" data-y="${y}" class="${y === (year ?? res.year) ? 'on' : ''}">${y}</button>`).join('')}</div><p class="hint">בקובץ אין שנה ליד התאריכים${sh.year ? `. לקחתי ${sh.year} משם הקובץ או הגיליון` : ''}.</p></label>` : ''}
        <div class="field"><span>לאיזה מקום עבודה</span><div class="chips" id="fi-job" style="padding-top:0">${S.jobs.map(j => `<button type="button" class="chip${j.id === jid ? ' on' : ''}" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}<button type="button" class="chip${jid === '__new' ? ' on' : ''}" data-j="__new">${I.plus}חדש</button></div>
          ${jid === '__new' ? `<input class="input" id="fi-newname" value="${esc(newJobName || 'מיובא')}" style="margin-top:8px"><p class="hint">ייווצר עם ₪${draftJob.rate} לשעה ונסיעות ₪${draftJob.travel}, לפי מה שהכי נפוץ בקובץ.</p>` : ''}</div>
        <div class="card" style="margin-top:12px">
          ${L('אצבע תחשב', money(gross), `ברוטו ל־${fresh.length} משמרות · ${hm(hours)} ש׳, לפי הגדרות "${esc(draftJob.name)}"`)}
          ${res.summary.gross != null ? L('הקובץ חישב', money(res.summary.gross), 'ההפרש בא בדרך כלל משעות נוספות, שבת, חג ולילה, שכל אפליקציה מחשבת אחרת. אפשר לשנות את הכללים בהגדרות העבודה') : ''}
        </div>
        <div class="btnrow"><button class="btn primary" id="fi-go"${fresh.length ? '' : ' disabled'}>${I.check}ייבוא ${fresh.length} משמרות</button></div>`;
      $$('[data-sh]', el).forEach(b => b.onclick = () => { sheetIx = +b.dataset.sh; year = null; draw(); });
      $$('#fi-year button', el).forEach(b => b.onclick = () => { year = +b.dataset.y; draw(); });
      $$('#fi-job .chip', el).forEach(b => b.onclick = () => { jobId = b.dataset.j; draw(); });
      $('#fi-newname', el) && ($('#fi-newname', el).onchange = e => { newJobName = e.target.value.trim() || 'מיובא'; draw(); });
      $('#fi-go', el).onclick = () => {
        if (!job) { S.jobs.push(draftJob); S.settings.lastJob = draftJob.id; }
        const batch = 'imp-' + Date.now();
        for (const s of fresh) { s.batch = batch; S.shifts.push(s); }
        const last = new Date(Math.max(...fresh.map(s => +new Date(s.start))));
        viewY = last.getFullYear(); viewM = last.getMonth();
        closeSheet(); commit(); go('shifts');
        announce(`יובאו ${fresh.length} משמרות`);
        toast(`יובאו ${fresh.length} משמרות`, 'ok', { label: 'ביטול', fn: () => {
          S.shifts = S.shifts.filter(s => s.batch !== batch);
          if (!job && !S.shifts.some(s => s.jobId === draftJob.id)) { S.jobs = S.jobs.filter(j => j.id !== draftJob.id); S.settings.lastJob = S.jobs[0].id; }
          commit(); toast('הייבוא בוטל'); announce('הייבוא בוטל');
        } });
      };
    };
    const take = async f => {
      dbg.log('info', 'import file ' + f.name);
      fileName = f.name; $('#fi-prev', root).innerHTML = `<p class="hint" style="margin-top:12px">קורא את הקובץ…</p>`;
      try {
        const sheets = await readSheets(await f.arrayBuffer(), f.name);
        parsed = sheets.map(s => ({ ...s, year: guessYear(s.name, f.name), res: rowsToShifts(s.rows, { year: guessYear(s.name, f.name) ?? new Date().getFullYear() }) }));
        sheetIx = 0; year = null;
      } catch (err) { parsed = [{ res: { error: 'לא הצלחתי לקרוא את הקובץ.' } }]; dbg.log('error', 'read file: ' + (err?.message || err)); }
      draw();
    };
    $('#fi-file', root).onchange = e => { const f = e.target.files[0]; if (f) take(f); };
    if (f0) take(f0);
  });
}

/* ---- files shared to Etzba from other apps (Android share menu → אצבע) ----
   The service worker receives the file, keeps it in a cache, and opens the app with ?shared=1. */
async function takeSharedFile() {
  try {
    if (!/[?&]shared=1/.test(location.search) || !('caches' in window)) return;
    history.replaceState(null, '', location.pathname);       // a reload won't import twice
    const c = await caches.open('etzba-share'), r = await c.match('shared-file');
    if (!r) { toast('הקובץ ששותף לא הגיע. אפשר לנסות שוב'); dbg.log('warn', 'share: no file'); return; }
    const name = decodeURIComponent(r.headers.get('x-name') || 'shared.xls'), buf = await r.arrayBuffer();
    await c.delete('shared-file');
    dbg.log('info', `share: ${name} ${buf.byteLength}B`);
    $('#onboard')?.remove();
    go('set');
    openFileImport({ name, arrayBuffer: async () => buf });
  } catch (e) { report(e); }
}

/* ================= JOB SHEET ================= */
function openJobSheet(job, isNew) {
  const j = structuredClone(job);
  const days = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  const K = (k, label, step = 0.1) => `<label class="field"><span>${label}</span><input class="input num" type="number" step="${step}" inputmode="decimal" data-k="${k}" value="${j[k]}"></label>`;
  const R = (k, label) => `<label class="field"><span>${label}</span><div class="pct"><input class="input num" type="number" inputmode="numeric" data-r="${k}" value="${j.r[k]}"><i>%</i></div></label>`;
  const SW = (k, on) => `<span class="switch"><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}><i></i></span>`;
  const rule = (id, kc, ic, title, sub, k, body) => `<div class="rule" id="rule-${id}"><label class="rule-h"><span class="kic k-${kc}">${I[ic]}</span><span class="grow"><b>${title}</b><div class="sub">${sub}</div></span>${SW(k, j[k] !== false)}</label><div class="rule-b">${body}</div></div>`;
  openSheet(`
    <h2>${isNew ? 'מקום עבודה חדש' : 'הגדרות עבודה'}</h2>
    <p class="shsub">כל מקום עבודה שונה. מדליקים רק את התוספות שבאמת משלמים לך, ומשנים את האחוזים לפי החוזה.</p>
    <label class="field"><span>שם</span><input class="input" type="text" data-k="name" value="${esc(j.name)}"></label>
    <div class="field"><span>צבע</span><div class="swatches" id="j-col">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <label class="field"><span>שכר לשעה (₪)</span><input class="input num" type="number" step="0.01" inputmode="decimal" data-k="rate" value="${j.rate}"><p class="hint" id="j-minw"></p></label>

    <h3>תוספות שכר</h3>
    ${rule('ot', 'noon', 'ot', 'שעות נוספות ביום חול', 'תוספת אחרי יום עבודה מלא', 'otOn', `
      <div class="seg" id="j-week"><button type="button" data-w="5">שבוע של 5 ימים</button><button type="button" data-w="6">שבוע של 6 ימים</button></div>
      <div class="grid2">${K('regHours', 'אחרי (שעות ביום)')}${R('ot1', 'תוספת ראשונה')}</div>
      <div class="grid2">${K('ot1Hours', 'למשך (שעות)', 0.5)}${R('ot2', 'ואחר כך')}</div>
      <p class="hint" id="j-othint"></p>
      <label class="cell flat"><span class="grow">גם לפי שבוע<div class="sub">מעבר למכסה השבועית נחשב שעות נוספות</div></span>${SW('weeklyRule', j.weeklyRule)}</label>
      <div id="j-weekly">${K('weeklyLimit', 'מכסה שבועית (שעות)', 0.5)}<p class="hint">שעות רגילות בשבוע לפני שעות נוספות. לפי החוק 42.</p></div>
      <details class="adv"><summary>${I.chevDown}יום מקוצר ולילה</summary>
        ${K('shortHours', 'שעות ביום המקוצר')}
        <label class="field"><span>היום המקוצר</span><select class="input" data-k="shortDay">${days}</select></label>
        <label class="cell flat"><span class="grow">משמרת לילה<div class="sub">שעתיים או יותר בין 22:00 ל־06:00 מקצרות את היום</div></span>${SW('nightRule', j.nightRule)}</label>
        ${K('nightRegHours', 'שעות רגילות במשמרת לילה')}
      </details>`)}
    ${rule('shab', 'shabbat', 'shabbat', 'שבת', 'תוספת על שעות בתוך השבת', 'shabbatOn', `
      <div class="grid3">${R('rest', 'שעה בשבת')}<span class="otx">${R('restOt1', 'נוספות א׳')}</span><span class="otx">${R('restOt2', 'נוספות ב׳')}</span></div>
      <div class="seg" id="j-rest" style="margin-top:14px"><button type="button" data-m="city">לפי זמני השבת בעיר</button><button type="button" data-m="fixed">שעות קבועות בחוזה</button></div>
      <div class="grid2" id="j-fixed">
        <label class="field"><span>מתחיל</span><select class="input" data-k="fsDay">${days}</select><input class="input num" style="margin-top:6px" type="time" data-k="fsTime" value="${j.fixedStart.time}"></label>
        <label class="field"><span>נגמר</span><select class="input" data-k="feDay">${days}</select><input class="input num" style="margin-top:6px" type="time" data-k="feTime" value="${j.fixedEnd.time}"></label>
      </div>`)}
    ${rule('chag', 'chag', 'chag', 'חגים', 'תוספת על שעות בתוך החג', 'chag', `
      <div class="grid3">${R('chag', 'שעה בחג')}<span class="otx">${R('chagOt1', 'נוספות א׳')}</span><span class="otx">${R('chagOt2', 'נוספות ב׳')}</span></div>`)}
    ${rule('elect', 'chag', 'check', 'יום הבחירות', `עבודה ביום הבחירות לכנסת (${electionDate()})`, 'election', `
      <div class="grid3">${R('elect', 'שעה ביום בחירות')}<span class="otx">${R('electOt1', 'נוספות א׳')}</span><span class="otx">${R('electOt2', 'נוספות ב׳')}</span></div>
      <p class="hint">הנוהג המקובל: 200%, ובשעות נוספות 250% ו־300%. יש מקומות שמשלמים במקום זה שכר רגיל ויום חופש אחר.</p>`)}
    <div class="rule"><label class="rule-h"><span class="kic k-evening">${I.receipt}</span><span class="grow"><b>דמי חגים</b><div class="sub">תשלום על חג שלא עבדת בו (אחרי 3 חודשים)</div></span>${SW('holidayPay', j.holidayPay)}</label>
      <div class="rule-b" id="hp-body">${K('holidayPayHours', 'שעות לתשלום על יום חג', 0.5)}</div></div>

    <h3>הפסקה קבועה</h3>
    <div class="qchips" id="j-brk">${[0, 15, 30, 45, 60].map(b => `<button type="button" data-b="${b}">${b ? b + ' דק׳' : 'בלי'}</button>`).join('')}</div>
    <p class="hint">תיכנס אוטומטית לכל משמרת, ואפשר לשנות בכל משמרת.</p>
    ${R('reg', 'אחוז שעה רגילה')}

    <h3>נסיעות</h3>
    <div class="grid2">
      <label class="field"><span>החזר נסיעות (₪)</span><input class="input num" type="number" step="0.5" inputmode="decimal" data-k="travel" value="${j.travel}"></label>
      <label class="field"><span>תקרה לחודש (₪)</span><input class="input num" type="number" step="1" inputmode="decimal" data-k="travelMonthCap" value="${+j.travelMonthCap || ''}" placeholder="בלי"></label>
    </div>
    <div class="seg" id="j-tmode" style="margin-top:10px"><button type="button" data-t="day">פעם ביום עבודה</button><button type="button" data-t="shift">על כל משמרת</button></div>
    <p class="hint" id="j-thint"></p>

    <div class="rule" id="rule-tips"><label class="rule-h"><span class="kic k-morning">${I.coins}</span><span class="grow"><b>טיפים</b><div class="sub">שדה טיפים בכל משמרת</div></span>${SW('tipsOn', j.tipsOn)}</label>
      <div class="rule-b" id="tips-body">
        <div class="seg" id="j-tips"><button type="button" data-m="own">הטיפים שלי</button><button type="button" data-m="wage">דרך המעסיק</button></div>
        <p class="hint" id="j-tipshint"></p>
      </div></div>

    <h3>ימי מחלה וחופשה</h3>
    <div class="grid2">
      <label class="field"><span>התחלתי לעבוד ב־</span><input class="input num" type="date" data-k="startDate" value="${esc(j.startDate || '')}"></label>
      <label class="field"><span>ימי חופשה בשנה</span><input class="input num" type="number" step="1" inputmode="numeric" data-k="vacDays" value="${+j.vacDays || ''}" placeholder="${+j.weekDays === 6 ? 14 : 12}"></label>
    </div>
    <p class="hint">ריק: מהמשמרת הראשונה, וימי החופשה לפי החוק לשנים הראשונות. ימי מחלה נצברים לבד: 1.5 לחודש מלא, ופחות בחודש חלקי.</p>
    <div class="field"><span>תשלום על יום חופשה או מחלה</span>
      <div class="seg" id="j-leave"><button type="button" data-m="hours">שעות × תעריף</button><button type="button" data-m="avg">ממוצע 3 חודשים</button></div></div>
    <div id="j-lhours">${K('leaveHours', 'שעות ליום', 0.5)}</div>
    <p class="hint" id="j-lhint"></p>
    <div class="field"><span>דמי הבראה</span>
      <div class="seg" id="j-hav"><button type="button" data-m="year">פעם בשנה</button><button type="button" data-m="month">כל חודש בתלוש</button></div></div>
    <p class="hint">אחרי שנה בעבודה: 5 ימים בשנה ויותר עם הוותק, לפי היקף המשרה. בבחירה של כל חודש, חלק מהם נכנס לשכר של כל חודש.</p>
    ${native.geo.available() ? `<h3>מיקום העבודה</h3>
    <div class="card pad" id="j-place"></div>
    <p class="hint">כשמגיעים לעבודה (אחרי כ־3 דקות במקום) תגיע התראה שמציעה להתחיל משמרת, וכשיוצאים באמצע משמרת, הצעה לסיים אותה. הטלפון עצמו עוקב אחרי האזור, כך שזה כמעט לא צורך סוללה.</p>` : ''}
    <div class="btnrow">
      <button class="btn primary" id="j-save">${I.check}שמירה</button>
      ${(job.versions || []).length ? `<div class="card" style="margin-top:6px"><div class="ln"><span class="l" style="font-weight:700;color:var(--ink)">כללים קודמים</span><span class="v"></span></div>${[...job.versions].sort((x, y) => +new Date(x.until) - +new Date(y.until)).map((v, i, arr) => `<div class="ln"><span class="l num">${i ? dFull(arr[i - 1].until) + ' – ' : 'עד '}${dFull(new Date(+new Date(v.until) - 1))}</span><span class="v num">₪${v.rules.rate} לשעה${rulesDiffer(v.rules, job) ? ' · כללים אחרים' : ''}</span></div>`).join('')}<div class="ln"><span class="l num">מ־${dFull(job.versions.reduce((mx, v) => +new Date(v.until) > mx ? +new Date(v.until) : mx, 0))}</span><span class="v num">₪${job.rate} לשעה (עכשיו)</span></div></div>` : ''}
      ${!isNew && S.jobs.length > 1 ? `<button class="btn danger" id="j-del">${I.trash}מחיקת מקום העבודה</button>` : ''}
    </div>`, root => {
    const v = k => $(`[data-k=${k}]`, root);
    v('fsDay').value = j.fixedStart.day; v('feDay').value = j.fixedEnd.day; v('shortDay').value = j.shortDay;
    const ui = () => {
      $$('#j-col button', root).forEach(b => b.classList.toggle('on', b.dataset.c === j.color));
      $$('#j-week button', root).forEach(b => b.classList.toggle('on', +b.dataset.w === +j.weekDays));
      $$('#j-rest button', root).forEach(b => b.classList.toggle('on', b.dataset.m === j.restMode));
      $$('#j-brk button', root).forEach(b => b.classList.toggle('on', +b.dataset.b === +j.breakMin));
      $$('#j-tmode button', root).forEach(b => b.classList.toggle('on', b.dataset.t === (j.travelMode || 'day')));
      $$('#j-tips button', root).forEach(b => b.classList.toggle('on', b.dataset.m === (j.tipsMode || 'own')));
      $$('#j-leave button', root).forEach(b => b.classList.toggle('on', b.dataset.m === (j.leaveMode || 'hours')));
      $$('#j-hav button', root).forEach(b => b.classList.toggle('on', b.dataset.m === (j.havraaMode || 'year')));
      $('#j-lhours', root).classList.toggle('hidden', j.leaveMode === 'avg');
      $('#j-lhint', root).textContent = j.leaveMode === 'avg'
        ? 'השכר בשלושת החודשים שלפני החופשה, חלקי ימי העבודה בהם. כך מחשבים בחלק מהמקומות לעובדים לפי שעה.'
        : `כל יום שווה ${hm(+v('leaveHours').value || 0)} שעות × ₪${+v('rate').value || 0} = ${money2((+v('leaveHours').value || 0) * (+v('rate').value || 0))}.`;
      $('#rule-tips', root).classList.toggle('off', !v('tipsOn').checked);
      $('#tips-body', root).classList.toggle('hidden', !v('tipsOn').checked);
      $('#j-tipshint', root).textContent = j.tipsMode === 'wage'
        ? 'הטיפים נכנסים לקופה ונחשבים לשכר. אם במשמרת הם פחות מהשכר לשעות, המעסיק משלים את ההפרש.'
        : 'הטיפים שלך במזומן או מהלקוחות, מעבר לשכר לשעה. הם לא חלק מהברוטו.';
      const tr0 = +v('travel').value || 0, maxD = rules().travelMaxDaily;
      $('#j-thint', root).textContent = (j.travelMode === 'shift' ? 'נסיעות על כל משמרת, גם כשיש שתיים באותו יום.' : 'לפי החוק נסיעות משולמות פעם אחת על כל יום עבודה.')
        + (maxD && tr0 > maxD ? ` לפי צו ההרחבה ההחזר עד ₪${maxD} ליום.` : '') + ' התקרה לחודש: מחיר חופשי חודשי, אם זול יותר.';
      $('#j-fixed', root).classList.toggle('hidden', j.restMode !== 'fixed');
      const ot = v('otOn').checked;
      $('#rule-ot', root).classList.toggle('off', !ot);
      $('#rule-shab', root).classList.toggle('off', !v('shabbatOn').checked);
      $('#rule-chag', root).classList.toggle('off', !v('chag').checked);
      $('#rule-elect', root).classList.toggle('off', !v('election').checked);
      $('#j-weekly', root).classList.toggle('hidden', !v('weeklyRule').checked);
      $('#hp-body', root).classList.toggle('hidden', !v('holidayPay').checked);
      $$('.otx', root).forEach(e => e.classList.toggle('dim', !ot));
      const r = +v('rate').value, mw = $('#j-minw', root);
      mw.textContent = r < MIN_WAGE_HOURLY ? `נמוך משכר המינימום (₪${MIN_WAGE_HOURLY})` : ''; mw.className = 'hint' + (r < MIN_WAGE_HOURLY ? ' bad' : '');
      const g = k => +$(`[data-r=${k}]`, root).value;
      $('#j-othint', root).textContent = `כלומר: עד ${hm(+v('regHours').value)} ש׳ ביום ${g('reg')}%, אחר כך ${v('ot1Hours').value} שעות ב־${g('ot1')}%, ומשם ${g('ot2')}%.`;
    };
    $$('#j-col button', root).forEach(b => b.onclick = () => { j.color = b.dataset.c; ui(); });
    $$('#j-rest button', root).forEach(b => b.onclick = () => { j.restMode = b.dataset.m; ui(); });
    $$('#j-brk button', root).forEach(b => b.onclick = () => { j.breakMin = +b.dataset.b; ui(); });
    $$('#j-tmode button', root).forEach(b => b.onclick = () => { j.travelMode = b.dataset.t; ui(); });
    $$('#j-tips button', root).forEach(b => b.onclick = () => { j.tipsMode = b.dataset.m; ui(); });
    $$('#j-leave button', root).forEach(b => b.onclick = () => { j.leaveMode = b.dataset.m; ui(); });
    $$('#j-hav button', root).forEach(b => b.onclick = () => { j.havraaMode = b.dataset.m; ui(); });
    $$('#j-week button', root).forEach(b => b.onclick = () => {
      j.weekDays = +b.dataset.w; const five = j.weekDays === 5;
      v('regHours').value = five ? 8.6 : 8; v('shortHours').value = five ? 7.6 : 7; v('shortDay').value = five ? 4 : 5; ui();
    });
    $$('input,select', root).forEach(i => i.addEventListener('input', ui));
    ui();
    if ($('#j-place', root)) drawPlace(root, j);
    $('#j-save', root).onclick = () => {
      j.name = v('name').value.trim() || 'עבודה';
      for (const k of ['rate', 'travel', 'travelMonthCap', 'vacDays', 'leaveHours', 'regHours', 'shortHours', 'shortDay', 'ot1Hours', 'weeklyLimit', 'nightRegHours', 'holidayPayHours']) j[k] = Math.max(0, +v(k).value || 0);
      for (const k of ['otOn', 'shabbatOn', 'chag', 'election', 'holidayPay', 'weeklyRule', 'nightRule', 'tipsOn']) j[k] = v(k).checked;
      j.startDate = /^\d{4}-\d{2}-\d{2}$/.test(v('startDate').value) ? v('startDate').value : '';
      j.fixedStart = { day: +v('fsDay').value, time: v('fsTime').value || '16:00' };
      j.fixedEnd = { day: +v('feDay').value, time: v('feTime').value || '04:00' };
      $$('[data-r]', root).forEach(i => j.r[i.dataset.r] = +i.value || 0);
      const old = S.jobs.find(x => x.id === j.id);
      if (old && rulesChanged(old, j) && S.shifts.some(s => s.jobId === j.id)) return openApplyFrom(old, j);
      const i = S.jobs.findIndex(x => x.id === j.id);
      if (i >= 0) S.jobs[i] = j; else S.jobs.push(j);
      if (isNew) S.settings.lastJob = j.id;
      closeSheet(); commit(); toast('נשמר');
    };
    $('#j-del', root) && ($('#j-del', root).onclick = () => confirmBtn($('#j-del', root), 'ללחוץ שוב (המשמרות יעברו לעבודה אחרת)', () => {
      S.jobs = S.jobs.filter(x => x.id !== j.id);
      S.shifts.forEach(s => { if (s.jobId === j.id) s.jobId = S.jobs[0].id; });
      if (S.active?.jobId === j.id) S.active.jobId = S.jobs[0].id;
      if (S.settings.lastJob === j.id) S.settings.lastJob = S.jobs[0].id;
      closeSheet(); commit(); toast('נמחק');
    }));
  });
}

/* ================= CSV / EXPORT ================= */
function toCSV(rows) {
  const cell = c => { c = c == null ? '' : String(c); return /[",\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
const n2 = x => (Math.round(x * 100) / 100).toFixed(2);
/* translations: skip-start (CSV file contents are Hebrew by design) */
const CSV_TIER = { reg: 'שעות רגילות', ot1: 'שעות נוספות א׳', ot2: 'שעות נוספות ב׳', rest: 'שעות שבת', restOt1: 'שבת נוספות א׳', restOt2: 'שבת נוספות ב׳', chag: 'שעות חג', chagOt1: 'חג נוספות א׳', chagOt2: 'חג נוספות ב׳' , elect: 'שעות יום בחירות', electOt1: 'יום בחירות נוספות א׳', electOt2: 'יום בחירות נוספות ב׳', special: 'שעות בתעריף מיוחד' };
function shiftsCSV(list) {
  const head = ['תאריך', 'יום', 'מקום עבודה', 'סוג משמרת', 'כניסה', 'יציאה', 'תאריך יציאה', 'הפסקה (דקות)', 'שעות לתשלום',
    ...TIERS.map(k => CSV_TIER[k]), 'מתוכן נוספות שבועיות', 'שבת/חג (שם)', 'תעריף לשעה', 'שכר על שעות', 'נסיעות', 'בונוס', 'טיפים', 'סה״כ ברוטו', 'הערה'];
  const rows = [head], T = new Array(head.length).fill(0), n = TIERS.length;
/* translations: skip-end */
  const sumCols = [8, ...TIERS.map((_, i) => 9 + i), 9 + n, 12 + n, 13 + n, 14 + n, 15 + n, 16 + n];
  for (const s of [...list].sort((a, b) => new Date(a.start) - new Date(b.start))) {
    const p = PAY.get(s.id), job = jobById(s.jobId), d = new Date(s.start);
    const r = [dFull(s.start), DAYS[d.getDay()], job.name, KIND_NAME[shiftKind(s, p)], tm(s.start), tm(s.end), dFull(s.end), +s.breakMin || 0, n2(p.hours),
      ...TIERS.map(k => n2(p.b[k])), n2(p.weeklyOT), p.names.join(' / '), n2(p.rate), n2(p.base), n2(p.travel), n2(p.bonus), n2(p.tips), n2(p.pay), s.note || ''];
    sumCols.forEach(i => T[i] += +r[i]);
    rows.push(r);
  }
  const tot = new Array(head.length).fill(''); tot[0] = 'סה״כ'; sumCols.forEach(i => tot[i] = n2(T[i]));
  rows.push(tot);
  return toCSV(rows);
}
function summaryCSV() {
  const keys = [...index().month.keys()].sort((a, b) => a - b);
  const rows = [['חודש', 'משמרות', 'שעות', 'ברוטו', 'מס הכנסה', 'ביטוח לאומי', 'ביטוח בריאות', 'פנסיה (עובד)', 'קרן השתלמות (עובד)', 'נטו משוער', 'פנסיה (מעסיק)', 'פיצויים', 'עלות מעסיק']];
  for (const k of keys) {
    const y = Math.floor(k / 12), m = k % 12, M = monthCalc(y, m), n = M.net;
    rows.push([`${pad(m + 1)}/${y}`, M.shifts.length, n2(M.hours), n2(M.gross), n2(n.tax), n2(n.ni), n2(n.health), n2(n.pEmp), n2(n.hEmp), n2(n.net), n2(n.employer.pension), n2(n.employer.severance), n2(n.cost)]);
  }
  return toCSV(rows);
}
async function deliver(name, text, mime) {
  if (native.NATIVE) {
    try { return await native.saveFile(name, text); }
    catch (e) { dbg.log('error', 'native save: ' + (e?.message || e)); toast('לא הצלחתי לשמור את הקובץ'); return false; }
  }
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e?.name === 'AbortError') return false; }
  try {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('הקובץ נשמר בהורדות', 'ok');
    return true;
  } catch { return copyText(text); }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('הועתק ללוח'); return true; } catch { toast('לא הצלחתי להעתיק'); return false; }
}
function exportShifts(scope, how = 'file') {
  const list = scope === 'month' ? monthCalc(viewY, viewM).shifts : S.shifts;
  if (!list.length) return toast('אין משמרות לייצא');
  const csv = shiftsCSV(list), name = scope === 'month' ? `אצבע-משמרות-${viewY}-${pad(viewM + 1)}.csv` : `אצבע-כל-המשמרות.csv`;
  how === 'copy' ? copyText(csv.slice(1)) : deliver(name, csv, 'text/csv;charset=utf-8');
}
function openExport() {
  let how = 'file';
  openSheet(`<h2>ייצוא</h2><p class="shsub">קובצי CSV נפתחים באקסל ובגוגל שיטס, עם עברית תקינה וטור לכל סוג שעות.</p>
    <div class="seg" id="x-how" style="margin-top:14px"><button data-h="file" class="on">שיתוף / הורדה</button><button data-h="copy">העתקה</button></div>
    <div class="card" style="margin-top:12px">
      <button class="cell" data-x="month"><span class="cell-ic t-blue">${I.file}</span><span class="grow">משמרות ${MONTHS[viewM]} ${viewY}<div class="sub">כל משמרת בשורה, עם שורת סיכום</div></span></button>
      <button class="cell" data-x="all"><span class="cell-ic t-teal">${I.list}</span><span class="grow">כל המשמרות<div class="sub">${S.shifts.length} משמרות</div></span></button>
      <button class="cell" data-x="sum"><span class="cell-ic t-green">${I.receipt}</span><span class="grow">סיכום לפי חודשים<div class="sub">ברוטו, ניכויים ונטו לכל חודש</div></span></button>
      <button class="cell" data-x="backup"><span class="cell-ic t-blue">${I.download}</span><span class="grow">גיבוי מלא (JSON)<div class="sub">להעברה לטלפון אחר</div></span></button>
    </div>`, root => {
    $$('#x-how button', root).forEach(b => b.onclick = () => { how = b.dataset.h; $$('#x-how button', root).forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-x]', root).forEach(b => b.onclick = () => {
      const x = b.dataset.x;
      if (x === 'month' || x === 'all') return exportShifts(x, how);
      if (x === 'sum') { if (!S.shifts.length) return toast('אין נתונים'); const c = summaryCSV(); return how === 'copy' ? copyText(c.slice(1)) : deliver('אצבע-סיכום-חודשי.csv', c, 'text/csv;charset=utf-8'); }
      backupNow(how);
    });
  });
}
async function backupNow(how = 'file') {
  const j = JSON.stringify({ app: 'etzba', version: VERSION, exported: new Date().toISOString(), ...S }, null, 1);
  const ok = how === 'copy' ? await copyText(j) : await deliver(`אצבע-גיבוי-${dFull(new Date()).replace(/\//g, '-')}.json`, j, 'application/json');
  if (ok) { S.settings.lastBackup = new Date().toISOString(); persist(); if (view === 'set') renderSet(); updateBackupDot(); }
}
/** Backup is "due" once there is something worth losing and the last backup is old. */
function backupDue() {
  if (S.shifts.length < 10) return false;
  const last = S.settings.lastBackup ? new Date(S.settings.lastBackup) : null;
  return !last || Date.now() - last > 30 * 864e5;
}
function updateBackupDot() { $('#tabs [data-v=set]')?.classList.toggle('dot', backupDue()); }
async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}
async function persistState() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}
function summarize(d) {
  const ts = d.shifts.map(s => +new Date(s.start)).filter(x => !isNaN(x)).sort((x, y) => x - y);
  return { shifts: d.shifts.length, jobs: d.jobs.length, from: ts[0], to: ts[ts.length - 1], exported: d.exported };
}
/** Where the data lives right now, in plain words. */
function storeNote() {
  return native.NATIVE
    ? `${I.info}<span>הנתונים נשמרים <b>רק בטלפון הזה</b>, בלי חשבון ובלי שרת. מחיקת האפליקציה מוחקת אותם, אז כדאי לגבות מדי פעם. כדי לעבור לטלפון חדש: גיבוי מלא כאן, ואז ״שחזור״ בטלפון החדש.</span>`
    : `${I.info}<span>הנתונים נשמרים <b>רק בדפדפן הזה</b>, בלי חשבון ובלי שרת. ניקוי נתוני האתר מוחק אותם. כדי לעבור למכשיר אחר: גיבוי מלא כאן, ואז ״שחזור״ במכשיר החדש. <span id="persistLine"></span></span>`;
}

function openImport() {
  openSheet(`<h2>שחזור מגיבוי</h2><p class="shsub">בוחרים קובץ גיבוי של אצבע. לפני שמשהו משתנה, תראו מה יש בקובץ.</p>
    <label class="btn soft" style="margin-top:14px">${I.file}בחירת קובץ<input type="file" accept=".json,application/json" id="imp-file" hidden></label>
    <details class="adv"><summary>${I.chevDown}או הדבקת טקסט הגיבוי</summary><textarea class="input" rows="4" id="imp-text" placeholder="{ ... }" style="margin-top:8px"></textarea>
      <div class="btnrow"><button class="btn soft" id="imp-read">בדיקת הטקסט</button></div></details>
    <div id="imp-prev"></div>`, root => {
    const show = txt => {
      let d;
      try { d = JSON.parse(txt); if (!Array.isArray(d.jobs) || !Array.isArray(d.shifts)) throw 0; }
      catch { $('#imp-prev', root).innerHTML = `<div class="note">${I.warn}<span>הקובץ לא נראה כמו גיבוי של אצבע. שום דבר לא השתנה.</span></div>`; return; }
      const f = summarize(d), cur = S.shifts.length, ids = new Set(S.shifts.map(s => s.id));
      // a shift already on this phone is never imported twice: same id, or same job with the same start and end
      const sig = s => `${s.jobId}|${+new Date(s.start)}|${+new Date(s.end)}`, sigs = new Set(S.shifts.map(sig));
      const isDup = s => ids.has(s.id) || sigs.has(sig(s));
      const freshList = d.shifts.filter(s => s.start && s.end && !isDup(s)), fresh = freshList.length, dups = d.shifts.length - fresh;
      $('#imp-prev', root).innerHTML = `<div class="card" style="margin-top:14px">
        <div class="ln"><span class="l">בקובץ</span><span class="v num">${f.shifts} משמרות · ${f.jobs} מקומות עבודה</span></div>
        ${f.from ? `<div class="ln"><span class="l">טווח</span><span class="v num">${dFull(f.from)} – ${dFull(f.to)}</span></div>` : ''}
        ${f.exported ? `<div class="ln"><span class="l">נוצר</span><span class="v num">${dFull(f.exported)}</span></div>` : ''}
        <div class="ln"><span class="l">בטלפון עכשיו</span><span class="v num">${cur} משמרות</span></div></div>
        <div class="btnrow">
          <button class="btn primary" id="imp-merge"${fresh ? '' : ' disabled'}>${I.check}הוספה למה שיש (${fresh} חדשות)</button>
          <button class="btn danger" id="imp-replace">החלפת כל הנתונים בקובץ</button>
          <p class="hint" style="text-align:center">${dups ? `${dups} משמרות כבר קיימות בטלפון ויידלגו. ` : ''}הוספה לא מוחקת ולא משנה כלום. החלפה מוחקת את ${cur} המשמרות שבטלפון.</p></div>`;
      $('#imp-merge', root).onclick = () => {
        const jobIds = new Set(S.jobs.map(j => j.id));
        S.jobs.push(...d.jobs.filter(j => !jobIds.has(j.id)).map(normalizeJob));
        S.shifts.push(...freshList);
        closeSheet(); commit(); toast(`נוספו ${fresh} משמרות`, 'ok');
      };
      $('#imp-replace', root).onclick = () => confirmBtn($('#imp-replace', root), `ללחוץ שוב: ${cur} משמרות יימחקו`, () => {
        localStorage.setItem(KEY, JSON.stringify(d)); S = load(); applyTheme(); closeSheet(); commit(); toast(`שוחזרו ${S.shifts.length} משמרות`, 'ok');
      });
    };
    $('#imp-file', root).onchange = async e => { const f = e.target.files[0]; if (f) show(await f.text()); };
    $('#imp-read', root).onclick = () => show($('#imp-text', root).value);
  });
}

/* ================= notifications during a shift =================
   Only about the shift that's running: the rate changing (overtime, weekly limit), Shabbat or a holiday
   starting or ending, and a shift left open for 12 hours. Scheduled on the phone when the shift starts. */
/** The notifications a shift will get: [{ at, title, body }] (Hebrew; translated when sent). */
/** One switch for all shift notifications (older saves kept three). */
const notifOn = () => { const n = S.settings.notif || {}; return n.rates !== false || n.rest !== false || n.long !== false; };
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
/* What happened the last time notifications were planned: shown under the live shift, and in Settings. */
let NOTIF = { state: 'unknown', next: null, exact: null };
const PRIVACY_URL = 'https://etzba.ilanox.dev/privacy.html', CONTACT = 'ilan@edvin.co.il';
/** Privacy and the calculation disclaimer, in one place. */
function openLegal() {
  openSheet(`<h2>פרטיות ומשפטי</h2>
    <div class="card legal">
      <div class="cell flat">${I.lock}<span class="grow">הכל נשמר רק בטלפון שלך<div class="sub">משמרות, שכר והגדרות. אין חשבון, אין שרת, אין פרסומות ואין מעקב.</div></span></div>
      <div class="cell flat">${I.download}<span class="grow">גיבוי ומחיקה בידיים שלך<div class="sub">גיבוי וייצוא ב״נתונים וגיבוי״. מחיקת האפליקציה או ניקוי הנתונים שלה מוחקים הכל, אז כדאי לגבות לפני.</div></span></div>
      <div class="cell flat">${I.info}<span class="grow">מה נשלח לאינטרנט<div class="sub">רק בדיקה יומית של נתוני שכר מינימום ומס, בהורדה של קובץ ציבורי. שום מידע שלך.</div></span></div>
    </div>
    <div class="note" style="margin-top:12px">${I.warn}<span><b>החישובים הם הערכה.</b> לפי חוק שעות עבודה ומנוחה, הכללים המקובלים וההגדרות שהזנת. זה לא תלוש שכר רשמי ולא ייעוץ משפטי, מיסוי או פיננסי. הסכם קיבוצי או חוזה אישי יכולים לקבוע אחרת.</span></div>
    <div class="btnrow"><a class="btn soft" href="${PRIVACY_URL}" target="_blank" rel="noopener">${I.file}מדיניות הפרטיות המלאה</a><a class="btn soft" href="mailto:${CONTACT}">${I.receipt}יצירת קשר · ${CONTACT}</a></div>`);
}
/** Under the Settings switch: whether the phone lets them through, and how exactly. */
async function drawNotifStatus() {
  const box = $('#s-nstat'); if (!box || !native.NATIVE) return;
  if (!notifOn()) { box.innerHTML = ''; return; }
  const st = await native.notifyStatus();
  const row = (icon, text, btn) => `<div class="cell flat nrow">${icon}<span class="grow sub">${text}</span>${btn ? `<button class="btn soft mini" type="button" data-n="${btn[0]}">${btn[1]}</button>` : ''}</div>`;
  box.innerHTML = st.display === 'denied' ? row(I.bellOff, 'חסומות בהגדרות הטלפון, אז לא יגיעו.', ['open', 'לאפשר'])
    : st.display !== 'granted' ? row(I.bell, 'הטלפון יבקש אישור בפעם הבאה שנכנסים למשמרת.')
    : st.exact === false ? row(I.bell, 'מאושרות. הטלפון שולח אותן בערך בזמן, לפעמים באיחור של כמה דקות.', ['exact', 'בדיוק לדקה'])
    : row(I.check, 'מאושרות, ויגיעו בזמן גם כשהאפליקציה סגורה.');
}
function notifLine() {
  if (!native.NATIVE || !S.active) return '';
  if (NOTIF.state === 'denied') return `<button class="nstat warn" type="button" data-n="open">${I.bellOff}ההתראות חסומות בטלפון · לפתוח הגדרות</button>`;
  if (NOTIF.state === 'error') return `<span class="nstat warn">${I.bellOff}לא הצלחתי לקבוע התראות</span>`;
  if (NOTIF.state === 'ok' && NOTIF.next) return `<span class="nstat">${I.bell}${NOTIF.exact === false ? 'התראה הבאה בסביבות ' : 'התראה הבאה ב־'}${tm(NOTIF.next.at)}</span>`;
  return '';
}
function planNotifications(ask = false) {
  if (!native.NATIVE) return;
  clearTimeout(planTimer);
  planTimer = setTimeout(async () => {
    try {
      const a = S.active, N = { rates: true, rest: true, long: true, ...(S.settings.notif || {}) };
      const on = N.rates || N.rest || N.long, ahead = on ? planReminders() : [];
      if (!on || (!a && !ahead.length)) { NOTIF = { state: 'off', next: null, exact: null }; await native.scheduleNotifications([]); return; }
      if (!(await native.notifyAllowed(ask))) { NOTIF = { state: 'denied', next: null, exact: null }; dbg.log('warn', 'notifications: not allowed'); return; }
      const st = await native.notifyStatus();
      const items = [...(a ? buildNotifications(a, N) : []), ...ahead].filter(x => +x.at > Date.now() + 5000).sort((x, y) => x.at - y.at);
      const n = await native.scheduleNotifications(items.map(x => ({ ...x, title: tr(x.title), body: tr(x.body) })));
      NOTIF = { state: 'ok', next: items[0] || null, exact: st.exact, count: n };
      dbg.log('info', `notifications: ${n} scheduled${st.exact === false ? ' (approximate times)' : ''}`);
    } catch (e) {
      NOTIF = { state: 'error', next: null, exact: null };
      dbg.log('error', 'notifications: ' + (e?.message || e));
    } finally { if (view === 'home') renderHome(); if (view === 'set') drawNotifStatus(); }
  }, 400);
}

/* ================= workplace location (arrive → "start a shift?", leave → "end it?") ================= */
function drawPlace(root, j) {
  const el = $('#j-place', root), p = j.place;
  el.innerHTML = `
    ${p ? `<div class="ln flat"><span class="l">${I.pin}${esc(p.label || 'המיקום שנשמר')}</span><button class="btn soft" style="width:auto;height:40px;padding:0 14px" id="pl-del" type="button">הסרה</button></div>
      <label class="cell flat"><span class="grow">לשאול כשמגיעים ויוצאים</span><span class="switch"><input type="checkbox" id="pl-on"${p.on !== false ? ' checked' : ''}><i></i></span></label>
      <div class="field"><span>רדיוס</span><div class="seg" id="pl-r">${[150, 300, 500].map(r => `<button type="button" data-r="${r}" class="${(p.radius || 300) === r ? 'on' : ''}">${r} מ׳</button>`).join('')}</div></div>
      <div id="pl-perm"></div>`
    : `<button class="btn soft" type="button" id="pl-here">${I.pin}אני בעבודה עכשיו</button>
      <div class="field"><span>או כתובת</span><div style="display:flex;gap:8px"><input class="input" id="pl-addr" type="text" placeholder="למשל: יפו 97, ירושלים" autocomplete="street-address"><button class="btn soft" type="button" style="width:auto;padding:0 16px" id="pl-find">חיפוש</button></div></div>
      <div id="pl-res"></div>`}`;
  const set = place => { j.place = place; drawPlace(root, j); };
  // "Allow all the time" is what lets the phone notice arriving at work while the app is closed. Asked here,
  // inside the job sheet, so nothing typed in the sheet is lost.
  if (p && p.on !== false) native.geo.status().then(st => {
    const box = $('#pl-perm', el); if (!box || st.background) return;
    box.innerHTML = `<div class="note" style="margin-top:12px">${I.info}<span>${st.location ? 'עוד אישור אחד: כדי לדעת שהגעת לעבודה גם כשאצבע סגורה, צריך לבחור במסך הבא <b>"לאפשר כל הזמן"</b>. אצבע לא שומרת ולא שולחת את המיקום לשום מקום.' : 'צריך אישור מיקום כדי שההתראות על הגעה יעבדו.'}</span></div>
      <button class="btn soft" type="button" id="pl-allow" style="margin-top:8px">${st.location ? 'לאפשר כל הזמן' : 'לאשר מיקום'}</button>`;
    $('#pl-allow', box).onclick = async () => {
      let r = await native.geo.status();
      if (!r.location) r = await native.geo.requestLocation();
      if (r.location && !r.background) r = await native.geo.requestBackground();
      if (!r.background) toast('בלי "כל הזמן" ההתראה תגיע רק כשהאפליקציה פתוחה', 'err');
      drawPlace(root, j); syncGeo(true);
    };
  });
  $('#pl-del', el) && ($('#pl-del', el).onclick = () => set(null));
  $('#pl-on', el) && ($('#pl-on', el).onchange = e => { j.place.on = e.target.checked; drawPlace(root, j); });
  $$('#pl-r button', el).forEach(b => b.onclick = () => { j.place.radius = +b.dataset.r; drawPlace(root, j); });
  $('#pl-here', el) && ($('#pl-here', el).onclick = async () => {
    let st = await native.geo.status();
    if (!st.location) st = await native.geo.requestLocation();
    if (!st.location) return toast('צריך אישור מיקום כדי לשמור את המקום', 'err');
    toast('מאתר מיקום…');
    try { const c = await native.geo.current(); set({ lat: c.lat, lng: c.lng, label: `המיקום שלך (±${Math.round(c.accuracy)} מ׳)`, radius: 300, on: true }); }
    catch { toast('לא הצלחתי לקבל מיקום. כדאי לנסות ליד חלון או בחוץ', 'err'); }
  });
  $('#pl-find', el) && ($('#pl-find', el).onclick = async () => {
    const q = $('#pl-addr', el).value.trim(); if (!q) return;
    $('#pl-res', el).innerHTML = '<p class="hint">מחפש…</p>';
    let res = []; try { res = await native.geo.geocode(q); } catch {}
    $('#pl-res', el).innerHTML = res.length ? `<div class="card" style="margin-top:8px">${res.map((r, i) => `<button class="cell" type="button" data-i="${i}"><span class="cell-ic t-orange">${I.pin}</span><span class="grow">${esc(r.label)}</span></button>`).join('')}</div>`
      : '<p class="hint bad">לא נמצאה כתובת כזו (חיפוש כתובת צריך אינטרנט). אפשר גם "אני בעבודה עכשיו".</p>';
    $$('#pl-res [data-i]', el).forEach(b => b.onclick = () => { const r = res[+b.dataset.i]; set({ lat: r.lat, lng: r.lng, label: r.label, radius: 300, on: true }); });
  });
}
var geoSent = '';
function syncGeo(force = false) {
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
/** The widget was tapped, or an arrival/departure notification. */
/** The home-screen widget mirrors the running shift. */
let lastWidget = '';
/** A theme colour as #RRGGBB, whatever form the stylesheet wrote it in. */
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
  // pay rate over the shift (regular → overtime → Shabbat…), so the widget can work out pay and status on its own
  let segs = [], thr = job?.regHours || 8.6;
  if (a) {
    const k = a.start + '|' + a.jobId + '|' + LANG;
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
    ['rega', '--g-money-a'], ['regb', '--g-money-b'], ['ot1a', '--g-ot-a'], ['ot1b', '--g-ot-b'], ['ot2a', '--g-hot-a'], ['ot2b', '--g-hot-b'], ['hub', '--g-acc-a']]
    .map(([k, v]) => [k, cssHex(v)]));
  const state = { active: !!a, start: a ? +new Date(a.start) : 0, job: job?.name || '', rate: +job?.rate || 0, rtl: document.documentElement.dir === 'rtl', segs,
    extra: { thr, ot1: job?.ot1Hours ?? 2, otOn: job?.otOn !== false, theme, month: { name: MONTHS[now.getMonth()], gross: money(M.gross), count: M.shifts.length } },
    labels: EN
      ? { idle: 'Not on shift', starts: 'Starts ', since: 'since ', perHour: 'per hour', toOt: 'Overtime in {t}', now: 'Now: ', shortReg: 'regular', shortOt: 'overtime',
          tapStart: 'Tap the dial to clock in', tapShort: 'Tap to start', gross: 'gross', shifts: 'shifts' }
      : { idle: 'לא במשמרת', starts: 'מתחילה ב־', since: 'מ־', perHour: 'לשעה', toOt: 'עוד {t} לשעות נוספות', now: 'עכשיו ', shortReg: 'רגילות', shortOt: 'נוספות',
          tapStart: 'נגיעה בחוגה כדי להתחיל', tapShort: 'נגיעה להתחלה', gross: 'ברוטו', shifts: 'משמרות' } };
  const k = JSON.stringify(state); if (k === lastWidget) return; lastWidget = k;
  native.appActions.updateWidget(state);
}
function appAction({ action, jobId }) {
  dbg.log('info', 'app action ' + action);
  if (action === 'toggle') {
    go('home');
    // a running shift: confirm before ending it. none: start on the last job.
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
/* ================= developer tools (Settings → tap the version 7 times) ================= */
function openDevTools() {
  const scen = {
    weekday: ['יום חול ארוך מ־08:00', () => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; }],
    friday: ['שישי מ־10:00, לתוך השבת', () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); d.setHours(10, 0, 0, 0); return d; }],
    current: ['המשמרת שרצה עכשיו', () => S.active ? new Date(S.active.start) : null],
  };
  let pick = S.active ? 'current' : 'friday', items = [];
  const jobId = S.active?.jobId || S.settings.lastJob;
  openSheet(`<div data-keep><h2>כלי פיתוח</h2><p class="shsub">לבדיקות בלבד. לא משנה את החישובים.</p>
    <div class="sec"><span>התראות</span></div>
    <div class="card">
      <button class="cell" id="dv-one"><span class="grow">התראה אחת לבדיקה<div class="sub">מגיעה בעוד 3 שניות</div></span></button>
      <button class="cell" id="dv-soon"><span class="grow">משמרת שמגיעה לשעות נוספות בעוד 2 דקות<div class="sub">מתחילה משמרת אמיתית שהתחילה מוקדם, וההתראה תגיע כרגיל</div></span></button>
      <button class="cell" id="dv-pend"><span class="grow">ההתראות שמתוזמנות עכשיו</span></button>
      <button class="cell" id="dv-geo-in"><span class="grow">התראת "הגעת לעבודה?" לבדיקה</span></button>
      <button class="cell" id="dv-geo-out"><span class="grow">התראת "יצאת מהעבודה?" לבדיקה</span></button>
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
    $('#dv-geo-in', root).onclick = () => geoTest('in');
    $('#dv-geo-out', root).onclick = () => geoTest('out');
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

/* ================= first open: welcome and job setup =================
   Four short steps, every one skippable. Nothing here is required: the defaults already work. */
/** Once, right after the welcome (or on the first start of this version): the phone's notification permission. */
async function askFirstPerms() {
  if (!native.NATIVE || S.settings.askedPerms) return;
  S.settings.askedPerms = true; persist();
  const ok = await native.notifyAllowed(true);
  dbg.log('info', 'notification permission: ' + (ok ? 'allowed' : 'not allowed'));
  planNotifications();
}
function openOnboarding() {
  const job = S.jobs[0];
  const d = { lang: LANG, name: job.name === 'העבודה שלי' ? '' : job.name, rate: job.rate, travel: job.travel || 0,
    weekDays: job.weekDays, otOn: job.otOn !== false, shabbatOn: job.shabbatOn !== false, city: S.settings.city };
  let step = 0;
  const el = document.createElement('div');
  el.id = 'onboard'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ob-title');
  document.body.appendChild(el);
  dbg.log('info', 'onboarding opened');
  const dots = () => `<div class="ob-dots" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  const yesNo = (k, on) => `<div class="seg" data-k="${k}"><button type="button" data-v="1" class="${on ? 'on' : ''}">כן</button><button type="button" data-v="0" class="${on ? '' : 'on'}">לא</button></div>`;
  const STEPS = [
    () => `<div class="ob-hero">${mark({ ink: 'var(--ink)', accent: 'var(--accent)' })}</div>
      <h1 id="ob-title">ברוכים הבאים לאצבע</h1>
      <p class="ob-sub">שמים אצבע כשנכנסים למשמרת, ושמים אצבע כשיוצאים. אצבע מחשבת את השכר לפי החוק: שעות נוספות, שבת, חגים ונסיעות.</p>
      <div class="field"><span>שפה</span><div class="seg" id="ob-lang">${LANGS.map(l => `<button type="button" data-l="${l.code}" class="${l.code === LANG ? 'on' : ''}" data-keep>${l.name}</button>`).join('')}</div></div>`,
    () => `<h1 id="ob-title">איפה את/ה עובד/ת?</h1>
      <p class="ob-sub">אפשר להוסיף עוד מקומות עבודה אחר כך בהגדרות.</p>
      <label class="field"><span>שם מקום העבודה</span><input class="input" id="ob-name" type="text" autocomplete="organization" placeholder="למשל: קפה רחביה" value="${esc(d.name)}"></label>
      <label class="field"><span>שכר לשעה (₪)</span><input class="input num" id="ob-rate" type="number" step="0.01" inputmode="decimal" value="${d.rate}"><p class="hint" id="ob-minw"></p></label>
      <label class="field"><span>נסיעות למשמרת (₪)</span><input class="input num" id="ob-travel" type="number" step="0.5" inputmode="decimal" value="${d.travel || ''}" placeholder="0"><p class="hint">אם המעסיק מחזיר נסיעות. אפשר להשאיר ריק.</p></label>`,
    () => `<h1 id="ob-title">איך נראה שבוע העבודה?</h1>
      <p class="ob-sub">זה קובע מתי מתחילות שעות נוספות. לא בטוח/ה? אפשר להשאיר את מה שמסומן.</p>
      <div class="field"><span>ימי עבודה בשבוע</span><div class="seg" data-k="weekDays"><button type="button" data-v="5" class="${d.weekDays === 5 ? 'on' : ''}">5 ימים</button><button type="button" data-v="6" class="${d.weekDays === 6 ? 'on' : ''}">6 ימים</button></div>
        <p class="hint">${d.weekDays === 5 ? 'שעות נוספות אחרי 8.6 שעות ביום (7.6 ביום חמישי).' : 'שעות נוספות אחרי 8 שעות ביום (7 ביום שישי).'}</p></div>
      <div class="field"><span>משלמים לך שעות נוספות (125% / 150%)?</span>${yesNo('otOn', d.otOn)}<p class="hint">מגיע לפי חוק. יש מקומות שלא משלמים; אם כך, כדאי לדעת כמה זה יוצא.</p></div>
      <div class="field"><span>משלמים תוספת על שבת וחגים?</span>${yesNo('shabbatOn', d.shabbatOn)}</div>
      <label class="field"><span>העיר שלך (לזמני כניסת ויציאת שבת)</span><select class="input" id="ob-city">${Object.keys(CITIES).map(c => `<option value="${c}"${c === d.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>`,
    () => `<div class="ob-hero">${mark({ ink: 'var(--ink)', accent: 'var(--accent)' })}</div>
      <h1 id="ob-title">הכל מוכן</h1>
      <p class="ob-sub">${esc(d.name || 'העבודה שלי')} · ₪${d.rate} לשעה${d.travel ? ` · נסיעות ₪${d.travel}` : ''} · שבוע של ${d.weekDays} ימים</p>
      <div class="card" style="margin-top:18px">
        <button class="cell" id="ob-import"><span class="cell-ic t-blue">${I.file}</span><span class="grow">יש לי משמרות מאפליקציה אחרת<div class="sub">ייבוא מקובץ Excel או CSV</div></span><span class="chev">${I.chevL}</span></button>
      </div>
      <p class="ob-note">${I.info}<span>כל זה ניתן לשינוי בכל רגע: הגדרות ← מקום העבודה.</span></p>`,
  ];
  const read = () => {
    const v = id => el.querySelector(id);
    if (step === 1) { d.name = v('#ob-name').value.trim(); d.rate = Math.max(0, +v('#ob-rate').value || 0); d.travel = Math.max(0, +v('#ob-travel').value || 0); }
    if (step === 2) d.city = v('#ob-city').value;
  };
  const finish = (andImport = false) => {
    read();
    Object.assign(job, { name: d.name || 'העבודה שלי', rate: d.rate || job.rate, travel: d.travel, weekDays: d.weekDays, otOn: d.otOn, shabbatOn: d.shabbatOn, chag: d.shabbatOn });
    if (d.weekDays === 6) Object.assign(job, { regHours: 8, shortHours: 7, shortDay: 5 });
    else Object.assign(job, { regHours: 8.6, shortHours: 7.6, shortDay: 4 });
    S.settings.city = d.city; S.settings.onboarded = true;
    commit();
    el.classList.add('out'); setTimeout(() => el.remove(), 250);
    dbg.log('info', 'onboarding done');
    setTimeout(askFirstPerms, 600);
    go('home');
    if (andImport) { go('set'); openFileImport(); }
    else toast('מוכן. שמים אצבע כדי להתחיל משמרת', 'ok');
  };
  const draw = () => {
    el.innerHTML = `<div class="ob-top">${step ? `<button class="ob-link" id="ob-back">${I.chevR} חזרה</button>` : '<span></span>'}${dots()}<button class="ob-link" id="ob-skip">${step === 3 ? '' : 'דילוג'}</button></div>
      <div class="ob-body">${STEPS[step]()}</div>
      <div class="ob-foot"><button class="btn primary" id="ob-next">${step === 0 ? 'מתחילים' : step === 3 ? 'לאפליקציה' : 'המשך'}</button></div>`;
    el.querySelector('.ob-body').scrollTop = 0;
    const $o = q => el.querySelector(q);
    $o('#ob-next').onclick = () => { read(); if (step === 3) return finish(); step++; draw(); };
    if ($o('#ob-back')) $o('#ob-back').onclick = () => { read(); step--; draw(); };
    $o('#ob-skip').onclick = () => { if (step < 3) { S.settings.onboarded = true; persist(); el.remove(); dbg.log('info', 'onboarding skipped'); setTimeout(askFirstPerms, 400); } };
    el.querySelectorAll('#ob-lang button').forEach(b => b.onclick = async () => { await setLang(b.dataset.l); d.lang = b.dataset.l; draw(); });
    el.querySelectorAll('.seg[data-k]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = g.dataset.k; d[k] = k === 'weekDays' ? +b.dataset.v : b.dataset.v === '1'; read(); draw(); buzz(8);
    }));
    if ($o('#ob-import')) $o('#ob-import').onclick = () => finish(true);
    const rate = $o('#ob-rate');
    if (rate) { const mw = () => { const r = +rate.value; $o('#ob-minw').textContent = r && r < MIN_WAGE_HOURLY ? `נמוך משכר המינימום (₪${MIN_WAGE_HOURLY} לשעה)` : ''; $o('#ob-minw').className = 'hint' + (r && r < MIN_WAGE_HOURLY ? ' bad' : ''); }; rate.oninput = mw; mw(); }
    const first = $o('#ob-name'); if (first && !d.name) setTimeout(() => first.focus(), 250);
  };
  draw();
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
function openDebug() {
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
/** Draws every screen off to the side and computes every shift, timing each step. */
function selfTest(out) {
  out.textContent = 'בודק…';
  setTimeout(() => {
    const res = [], keep = { view, viewY, viewM, sumView: S.ui.sumView };
    const t0 = performance.now();
    try { const P = computeAll(S.shifts, jobById, place()); let n = 0; for (const x of P.values()) n += x.pay > -1 ? 1 : 0; res.push(`pay ${n}/${S.shifts.length} ${Math.round(performance.now() - t0)}ms`); }
    catch (e) { res.push('pay FAIL ' + e.message); dbg.log('error', 'selftest pay: ' + e.message); }
    for (const v of ['home', 'shifts', 'sum', 'rights']) {
      const t = performance.now();
      try { view = v; RENDER[v](); res.push(`${v} ${Math.round(performance.now() - t)}ms`); }
      catch (e) { res.push(`${v} FAIL ${e.message}`); dbg.log('error', 'selftest ' + v + ': ' + e.message); }
    }
    for (const sv of ['weeks', 'year', 'month']) {
      const t = performance.now();
      try { S.ui.sumView = sv; view = 'sum'; renderSum(); res.push(`sum/${sv} ${Math.round(performance.now() - t)}ms`); }
      catch (e) { res.push(`sum/${sv} FAIL ${e.message}`); dbg.log('error', 'selftest sum ' + sv + ': ' + e.message); }
    }
    view = keep.view; viewY = keep.viewY; viewM = keep.viewM; S.ui.sumView = keep.sumView;
    try { RENDER[view](); } catch {}
    const txt = res.join(' · '); dbg.log('perf', 'selftest ' + txt);
    out.textContent = (res.some(r => r.includes('FAIL')) ? '✗ ' : '✓ ') + txt;
  }, 50);
}

/* ================= language ================= */
/** Switch language in place, without reloading. */
/** Switch language in place: load its pack, set direction, day/month names, and translate what's on screen. */
async function setLang(l, save = true) {
  const info = langInfo(l);
  const pack = preferPack(info.code, await loadPack(info.code).catch(() => null));   // built in, or a newer downloaded copy
  LANG = info.code; EN = LANG !== 'he'; PACK = pack;
  document.documentElement.lang = LANG; document.documentElement.dir = info.dir;
  DAYS = pack?.days || HE_DAYS; MONTHS = pack?.months || HE_MONTHS; DAY_SHORT = pack?.daysShort || HE_DAY_SHORT;
  stopTranslating(); usePack(pack);
  if (pack) startTranslating();
  // save only now: saving also updates the widget, which must get the new language's texts and direction
  if (save) { S.settings.lang = LANG; persist(); }
  render(); updateBackupDot();
  syncGeo(true); planNotifications(); syncWidget();   // texts the phone shows on its own follow the language
}

/* ================= router ================= */
const RENDER = { home: renderHome, shifts: renderShifts, sum: renderSum, rights: renderRights, set: renderSet };
function go(v) {
  dbg.log('tap', 'tab ' + v);
  view = v;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $$('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  $('#fab').classList.toggle('hidden', v !== 'shifts');
  scrollTo(0, 0);
  render();
}
function render() {
  // a screen that fails to draw shows what went wrong in its place; the rest of the app keeps working
  const v = view;
  try { dbg.timed('draw ' + v, RENDER[v]); } catch (e) { showFailure($('#v-' + v), e); }
  // the phone paints after this returns; mark it so a crash while painting is visible next time
  dbg.log('begin', 'paint ' + v);
  requestAnimationFrame(() => requestAnimationFrame(() => dbg.log('end', 'paint ' + v)));
  try {
    const now = new Date(), M = withLive(monthCalc(now.getFullYear(), now.getMonth()));
    countUp($('#barNet'), M.net.net);
    $('#brandMark').innerHTML = mark({ t: now, sw: 5.4 });
  } catch (e) { report(e); }
}

/* ---- problems: shown on screen with a copy button, never a dead page ---- */
const PROBLEMS = [];
function describe(e) { return ((e && (e.stack || e.message)) || String(e)).split('\n').slice(0, 4).join('\n'); }
function problemText() { return debugReport(); }
function report(e) {
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

/* ---- start: draw first, everything else after, and never let one failing step blank the app ---- */
const step = (name, fn) => { try { fn(); } catch (e) { (window.__etzbaErr || []).push(name + ': ' + (e && e.message)); console.error(name, e); } };
step('recompute', recompute);
step('render', render);
// (index.html starts in Hebrew if the last start in another language never finished)
if (LANG !== 'he') step('language', () => { setLang(LANG, false); });
step('langCheck', () => {
  let failed = null; try { failed = localStorage.getItem('etzba.langFailed'); localStorage.removeItem('etzba.langFailed'); } catch {}
  if (failed) {
    dbg.log('error', `language ${failed}: the last start didn't finish, back to Hebrew`);
    // what happened, to send to the developer (works without developer tools)
    let errs = ''; try { errs = localStorage.getItem('etzba.bootErr') || ''; } catch {}
    const report = [`language ${failed} failed to start · v${VERSION}`, errs || '(no error recorded: it stopped responding)', ...dbg.getLog().slice(-40).map(e => JSON.stringify(e)), navigator.userAgent].join('\n');
    setTimeout(() => toast('השפה הוחזרה לעברית בגלל תקלה. אפשר לנסות שוב בהגדרות', 'err', { label: 'העתקת פרטים', fn: () => copyText(report).then(() => toast('הועתק', 'ok')) }), 800);
  }
  // this start worked: clear the mark a few seconds after everything is drawn
  setTimeout(() => { try { localStorage.removeItem('etzba.langBoot'); } catch {} }, 4000);
});
window.__etzbaReady = true;
dbg.log('perf', 'ready', dbg.sinceStart());
step('crashNote', () => { const c = dbg.lastCrash(); if (c) { dbg.log('warn', 'last session ended during: ' + c.step); if (FEATURES.devTools) toast(`בפעם הקודמת האפליקציה נסגרה (${c.step}). פרטים באבחון`, 'err', { label: 'פרטים', fn: openDebug }); } });
step('debugHash', () => { if (!FEATURES.devTools) return; if (location.hash === '#debug') openDebug(); addEventListener('hashchange', () => { if (location.hash === '#debug') openDebug(); }); });
step('restore', async () => {
  // the WebView's storage came back empty but the app's own copy has data: bring it back
  if (!native.NATIVE || hadLocal) return;
  const json = await native.snapshot.load(); if (!json) return;
  let d; try { d = JSON.parse(json); } catch (e) { dbg.log('error', 'snapshot unreadable'); return; }
  if (!d || !Array.isArray(d.shifts) || (!d.shifts.length && !d.active)) return;
  S = normalizeState(d); try { localStorage.setItem(KEY, json); } catch {}
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
  if (sheet.classList.contains('on')) { closeSheet(); return true; }
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
    const b = e.target.closest('[data-n="open"], [data-n="exact"]'); if (!b) return;
    (b.dataset.n === 'open' ? native.openNotificationSettings() : native.openExactSettings());
  });
});
step('rules', () => {
  // newer yearly figures from the internet (once a day at most); everything works without them
  const changed = () => { recompute(); render(); toast('עודכנו נתוני השכר והחגים', 'ok'); };
  // and the language pack: fixed translations arrive without a new app release
  const packChanged = () => { if (LANG !== 'he') setLang(LANG, false); };
  const both = () => { checkForUpdates(changed); checkPack(LANG, packChanged); };
  both();
  addEventListener('online', both);
});
step('geo', () => { syncGeo(true); native.appActions.onAction(appAction); syncWidget(); });
step('meter', () => { try { if (localStorage.getItem('etzba.meter') === '1') dbg.setMeter(true); } catch {} });
step('backupDot', updateBackupDot);
setInterval(() => { tickHome(false); if (new Date().getSeconds() === 0) { renderRestCard(); $('#brandMark').innerHTML = mark({ t: new Date(), sw: 5.4 }); } }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); planNotifications(); } });

/* Offline cache for the website version. Inside an embedded frame service workers aren't allowed,
   so any old one is removed there instead. The Android app has everything built in and needs none. */
const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
try {
  if (!native.NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    if (framed) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    else navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
} catch {}
