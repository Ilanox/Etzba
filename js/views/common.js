// Pieces several screens share: month switcher, shift rows, the pay explanation, % changes, animated numbers.
import { TIER_NAME, shiftKind, KIND_NAME, TIERS } from '../pay-engine.js';
import { I } from '../svg-icons.js';
import { MONTHS, DAYS, EN } from '../lang.js';
import { viewM, viewY, stepMonth, render } from '../nav.js';
import { $$, esc, hm, nm, dShort, tm, money, pctChange, $, money2 } from '../util.js';
import { jobById, S, index } from '../state.js';
import { PAY, minWage } from '../pay.js';
import { openShiftSheet } from './shift-form.js';

export const tierLabel = (k, job, pct) => k === 'special' ? (pct ? `${TIER_NAME[k]} ${pct}%` : TIER_NAME[k]) : `${TIER_NAME[k]} ${job.r[k]}%`;

export function monthBar() {
  return `<div class="monthbar"><button class="ibtn" data-mn="-1" aria-label="חודש קודם">${I.chevR}</button>
    <b>${MONTHS[viewM]} ${viewY}</b><button class="ibtn" data-mn="1" aria-label="חודש הבא">${I.chevL}</button></div>`;
}

export function bindMonthBar(root) {
  $$('[data-mn]', root).forEach(b => b.onclick = () => {
    stepMonth(+b.dataset.mn);
    render();
  });
}

export function shiftRow(s) {
  const job = jobById(s.jobId), p = PAY.get(s.id); if (!p) return '';
  const k = shiftKind(s, p), d = new Date(s.start);
  const pills = [
    p.restHours > 0.01 ? `<span class="pill rest">${esc(p.names[0])}</span>` : '',
    p.otHours > 0.01 ? `<span class="pill ot">+${hm(p.otHours)} נוספות</span>` : '',
    p.specialPct ? `<span class="pill special">${p.specialPct}%</span>` : '',
  ].join('');
  const second = [S.jobs.length > 1 ? `<span class="jobp"><i style="background:${job.color}"></i>${nm(job.name)}</span>` : esc(KIND_NAME[k]), s.note ? nm(s.note) : ''].filter(Boolean);
  const marks = [p.specialPct ? ['special', 'pct'] : null, p.otHours > 0.01 ? ['ot', 'ot'] : null, p.tips ? ['tips', 'coins'] : null].filter(Boolean).slice(0, 2);
  return `<button class="srow" data-id="${s.id}">
    <span class="kic k-${k}" title="${KIND_NAME[k]}">${I[k]}${marks.length ? `<span class="marks">${marks.map(([c, i]) => `<i class="mk c-${c}">${I[i]}</i>`).join('')}</span>` : ''}</span>
    <span class="mid"><span class="t1">${DAYS[d.getDay()]} ${dShort(d)} ${pills}</span>
      <span class="t2 num tline"><bdi dir="ltr" class="trange">${tm(s.start)}–${tm(s.end)}</bdi><span class="tmore">${second.map(x => `<span class="sep">·</span>${x}`).join('')}</span></span></span>
    <span class="end"><span class="amt num">${money(p.pay)}</span><br><span class="t2 num">${hm(p.hours)} ש׳</span></span></button>`;
}

export function dlt(cur, prev, what = '') {
  const p = pctChange(cur, prev); if (p === null) return '';
  const cls = p > 0 ? 'up' : p < 0 ? 'down' : 'flat';
  const he = p > 0 ? `עלייה של ${p}%` : p < 0 ? `ירידה של ${-p}%` : 'ללא שינוי';
  return `<span class="dlt ${cls}" dir="ltr" role="img" aria-label="${he}${what ? ' ' + what : ''}">${p > 0 ? '+' : p < 0 ? '-' : ''}${Math.abs(p)}%</span>`;
}

export function showWhy(sh) { openShiftSheet(sh, 'edit'); setTimeout(() => $('#f-explain')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350); }

export function bindRows(root) { $$('.srow', root).forEach(r => r.onclick = () => openShiftSheet(index().byId.get(r.dataset.id), 'edit')); }

export function explain(sh, job, p) {
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
  if (p.rate < minWage(sh.start)) w('warn', `התעריף נמוך משכר המינימום (₪${minWage(sh.start)} לשעה).`, true);
  if (job.minor && p.otHours > 0) w('warn', 'עד גיל 18 אסור לעבוד שעות נוספות, אבל אם עבדת אותן מגיע לך תשלום עליהן.', true);
  return `<div class="explain"><div class="ehead"><b class="num">${money2(p.pay)}</b><span class="num">${hm(p.hours)} שעות</span></div>${lines.join('')}${why.join('')}</div>`;
}

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function countUp(el, to, fmt = money) {
  const from = el._v ?? 0; el._v = to;
  if (from === to || reduced) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); cancelAnimationFrame(el._raf);
  const step = t => { const k = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}

export const dayWord = d => { const t = new Date(); t.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0); const n = Math.round((x - t) / 864e5);
  return n === 0 ? 'היום' : n === 1 ? 'מחר' : n === -1 ? 'אתמול' : `${DAYS[x.getDay()]} ${dShort(x)}`; };
