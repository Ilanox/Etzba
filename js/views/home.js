// The clock screen: punch in and out, the live shift, today's tiles, planned shifts and the monthly goal.
import { ridges, I, handAngles } from '../svg-icons.js';
import { $$, $, nm, esc, tm, pad, money2, money, hm, sameDay, uid, dShort } from '../util.js';
import { S, jobById, index, place, inWeek } from '../state.js';
import { openShiftSheet } from './shift-form.js';
import { commit, persist, go, view, showMonth, viewY, viewM } from '../nav.js';
import { toast, announce, buzz, openSheet, closeSheet, openPop, closePop, keepPopQuiet, hideToast } from '../ui.js';
import { shiftRow, bindRows, tierLabel, dlt, showWhy, dayWord } from './common.js';
import { nextRest, holidaysOfGregorianYear } from '../hebrew-calendar.js';
import { DAYS, MONTHS, DAY_SHORT } from '../lang.js';
import { jobAt, shiftPay, weekStart } from '../pay-engine.js';
import { weekRegBefore, livePay, PAY, withLive, monthCalc, monthVsLast, netOpts, NET } from '../pay.js';
import { rules } from '../rules.js';
import { taxFor, grossToNet } from '../net-pay.js';
import { isSup } from '../theme.js';
import { celebrate } from './celebrate.js';
import * as dbg from '../diagnostics.js';
import { secIc } from './settings.js';
import { openJobSheet } from './job.js';
import { askPersist } from './data.js';
import { notifLine, planNotifications, notifOn } from '../notifications.js';

/* ---- the fingerprint button ---- */
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

