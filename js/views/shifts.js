// The shift list: filters, sorting and weekly groups.
import { $, pad, dateKey, dShort, tm, nm, money, hm, $$, dFull } from '../util.js';
import { S, jobById, inWeek } from '../state.js';
import { monthCalc, PAY } from '../pay.js';
import { viewY, viewM, commit, persist } from '../nav.js';
import { shiftKind, weekStart } from '../pay-engine.js';
import { I } from '../svg-icons.js';
import { DAYS } from '../lang.js';
import { planPay, planAction } from './home.js';
import { shiftRow, monthBar, bindMonthBar, bindRows } from './common.js';
import { openSheet, closeSheet, toast } from '../ui.js';

const FILTERS = [['all', 'הכל'], ['morning', 'בוקר'], ['noon', 'צהריים'], ['evening', 'ערב'], ['night', 'לילה'], ['rest', 'שבת וחג'], ['ot', 'עם נוספות']];

const SORTS = [['old', 'מהישן לחדש'], ['new', 'מהחדש לישן'], ['pay', 'הכי משתלמות'], ['hours', 'הכי ארוכות']];

export function renderShifts() {
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
      <span class="mid"><span class="t1">${DAYS[d.getDay()]} ${dShort(d)}</span><span class="t2 num tline">${x.end ? `<bdi dir="ltr" class="trange">${tm(x.start)}–${tm(x.end)}</bdi>` : `<span>מ־${tm(x.start)}</span>`}<span class="tmore"><span class="sep">·</span>עתידית${S.jobs.length > 1 ? `<span class="sep">·</span>${nm(j.name)}` : ''}</span></span></span>
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
