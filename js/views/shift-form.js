// The add / edit / clock-out form for a shift, and the same form for a future shift, a vacation or a sick day.
import { $, $$, esc, nm, pad, uid, money, hm, dateKey, sameDay } from '../util.js';
import { I } from '../svg-icons.js';
import { S, jobById, place } from '../state.js';
import { PAY, weekRegBefore } from '../pay.js';
import { jobAt, shiftPay } from '../pay-engine.js';
import { MONTHS, DAY_SHORT, EN } from '../lang.js';
import { commit, showMonth } from '../nav.js';
import { toast, announce, buzz, openSheet, closeSheet, spokenDate } from '../ui.js';
import { explain, dayWord } from './common.js';
import { planNotifications, addLeave, leaveHint } from '../app.js';

const ROW = 44;   // height of one number in the time wheels
const DAY = 864e5;
const TITLES = { end: 'סיום משמרת', new: 'משמרת חדשה', edit: 'עריכת משמרת' };
const KIND_TITLES = { vac: 'יום חופשה', sick: 'יום מחלה', plan: 'משמרת עתידית' };
const KINDS = [['shift', 'משמרת', 'ot'], ['special', 'מיוחדת', 'pct']];
const NEW_ONLY_KINDS = [['plan', 'עתידית', 'cal'], ['vac', 'חופשה', 'vac'], ['sick', 'מחלה', 'sick']];

/**
 * mode: 'new', 'edit' or 'end' (clocking out).
 * sh.planId (with sh.planEnd) opens a future shift for editing.
 */
export function openShiftSheet(sh, mode) {
  const f = initForm(sh, mode);
  openSheet(formHtml(f), root => { f.root = root; wireForm(f); });
}

/* ---- state ---- */
function initForm(sh, mode) {
  const st0 = new Date(sh.start), en0 = new Date(sh.end);
  const T = {
    date: new Date(st0.getFullYear(), st0.getMonth(), st0.getDate()),
    s: [st0.getHours(), st0.getMinutes()],
    e: [en0.getHours(), en0.getMinutes()],
    active: mode === 'end' ? 'e' : 's',
  };
  // a shift saved as ending on the next day keeps "next day" on, even when the hours alone wouldn't say so
  const d0 = new Date(st0.getFullYear(), st0.getMonth(), st0.getDate()), d1 = new Date(en0.getFullYear(), en0.getMonth(), en0.getDate());
  T.next = d1 > d0 && (T.e[0] * 60 + T.e[1]) >= (T.s[0] * 60 + T.s[1]);
  return {
    sh, mode, T, job: jobById(sh.jobId), title: TITLES[mode],
    jobId: sh.jobId, rest: sh.rest || 'auto',
    kind: sh.planId ? 'plan' : +sh.specialPct > 0 ? 'special' : 'shift',
    planEnd: !!(sh.planId && sh.planEnd),
    W: { sh: [T.s, 0], sm: [T.s, 1], eh: [T.e, 0], em: [T.e, 1] },   // each wheel and the value it controls
    root: null,
  };
}

/** The shift as the form currently describes it. */
function read(f) {
  const { sh, T, root, kind, rest } = f, val = id => $('#' + id, root).value;
  const st = new Date(T.date); st.setHours(T.s[0], T.s[1], 0, 0);
  const en = new Date(T.date); en.setHours(T.e[0], T.e[1], 0, 0);
  if (en <= st || T.next) en.setDate(en.getDate() + 1);
  const tipsShown = jobById(f.jobId).tipsOn || +val('f-tips');
  return {
    ...sh, jobId: f.jobId, start: st.toISOString(), end: en.toISOString(),
    breakMin: Math.max(0, +val('f-break') || 0),
    bonus: +val('f-bonus') || 0,
    tips: tipsShown ? Math.max(0, +val('f-tips') || 0) || undefined : undefined,
    note: val('f-note').trim(), rest,
    travel: val('f-travel') === '' ? undefined : Math.max(0, +val('f-travel') || 0),
    forceRest: kind === 'special' ? undefined : rest === 'yes' ? true : rest === 'no' ? false : undefined,
    specialPct: kind === 'special' ? Math.max(1, Math.min(1000, +val('f-pct') || 200)) : undefined,
  };
}

