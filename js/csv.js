// Shifts and monthly totals as CSV, for Excel and Google Sheets. Column names stay in Hebrew.
import { TIERS, KIND_NAME, shiftKind } from './pay-engine.js';
import { PAY, monthCalc } from './pay.js';
import { jobById, index } from './state.js';
import { dFull, tm, pad } from './util.js';
import { DAYS } from './lang.js';

export function toCSV(rows) {
  const cell = c => { c = c == null ? '' : String(c); if (/^[=+\-@\t\r]/.test(c) && isNaN(+c)) c = "'" + c; return /[",\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

export const n2 = x => (Math.round(x * 100) / 100).toFixed(2);

/* translations: skip-start (CSV file contents are Hebrew by design) */
export const CSV_TIER = { reg: 'שעות רגילות', ot1: 'שעות נוספות א׳', ot2: 'שעות נוספות ב׳', rest: 'שעות שבת', restOt1: 'שבת נוספות א׳', restOt2: 'שבת נוספות ב׳', chag: 'שעות חג', chagOt1: 'חג נוספות א׳', chagOt2: 'חג נוספות ב׳' , elect: 'שעות יום בחירות', electOt1: 'יום בחירות נוספות א׳', electOt2: 'יום בחירות נוספות ב׳', special: 'שעות בתעריף מיוחד' };

export function shiftsCSV(list) {
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

export function summaryCSV() {
  const keys = [...index().month.keys()].sort((a, b) => a - b);
  const rows = [['חודש', 'משמרות', 'שעות', 'ברוטו', 'מס הכנסה', 'ביטוח לאומי', 'ביטוח בריאות', 'פנסיה (עובד)', 'קרן השתלמות (עובד)', 'נטו משוער', 'פנסיה (מעסיק)', 'פיצויים', 'עלות מעסיק']];
  for (const k of keys) {
    const y = Math.floor(k / 12), m = k % 12, M = monthCalc(y, m), n = M.net;
    rows.push([`${pad(m + 1)}/${y}`, M.shifts.length, n2(M.hours), n2(M.gross), n2(n.tax), n2(n.ni), n2(n.health), n2(n.pEmp), n2(n.hEmp), n2(n.net), n2(n.employer.pension), n2(n.employer.severance), n2(n.cost)]);
  }
  return toCSV(rows);
}
