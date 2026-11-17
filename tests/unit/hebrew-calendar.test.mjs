// Holidays are calculated, not looked up, so they work offline for any year. Checked against a printed calendar to 2035.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidaysOfGregorianYear, sunset, CITIES } from '../../js/hebrew-calendar.js';

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (y, name) => holidaysOfGregorianYear(y).filter(h => h.name === name).map(h => ymd(h.date));

// first day of Rosh Hashana, Yom Kippur, first day of Pesach, Shavuot, Independence Day (as observed)
const KNOWN = {
  2026: ['2026-09-12', '2026-09-21', '2026-04-02', '2026-05-22', '2026-04-22'],
  2027: ['2027-10-02', '2027-10-11', '2027-04-22', '2027-06-11', '2027-05-12'],
  2028: ['2028-09-21', '2028-09-30', '2028-04-11', '2028-05-31', '2028-05-02'],
  2029: ['2029-09-10', '2029-09-19', '2029-03-31', '2029-05-20', '2029-04-19'],
  2030: ['2030-09-28', '2030-10-07', '2030-04-18', '2030-06-07', '2030-05-08'],
  2031: ['2031-09-18', '2031-09-27', '2031-04-08', '2031-05-28', '2031-04-29'],
  2032: ['2032-09-06', '2032-09-15', '2032-03-27', '2032-05-16', '2032-04-15'],
  2033: ['2033-09-24', '2033-10-03', '2033-04-14', '2033-06-03', '2033-05-04'],
  2034: ['2034-09-14', '2034-09-23', '2034-04-04', '2034-05-24', '2034-04-25'],
  2035: ['2035-10-04', '2035-10-13', '2035-04-24', '2035-06-13', '2035-05-15'],
};

for (const [y, [rh, yk, pesach, shavuot, atz]] of Object.entries(KNOWN)) {
  test(`holidays ${y}`, () => {
    assert.deepEqual(day(+y, 'ראש השנה א׳'), [rh]);
    assert.deepEqual(day(+y, 'יום כיפור'), [yk]);
    assert.deepEqual(day(+y, 'פסח'), [pesach]);
    assert.deepEqual(day(+y, 'חג השבועות'), [shavuot]);
    assert.deepEqual(day(+y, 'יום העצמאות'), [atz]);
    assert.equal(holidaysOfGregorianYear(+y).length >= 9, true);
  });
}

test('Independence Day never falls on Friday or Saturday, or right after Shabbat', () => {
  for (let y = 2026; y <= 2035; y++) {
    const [h] = holidaysOfGregorianYear(y).filter(h => h.name === 'יום העצמאות');
    assert.ok(![5, 6, 0].includes(h.date.getDay()), `${y}: ${ymd(h.date)}`);
  }
});

test('sunset in Tel Aviv is in a sensible range all year', () => {
  const [lat, lng] = CITIES['תל אביב'];
  for (let m = 0; m < 12; m++) {
    const s = sunset(2026, m, 15, lat, lng);
    const h = +new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jerusalem' }).format(s);
    assert.ok(h >= 16 && h <= 19, `month ${m + 1}: ${h}`);
  }
});