/* ---- markup ---- */
const wheel = (id, n, step) => `<div class="wheel" id="w-${id}" data-step="${step}">${Array.from({ length: n / step }, (_, i) =>
  `<div class="wi num" data-v="${i * step}">${pad(i * step)}</div>`).join('')}</div>`;

/** Six weeks back to a week ahead, always including the shift's own day. */
function dayStrip(T) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = new Date(Math.min(+today - 45 * DAY, +T.date - 3 * DAY)), to = new Date(Math.max(+today + 7 * DAY, +T.date + 3 * DAY));
  from.setHours(0, 0, 0, 0); to.setHours(0, 0, 0, 0);
  let html = '';
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const diff = Math.round((today - d) / DAY);
    const word = diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : diff === -1 ? 'מחר' : DAY_SHORT[d.getDay()];
    html += `<button type="button" class="day${d.getDay() === 6 ? ' sat' : ''}" data-d="${+d}" aria-label="${spokenDate(d)}"><small>${word}</small><b class="num">${d.getDate()}</b><em class="num">${MONTHS[d.getMonth()].slice(0, 3)}${EN ? '' : '׳'}</em></button>`;
  }
  return html;
}

function timePicker(T) {
  const mstep = [T.s[1], T.e[1]].every(x => x % 5 === 0) ? 5 : 1;
  const col = (t, label, typeLabel, extra = '') => `<div class="tp-col${t === 'e' ? ' tp-endpart' : ''}"><button type="button" class="tp-cap tp-type" data-t="${t}" aria-label="${typeLabel}">${label}<span>${I.clockEdit}</span></button><input type="time" class="tp-in" data-t="${t}" tabindex="-1" aria-hidden="true"><div class="wheels" dir="ltr">${wheel(t + 'h', 24, 1)}<span class="colon">:</span>${wheel(t + 'm', 60, mstep)}</div>${extra}</div>`;
  return `<div class="tp">
      ${col('s', 'כניסה', 'הקלדת שעת הכניסה')}
      <div class="tp-arrow tp-endpart">${I.chevL}</div>
      ${col('e', 'יציאה', 'הקלדת שעת היציאה', `<button type="button" class="tp-next" id="tNext" aria-pressed="false">${I.check}<span>למחרת</span></button>`)}
    </div>
    <div class="tp-sum tp-endpart">סה״כ <b class="num" id="tDur"></b> שעות · גוללים כדי לשנות</div>`;
}

function extras(sh, job) {
  const open = +sh.tips || +sh.bonus || sh.travel != null || (sh.rest && sh.rest !== 'auto');
  return `<details class="adv" id="f-more"${open ? ' open' : ''}><summary>${I.chevDown}הפסקה, טיפים, בונוס ונסיעות<span class="fhint" id="f-more-s"></span></summary>
      <h3>הפסקה לא בתשלום</h3>
      <div class="qchips" id="f-bq">${[0, 15, 30, 45, 60].map(b => `<button type="button" data-b="${b}">${b ? b + ' דק׳' : 'בלי'}</button>`).join('')}
        <input class="input num mini" type="number" inputmode="numeric" id="f-break" value="${+sh.breakMin || 0}" aria-label="דקות הפסקה"></div>
      <div class="grid2">
        <label class="field" id="f-tips-w"><span>טיפים (₪)</span><input class="input num" type="number" inputmode="decimal" id="f-tips" value="${+sh.tips || ''}" placeholder="0"></label>
        <label class="field"><span>בונוס (₪)</span><input class="input num" type="number" inputmode="decimal" id="f-bonus" value="${+sh.bonus || ''}" placeholder="0"></label>
        <label class="field"><span>נסיעות (₪)</span><input class="input num" type="number" step="0.5" inputmode="decimal" id="f-travel" value="${sh.travel ?? ''}" placeholder="${jobAt(job, sh.start).travel || 0}"><small class="fhint">ריק: לפי הגדרות העבודה</small></label>
      </div>
      <details class="adv" id="f-restd"><summary>${I.chevDown}שבת / חג ידני</summary>
        <div class="seg" id="f-rest" style="margin-top:10px">
          <button type="button" data-r="auto">אוטומטי</button><button type="button" data-r="yes">הכל בתוספת שבת</button><button type="button" data-r="no">בלי תוספת</button></div>
        <p class="hint">"אוטומטי" מחשב לפי זמני כניסת ויציאת שבת וחג בעיר שבחרת.</p></details>
    </details>`;
}

