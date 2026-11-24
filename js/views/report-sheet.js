// The monthly report: choosing what goes in, and building the PDF.
import { monthCalc, NET, netOpts, PAY } from '../pay.js';
import { viewY, viewM } from '../nav.js';
import { toast, openSheet, closeSheet } from '../ui.js';
import { S, jobById } from '../state.js';
import { MONTHS, EN, DAYS } from '../lang.js';
import { nm, $$, $, pad, hm, money2, money, dFull, tm } from '../util.js';
import { I } from '../svg-icons.js';
import { report } from '../app.js';
import { tr } from '../translate.js';
import { TIERS, jobAt } from '../pay-engine.js';
import { tierLabel } from './common.js';
import { grossToNet, taxFor } from '../net-pay.js';
import { drawReport, pagesToPDF } from '../report.js';
import { deliver } from '../files.js';

export function openReport() {
  const M0 = monthCalc(viewY, viewM);
  if (!M0.shifts.length && !M0.absent.length) return toast('אין משמרות בחודש הזה');
  const used = S.jobs.filter(j => M0.shifts.some(s => s.jobId === j.id) || M0.absent.some(a => a.jobId === j.id));
  let jobId = used.length === 1 ? used[0].id : 'all';
  openSheet(`<h2>דוח חודשי</h2><p class="shsub">${MONTHS[viewM]} ${viewY}: כל המשמרות, השעות לפי סוג והשכר, בקובץ PDF שאפשר לשלוח למעסיק או לשמור.</p>
    ${used.length > 1 ? `<div class="chips" id="rp-jobs" style="margin-top:14px"><button type="button" class="chip" data-j="all">כל העבודות</button>${used.map(j => `<button type="button" class="chip" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}</div>` : ''}
    <label class="cell flat" style="margin-top:10px"><span class="grow">עם נטו משוער<div class="sub">בלי זה הדוח מראה רק שעות וברוטו</div></span><span class="switch"><input type="checkbox" id="rp-net"${NET() ? '' : ' disabled'}><i></i></span></label>
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
    const n = grossToNet(gross, netOpts(y, m), taxFor(y));
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
    footer: T('הופק באצבע · etzba.co.il · חישוב לפי החוק וההגדרות שהוזנו, לא תלוש שכר רשמי'),
    pageLabel: (i, n) => `${i} / ${n}`,
  });
  return pagesToPDF(pages);
}
