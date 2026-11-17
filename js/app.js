// אצבע — app
import { grossToNet } from './net-pay.js';
import { computeAll, shiftPay, defaultJob, normalizeJob, holidayPayDays, shiftKind, KIND_NAME, TIERS, TIER_NAME, MIN_WAGE_HOURLY, weekStart, jobAt, applyRulesFrom, rulesChanged } from './pay-engine.js';
import { readSheets } from './file-reader.js';
import { rowsToShifts, guessYear } from './shift-import.js';
import { CITIES, nextRest, restWindows, holidaysOfGregorianYear } from './hebrew-calendar.js';
import { I, mark, ridges, handAngles } from './svg-icons.js';
import { usePack, startTranslating, stopTranslating } from './translate.js';
import { LANGS, loadPack, langInfo } from '../languages/index.js';
import * as dbg from './diagnostics.js';
import * as native from './native-bridge.js';

const VERSION = '1.21';
dbg.log('boot', 'v' + VERSION);

/* ================= state ================= */
const KEY = 'etzba.v1', OLD_KEY = 'shifts.v1';
function fresh() {
  const job = defaultJob('העבודה שלי');
  return {
    settings: { city: 'תל אביב', candleMin: 20, havdalahMin: 40, sex: 2.25, extraPts: 0, pension: true, pEmp: 6, pEr: 6.5, sev: 8.33, hish: false, theme: 'auto', lang: 'he', lastJob: job.id },
    jobs: [job], shifts: [], active: null, ui: {},
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
  d.ui = { sort: 'new', filter: 'all', ...(d.ui || {}) };
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
}
applyTheme(); darkMQ.addEventListener?.('change', applyTheme);
let PAY = new Map();
const persist = () => { invalidate(); S.updatedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); localOk = true; } catch {
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
const tierLabel = (k, job) => `${TIER_NAME[k]} ${job.r[k]}%`;

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
function monthCalcRaw(y, m) {
  const shifts = [...inMonth(y, m)];
  const per = new Map();
  let gross = 0, hours = 0;
  const J0 = job => ({ job, hours: 0, b: {}, money: {}, travel: 0, bonus: 0, count: 0, holiday: 0, holDays: [] });
  const monthEnd = new Date(y, m + 1, 0, 23, 59);
  for (const s of shifts) {
    const job = jobAt(jobById(s.jobId), monthEnd), p = PAY.get(s.id); if (!p) continue;
    const J = per.get(job.id) || J0(job);
    J.hours += p.hours; J.travel += p.travel; J.bonus += p.bonus; J.count++;
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
  for (const J of per.values()) J.total = Object.values(J.money).reduce((a, b) => a + b, 0) + J.travel + J.bonus + J.holiday;
  const st = S.settings;
  const net = grossToNet(gross, { points: +st.sex + +st.extraPts, pension: st.pension, pEmp: +st.pEmp, pEr: +st.pEr, sev: +st.sev, hish: st.hish });
  return { y, m, shifts, perJob: [...per.values()], gross, hours, net };
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
  return { job, p: shiftPay({ start: a.start, end: new Date(), breakMin: 0 }, job, place(), weekRegBefore(job, a.start)) };
}

/* ================= sheets ================= */
const sheet = $('#sheet'), scrim = $('#scrim');
function openSheet(html, mount) {
  dbg.log('tap', 'sheet: ' + (/<h2[^>]*>([^<]*)/.exec(html)?.[1] || '?'));
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.scrollTop = 0; sheet.style.transform = '';
  scrim.classList.add('on'); sheet.classList.add('on');
  mount?.(sheet);
}
function closeSheet() { scrim.classList.remove('on'); sheet.classList.remove('on'); sheet.style.transform = ''; }
scrim.onclick = closeSheet;
(() => { // swipe down to close
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', e => { if (sheet.scrollTop <= 0 && !e.target.closest('.wheel,.daystrip,.chips')) { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; } }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', () => { sheet.style.transition = ''; if (y0 != null && dy > 110) closeSheet(); else sheet.style.transform = ''; y0 = null; });
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
    p.otHours > 0.01 ? `<span class="pill ot">+${hm(p.otHours)} נוספות</span>` : '',
    p.restHours > 0.01 ? `<span class="pill rest">${esc(p.names[0])}</span>` : '',
    S.jobs.length > 1 ? `<span class="pill jobp" style="color:${job.color}">${esc(job.name)}</span>` : '',
  ].join('');
  return `<button class="srow" data-id="${s.id}">
    <span class="kic k-${k}" title="${KIND_NAME[k]}">${I[k]}</span>
    <span class="mid"><span class="t1">${DAYS[d.getDay()]} ${dShort(d)} ${pills}</span>
      <span class="t2 num tline"><bdi dir="ltr" class="trange">${tm(s.start)}–${tm(s.end)}</bdi><span class="tmore"> · ${KIND_NAME[k]}${s.note ? ' · ' + esc(s.note) : ''}</span></span></span>
    <span class="end"><span class="amt num">${money(p.pay)}</span><br><span class="t2 num">${hm(p.hours)} ש׳</span></span></button>`;
}
function bindRows(root) { $$('.srow', root).forEach(r => r.onclick = () => openShiftSheet(index().byId.get(r.dataset.id), 'edit')); }

/** Plain-language explanation of a shift's pay. */
function explain(sh, job, p) {
  const lines = TIERS.filter(k => p.b[k] > 0.004).map(k => `<div class="ln"><span class="l">${tierLabel(k, job)}<small class="num">${hm(p.b[k])} ש׳ × ${money2(p.rate * job.r[k] / 100)}</small></span><span class="v num">${money2(p.money[k])}</span></div>`);
  if (p.travel) lines.push(`<div class="ln"><span class="l">נסיעות</span><span class="v num">${money2(p.travel)}</span></div>`);
  if (p.bonus) lines.push(`<div class="ln"><span class="l">בונוס / טיפים</span><span class="v num">${money2(p.bonus)}</span></div>`);
  const why = [];
  const w = (ic, txt, bad) => why.push(`<div class="why${bad ? ' bad' : ''}">${I[ic]}<span>${txt}</span></div>`);
  const kind = p.isNight ? ' (משמרת לילה)' : p.isShort ? ` (יום ${DAYS[job.shortDay]} הוא היום המקוצר)` : '';
  if (p.restHours > 0.01) w(p.b.chag + p.b.chagOt1 + p.b.chagOt2 + p.b.elect + p.b.electOt1 + p.b.electOt2 > 0 ? 'chag' : 'shabbat', `${hm(p.restHours)} ש׳ בתוך ${esc(p.names.join(EN ? ' and ' : ' ו'))}${p.restStart ? ` (נכנס ב־${tm(p.restStart)})` : ''}, ולכן בתוספת.`);
  if (!p.otOn) w('info', 'שעות נוספות כבויות בהגדרות של העבודה הזו, אז כל השעות בתעריף הרגיל.');
  else if (p.otHours - p.weeklyOT > 0.01) w('ot', `מעבר ל־${hm(p.threshold)} ש׳ ביום${kind} משלמים שעות נוספות.`);
  else if (p.hours > 0 && p.otHours < 0.01) w('info', `שעות נוספות מתחילות רק אחרי ${hm(p.threshold)} ש׳ ביום${kind}, גם אם עבדת יותר ממה שתוכנן לך.`);
  if (p.weeklyOT > 0.01) w('ot', `עברת ${job.weeklyLimit} שעות רגילות השבוע, אז ${hm(p.weeklyOT)} ש׳ מהמשמרת נספרו כשעות נוספות.`);
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
      <div id="pTier"></div>
      ${multi ? `<div class="jobchips" id="jobChips">${S.jobs.map(j => `<button class="chip${j.id === (S.active?.jobId || S.settings.lastJob) ? ' on' : ''}" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${esc(j.name)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="tiles" id="tiles"></div>
    <div class="card rest-card" id="restCard" style="margin-top:12px"></div>
    <div class="sec"><span>משמרות אחרונות</span><button id="seeAll">לכל המשמרות</button></div>
    <div class="card" id="recent"></div>`;
  ridgeLens = null;
  $('#punchBtn').onclick = onPunch;
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
    $('#pLabel').textContent = `במשמרת מ־${tm(a.start)}${S.jobs.length > 1 ? ' · ' + job.name : ''}`;
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
    $('#pTier').innerHTML = `<span class="tier${isRest ? ' rest' : isOt ? ' ot' : ''}">${isRest ? (key.startsWith('chag') || key.startsWith('elect') ? I.chag : I.shabbat) : isOt ? I.ot : I.check}${txt}</span>`;
  } else {
    $('#pTime').textContent = tm(now);
    $('#pEarn').textContent = '';
    $('#pLabel').textContent = 'לוחצים על האצבע כדי להתחיל משמרת';
    punch.dataset.phase = 'idle'; setFill(0); tickHome.key = null;
    $('#punchBtn').setAttribute('aria-label', `לא במשמרת. לחיצה להתחלת משמרת · ${job.name}`);
    $('#pTier').innerHTML = S.jobs.length > 1 ? '' : `<span class="tier plain">${I.briefcase}${esc(job.name)} · ₪${job.rate} לשעה</span>`;
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
  const M = monthCalc(now.getFullYear(), now.getMonth());
  el.innerHTML = `
    <div class="today"><small>היום · ברוטו</small><b class="num">${money(tP)}</b><span class="num">${hm(tH)} ש׳</span></div>
    <button class="monthcell" id="mcell"><small>${MONTHS[now.getMonth()]} · ברוטו</small><b class="num">${money(M.gross + (L ? L.p.base : 0))}</b><span class="num">${M.shifts.length} משמרות</span></button>
    <div class="wkb"><div class="wkb-h"><b>השבוע</b><span class="num"><b>${hm(wH)}</b> מתוך ${lim} ש׳</span></div>
      <div class="wkb-days">${H.map((h, i) => `<div class="wkb-d${i === now.getDay() ? ' on' : ''}"><i style="height:${h / mx * 100}%"></i><em>${DAY_SHORT[i]}</em></div>`).join('')}</div>
      <div class="wkb-sub num">${wH > lim ? `${hm(wH - lim)} מעל המכסה השבועית` : `נשארו ${hm(lim - wH)} עד המכסה השבועית`}</div></div>`;
  $('#mcell', el).onclick = () => { viewY = now.getFullYear(); viewM = now.getMonth(); S.ui.sumView = 'month'; go('sum'); };
}
function onPunch() {
  const btn = $('#punchBtn');
  if (!S.active) {
    const jobId = S.settings.lastJob && S.jobs.some(j => j.id === S.settings.lastJob) ? S.settings.lastJob : S.jobs[0].id;
    S.active = { jobId, start: new Date().toISOString() };
    if (!persist()) { S.active = null; return; }
    buzz(35); askPersist();
    announce(`משמרת התחילה ב־${tm(S.active.start)}`);
    toast(`נכנסת למשמרת ב־${tm(S.active.start)}`, 'ok', { label: 'ביטול', fn: () => { S.active = null; persist(); renderHome(); toast('הכניסה בוטלה'); announce('הכניסה בוטלה'); } });
    renderHome();
  } else {
    buzz(15);
    const a = S.active, job = jobById(a.jobId);
    openShiftSheet({ id: null, jobId: a.jobId, start: a.start, end: new Date().toISOString(), breakMin: job.breakMin || 0, bonus: 0, note: '', rest: 'auto' }, 'end');
  }
}

/* ================= SHIFT SHEET ================= */
const HE_DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
let DAY_SHORT = HE_DAY_SHORT;
function commonShifts() {
  const m = new Map();
  for (const s of index().newest.slice(0, 300)) {   // recent habits are what matter
    if (new Date(s.start).getMinutes() % 5 || new Date(s.end).getMinutes() % 5) continue;
    const k = tm(s.start) + '–' + tm(s.end); m.set(k, (m.get(k) || 0) + 1);
  }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  for (const d of ['07:00–15:00', '15:00–23:00', '23:00–07:00']) if (!top.includes(d)) top.push(d);
  return top.slice(0, 4);
}
function openShiftSheet(sh, mode) {
  const job = jobById(sh.jobId);
  const st0 = new Date(sh.start), en0 = new Date(sh.end), today = new Date(); today.setHours(0, 0, 0, 0);
  const T = { date: new Date(st0.getFullYear(), st0.getMonth(), st0.getDate()), s: [st0.getHours(), st0.getMinutes()], e: [en0.getHours(), en0.getMinutes()], active: mode === 'end' ? 'e' : 's' };
  const mstep = [T.s[1], T.e[1]].every(x => x % 5 === 0) ? 5 : 1;
  const wheel = (id, n, st) => `<div class="wheel" id="w-${id}" data-step="${st}">${Array.from({ length: n / st }, (_, i) => `<div class="wi num" data-v="${i * st}">${pad(i * st)}</div>`).join('')}</div>`;
  const title = mode === 'end' ? 'סיום משמרת' : mode === 'new' ? 'משמרת חדשה' : 'עריכת משמרת';
  const sub = mode === 'end' ? `${esc(job.name)} · אם שכחת להחתים בזמן, אפשר לתקן את השעות.` : '';
  const d0 = new Date(Math.min(+today - 45 * 864e5, +T.date - 3 * 864e5)), d1 = new Date(Math.max(+today + 7 * 864e5, +T.date + 3 * 864e5));
  let days = '';
  for (let d = new Date(d1); d >= d0; d.setDate(d.getDate() - 1)) {
    const diff = Math.round((today - d) / 864e5);
    days += `<button type="button" class="day${d.getDay() === 6 ? ' sat' : ''}" data-d="${+d}"><small>${diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : DAY_SHORT[d.getDay()]}</small><b class="num">${d.getDate()}</b><em class="num">${MONTHS[d.getMonth()].slice(0, 3)}${EN ? '' : '׳'}</em></button>`;
  }
  openSheet(`
    <h2>${title}</h2>${sub ? `<p class="shsub">${sub}</p>` : ''}
    ${S.jobs.length > 1 ? `<div class="chips" id="f-jobs">${S.jobs.map(j => `<button type="button" class="chip" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${esc(j.name)}</button>`).join('')}</div>` : ''}
    <h3>יום</h3>
    <div class="daystrip" id="f-days">${days}</div>
    <h3>שעות · בחירה מהירה</h3>
    <div class="qchips" id="f-pre">${commonShifts().map(c => `<button type="button" class="num" dir="ltr" data-p="${c}">${c}</button>`).join('')}</div>
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
      <label class="field"><span>טיפים / בונוס (₪)</span><input class="input num" type="number" inputmode="decimal" id="f-bonus" value="${+sh.bonus || ''}" placeholder="0"></label>
      <label class="field"><span>נסיעות (₪)</span><input class="input num" type="number" step="0.5" inputmode="decimal" id="f-travel" value="${sh.travel ?? ''}" placeholder="${jobAt(job, sh.start).travel || 0}"></label>
    </div>
    <p class="hint" style="margin-top:-4px">ריק בנסיעות = לפי הגדרות העבודה</p>
    <label class="field"><span>הערה</span><input class="input" type="text" id="f-note" value="${esc(sh.note)}" placeholder="אופציונלי"></label>
    <details class="adv"><summary>${I.chevDown}שבת / חג ידני</summary>
      <div class="seg" id="f-rest" style="margin-top:10px">
        <button type="button" data-r="auto">אוטומטי</button><button type="button" data-r="yes">הכל בתוספת שבת</button><button type="button" data-r="no">בלי תוספת</button></div>
      <p class="hint">"אוטומטי" מחשב לפי זמני כניסת ויציאת שבת וחג בעיר שבחרת.</p></details>
    <div id="f-explain"></div>
    <div class="btnrow">
      <button class="btn ${mode === 'end' ? 'accent' : 'primary'}" id="f-save">${I.check}${mode === 'end' ? 'סיום ושמירה' : 'שמירה'}</button>
      ${mode === 'end' ? `<button class="btn soft" id="f-cont">חזרה, המשמרת ממשיכה</button><button class="btn danger" id="f-discard">${I.trash}מחיקת המשמרת</button><p class="hint" style="text-align:center">מחיקה: המשמרת לא נשמרת, כאילו לא נכנסת.</p>` : ''}
      ${mode === 'edit' ? `<button class="btn danger" id="f-del">${I.trash}מחיקה</button>` : ''}
    </div>`, root => {
    let rest = sh.rest || 'auto', jobId = sh.jobId;
    const IH = 44, W = { sh: [T.s, 0], sm: [T.s, 1], eh: [T.e, 0], em: [T.e, 1] };
    const setWheel = (id, smooth) => { const w = $('#w-' + id, root), [arr, i] = W[id]; w.scrollTo({ top: Math.round(arr[i] / +w.dataset.step) * IH, behavior: smooth ? 'smooth' : 'auto' }); };
    const read = () => {
      const st = new Date(T.date); st.setHours(T.s[0], T.s[1], 0, 0);
      const en = new Date(T.date); en.setHours(T.e[0], T.e[1], 0, 0);
      if (en < st) en.setDate(en.getDate() + 1);
      return { ...sh, jobId, start: st.toISOString(), end: en.toISOString(),
        breakMin: Math.max(0, +$('#f-break', root).value || 0), bonus: +$('#f-bonus', root).value || 0, note: $('#f-note', root).value.trim(), rest,
        travel: $('#f-travel', root).value === '' ? undefined : Math.max(0, +$('#f-travel', root).value || 0),
        forceRest: rest === 'yes' ? true : rest === 'no' ? false : undefined };
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
      $$('#f-bq button', root).forEach(b => b.classList.toggle('on', +b.dataset.b === s.breakMin));
      const pre = `${pad(T.s[0])}:${pad(T.s[1])}–${pad(T.e[0])}:${pad(T.e[1])}`;
      $$('#f-pre button', root).forEach(b => b.classList.toggle('on', b.dataset.p === pre));
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
    $$('#f-pre button', root).forEach(b => b.onclick = () => {
      const [a, z] = b.dataset.p.split('–').map(x => x.split(':').map(Number)); T.s[0] = a[0]; T.s[1] = a[1]; T.e[0] = z[0]; T.e[1] = z[1]; for (const id in W) setWheel(id, true); upd();
    });
    $$('#f-jobs .chip', root).forEach(b => b.onclick = () => { jobId = b.dataset.j; upd(); });
    $$('#f-rest button', root).forEach(b => b.onclick = () => { rest = b.dataset.r; upd(); });
    $$('#f-bq button', root).forEach(b => b.onclick = () => { $('#f-break', root).value = b.dataset.b; upd(); });
    $$('input', root).forEach(i => i.addEventListener('input', upd));
    upd();
    for (const id in W) setWheel(id, false);
    $('.day.on', root)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    $('#f-save', root).onclick = () => {
      const s = read(), len = new Date(s.end) - new Date(s.start);
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
    $('#f-discard', root) && ($('#f-discard', root).onclick = () => confirmBtn($('#f-discard', root), 'ללחוץ שוב כדי למחוק', () => { S.active = null; closeSheet(); commit(); toast('המשמרת נמחקה'); announce('המשמרת נמחקה'); }));
    $('#f-del', root) && ($('#f-del', root).onclick = () => confirmBtn($('#f-del', root), 'ללחוץ שוב כדי למחוק', () => { S.shifts = S.shifts.filter(x => x.id !== sh.id); closeSheet(); commit(); toast('נמחק'); }));
  });
}
function confirmBtn(btn, msg, fn) {
  if (btn.dataset.armed) return fn();
  btn.dataset.armed = '1'; btn.classList.add('armed'); const old = btn.innerHTML; btn.innerHTML = msg; buzz(20);
  setTimeout(() => { btn.dataset.armed = ''; btn.classList.remove('armed'); btn.innerHTML = old; }, 3000);
}

/* ================= SHIFTS ================= */
const FILTERS = [['all', 'הכל'], ['morning', 'בוקר'], ['noon', 'צהריים'], ['evening', 'ערב'], ['night', 'לילה'], ['rest', 'שבת וחג'], ['ot', 'עם נוספות']];
const SORTS = [['new', 'מהחדש לישן'], ['old', 'מהישן לחדש'], ['pay', 'הכי משתלמות'], ['hours', 'הכי ארוכות']];
function renderShifts() {
  const el = $('#v-shifts');
  if (!SORTS.some(x => x[0] === S.ui.sort)) S.ui.sort = 'new';
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
  if (!list.length) body = `<div class="card"><div class="empty"><div class="eic">${I.list}</div>${M.shifts.length ? 'אין משמרות שמתאימות לסינון' : 'אין משמרות בחודש הזה'}</div></div>`;
  else if (so === 'new' || so === 'old') {
    const groups = new Map();
    for (const s of list) { const k = +weekStart(s.start); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    for (const [k, arr] of groups) {
      const ws = new Date(k), we = new Date(k + 6 * 864e5);
      let wh = 0; for (const s of inWeek(k)) wh += PAY.get(s.id).hours;
      const lim = jobById(arr[0].jobId).weeklyLimit;
      body += `<div class="week-h"><span>שבוע ${dShort(ws)}–${dShort(we)}</span><span class="wk num${wh > lim ? ' over' : ''}">${hm(wh)} ש׳ מתוך ${lim}</span></div>
        <div class="card">${arr.map(shiftRow).join('')}</div>`;
    }
  } else body = `<div class="card" style="margin-top:12px">${list.map(shiftRow).join('')}</div>`;
  el.innerHTML = `<h1 class="title">משמרות</h1>${monthBar()}
    <div class="chips" id="fchips">${FILTERS.map(([k, n]) => `<button class="chip${f === k ? ' on' : ''}" data-f="${k}">${k !== 'all' && k !== 'ot' && k !== 'rest' ? I[k] : k === 'rest' ? I.shabbat : k === 'ot' ? I.ot : ''}${n}</button>`).join('')}</div>
    <div class="toolrow"><span class="num">${list.length} משמרות · ${hm(tot.h)} ש׳ · ${money(tot.p)}</span>
      <button class="sortbtn" id="sortBtn">${I.sort}${SORTS.find(x => x[0] === so)[1]}</button></div>
    ${body}`;
  bindMonthBar(el); bindRows(el);
  $$('#fchips .chip', el).forEach(c => c.onclick = () => { S.ui.filter = c.dataset.f; persist(); renderShifts(); });
  $('#sortBtn', el).onclick = () => openSheet(`<h2>מיון</h2><div class="card" style="margin-top:12px">${SORTS.map(([k, n]) =>
    `<button class="cell" data-s="${k}"><span class="grow">${n}</span>${so === k ? `<span style="width:20px;color:var(--accent)">${I.check}</span>` : ''}</button>`).join('')}</div>`, root =>
    $$('[data-s]', root).forEach(b => b.onclick = () => { S.ui.sort = b.dataset.s; persist(); closeSheet(); renderShifts(); }));
}

/* ================= SUMMARY (תלוש) ================= */
function sumMonth(el) {
  const M = monthCalc(viewY, viewM), n = M.net;
  const ded = n.tax + n.ni + n.health + n.pEmp + n.hEmp;
  const parts = [[n.net, 'var(--hero-net)', 'נטו'], [n.tax, 'var(--accent)', 'מס הכנסה'], [n.ni + n.health, 'var(--gold)', 'ביטוח לאומי ובריאות'], [n.pEmp + n.hEmp, 'var(--ink3)', 'חיסכון (פנסיה)']].filter(x => x[0] > 0);
  const L = (l, v, cls = '', sub = '') => `<div class="ln ${cls}"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
  const hol = holidaysOfGregorianYear(viewY).filter(h => h.date.getMonth() === viewM);
  el.innerHTML = `${monthBar()}
    <div class="card hero" style="margin-top:12px"><small>נטו משוער ל${MONTHS[viewM]}<span class="estimate">הערכה</span></small><div class="big num">${money(n.net)}</div>
      <div class="meta num">${M.shifts.length} משמרות · ${hm(M.hours)} שעות · ברוטו ${money(M.gross)}</div>
      ${M.gross ? `<div class="stack">${parts.map(([v, c]) => `<span style="flex:${v};background:${c}"></span>`).join('')}</div>
      <div class="legend">${parts.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>` : ''}</div>
    ${M.gross ? `
    <div class="sec"><span>לפי ימים</span></div>
    <div class="card pad">${metricSeg()}<div id="dayChart"></div></div>
    <div class="sec"><span>איך זה מחושב</span></div>
    <div class="card steps">
      ${L('עבדת', hm(M.hours) + ' ש׳')}
      ${L('הרווחת ברוטו', money(M.gross), '', 'לפני ניכויים, כולל שעות נוספות, תוספות ונסיעות')}
      ${L('מס הכנסה', n.tax ? '−' + money(n.tax) : '₪0', n.tax ? 'neg' : '', n.tax ? `אחרי ${(+S.settings.sex + +S.settings.extraPts)} נקודות זיכוי (${money(n.pointsCredit)})` : 'נקודות הזיכוי מכסות את כל המס')}
      ${L('ביטוח לאומי ובריאות', '−' + money(n.ni + n.health), 'neg', 'יורד מכל שכר')}
      ${n.pEmp + n.hEmp ? L('חיסכון לפנסיה' + (n.hEmp ? ' והשתלמות' : ''), '−' + money(n.pEmp + n.hEmp), 'neg', 'הכסף נשאר שלך, בקרן') : ''}
      ${L('נכנס לחשבון', money(n.net), 'tot money')}
    </div>
    <div class="sec"><span>פירוט שעות ותוספות</span></div>
    ${M.perJob.map(J => `<div class="card">
      ${S.jobs.length > 1 ? `<div class="ln"><span class="l" style="color:${J.job.color};font-weight:700">${esc(J.job.name)}</span><span class="v num">₪${J.job.rate}/ש׳</span></div>` : ''}
      ${TIERS.filter(k => J.b[k] > 0.004).map(k => L(tierLabel(k, J.job), money2(J.money[k]), '', `${hm(J.b[k])} ש׳`)).join('')}
      ${J.travel ? L('נסיעות', money2(J.travel), '', `${J.count} משמרות`) : ''}
      ${J.bonus ? L('טיפים ובונוסים', money2(J.bonus)) : ''}
      ${J.holiday ? L('דמי חגים', money2(J.holiday), '', J.holDays.map(h => h.name).join(', ')) : ''}
      ${L('סה״כ ברוטו', money2(J.total), 'tot')}</div>`).join('')}
    <div class="sec"><span>מה המעסיק מפריש בנוסף</span></div>
    <div class="card">
      ${n.employer.pension ? L('פנסיה (מעסיק)', money(n.employer.pension)) + L('פיצויים', money(n.employer.severance)) : ''}
      ${n.employer.hish ? L('קרן השתלמות (מעסיק)', money(n.employer.hish)) : ''}
      ${L('ביטוח לאומי (מעסיק)', money(n.employer.bl))}
      ${L('עלות המעסיק בסה״כ', money(n.cost), 'tot')}</div>` : `<div class="card" style="margin-top:12px"><div class="empty"><div class="eic">${I.receipt}</div>אין משמרות בחודש הזה</div></div>`}
    ${hol.length ? `<div class="sec"><span>חגים החודש</span></div><div class="card">${hol.map(h => L(h.name, `${DAYS[h.dow]} ${dShort(h.date)}`, '', h.dow === 6 ? 'חל בשבת' : '')).join('')}</div>` : ''}
    <div class="sec"><span>ייצוא</span></div>
    <div class="card">
      <button class="cell" id="xMonth"><span class="cell-ic">${I.file}</span><span class="grow">משמרות ${MONTHS[viewM]} (CSV)<div class="sub">נפתח באקסל ובגוגל שיטס</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="xMore"><span class="cell-ic">${I.download}</span><span class="grow">עוד אפשרויות ייצוא</span><span class="chev">${I.chevL}</span></button>
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
  $('#xMore', el).onclick = openExport;
}

/* ================= STATS ================= */
const GROUPS = ['רגיל', 'נוספות', 'שבת וחג'];
function agg(list) {
  const A = { h: [0, 0, 0], m: [0, 0, 0], hours: 0, gross: 0, count: 0 };
  for (const s of list) {
    const p = PAY.get(s.id); if (!p) continue;
    for (const k of TIERS) { const g = /^(rest|chag|elect)/.test(k) ? 2 : /^ot/.test(k) ? 1 : 0; A.h[g] += p.b[k]; A.m[g] += p.money[k]; }
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
    <div class="c-plot" dir="ltr"><div class="c-grid">${[1, .5, 0].map(f => `<span style="bottom:${f * 100}%"><em class="num">${fmt(max * f)}</em></span>`).join('')}</div>
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
    <div class="sec"><span>${N} שבועות אחרונים</span></div>
    <div class="card pad">${metricSeg()}<div id="wkChart"></div></div>
    <div class="sec"><span>פירוט</span></div>
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
    <div class="sec"><span>לפי חודשים</span></div>
    <div class="card pad">${metricSeg()}<div id="yrChart"></div></div>
    <div class="sec"><span>חלוקת השעות בשנה</span></div>
    <div class="card pad"><div class="split">${H.map((v, j) => v > 0.004 ? `<i class="cg${j}" style="flex:${v}"></i>` : '').join('')}</div>
      ${GROUPS.map((g, j) => `<div class="ln flat"><span class="l"><i class="dotc cg${j}"></i>${g}</span><span class="v num">${hm(H[j])} ש׳ · ${T.hours ? Math.round(H[j] / T.hours * 100) : 0}%</span></div>`).join('')}</div>
    <div class="sec"><span>חודשים</span></div>
    <div class="card">${Ms.map((M, m) => M.shifts.length || M.gross ? `<button class="cell" data-gm="${m}"><span class="grow">${MONTHS[m]}<div class="sub num">${M.shifts.length} משמרות · ${hm(M.hours)} ש׳</div></span><span class="val num" style="text-align:end;color:var(--ink)"><b>${money(M.gross)}</b><div class="sub">נטו ${money(M.net.net)}</div></span><span class="chev">${I.chevL}</span></button>` : '').join('')}</div>
    <div class="card" style="margin-top:12px"><button class="cell" id="xYear"><span class="cell-ic">${I.file}</span><span class="grow">ייצוא סיכום חודשי (CSV)</span><span class="chev">${I.chevL}</span></button></div>`
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
      <p>יום הבחירות לכנסת (<b>27.10.2026</b>) הוא יום שבתון. מי שעובד אצל אותו מעסיק לפחות 14 ימים ברציפות מקבל עליו שכר מלא גם בלי לעבוד.</p>
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
    ${low.map(j => `<div class="note">${I.warn}<span>The wage at "${esc(j.name)}" (₪${j.rate}) is below minimum wage, ₪${MIN_WAGE_HOURLY} an hour since 1.4.2026.</span></div>`).join('')}
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
      <p>Knesset election day (<b>27.10.2026</b>) is a day off by law. If you’ve worked for the same employer for at least 14 days in a row, you’re paid for it even without working.</p>
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
function renderSet() {
  const el = $('#v-set'), st = S.settings;
  const sw = (id, on) => `<span class="switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><i></i></span>`;
  el.innerHTML = `<h1 class="title">הגדרות</h1>
    <div class="sec"><span>מקומות עבודה</span></div>
    <div class="card">${S.jobs.map(j => `<button class="cell" data-job="${j.id}"><span class="cell-ic" style="color:${j.color}">${I.briefcase}</span>
      <span class="grow">${esc(j.name)}<div class="sub num">₪${j.rate} לשעה · שבוע של ${j.weekDays} ימים${j.restMode === 'fixed' ? ' · שבת לפי חוזה' : ''}</div></span><span class="chev">${I.chevL}</span></button>`).join('')}
      <button class="cell" id="addJob"><span class="cell-ic">${I.plus}</span><span class="grow" style="color:var(--accent);font-weight:600">הוספת מקום עבודה</span></button></div>

    <div class="sec"><span>מראה</span></div>
    <div class="card pad"><div class="themes" id="s-theme">${[['auto', 'אוטומטי', 'linear-gradient(90deg,#F1EEE6 50%,#141518 50%)'], ['light', 'בהיר', '#F1EEE6'], ['dark', 'כהה', '#141518'], ['blurple', 'בלרפל', 'linear-gradient(90deg,#1E1F22 60%,#5865F2 60%)']].map(([k, n, bg]) => `<button data-t="${k}" class="${(st.theme || 'auto') === k ? 'on' : ''}"><i style="background:${bg}"></i>${n}</button>`).join('')}</div>
      <div class="field"><span>שפה</span><div class="seg" id="s-lang">${LANGS.map(l => `<button data-l="${l.code}" class="${l.code === LANG ? 'on' : ''}" data-keep>${l.name}</button>`).join('')}</div></div></div>

    <div class="sec"><span>זמני שבת וחג</span></div>
    <div class="card">
      <label class="cell"><span class="cell-ic">${I.pin}</span><span class="grow">עיר</span>
        <select class="val" id="s-city" style="border:0;background:none;text-align:end;font-weight:600">${Object.keys(CITIES).map(c => `<option value="${c}"${c === st.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="cell"><span class="cell-ic">${I.shabbat}</span><span class="grow">הדלקת נרות<div class="sub">דקות לפני השקיעה</div></span>
        <input class="input num" style="width:76px;height:44px;text-align:center" type="number" id="s-candleMin" value="${st.candleMin}"></label>
      <label class="cell"><span class="cell-ic">${I.night}</span><span class="grow">צאת שבת<div class="sub">דקות אחרי השקיעה</div></span>
        <input class="input num" style="width:76px;height:44px;text-align:center" type="number" id="s-havdalahMin" value="${st.havdalahMin}"></label>
    </div>

    <div class="sec"><span>מס ונטו</span></div>
    <div class="card pad">
      <div class="seg" id="s-sex"><button data-v="2.25">גבר · 2.25 נק׳</button><button data-v="2.75">אישה · 2.75 נק׳</button></div>
      <label class="field"><span>נקודות זיכוי נוספות</span><input class="input num" type="number" step="0.25" inputmode="decimal" id="s-extraPts" value="${st.extraPts}">
        <p class="hint">למשל: ילדים, תואר אקדמי, חייל/ת משוחרר/ת, צעירים עד גיל 23. אפשר לבדוק בטופס 101.</p></label>
    </div>
    <div class="card">
      <label class="cell"><span class="grow">פנסיה<div class="sub">לעובד שעתי בדרך כלל אחרי 6 חודשים</div></span>${sw('s-pension', st.pension)}</label>
      <div class="cell ${st.pension ? '' : 'hidden'}" id="penRow"><span class="grow">עובד / מעסיק / פיצויים %</span>
        <input class="input num" style="width:64px;height:44px;text-align:center;padding:0 4px" type="number" step="0.5" id="s-pEmp" value="${st.pEmp}">
        <input class="input num" style="width:64px;height:44px;text-align:center;padding:0 4px" type="number" step="0.5" id="s-pEr" value="${st.pEr}">
        <select class="input num" style="width:76px;height:44px" id="s-sev"><option${+st.sev === 8.33 ? ' selected' : ''}>8.33</option><option${+st.sev === 6 ? ' selected' : ''}>6</option></select></div>
      <label class="cell"><span class="grow">קרן השתלמות<div class="sub">2.5% עובד · 7.5% מעסיק</div></span>${sw('s-hish', st.hish)}</label>
    </div>

    <div class="sec"><span>נתונים וגיבוי</span></div>
    ${backupDue() ? `<div class="note" style="margin-bottom:10px">${I.warn}<span>${S.settings.lastBackup ? `הגיבוי האחרון לפני ${Math.floor((Date.now() - new Date(S.settings.lastBackup)) / 864e5)} ימים.` : 'עוד לא גיבית.'} יש ${S.shifts.length} משמרות שקיימות רק בטלפון הזה.</span></div>` : ''}
    <div class="card">
      <button class="cell" id="s-backup"><span class="cell-ic">${I.download}</span><span class="grow">גיבוי מלא עכשיו<div class="sub">${S.settings.lastBackup ? 'גיבוי אחרון: ' + dFull(S.settings.lastBackup) : 'עוד לא גיבית'}</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-import"><span class="cell-ic">${I.file}</span><span class="grow">שחזור או העברה מטלפון אחר<div class="sub">מציג מה בקובץ לפני שמשנים משהו</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-fimport"><span class="cell-ic">${I.list}</span><span class="grow">ייבוא משמרות מקובץ<div class="sub">Excel או CSV, גם מאפליקציות אחרות</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-export"><span class="cell-ic">${I.receipt}</span><span class="grow">ייצוא ל־CSV<div class="sub">לאקסל או לגוגל שיטס</div></span><span class="chev">${I.chevL}</span></button>
    </div>
    <div class="note info" style="margin-top:10px" id="storeNote">${storeNote()}</div>
    <div class="card" style="margin-top:12px"><button class="cell" id="s-debug"><span class="cell-ic">${I.info}</span><span class="grow">אבחון ותקלות<div class="sub">${dbg.lastCrash() ? 'האפליקציה נסגרה בפעם הקודמת · פרטים כאן' : 'מידע טכני לשליחה כשמשהו לא עובד'}</div></span><span class="chev">${I.chevL}</span></button></div>
    <p class="fine"><b>אצבע</b> · גרסה ${VERSION}<br>An Edvin Studios Project</p>`;
  $$('[data-job]', el).forEach(b => b.onclick = () => openJobSheet(jobById(b.dataset.job), false));
  $('#addJob', el).onclick = () => { const j = defaultJob('עבודה ' + (S.jobs.length + 1)); j.color = COLORS[S.jobs.length % COLORS.length]; openJobSheet(j, true); };
  const set = (k, v) => { S.settings[k] = v; commit(); };
  $('#s-city', el).onchange = e => { S.settings.candleMin = CITIES[e.target.value][2]; set('city', e.target.value); };
  for (const k of ['candleMin', 'havdalahMin', 'extraPts', 'pEmp', 'pEr', 'sev']) $('#s-' + k, el).onchange = e => set(k, +e.target.value || 0);
  for (const k of ['pension', 'hish']) $('#s-' + k, el).onchange = e => set(k, e.target.checked);
  $$('#s-sex button', el).forEach(b => { b.classList.toggle('on', +b.dataset.v === +st.sex); b.onclick = () => set('sex', +b.dataset.v); });
  $$('#s-theme button', el).forEach(b => b.onclick = () => { S.settings.theme = b.dataset.t; applyTheme(); commit(); });
  $$('#s-lang button', el).forEach(b => b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); });
  $('#s-export', el).onclick = openExport;
  $('#s-import', el).onclick = openImport;
  $('#s-debug', el).onclick = openDebug;
  $('#s-backup', el).onclick = () => backupNow();
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
        <div class="field"><span>לאיזה מקום עבודה</span><div class="chips" id="fi-job" style="padding-top:0">${S.jobs.map(j => `<button type="button" class="chip${j.id === jid ? ' on' : ''}" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${esc(j.name)}</button>`).join('')}<button type="button" class="chip${jid === '__new' ? ' on' : ''}" data-j="__new">${I.plus}חדש</button></div>
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
      <details class="adv"><summary>${I.chevDown}יום מקוצר, מכסה שבועית ולילה</summary>
        <div class="grid2">${K('weeklyLimit', 'מכסה שבועית (שעות)', 0.5)}${K('shortHours', 'שעות ביום המקוצר')}</div>
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
    ${rule('elect', 'chag', 'check', 'יום הבחירות', 'עבודה ביום הבחירות לכנסת (27.10.2026)', 'election', `
      <div class="grid3">${R('elect', 'שעה ביום בחירות')}<span class="otx">${R('electOt1', 'נוספות א׳')}</span><span class="otx">${R('electOt2', 'נוספות ב׳')}</span></div>
      <p class="hint">הנוהג המקובל: 200%, ובשעות נוספות 250% ו־300%. יש מקומות שמשלמים במקום זה שכר רגיל ויום חופש אחר.</p>`)}
    <div class="rule"><label class="rule-h"><span class="kic k-evening">${I.receipt}</span><span class="grow"><b>דמי חגים</b><div class="sub">תשלום על חג שלא עבדת בו (אחרי 3 חודשים)</div></span>${SW('holidayPay', j.holidayPay)}</label>
      <div class="rule-b" id="hp-body">${K('holidayPayHours', 'שעות לתשלום על יום חג', 0.5)}</div></div>

    <h3>הפסקה קבועה</h3>
    <div class="qchips" id="j-brk">${[0, 15, 30, 45, 60].map(b => `<button type="button" data-b="${b}">${b ? b + ' דק׳' : 'בלי'}</button>`).join('')}</div>
    <p class="hint">תיכנס אוטומטית לכל משמרת, ואפשר לשנות בכל משמרת.</p>
    <div class="grid2">
      <label class="field"><span>החזר נסיעות למשמרת (₪)</span><input class="input num" type="number" step="0.5" inputmode="decimal" data-k="travel" value="${j.travel}"></label>
      ${R('reg', 'אחוז שעה רגילה')}
    </div>
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
      $('#j-fixed', root).classList.toggle('hidden', j.restMode !== 'fixed');
      const ot = v('otOn').checked;
      $('#rule-ot', root).classList.toggle('off', !ot);
      $('#rule-shab', root).classList.toggle('off', !v('shabbatOn').checked);
      $('#rule-chag', root).classList.toggle('off', !v('chag').checked);
      $('#rule-elect', root).classList.toggle('off', !v('election').checked);
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
    $$('#j-week button', root).forEach(b => b.onclick = () => {
      j.weekDays = +b.dataset.w; const five = j.weekDays === 5;
      v('regHours').value = five ? 8.6 : 8; v('shortHours').value = five ? 7.6 : 7; v('shortDay').value = five ? 4 : 5; ui();
    });
    $$('input,select', root).forEach(i => i.addEventListener('input', ui));
    ui();
    $('#j-save', root).onclick = () => {
      j.name = v('name').value.trim() || 'עבודה';
      for (const k of ['rate', 'travel', 'regHours', 'shortHours', 'shortDay', 'ot1Hours', 'weeklyLimit', 'nightRegHours', 'holidayPayHours']) j[k] = +v(k).value || 0;
      for (const k of ['otOn', 'shabbatOn', 'chag', 'election', 'holidayPay', 'weeklyRule', 'nightRule']) j[k] = v(k).checked;
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
const CSV_TIER = { reg: 'שעות רגילות', ot1: 'שעות נוספות א׳', ot2: 'שעות נוספות ב׳', rest: 'שעות שבת', restOt1: 'שבת נוספות א׳', restOt2: 'שבת נוספות ב׳', chag: 'שעות חג', chagOt1: 'חג נוספות א׳', chagOt2: 'חג נוספות ב׳' , elect: 'שעות יום בחירות', electOt1: 'יום בחירות נוספות א׳', electOt2: 'יום בחירות נוספות ב׳' };
function shiftsCSV(list) {
  const head = ['תאריך', 'יום', 'מקום עבודה', 'סוג משמרת', 'כניסה', 'יציאה', 'תאריך יציאה', 'הפסקה (דקות)', 'שעות לתשלום',
    ...TIERS.map(k => CSV_TIER[k]), 'מתוכן נוספות שבועיות', 'שבת/חג (שם)', 'תעריף לשעה', 'שכר על שעות', 'נסיעות', 'טיפים/בונוס', 'סה״כ ברוטו', 'הערה'];
  const rows = [head], T = new Array(head.length).fill(0), n = TIERS.length;
/* translations: skip-end */
  const sumCols = [8, ...TIERS.map((_, i) => 9 + i), 9 + n, 12 + n, 13 + n, 14 + n, 15 + n];
  for (const s of [...list].sort((a, b) => new Date(a.start) - new Date(b.start))) {
    const p = PAY.get(s.id), job = jobById(s.jobId), d = new Date(s.start);
    const r = [dFull(s.start), DAYS[d.getDay()], job.name, KIND_NAME[shiftKind(s, p)], tm(s.start), tm(s.end), dFull(s.end), +s.breakMin || 0, n2(p.hours),
      ...TIERS.map(k => n2(p.b[k])), n2(p.weeklyOT), p.names.join(' / '), n2(p.rate), n2(p.base), n2(p.travel), n2(p.bonus), n2(p.pay), s.note || ''];
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
      <button class="cell" data-x="month"><span class="cell-ic">${I.file}</span><span class="grow">משמרות ${MONTHS[viewM]} ${viewY}<div class="sub">כל משמרת בשורה, עם שורת סיכום</div></span></button>
      <button class="cell" data-x="all"><span class="cell-ic">${I.list}</span><span class="grow">כל המשמרות<div class="sub">${S.shifts.length} משמרות</div></span></button>
      <button class="cell" data-x="sum"><span class="cell-ic">${I.receipt}</span><span class="grow">סיכום לפי חודשים<div class="sub">ברוטו, ניכויים ונטו לכל חודש</div></span></button>
      <button class="cell" data-x="backup"><span class="cell-ic">${I.download}</span><span class="grow">גיבוי מלא (JSON)<div class="sub">להעברה לטלפון אחר</div></span></button>
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
  return `${I.info}<span>הנתונים נשמרים <b>רק בטלפון הזה</b>, בלי חשבון ובלי שרת. מחיקת האפליקציה או ניקוי נתוני האתר בדפדפן מוחקים אותם. כדי לעבור לטלפון חדש: גיבוי מלא כאן, ואז "שחזור" בטלפון החדש. <span id="persistLine"></span></span>`;
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

/* ================= first open: welcome and job setup =================
   Four short steps, every one skippable. Nothing here is required: the defaults already work. */
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
      <p class="ob-sub">לוחצים על האצבע כשנכנסים למשמרת, ושוב כשיוצאים. אצבע מחשבת את השכר לפי החוק: שעות נוספות, שבת, חגים ונסיעות.</p>
      <div class="field"><span>שפה</span><div class="seg" id="ob-lang">${LANGS.map(l => `<button type="button" data-l="${l.code}" class="${l.code === LANG ? 'on' : ''}" data-keep>${l.name}</button>`).join('')}</div></div>
      <p class="ob-note">${I.lock}<span>הכל נשמר רק בטלפון שלך. אין חשבון ואין שרת.</span></p>`,
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
        <button class="cell" id="ob-import"><span class="cell-ic">${I.file}</span><span class="grow">יש לי משמרות מאפליקציה אחרת<div class="sub">ייבוא מקובץ Excel או CSV</div></span><span class="chev">${I.chevL}</span></button>
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
    go('home');
    if (andImport) { go('set'); openFileImport(); }
    else toast('מוכן. לוחצים על האצבע כדי להתחיל משמרת', 'ok');
  };
  const draw = () => {
    el.innerHTML = `<div class="ob-top">${step ? `<button class="ob-link" id="ob-back">${I.chevR} חזרה</button>` : '<span></span>'}${dots()}<button class="ob-link" id="ob-skip">${step === 3 ? '' : 'דילוג'}</button></div>
      <div class="ob-body">${STEPS[step]()}</div>
      <div class="ob-foot"><button class="btn primary" id="ob-next">${step === 0 ? 'מתחילים' : step === 3 ? 'לאפליקציה' : 'המשך'}</button></div>`;
    el.querySelector('.ob-body').scrollTop = 0;
    const $o = q => el.querySelector(q);
    $o('#ob-next').onclick = () => { read(); if (step === 3) return finish(); step++; draw(); };
    if ($o('#ob-back')) $o('#ob-back').onclick = () => { read(); step--; draw(); };
    $o('#ob-skip').onclick = () => { if (step < 3) { S.settings.onboarded = true; persist(); el.remove(); dbg.log('info', 'onboarding skipped'); } };
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
      <button class="cell" id="d-copy"><span class="cell-ic">${I.file}</span><span class="grow">העתקת דוח אבחון</span></button>
      <button class="cell" id="d-save"><span class="cell-ic">${I.download}</span><span class="grow">שמירת הדוח כקובץ</span></button>
    </div>
    <div class="sec"><span>המכשיר</span></div>
    <div class="card pad">${row('גרסה', VERSION)}${row('רץ ב־', e.where)}${row('דפדפן', e.webview)}${row('מסך', e.screen)}${row('זיכרון', e.deviceMemory + ' · ' + e.heap)}${row('אחסון בטלפון', e.localStorage)}${row('משמרות', S.shifts.length)}</div>
    <div class="sec"><span>תצוגה</span></div>
    <div class="seg" id="d-lite"><button data-l="auto" class="${lite === 'auto' ? 'on' : ''}">אוטומטי</button><button data-l="on" class="${lite === 'on' ? 'on' : ''}">קלה</button><button data-l="off" class="${lite === 'off' ? 'on' : ''}">מלאה</button></div>
    <p class="fine" style="margin-top:6px">תצוגה קלה מכבה רקע זז, טשטוש ואנימציות. עוזרת בטלפונים חלשים.</p>
    <label class="cell" style="margin-top:8px"><span class="grow">מד ביצועים על המסך</span><input type="checkbox" id="d-meter" ${meterOn ? 'checked' : ''}></label>
    <div class="sec"><span>בדיקה עצמית</span></div>
    <div class="card"><button class="cell" id="d-test"><span class="cell-ic">${I.check}</span><span class="grow">להריץ בדיקה<div class="sub" id="d-test-out">מצייר כל מסך ומחשב את כל המשמרות, ומודד זמנים</div></span></button></div>
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
  const pack = await loadPack(info.code).catch(() => null);
  LANG = info.code; EN = LANG !== 'he'; PACK = pack;
  if (save) { S.settings.lang = LANG; persist(); }
  document.documentElement.lang = LANG; document.documentElement.dir = info.dir;
  DAYS = pack?.days || HE_DAYS; MONTHS = pack?.months || HE_MONTHS; DAY_SHORT = pack?.daysShort || HE_DAY_SHORT;
  stopTranslating(); usePack(pack);
  if (pack) startTranslating();
  render(); updateBackupDot();
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
    const now = new Date(), M = monthCalc(now.getFullYear(), now.getMonth());
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
$('#fab').onclick = () => {
  const job = jobById(S.settings.lastJob), end = new Date(); end.setMinutes(0, 0, 0);
  const start = new Date(+end - Math.round(job.regHours) * 3.6e6);
  openShiftSheet({ id: null, jobId: job.id, start: start.toISOString(), end: end.toISOString(), breakMin: job.breakMin, bonus: 0, note: '', rest: 'auto' }, 'new');
};

/* ---- start: draw first, everything else after, and never let one failing step blank the app ---- */
const step = (name, fn) => { try { fn(); } catch (e) { (window.__etzbaErr || []).push(name + ': ' + (e && e.message)); console.error(name, e); } };
step('recompute', recompute);
step('render', render);
if (LANG !== 'he') step('language', () => { setLang(LANG, false); });
window.__etzbaReady = true;
dbg.log('perf', 'ready', dbg.sinceStart());
step('crashNote', () => { const c = dbg.lastCrash(); if (c) { dbg.log('warn', 'last session ended during: ' + c.step); toast(`בפעם הקודמת האפליקציה נסגרה (${c.step}). פרטים באבחון`, 'err', { label: 'פרטים', fn: openDebug }); } });
step('debugHash', () => { if (location.hash === '#debug') openDebug(); addEventListener('hashchange', () => { if (location.hash === '#debug') openDebug(); }); });
step('welcome', () => { if (!S.settings.onboarded && !S.shifts.length && !S.active) openOnboarding(); });
step('shared', () => {
  takeSharedFile();
  native.onSharedFile(f => { dbg.log('info', 'native share: ' + f.name); go('set'); openFileImport(f); });
});
step('back', () => native.onBack(() => {
  if (sheet.classList.contains('on')) { closeSheet(); return true; }
  if (view !== 'home') { go('home'); return true; }
  return false;
}));
step('splash', native.ready);
step('meter', () => { try { if (localStorage.getItem('etzba.meter') === '1') dbg.setMeter(true); } catch {} });
step('backupDot', updateBackupDot);
setInterval(() => { tickHome(false); if (new Date().getSeconds() === 0) { renderRestCard(); $('#brandMark').innerHTML = mark({ t: new Date(), sw: 5.4 }); } }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* Offline cache for the website version. Inside an embedded frame service workers aren't allowed,
   so any old one is removed there instead. The Android app has everything built in and needs none. */
const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
try {
  if (!native.NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    if (framed) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    else navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
} catch {}
