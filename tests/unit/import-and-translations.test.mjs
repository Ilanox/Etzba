import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rowsToShifts, parseTime, parseDate } from '../../js/shift-import.js';
import { usePack, tr } from '../../js/translate.js';
import en from '../../languages/en.js';

test('times in common formats', () => {
  assert.equal(parseTime('08:30'), 8.5 * 60);
  assert.equal(parseTime('8:05'), 8 * 60 + 5);
});

test('a simple Hebrew spreadsheet becomes shifts', () => {
  const rows = [['תאריך', 'כניסה', 'יציאה'], ['17/11/2026', '08:00', '16:30'], ['18/11/2026', '22:00', '06:00'], ['', '', '']];
  const r = rowsToShifts(rows, { year: 2026 });
  assert.equal(r.shifts.length, 2);
  const [a, b] = r.shifts.map(s => (new Date(s.end) - new Date(s.start)) / 36e5);
  assert.equal(a, 8.5); assert.equal(b, 8, 'night shift ends the next morning');
});

test('English pack translates phrases and templates', () => {
  usePack(en);
  assert.equal(tr('לא במשמרת'), 'Not on shift');
  assert.equal(tr('שעת הכניסה: 08:00'), 'Start time: 08:00');
  usePack(null);
});

test('translation check script runs', () => {
  const out = execFileSync(process.execPath, [new URL('../../scripts/check-translations.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /proper/);
});