/* ---- the screen ---- */
export function renderHome() {
  const el = $('#v-home');
  const multi = S.jobs.length > 1;
  const rj = jobById(S.active?.jobId || S.settings.lastJob) || S.jobs[0], rateUnset = rj && !rj.rateOk && +rj.rate === 40;
  el.innerHTML = `
    ${rateUnset ? `<div class="card rate-card" id="rateCard"><div class="rc-top"><span class="cell-ic t-orange">${I.coins}</span><span class="grow"><b>השכר לשעה הוא ₪40 לדוגמה</b><small>כדי שהחישובים יהיו נכונים, כדאי לשים את השכר שלך.</small></span></div>
      <div class="nudge"><button class="btn primary" id="rateSet">לעדכן את השכר</button><button class="btn soft" id="rateOk">זה השכר שלי</button></div></div>` : ''}
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
  if (rateUnset) {
    $('#rateSet').onclick = () => openJobSheet(rj);
    $('#rateOk').onclick = () => { rj.rateOk = true; commit(); toast('מעולה, השכר נשמר', 'ok'); };
  }
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

export function renderRestCard() {
  const el = $('#restCard'); if (!el) return;
  const now = new Date(), w = nextRest(now, place());
  if (!w) { el.classList.add('hidden'); return; }
  const isChag = w.names.some(n => n !== 'שבת'), inNow = w.start <= now;
  el.innerHTML = `<span class="ri${isChag ? ' chag' : ''}">${isChag ? I.chag : I.shabbat}</span>
    <span style="flex:1"><small style="color:var(--ink3);font-size:.75rem;font-weight:600">${inNow ? 'עכשיו' : 'הבא'} · ${esc(S.settings.city)}</small><b>${esc(w.names.join(' · '))}</b></span>
    <span class="times num">כניסה ${DAYS[w.start.getDay()]} ${tm(w.start)}<br>יציאה ${DAYS[w.end.getDay()]} ${tm(w.end)}</span>`;
}

export function tickHome(full) {
  if (view !== 'home' || !$('#pTime')) return;
  const now = new Date(), a = S.active, punch = $('#punch');
  const { h, m } = handAngles(now);
  $('#hM')?.setAttribute('transform', `rotate(${m} 50 52)`);
  $('#hH')?.setAttribute('transform', `rotate(${h} 50 52)`);
  punch.classList.toggle('live', !!a);
  const job = a ? jobAt(jobById(a.jobId), a.start) : jobAt(jobById(S.settings.lastJob), new Date());
  if (a) {
    const st = new Date(a.start), sec = Math.floor(Math.max(0, now - st) / 1000), ms = sec * 1000;
    const mNow = Math.floor(ms / 6e4), wb = weekRegBefore(job, a.start);
    const p = shiftPay({ start: a.start, end: new Date(+st + mNow * 6e4), breakMin: 0 }, job, place(), wb);
    const key = shiftPay({ start: a.start, end: new Date(+st + (mNow + 1) * 6e4), breakMin: 0 }, job, place(), wb).lastKey || 'reg';
    $('#pTime').textContent = `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
    $('#pEarn').textContent = money2(p.base + ((ms % 6e4) / 3.6e6) * p.rate * job.r[key] / 100);
    $('#pLabel').textContent = `${+st > +now ? 'המשמרת מתחילה ב־' : 'במשמרת מ־'}${tm(a.start)}${S.jobs.length > 1 ? ' · ' + job.name : ''}`;
    $('#pEdit').hidden = false;
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
    <button class="today" id="tcell" type="button" aria-label="איך חושב היום"><small>היום · ברוטו</small><b class="num">${money(tP)}</b><span class="num">${hm(tH)} ש׳</span></button>
    <button class="monthcell" id="mcell"><small>${MONTHS[now.getMonth()]} · ברוטו</small><b class="num">${money(M.gross)}</b><span class="num">${M.shifts.length} משמרות</span>${(() => { const c = monthVsLast(now.getFullYear(), now.getMonth()); return c.b.g ? `<span class="dline">${dlt(c.a.g, c.b.g, `לעומת ${MONTHS[c.pm]}`)} <small>לעומת ${MONTHS[c.pm]}</small></span>` : ''; })()}</button>
    <div class="wkb"><div class="wkb-h"><b>השבוע</b><span class="num"><b>${hm(wH)}</b> מתוך ${lim} ש׳</span></div>
      <div class="wkb-days">${H.map((h, i) => `<div class="wkb-d${i === now.getDay() ? ' on' : ''}"><i style="height:${h / mx * 100}%"></i><em>${DAY_SHORT[i]}</em></div>`).join('')}</div>
      <div class="wkb-sub num">${wH > lim ? `${hm(wH - lim)} מעל המכסה השבועית` : `נשארו ${hm(lim - wH)} עד המכסה השבועית`}</div></div>
    ${goalCell(M)}`;
  $('#mcell', el).onclick = () => { showMonth(now.getFullYear(), now.getMonth()); S.ui.sumView = 'month'; go('sum'); };
  $('#goal', el).onclick = openGoal;
  $('#tcell', el).onclick = () => {
    const today = S.shifts.filter(x => sameDay(x.start, now)).sort((a, b) => new Date(b.start) - new Date(a.start));
    if (today.length === 1) return showWhy(today[0]);
    go('shifts');
  };
  $$('[data-plan]', el).forEach(b => b.onclick = e => { e.stopPropagation(); planAction(b.dataset.plan, b.dataset.do); });
}

/* ---- planned shifts ---- */
const PLAN_EARLY = 2 * 36e5;

function usualHours() {
  const from = Date.now() - 56 * 864e5, h = S.shifts.filter(s => +new Date(s.start) >= from).map(s => PAY.get(s.id)?.hours).filter(Boolean);
  return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 8;
}

const planEndOf = x => x.end || new Date(+new Date(x.start) + usualHours() * 36e5).toISOString();

export const planPay = x => { const j = jobAt(jobById(x.jobId), x.start); return shiftPay({ ...x, end: planEndOf(x), rest: 'auto' }, j, place(), weekRegBefore(j, x.start)).pay; };

const planTime = x => x.end ? `<span class="num" dir="ltr">${tm(x.start)}–${tm(x.end)}</span>` : `<span>מ־<span class="num">${tm(x.start)}</span></span>`;

function planNow(jobId, t = Date.now()) {
  return S.plans.find(x => (!jobId || x.jobId === jobId) && +new Date(x.start) - PLAN_EARLY <= t && t <= +new Date(x.end || +new Date(x.start) + 12 * 36e5));
}

function planCell() {
  if (S.active || !S.plans.length) return '';
  const now = Date.now(), sorted = [...S.plans].sort((a, b) => new Date(a.start) - new Date(b.start));
  const over = x => +new Date(planEndOf(x)) < now;
  const missed = sorted.find(over);
  const x = missed || sorted.find(x => !over(x)); if (!x) return '';
  const j = jobById(x.jobId), when = `${dayWord(x.start)} ${planTime(x)}${S.jobs.length > 1 ? ' · ' + nm(j.name) : ''}`;
  if (missed) return `<div class="plancell missed"><span class="kic k-plan">${I.cal}</span><span class="grow"><small>עבדת במשמרת המתוכננת?</small><b>${when}</b></span>
    <button class="btn primary mini" data-plan="${x.id}" data-do="worked">כן</button><button class="btn soft mini" data-plan="${x.id}" data-do="missed">לא</button></div>`;
  const near = +new Date(x.start) - PLAN_EARLY <= now;
  return `<div class="plancell" data-plan="${x.id}" data-do="open"><span class="kic k-plan">${I.cal}</span><span class="grow"><small>המשמרת הבאה</small><b>${when}</b></span>
    ${near ? `<button class="btn primary mini" data-plan="${x.id}" data-do="start">התחלה</button>` : `<span class="num plan-pay" dir="ltr">~${money(planPay(x))}</span>`}</div>`;
}

export function planAction(id, act) {
  const x = S.plans.find(p => p.id === id); if (!x) return;
  const drop = () => { S.plans = S.plans.filter(p => p.id !== id); };
  if (act === 'start') {
    if (S.active) return;
    drop(); S.settings.lastJob = x.jobId; S.active = { jobId: x.jobId, start: new Date().toISOString(), planned: x.start };
    commit(); buzz(35); planNotifications(true); toast(`נכנסת למשמרת ב־${tm(S.active.start)}`, 'ok'); return;
  }
  if (act === 'worked') {
    drop(); S.shifts.push({ id: uid(), jobId: x.jobId, start: x.start, end: planEndOf(x), breakMin: x.breakMin || 0, bonus: 0, note: '', rest: 'auto', ...(x.specialPct ? { specialPct: x.specialPct } : {}) });
    const sh = S.shifts[S.shifts.length - 1]; commit(); buzz(25);
    if (!x.end) { openShiftSheet(sh, 'edit'); return toast('מתי סיימת? אפשר לתקן את שעת היציאה', 'ok'); }
    toast('המשמרת נוספה', 'ok', { label: 'עריכה', fn: () => openShiftSheet(sh, 'edit') }); return;
  }
  if (act === 'drop' || act === 'missed') { const was = { ...x }; drop(); commit(); toast(act === 'missed' ? 'סומנה כמשמרת שלא התקיימה' : 'הוסרה', '', { label: 'ביטול', fn: () => { S.plans.push(was); commit(); } }); return; }
  if (act === 'edit') {
    const end = x.end || planEndOf(x);
    return openShiftSheet({ jobId: x.jobId, start: x.start, end, breakMin: 0, rest: 'auto', planId: x.id, planEnd: !!x.end }, 'new');
  }
  // open: what you can do with a planned shift
  const past = +new Date(x.start) <= Date.now(), near = +new Date(x.start) - PLAN_EARLY <= Date.now();
  openSheet(`<h2>משמרת עתידית</h2><p class="shsub"><span>${dayWord(x.start)}</span> ${planTime(x)} · ${nm(jobById(x.jobId).name)} · <span>בערך ${money(planPay(x))}</span></p>
    <p class="hint">${notifOn() ? 'תגיע תזכורת שעה לפני.' : 'ההתראות כבויות, אז לא תגיע תזכורת.'} כשנכנסים למשמרת סביב השעה הזו, היא נרשמת כרגיל.</p>
    <div class="btnrow">${near && !S.active ? `<button class="btn primary" id="pl-start">התחלת המשמרת</button>` : ''}${past ? `<button class="btn soft" id="pl-worked">עבדתי בה, להוסיף</button><button class="btn soft" id="pl-missed">לא עבדתי בה</button>` : ''}<button class="btn soft" id="pl-edit">${I.clockEdit}עריכה</button><button class="btn danger" id="pl-del">${I.trash}הסרה</button></div>`, root => {
    $('#pl-edit', root).onclick = () => { closeSheet(); setTimeout(() => planAction(id, 'edit'), 250); };
    $('#pl-missed', root) && ($('#pl-missed', root).onclick = () => { closeSheet(); planAction(id, 'missed'); });
    $('#pl-start', root) && ($('#pl-start', root).onclick = () => { closeSheet(); planAction(id, 'start'); });
    $('#pl-worked', root) && ($('#pl-worked', root).onclick = () => { closeSheet(); planAction(id, 'worked'); });
    $('#pl-del', root).onclick = () => { closeSheet(); planAction(id, 'drop'); };
  });
}

export function planReminders() {
  // an hour before, asked for 10 minutes earlier: Android delivers these a few minutes late (no exact alarms, by
  // Play's rules), so this way it lands around the hour mark instead of after it. The title names the time, so it's right either way.
  const lead = 70 * 6e4, out = [];
  for (const x of S.plans) {
    const at = +new Date(x.start) - lead; if (at < Date.now() + 5000) continue;
    const j = jobById(x.jobId);
    out.push({ at: new Date(at), title: `משמרת ב־${tm(x.start)}`, body: `${x.end ? `${tm(x.start)}–${tm(x.end)}` : `מ־${tm(x.start)}`}${S.jobs.length > 1 ? ' · ' + j.name : ''}` });
  }
  return out;
}

/* ---- the monthly goal ---- */
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
  const opts = netOpts(M.y, M.m), T = taxFor(M.y);
  const isNet = g.kind !== 'gross' && NET(), value = gross => isNet ? grossToNet(gross, opts, T).net : gross;
  const have = isNet ? M.net.net : M.gross, goal = +g.amount, left = Math.max(0, goal - have);
  const avg = typicalShift(), now = new Date(), R = restDaysLeft(now), rest = typicalRestShift(avg, now);
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
      if (r === 0) break;
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
  let kind = NET() ? g.kind || 'net' : 'gross';
  const avg = typicalShift();
  openSheet(`<h2>יעד לחודש</h2><p class="shsub">כמה רוצים להרוויח החודש. הפס בבית מראה כמה נשאר וכמה משמרות עוד צריך.</p>
    ${NET() ? `<div class="seg" id="g-kind" style="margin-top:14px"><button type="button" data-k="net">נטו</button><button type="button" data-k="gross">ברוטו</button></div>` : ''}
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

/* ---- clocking in and out ---- */
export function onPunch() {
  const btn = $('#punchBtn');
  if (!S.active) {
    const jobId = S.settings.lastJob && S.jobs.some(j => j.id === S.settings.lastJob) ? S.settings.lastJob : S.jobs[0].id;
    S.active = { jobId, start: new Date().toISOString() };
    const plan = planNow(jobId);
    if (plan) { S.plans = S.plans.filter(x => x !== plan); S.active.planned = plan.start; }
    if (!persist()) { S.active = null; if (plan) S.plans.push(plan); return; }
    if (isSup()) celebrate('in'); else buzz(35);
    askPersist(); planNotifications(true);
    announce(`משמרת התחילה ב־${tm(S.active.start)}`);
    toast(`נכנסת למשמרת ב־${tm(S.active.start)} · אפשר לשנות את השעה`, 'ok', { label: 'ביטול', fn: () => { S.active = null; if (plan) S.plans.push(plan); persist(); renderHome(); toast('הכניסה בוטלה'); announce('הכניסה בוטלה'); } });
    renderHome();
  } else {
    const a = S.active, job = jobById(a.jobId);
    let end = new Date();
    if (end - new Date(a.start) < 6e4) end = new Date(+new Date(a.start) + 6e4);
    const sh = { id: uid(), jobId: a.jobId, start: a.start, end: end.toISOString(), breakMin: job.breakMin || 0, bonus: 0, note: '', rest: 'auto', ...(a.planned ? { planned: a.planned } : {}) };
    S.shifts.push(sh); S.active = null;
    const d = new Date(sh.start); showMonth(d.getFullYear(), d.getMonth());
    const g0 = goalState(withLive(monthCalc(viewY, viewM)));
    commit(); buzz(25); announce('המשמרת נשמרה');
    openShiftDone(sh, a);
    const g1 = goalState(monthCalc(viewY, viewM));
    if (isSup() && g0 && g1 && g0.left > 0 && g1.left <= 0) setTimeout(() => { celebrate('goal'); toast('הגעת ליעד של החודש!', 'ok'); }, 450);
  }
}

function openShiftDone(sh, was) {
  const job = jobAt(jobById(sh.jobId), sh.start), p = PAY.get(sh.id);
  const html = `<div class="pop-ic">${I.check}</div>
    <h2 id="pop-h">המשמרת נשמרה</h2>
    <div class="pop-pay num">${money(p.pay)}</div>
    <p class="pop-sub"><span class="num" dir="ltr">${tm(sh.start)}–${tm(sh.end)}</span> · <span class="num">${hm(p.hours)}</span> ש׳${S.jobs.length > 1 ? ' · ' + nm(job.name) : ''}${+sh.breakMin ? ` · הפסקה ${+sh.breakMin} דק׳` : ''}</p>
    ${job.tipsOn ? `<label class="field pop-tips"><span>טיפים במשמרת (₪)</span><input class="input num" type="number" inputmode="decimal" id="pd-tips" placeholder="0"></label>` : ''}
    <div class="pop-btns">
      <button class="btn primary" id="pd-ok">${I.check}אישור</button>
      <button class="btn soft" id="pd-edit">עריכה</button>
      <button class="btn ghost" id="pd-undo">ביטול, המשמרת ממשיכה</button>
    </div>`;
  let tipsIn;
  const keepTips = () => {
    const v = tipsIn ? Math.max(0, +tipsIn.value || 0) : 0, cur = S.shifts.find(x => x.id === sh.id);
    if (cur && v !== (+cur.tips || 0)) { cur.tips = v || undefined; commit(); }
  };
  const pop = openPop(html, keepTips); tipsIn = $('#pd-tips', pop);
  $('#pd-ok', pop).onclick = () => { closePop(); toast(`נשמר · ${money(PAY.get(sh.id).pay)} על ${hm(PAY.get(sh.id).hours)} ש׳`, 'ok'); };
  $('#pd-edit', pop).onclick = () => { closePop(); const cur = S.shifts.find(x => x.id === sh.id); if (cur) openShiftSheet(cur, 'edit'); };
  $('#pd-undo', pop).onclick = () => {
    keepPopQuiet(); closePop();
    S.shifts = S.shifts.filter(x => x.id !== sh.id); S.active = was; commit(); buzz(15);
    toast('המשמרת ממשיכה', 'ok'); announce('המשמרת ממשיכה');
  };
}

function openStartTime() {
  const a = S.active; if (!a) return;
  hideToast();
  const now = new Date(), st0 = new Date(a.start);
  const T = [st0.getHours(), st0.getMinutes()];
  const IH = 44;
  const wheel = (id, n) => `<div class="wheel" id="w-${id}" data-step="1">${Array.from({ length: n }, (_, i) => `<div class="wi num" data-v="${i}">${pad(i)}</div>`).join('')}</div>`;
  const QUICK = [['עכשיו', 0], ['לפני 15 דק׳', -15], ['לפני 30 דק׳', -30], ['לפני שעה', -60], ['בעוד 15 דק׳', 15], ['בעוד 30 דק׳', 30]];
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
