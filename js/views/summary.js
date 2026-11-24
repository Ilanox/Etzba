// The summary screen: weeks, month and year, with charts.
import { withLive, monthCalc, NET, monthVsLast, PAY, yearVsLast } from '../pay.js';
import { viewY, viewM, persist, showMonth } from '../nav.js';
import { holidaysOfGregorianYear } from '../hebrew-calendar.js';
import { monthBar, dlt, tierLabel, bindMonthBar, countUp } from './common.js';
import { MONTHS, DAYS } from '../lang.js';
import { money, hm, nm, money2, dShort, $, $$, niceMax } from '../util.js';
import { secIc, exportShifts, openExport, RECAP_YEAR, recapOpen, earlyWhen, openRecap, openSupport, deliver, summaryCSV } from '../app.js';
import { S, inWeek, jobById } from '../state.js';
import { TIERS, weekStart } from '../pay-engine.js';
import { I } from '../svg-icons.js';
import { leaveCard, bindLeave } from './leave-days.js';
import { openReport } from './report-sheet.js';
import * as native from '../native-bridge.js';
import { isSup } from '../theme.js';
import { toast } from '../ui.js';

let heroV = 0;

function sumMonth(el) {
  const M = withLive(monthCalc(viewY, viewM)), n = M.net, net = NET(), heroAmt = net ? n.net : M.gross;
  const ded = n.tax + n.ni + n.health + n.pEmp + n.hEmp;
  const parts = [[n.net, 'var(--hero-net)', 'נטו'], [n.tax, 'var(--accent)', 'מס הכנסה'], [n.ni + n.health, 'var(--gold)', 'ביטוח לאומי ובריאות'], [n.pEmp + n.hEmp, 'var(--ink3)', 'חיסכון (פנסיה)']].filter(x => x[0] > 0);
  const L = (l, v, cls = '', sub = '') => `<div class="ln ${cls}"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
  const hol = holidaysOfGregorianYear(viewY).filter(h => h.date.getMonth() === viewM);
  el.innerHTML = `${monthBar()}
    <div class="card hero" style="margin-top:12px"><small>${net ? `נטו משוער ל${MONTHS[viewM]}` : `ברוטו ל${MONTHS[viewM]}`}<button type="button" class="estimate" data-legal aria-label="הערכה: מה החישוב כן ולא">הערכה ⓘ</button></small><button type="button" class="big num hero-amt" id="netWhy" aria-label="${net ? 'איך מחושב הנטו' : 'איך מחושב הברוטו'}">${money(n.net)}</button>
      <div class="meta num">${net ? `<b>ברוטו ${money(M.gross)}</b>` : ''}${M.tipsOwn ? ` · <span>טיפים ${money(M.tipsOwn)}</span>` : ''}<br>${M.shifts.length} משמרות${M.live ? ' + המשמרת הנוכחית' : ''} · ${hm(M.hours)} שעות</div>

      ${M.gross && net ? `<div class="stack">${parts.map(([v, c]) => `<span style="flex:${v};background:${c}"></span>`).join('')}</div>
      <div class="legend">${parts.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>` : ''}</div>
      ${(() => { const c = monthVsLast(viewY, viewM); if (!c.b.g) return ''; const vs = `לעומת ${MONTHS[c.pm]}${c.partial ? ` עד ה־${c.partial}` : ''}`;
        return `<div class="card dlts">${dlt(c.a.g, c.b.g, 'בברוטו')}<span>ברוטו</span>${dlt(c.a.h, c.b.h, 'בשעות')}<span>שעות</span>${dlt(c.a.h ? c.a.g / c.a.h : 0, c.b.h ? c.b.g / c.b.h : 0, 'בשכר לשעה')}<span>לשעה</span><small>${vs}</small></div>`; })()}
    ${M.gross ? `
    <div class="sec"><span>${secIc('cal', 'blue')}לפי ימים</span></div>
    <div class="card pad">${metricSeg()}<div id="dayChart"></div></div>
    <div class="sec"><span>${secIc('receipt', 'green')}איך זה מחושב</span></div>
    <div class="card steps" id="steps">
      ${L('עבדת', hm(M.hours) + ' ש׳')}
      ${L('הרווחת ברוטו', money(M.gross), '', 'לפני ניכויים, כולל שעות נוספות, תוספות ונסיעות')}
      ${net ? `${L('מס הכנסה', n.tax ? '−' + money(n.tax) : '₪0', n.tax ? 'neg' : '', n.tax ? `אחרי ${(+S.settings.sex + +S.settings.extraPts)} נקודות זיכוי (${money(n.pointsCredit)})` : 'נקודות הזיכוי מכסות את כל המס')}
      ${n.ni + n.health > 0 ? L('ביטוח לאומי ובריאות', '−' + money(n.ni + n.health), 'neg', 'יורד מכל שכר') : L('ביטוח לאומי ובריאות', money(0), '', 'עד גיל 18 לא יורד מהשכר')}
      ${n.pEmp + n.hEmp ? L('חיסכון לפנסיה' + (n.hEmp ? ' והשתלמות' : ''), '−' + money(n.pEmp + n.hEmp), 'neg', 'הכסף נשאר שלך, בקרן') : ''}
      ${L('נכנס לחשבון', money(n.net), 'tot money')}` : ''}
      ${M.tipsOwn ? L('טיפים שלך', '+' + money(M.tipsOwn), '', 'במזומן או מהלקוחות, לא בתלוש') + L('סה״כ בכיס', money(heroAmt + M.tipsOwn), 'tot') : ''}
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
    ${net ? `<p class="fine">הערכה לפי מדרגות מס וביטוח לאומי 2026. התלוש בפועל יכול להיות שונה (הטבות, זקיפות, הסכמים).</p>` : ''}`;
  bindMonthBar(el);
  { const big = $('.hero .big', el); big._v = heroV; countUp(big, heroAmt); heroV = heroAmt; }
  if ($('#dayChart', el)) {
    const nd = new Date(viewY, viewM + 1, 0).getDate(), items = [];
    for (let d = 1; d <= nd; d++) { const A = agg(M.shifts.filter(s => new Date(s.start).getDate() === d)); items.push({ ...A, title: `${DAYS[new Date(viewY, viewM, d).getDay()]} ${d}.${viewM + 1}`, label: d === 1 || d % 5 === 0 ? d : '' }); }
    mountChart($('#dayChart', el), items); bindMetric(el);
  }
  $('#xMonth', el).onclick = () => exportShifts('month');
  $('#xReport', el).onclick = () => openReport();
  $('#netWhy', el) && ($('#netWhy', el).onclick = () => $('#steps', el)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  bindLeave(el);
  $('#xMore', el).onclick = openExport;
}

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
  const cols = $$('.c-col', el), pick = b => { cols.forEach(x => x.classList.toggle('on', x === b)); $('.c-read', el).innerHTML = read(+b.dataset.i); };
  $('.c-bars', el).addEventListener('click', e => {
    let best = null, d = 1e9;
    for (const c of cols) { const r = c.getBoundingClientRect(), dx = Math.abs(e.clientX - (r.left + r.width / 2)); if (dx < d) { d = dx; best = c; } }
    if (best) pick(best);
  });
}

export function renderSum() {
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
  const k = (l, v, s = '', d = '') => `<div class="kpi"><small>${l}</small><b class="num">${v}</b>${d ? `<span class="dline">${d}</span>` : ''}${s ? `<em>${s}</em>` : ''}</div>`;
  const C = yearVsLast(viewY), vsY = `לעומת ${viewY - 1}`;
  const prevNet = !C.partial && C.b.g ? Array.from({ length: 12 }, (_, m) => monthCalc(viewY - 1, m)).reduce((a, M) => a + (M.gross ? M.net.net : 0), 0) : 0;
  el.innerHTML = `<div class="monthbar"><button class="ibtn" data-yn="-1" aria-label="שנה קודמת">${I.chevR}</button><b class="num">${viewY}</b><button class="ibtn" data-yn="1" aria-label="שנה הבאה">${I.chevL}</button></div>
    ${T.count && viewY === RECAP_YEAR ? `<button class="recap-btn${recapOpen() ? '' : ' locked'}" id="openRecap"><span class="grow"><b>השנה שלך באצבע</b><small>${recapOpen() ? 'סיכום השנה כמו סטורי, עם תמונה לשיתוף' : earlyWhen('recap')}</small></span>${recapOpen() ? I.chevL : I.lock}</button>` : ''}
    ${T.count ? `<div class="kpis" style="margin-top:12px">
      ${k('ברוטו שנתי', money(T.gross), '', dlt(C.a.g, C.b.g, vsY))}${NET() ? k('נטו משוער', money(T.net), `מס הכנסה ${money(T.tax)}`, prevNet ? dlt(T.net, prevNet, vsY) : '') : k('משמרות', T.count, `${hm(T.count ? T.hours / T.count : 0)} ש׳ בממוצע`)}
      ${k('שעות', hm(T.hours), `${T.count} משמרות`, dlt(C.a.h, C.b.h, vsY))}${k('ממוצע לשעה', money2(T.hours ? T.gross / T.hours : 0), 'כולל תוספות', dlt(C.a.h ? C.a.g / C.a.h : 0, C.b.h ? C.b.g / C.b.h : 0, vsY))}
      ${k('ממוצע לחודש', money(act ? T.gross / act : 0), `${act} חודשי עבודה`)}${k('חודש שיא', MONTHS[best.m], money(best.gross))}</div>
    ${C.b.g ? `<p class="dl-note">האחוזים: לעומת ${viewY - 1}${C.partial ? ', באותה תקופה בשנה' : ''}.</p>` : ''}
    <div class="sec"><span>${secIc('cal', 'blue')}לפי חודשים</span></div>
    <div class="card pad">${metricSeg()}<div id="yrChart"></div></div>
    <div class="sec"><span>${secIc('ot', 'orange')}חלוקת השעות בשנה</span></div>
    <div class="card pad"><div class="split">${H.map((v, j) => v > 0.004 ? `<i class="cg${j}" style="flex:${v}"></i>` : '').join('')}</div>
      ${GROUPS.map((g, j) => `<div class="ln flat"><span class="l"><i class="dotc cg${j}"></i>${g}</span><span class="v num">${hm(H[j])} ש׳ · ${T.hours ? Math.round(H[j] / T.hours * 100) : 0}%</span></div>`).join('')}</div>
    <div class="sec"><span>${secIc('cal', 'blue')}חודשים</span></div>
    <div class="card">${Ms.map((M, m) => M.shifts.length || M.gross ? `<button class="cell" data-gm="${m}"><span class="grow">${MONTHS[m]}<div class="sub num">${M.shifts.length} משמרות · ${hm(M.hours)} ש׳</div></span><span class="val num" style="text-align:end;color:var(--ink)"><b>${money(M.gross)}</b>${NET() ? `<div class="sub">נטו ${money(M.net.net)}</div>` : ''}</span><span class="chev">${I.chevL}</span></button>` : '').join('')}</div>
    <div class="card" style="margin-top:12px"><button class="cell" id="xYear"><span class="cell-ic t-blue">${I.file}</span><span class="grow">ייצוא סיכום חודשי (CSV)</span><span class="chev">${I.chevL}</span></button></div>`
    : `<div class="card" style="margin-top:12px"><div class="empty"><div class="eic">${I.receipt}</div>אין משמרות ב־${viewY}</div></div>`}
    ${NET() ? `<p class="fine">הנטו השנתי הוא סכום ההערכות החודשיות. החישוב הסופי נעשה בתיאום מס שנתי.</p>` : ''}`;
  $$('[data-yn]', el).forEach(b => b.onclick = () => { showMonth(viewY + +b.dataset.yn, viewM); renderSum(); });
  $('#openRecap', el) && ($('#openRecap', el).onclick = () => recapOpen() ? openRecap(viewY) : (native.billing.available() && !isSup() ? openSupport() : toast(earlyWhen('recap'))));
  if (!T.count) return;
  mountChart($('#yrChart', el), items, viewY === new Date().getFullYear() ? new Date().getMonth() : undefined); bindMetric(el);
  $$('[data-gm]', el).forEach(b => b.onclick = () => { showMonth(viewY, +b.dataset.gm); S.ui.sumView = 'month'; persist(); renderSum(); scrollTo(0, 0); });
  $('#xYear', el).onclick = () => deliver('אצבע-סיכום-חודשי.csv', summaryCSV(), 'text/csv;charset=utf-8');
}