function buttons(mode) {
  return `<div class="btnrow">
      <button class="btn ${mode === 'end' ? 'accent' : 'primary'}" id="f-save">${I.check}${mode === 'end' ? 'סיום ושמירה' : 'שמירה'}</button>
      ${mode === 'end' ? `<button class="btn soft" id="f-cont">חזרה, המשמרת ממשיכה</button><button class="btn danger" id="f-discard">${I.trash}מחיקת המשמרת</button><p class="hint" style="text-align:center">מחיקה: המשמרת לא נשמרת, כאילו לא נכנסת. אפשר לבטל מיד אחרי.</p>` : ''}
      ${mode === 'edit' ? `<button class="btn danger" id="f-del">${I.trash}מחיקה</button>` : ''}
    </div>`;
}

function formHtml({ sh, mode, T, job, title }) {
  const sub = mode === 'end' ? `${nm(job.name)} · אם שכחת להחתים בזמן, אפשר לתקן את השעות.` : '';
  const kinds = mode === 'end' ? [] : [...KINDS, ...(mode === 'new' ? NEW_ONLY_KINDS : [])];
  return `
    <h2 id="f-title">${title}</h2>${sub ? `<p class="shsub">${sub}</p>` : ''}
    ${kinds.length ? `<div class="seg kinds" id="f-kind">${kinds.map(([k, l, i]) => `<button type="button" data-k="${k}" class="c-${k}"><span class="ki">${I[i]}</span>${l}</button>`).join('')}</div>` : ''}
    <div id="f-special" class="hidden">
      <h3>תעריף לכל השעות</h3>
      <div class="qchips" id="f-pq">${[125, 150, 175, 200, 250].map(v => `<button type="button" class="num" data-p="${v}">${v}%</button>`).join('')}
        <input class="input num mini" type="number" inputmode="numeric" id="f-pct" value="${+sh.specialPct || 200}" aria-label="אחוז"></div>
      <p class="hint">כל שעה במשמרת הזו משולמת באחוז הזה מהתעריף, בלי שעות נוספות ובלי תוספת שבת. למשל משמרת של 3 שעות שכולה ב־200%.</p>
    </div>
    ${S.jobs.length > 1 ? `<div class="chips" id="f-jobs">${S.jobs.map(j => `<button type="button" class="chip" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}</div>` : ''}
    <h3>יום</h3>
    <div class="daystrip" id="f-days">${dayStrip(T)}</div>
    <div id="f-leave" class="hidden">
      <label class="field"><span>כמה ימים</span><input class="input num" type="number" min="1" max="60" inputmode="numeric" id="f-ndays" value="1"></label>
      <p class="hint" id="f-lhint"></p>
    </div>
    <div id="f-shiftonly">
    <h3>שעות</h3>
    ${timePicker(T)}
    <div id="f-planbits" class="hidden">
      <button type="button" class="tp-next" id="f-planend" aria-pressed="false">${I.check}<span>אני יודע/ת מתי היא מסתיימת</span></button>
      <p class="hint">משמרת עתידית היא רק תכנון: תגיע תזכורת שעה לפני, וכשנכנסים אליה היא נרשמת כרגיל. שעת סיום לא חובה.</p>
    </div>
    <div id="f-paybits">
    <label class="field"><span>הערה</span><input class="input" type="text" id="f-note" value="${esc(sh.note)}" placeholder="אופציונלי"></label>
    ${extras(sh, job)}
    <div id="f-explain"></div>
    </div>
    </div>
    ${buttons(mode)}`;
}

/* ---- keeping the form in sync ---- */
const toggle = (el, cls, on) => el?.classList.toggle(cls, on);
const press = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); };

/** Redraws everything that depends on the form's values: selections, sections shown, the pay explanation. */
function update(f) {
  const { root, T, W, kind, rest, jobId, planEnd } = f, s = read(f);
  $$('.wheels', root).forEach(w => w.classList.remove('bad'));
  press($('#tNext', root), !sameDay(s.start, s.end));
  $('#tDur', root).textContent = hm((new Date(s.end) - new Date(s.start)) / 3.6e6);
  for (const id in W) $$('.wi', $('#w-' + id, root)).forEach(it => toggle(it, 'on', +it.dataset.v === W[id][0][W[id][1]]));
  $$('.day', root).forEach(b => toggle(b, 'on', +b.dataset.d === +T.date));
  $$('#f-rest button', root).forEach(b => toggle(b, 'on', b.dataset.r === rest));
  $$('#f-jobs .chip', root).forEach(b => toggle(b, 'on', b.dataset.j === jobId));
  const tips = +$('#f-tips', root).value;
  toggle($('#f-tips-w', root), 'hidden', !jobById(jobId).tipsOn && !tips);
  $$('#f-bq button', root).forEach(b => toggle(b, 'on', +b.dataset.b === s.breakMin));
  $('#f-more-s', root).innerHTML = [s.breakMin ? `הפסקה ${s.breakMin} דק׳` : '', tips ? `טיפים ${money(tips)}` : '', +s.bonus ? `בונוס ${money(+s.bonus)}` : '', rest !== 'auto' ? 'שבת ידני' : '']
    .filter(Boolean).map(x => `<span>${x}</span>`).join(' · ');

  $$('#f-kind button', root).forEach(b => toggle(b, 'on', b.dataset.k === kind));
  toggle($('#f-special', root), 'hidden', kind !== 'special');
  $$('#f-pq button', root).forEach(b => toggle(b, 'on', +b.dataset.p === s.specialPct));
  toggle($('#f-restd', root), 'hidden', kind === 'special');
  const leave = kind === 'vac' || kind === 'sick', plan = kind === 'plan';
  toggle($('#f-shiftonly', root), 'hidden', leave);
  toggle($('#f-leave', root), 'hidden', !leave);
  if (f.mode === 'new') $('#f-title', root).textContent = KIND_TITLES[kind] || f.title;
  toggle($('#f-planbits', root), 'hidden', !plan);
  toggle($('#f-paybits', root), 'hidden', plan);
  $$('.tp-endpart', root).forEach(e => toggle(e, 'hidden', plan && !planEnd));
  toggle($('.tp', root), 'tp-one', plan && !planEnd);
  press($('#f-planend', root), planEnd);

  if (leave) { $('#f-lhint', root).textContent = leaveHint(kind); return; }
  if (plan) return;
  const j = jobAt(jobById(jobId), s.start), p = shiftPay(s, j, place(), weekRegBefore(j, s.start));
  $('#f-explain', root).innerHTML = explain(s, j, p);
}

/* ---- wiring ---- */
function setWheel(f, id, smooth) {
  const w = $('#w-' + id, f.root), [arr, i] = f.W[id];
  w.scrollTo({ top: Math.round(arr[i] / +w.dataset.step) * ROW, behavior: smooth ? 'smooth' : 'auto' });
}
const pickOnTap = (f, id) => $$('.wi', $('#w-' + id, f.root)).forEach(it => it.onclick = () => { f.W[id][0][f.W[id][1]] = +it.dataset.v; setWheel(f, id, true); update(f); });

/** Minute wheels start in steps of 5; a typed time that isn't on a step switches them to single minutes. */
function singleMinutes(f, id) {
  const w = $('#w-' + id, f.root); if (+w.dataset.step === 1) return;
  w.dataset.step = 1;
  w.innerHTML = Array.from({ length: 60 }, (_, i) => `<div class="wi num" data-v="${i}">${pad(i)}</div>`).join('');
  pickOnTap(f, id);
}

/** Scrolls the day strip so the chosen day is in the middle. */
function centerDay(root) {
  const strip = $('#f-days', root), on = $('.day.on', root); if (!strip || !on) return;
  const a = on.getBoundingClientRect(), b = strip.getBoundingClientRect();
  strip.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2);
}

/** The hour most recent shifts started at, else 9. */
function usualStartHour() {
  const count = {};
  for (const x of S.shifts.slice(-30)) { const h = new Date(x.start).getHours(); count[h] = (count[h] || 0) + 1; }
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return top ? +top[0] : 9;
}

function wireTime(f) {
  const { root, T, W } = f;
  for (const id in W) {
    const w = $('#w-' + id, root); let t;
    w.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const [arr, i] = W[id], idx = Math.max(0, Math.min(w.children.length - 1, Math.round(w.scrollTop / ROW))), v = idx * +w.dataset.step;
        if (arr[i] !== v) { arr[i] = v; buzz(5); update(f); }
      }, 80);
    }, { passive: true });
    pickOnTap(f, id);
  }
  // typing a time: a hidden time input opens the system picker
  $$('.tp-type', root).forEach(b => b.onclick = () => {
    const t = b.dataset.t, inp = $(`.tp-in[data-t="${t}"]`, root);
    inp.value = `${pad(T[t][0])}:${pad(T[t][1])}`;
    try { inp.showPicker(); } catch { inp.focus(); inp.click(); }
  });
  $$('.tp-in', root).forEach(inp => inp.onchange = () => {
    const m = /^(\d{1,2}):(\d{2})/.exec(inp.value); if (!m) return;
    const t = inp.dataset.t; T[t][0] = +m[1]; T[t][1] = +m[2];
    if (T[t][1] % 5) { singleMinutes(f, 'sm'); singleMinutes(f, 'em'); }
    setWheel(f, t + 'h'); setWheel(f, t + 'm'); update(f); buzz(8);
  });
  $('#tNext', root).onclick = () => {
    if (T.e[0] * 60 + T.e[1] <= T.s[0] * 60 + T.s[1]) return toast('שעת היציאה מוקדמת משעת הכניסה, אז היציאה למחרת');
    T.next = !T.next; buzz(8); update(f);
  };
}

function wireChoices(f) {
  const { root, T } = f;
  $$('.day', root).forEach(b => b.onclick = () => { T.date = new Date(+b.dataset.d); update(f); });
  $$('#f-jobs .chip', root).forEach(b => b.onclick = () => { f.jobId = b.dataset.j; update(f); });
  $$('#f-rest button', root).forEach(b => b.onclick = () => { f.rest = b.dataset.r; update(f); });
  $$('#f-bq button', root).forEach(b => b.onclick = () => { $('#f-break', root).value = b.dataset.b; update(f); });
  $$('#f-pq button', root).forEach(b => b.onclick = () => { $('#f-pct', root).value = b.dataset.p; update(f); });
  $$('#f-kind button', root).forEach(b => b.onclick = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (b.dataset.k === 'plan' && +T.date <= +today) {
      // a future shift starts tomorrow at the usual hour
      T.date = new Date(today); T.date.setDate(T.date.getDate() + 1);
      T.s[0] = usualStartHour(); T.s[1] = 0;
      setTimeout(() => { setWheel(f, 'sh'); setWheel(f, 'sm'); centerDay(root); }, 30);
    }
    f.kind = b.dataset.k; update(f);
  });
  $('#f-planend', root).onclick = () => { f.planEnd = !f.planEnd; buzz(8); update(f); };
  $$('input', root).forEach(i => i.addEventListener('input', () => update(f)));
}

function wireForm(f) {
  const { root } = f;
  wireTime(f);
  wireChoices(f);
  update(f);
  for (const id in f.W) setWheel(f, id, false);
  centerDay(root); requestAnimationFrame(() => requestAnimationFrame(() => centerDay(root))); setTimeout(() => centerDay(root), 350);
  $('#f-save', root).onclick = () => save(f);
  $('#f-cont', root) && ($('#f-cont', root).onclick = closeSheet);
  $('#f-discard', root) && ($('#f-discard', root).onclick = () => discardActive());
  $('#f-del', root) && ($('#f-del', root).onclick = () => remove(f.sh));
}

/* ---- saving ---- */
/** Closes, saves and confirms. msg may be a function, to read the pay after it's recalculated. */
const done = (msg, ms = 20) => { closeSheet(); commit(); buzz(ms); toast(typeof msg === 'function' ? msg() : msg, 'ok'); };
const showMonthOf = d => { d = new Date(d); showMonth(d.getFullYear(), d.getMonth()); };
const markBad = root => $$('.wheels', root).forEach(w => w.classList.add('bad'));

function save(f) {
  const { root, kind, sh, mode, T } = f;
  if (kind === 'vac' || kind === 'sick') {
    const n = addLeave(f.jobId, kind, dateKey(T.date), +$('#f-ndays', root).value);
    showMonthOf(T.date);
    return done(n === 1 ? 'נשמר יום אחד' : `נשמרו ${n} ימים`);
  }
  const s = read(f), len = new Date(s.end) - new Date(s.start);
  if (kind === 'plan') return savePlan(f, s);
  if (mode === 'new' && +new Date(s.start) > Date.now() + 10 * 6e4 && len > 0) {
    // a regular shift entered for later becomes a planned one
    S.plans.push({ id: uid(), jobId: s.jobId, start: s.start, end: s.end, breakMin: s.breakMin, ...(s.specialPct ? { specialPct: s.specialPct } : {}) });
    closeSheet(); commit(); planNotifications(true); buzz(20);
    return toast(`נשמרה משמרת מתוכננת ל${dayWord(s.start)} · תזכורת שעה לפני`, 'ok');
  }
  if (len < 6e4) { markBad(root); return toast('המשמרת קצרה מדי. אפשר לבטל אותה', 'err'); }
  if (len > 24 * 3.6e6) { markBad(root); return toast('משמרת לא יכולה להיות יותר מ־24 שעות', 'err'); }
  if (!s.id) { s.id = uid(); S.shifts.push(s); } else S.shifts[S.shifts.findIndex(x => x.id === s.id)] = s;
  if (mode === 'end') { S.active = null; announce('המשמרת נשמרה'); }
  S.settings.lastJob = s.jobId;
  showMonthOf(s.start);
  done(() => `נשמר · ${money(PAY.get(s.id).pay)} על ${hm(PAY.get(s.id).hours)} ש׳`, 25);
}

function savePlan(f, s) {
  if (+new Date(s.start) < Date.now() - 6e4) return toast('משמרת עתידית צריכה להתחיל אחרי עכשיו', 'err');
  const id = f.sh.planId, plan = { id: id || uid(), jobId: s.jobId, start: s.start, end: f.planEnd ? s.end : null, breakMin: 0 };
  if (id) S.plans = S.plans.map(x => x.id === id ? plan : x); else S.plans.push(plan);
  closeSheet(); commit(); planNotifications(true); buzz(20);
  toast(id ? 'המשמרת העתידית עודכנה' : `נשמרה משמרת עתידית ל${dayWord(s.start)} · תזכורת שעה לפני`, 'ok');
}

/** Throws away the running shift, with undo. */
function discardActive() {
  const was = S.active; S.active = null;
  closeSheet(); commit(); buzz(20); announce('המשמרת נמחקה');
  toast('המשמרת נמחקה', '', { label: 'ביטול', fn: () => { S.active = was; commit(); toast('המשמרת חזרה', 'ok'); } });
}

/** Deletes a saved shift, with undo. */
function remove(sh) {
  const i = S.shifts.findIndex(x => x.id === sh.id), was = S.shifts[i];
  if (i < 0) return closeSheet();
  S.shifts.splice(i, 1);
  closeSheet(); commit(); buzz(20); announce('המשמרת נמחקה');
  toast('המשמרת נמחקה', '', { label: 'ביטול', fn: () => { S.shifts.push(was); commit(); toast('המשמרת חזרה', 'ok'); } });
}
