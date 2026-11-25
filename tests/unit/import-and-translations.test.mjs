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
  assert.equal(tr('גיל 17'), 'Age 17');
  usePack(null);
});

test('templates: the most specific one wins, and pieces come back in place', () => {
  usePack({ templates: [['לעומת {}', 'compared with {1}'], ['לעומת {}, באותה תקופה', 'compared with {1}, the same part of the year'], ['{} מתוך {}', '{2}: {1}'], ['גיל {}', 'Age {}']] });
  assert.equal(tr('לעומת 2025, באותה תקופה'), 'compared with 2025, the same part of the year');
  assert.equal(tr('לעומת 2025'), 'compared with 2025');
  assert.equal(tr('3 מתוך 5'), '5: 3');
  assert.equal(tr('גיל 17'), 'Age 17');
  usePack(null);
});

test('English pack: every template is unique and numbers only the pieces it has', () => {
  const seen = new Set();
  for (const [he, t] of en.templates) {
    assert.ok(!seen.has(he), 'duplicate template: ' + he); seen.add(he);
    const n = he.split('{}').length - 1;
    assert.ok(!/\{\}/.test(t), 'number the pieces in: ' + t);
    for (const [, d] of t.matchAll(/\{(\d+)\}/g)) assert.ok(+d >= 1 && +d <= n, `{${d}} in "${t}" but the Hebrew has ${n} pieces`);
  }
});

test('translation check script runs', () => {
  const out = execFileSync(process.execPath, [new URL('../../scripts/check-translations.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.match(out, /proper/);
});
