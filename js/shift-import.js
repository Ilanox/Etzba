
/* translations: skip-start (column names to recognise in files, not shown) */
const H = {
  date: ['תאריך', 'תאריך כניסה', 'יום בחודש', 'date'],
  in: ['כניסה', 'שעת כניסה', 'התחלה', 'שעת התחלה', 'start', 'in', 'clock in'],
  out: ['יציאה', 'שעת יציאה', 'סיום', 'שעת סיום', 'end', 'out', 'clock out'],
  outDate: ['תאריך יציאה', 'end date'],
  hours: ['שעות', 'שעות לתשלום', 'סה"כ שעות', 'סהכ שעות', 'hours', 'total hours'],
  rate: ['שכר לשעה', 'תעריף לשעה', 'תעריף', 'rate', 'hourly rate'],
  travel: ['נסיעות ליום', 'נסיעות', 'travel'],
  deduct: ['הורדות', 'ניכויים', 'deductions'],
  bonus: ['תוספות', 'טיפים/בונוס', 'בונוס', 'bonus'],
  tips: ['טיפים', 'טיפ', 'tips'],
  breakMin: ['הפסקה (דקות)', 'הפסקה', 'break'],
  note: ['הערות', 'הערה', 'note', 'notes'],
};
/* translations: skip-end */
const norm = s => String(s ?? '').trim().toLowerCase().replace(/[״"]/g, '"').replace(/\s+/g, ' ');

export function findColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r].map(norm), map = {};
    for (const [key, names] of Object.entries(H)) {
      const want = names.map(norm);
      let i = cells.findIndex(c => want.includes(c));
      if (i < 0) i = cells.findIndex(c => c && want.some(w => c.startsWith(w)));
      if (i >= 0 && !Object.values(map).includes(i)) map[key] = i;
    }
    // "תאריך יציאה" must not be taken as the main date
    if (map.date != null && map.date === map.outDate) delete map.date;
    if (map.date != null && map.in != null && map.out != null) return { headerRow: r, map };
  }
  return null;
}

const num = v => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[₪,\s]/g, '').replace(/^‏|‎/g, '');
  if (!s || s === '-' || s === '—') return null;
  const n = parseFloat(s); return isNaN(n) ? null : n;
};
export function parseTime(v) {
  if (typeof v === 'number') { const f = v % 1; return Math.round(f * 1440); }
  const m = /^\s*(\d{1,2})[:.](\d{2})(?::\d{2})?\s*$/.exec(String(v ?? ''));
  return m ? +m[1] * 60 + +m[2] : null;
}
function parseHours(v) {
  if (typeof v === 'number') return v < 1 ? v * 24 : v;
  const s = String(v ?? '').trim(); if (!s || s === '-') return null;
  const m = /^(\d+):(\d{2})$/.exec(s); if (m) return +m[1] + +m[2] / 60;
  const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n;
}
export function parseDate(v) {
  if (typeof v === 'number' && v > 59 && v < 80000) { const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return { d: t.getUTCDate(), m: t.getUTCMonth() + 1, y: t.getUTCFullYear() }; }
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return { d: +m[3], m: +m[2], y: +m[1] };
  m = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/.exec(s);
  if (!m) return null;
  const d = +m[1], mo = +m[2]; if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y = m[3] ? +m[3] : null; if (y != null && y < 100) y += 2000;
  return { d, m: mo, y };
}
export function guessYear(...hints) {
  for (const h of hints) { const m = /(?:^|\D)(20\d{2})(?:\D|$)/.exec(String(h || '')); if (m) return +m[1]; }
  return null;
}
const pad = n => String(n).padStart(2, '0');
const localISO = (y, mo, d, min) => { const t = new Date(y, mo - 1, d, Math.floor(min / 60), min % 60); return t.toISOString(); };

function readSummary(rows, from) {
  const out = {};
  for (let r = from; r < rows.length; r++) {
    const label = norm(rows[r][0]); const val = rows[r].slice(1).find(c => c !== '' && c != null);
    if (!label || val == null) continue;
/* translations: skip-start (summary rows to recognise in files) */
    if (label.startsWith('שעות עבודה')) out.hours = parseHours(val);
    else if (label.startsWith('שכר חודשי') || label.startsWith('סה"כ שכר')) out.gross = num(val);
    else if (label.startsWith('נסיעות')) out.travel = num(val);
    else if (label.startsWith('ימי מחלה')) out.sick = num(val);
    else if (label.startsWith('סה"כ דיווחים')) out.reports = num(val);
/* translations: skip-end */
  }
  return out;
}

export function rowsToShifts(rows, opts = {}) {
  const found = findColumns(rows);
  if (!found) return { error: 'לא מצאתי עמודות של תאריך, כניסה ויציאה בקובץ.' };
  const { headerRow, map } = found;
  const shifts = [], skippedBad = []; let skippedEmpty = 0, lastRow = headerRow, needsYear = false;
  let year = opts.year ?? new Date().getFullYear(), prevMonth = null;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r], cell = k => map[k] != null ? row[map[k]] : '';
    if (!row.some(c => c !== '' && c != null)) continue;
    const date = parseDate(cell('date'));
    if (!date) { if (shifts.length || skippedEmpty) break; else continue; }
    lastRow = r;
    if (date.y == null) { needsYear = true; if (prevMonth != null && date.m < prevMonth - 6) year++; prevMonth = date.m; }
    const y = date.y ?? year;
    const a = parseTime(cell('in')), b = parseTime(cell('out')), hrs = parseHours(cell('hours'));
    if (a == null || b == null) { skippedBad.push({ row: r + 1, why: 'שעה לא מובנת' }); continue; }
    if (a === b && (!hrs || hrs === 0)) { skippedEmpty++; continue; }
    let endDay = { ...date, y };
    const od = map.outDate != null ? parseDate(cell('outDate')) : null;
    const start = localISO(y, date.m, date.d, a);
    let end;
    if (od) end = localISO(od.y ?? y, od.m, od.d, b);
    else { end = localISO(y, date.m, date.d, b); if (b <= a) end = new Date(+new Date(end) + 864e5).toISOString(); }
    const span = (new Date(end) - new Date(start)) / 6e4;
    if (span <= 0 || span > 24 * 60) { skippedBad.push({ row: r + 1, why: 'משך לא הגיוני' }); continue; }
    let breakMin = num(cell('breakMin')) ?? 0;
    if (!breakMin && hrs != null && span - hrs * 60 >= 1) breakMin = Math.round(span - hrs * 60);
    const sh = { start, end, breakMin, bonus: (num(cell('bonus')) ?? 0) - (num(cell('deduct')) ?? 0), note: (() => { const n = String(cell('note') ?? '').trim(); return n === '-' ? '' : n; })() };
    const rate = num(cell('rate')); if (rate != null) sh.rate = rate;
    if (map.travel != null) sh.travel = num(cell('travel')) ?? 0;
    if (map.tips != null) { const t = num(cell('tips')); if (t) sh.tips = t; }
    sh.fileHours = hrs;
    shifts.push(sh);
  }
  const summary = readSummary(rows, lastRow + 1);
  return { shifts, skippedEmpty, skippedBad, needsYear, year, summary, map };
}
