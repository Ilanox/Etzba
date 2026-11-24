// Sick and vacation days: the summary card, adding days, and recuperation pay.
import { S, jobById } from '../state.js';
import { leaveOf, havraaOf } from '../pay.js';
import { nm, dShort, dFull, money, $, $$, dateKey, uid } from '../util.js';
import { DAYS, MONTHS } from '../lang.js';
import { I } from '../svg-icons.js';
import { viewM, commit, viewY, showMonth } from '../nav.js';
import { buzz, toast, openSheet, closeSheet } from '../ui.js';

export function leaveCard(M) {
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

export function bindLeave(root) {
  $('#addLeave', root) && ($('#addLeave', root).onclick = () => openLeaveSheet());
  $$('[data-ab]', root).forEach(b => b.onclick = () => {
    const i = S.absences.findIndex(a => a.id === b.dataset.ab); if (i < 0) return;
    const was = S.absences[i]; S.absences.splice(i, 1); commit(); buzz(15);
    toast('נמחק', '', { label: 'ביטול', fn: () => { S.absences.push(was); commit(); } });
  });
}

export const leaveHint = kind => kind === 'sick'
  ? 'דמי מחלה: היום הראשון בלי תשלום, השני והשלישי 50%, ומהרביעי 100%. צריך אישור מחלה. ימים ברצף נספרים יחד.'
  : 'ימי עבודה בלבד: בלי שבתות וחגים שלא עובדים בהם.';

export function addLeave(jobId, kind, from, n) {
  n = Math.min(60, Math.max(1, Math.round(+n || 1)));
  const job = jobById(jobId), [y, m, dd] = from.split('-').map(Number);
  let added = 0;
  for (let d = new Date(y, m - 1, dd); added < n; d.setDate(d.getDate() + 1)) {
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
      const d = new Date(y, m - 1, dd); showMonth(d.getFullYear(), d.getMonth());
      closeSheet(); commit(); buzz(20); toast(n === 1 ? 'נשמר יום אחד' : `נשמרו ${n} ימים`, 'ok');
    };
  });
}
