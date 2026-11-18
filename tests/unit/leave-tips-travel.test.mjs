// Tips, travel once per work day, sick days and vacation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftPay, defaultJob, computeAll } from '../../js/pay-engine.js';
import { balances, sickShares, dayValue, lawVacDays } from '../../js/leave.js';

process.env.TZ ||= 'Asia/Jerusalem';
const place = { city: 'תל אביב', candleMin: 18, havdalahMin: 40 };
const job = (over = {}) => ({ ...defaultJob('test'), ...over });
const at = (s, hours, extra = {}) => { const a = new Date(s); return { start: a.toISOString(), end: new Date(+a + hours * 36e5).toISOString(), ...extra }; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

test('own tips come on top and are not part of the pay', () => {
  const p = shiftPay(at('2026-11-17T08:00:00+02:00', 8, { tips: 200 }), job({ tipsOn: true }), place);
  near(p.pay, 320, 'pay'); near(p.tips, 200, 'tips'); assert.equal(p.tipsInPay, false);
});

test('tips through the employer: topped up to the hourly pay when short', () => {
  const p = shiftPay(at('2026-11-17T08:00:00+02:00', 8, { tips: 200 }), job({ tipsOn: true, tipsMode: 'wage' }), place);
  near(p.pay, 320, 'pay is the hourly pay'); near(p.topUp, 120, 'employer tops up');
});

test('tips through the employer above the hourly pay are the pay', () => {
  const p = shiftPay(at('2026-11-17T08:00:00+02:00', 8, { tips: 500 }), job({ tipsOn: true, tipsMode: 'wage' }), place);
  near(p.pay, 500, 'pay'); near(p.topUp, 0, 'no top-up');
});

test('travel is paid once per work day, unless set per shift', () => {
  const j = job({ travel: 11 }), shifts = [
    { id: 'a', jobId: j.id, ...at('2026-11-17T08:00:00+02:00', 4) },
    { id: 'b', jobId: j.id, ...at('2026-11-17T17:00:00+02:00', 4) },
    { id: 'c', jobId: j.id, ...at('2026-11-18T08:00:00+02:00', 4) },
  ];
  const P = computeAll(shifts, () => j, place);
  near(P.get('a').travel + P.get('b').travel + P.get('c').travel, 22, 'two days');
  const js = job({ travel: 11, travelMode: 'shift' });
  const Q = computeAll(shifts.map(s => ({ ...s, jobId: js.id })), () => js, place);
  near(Q.get('a').travel + Q.get('b').travel + Q.get('c').travel, 33, 'every shift');
});

test('sick pay: first day nothing, second and third half, then full; a gap starts over', () => {
  const ab = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-10'].map((date, i) => ({ id: 's' + i, kind: 'sick', date }));
  assert.deepEqual(Object.values(sickShares(ab)), [0, 0.5, 0.5, 1, 0]);
});

test('an ordinary day is the average pay per day worked in the 90 days before', () => {
  const worked = [{ start: '2026-10-01T06:00:00Z', base: 300 }, { start: '2026-10-02T06:00:00Z', base: 100 }, { start: '2026-10-02T14:00:00Z', base: 100 }, { start: '2026-01-01T06:00:00Z', base: 9999 }];
  near(dayValue(job(), worked, '2026-11-01'), 250, 'two days');
  near(dayValue(job({ rate: 40, regHours: 8 }), [], '2026-11-01'), 320, 'no history: a regular day');
});

test('vacation: a full year for 200 days, in proportion below; sick 1.5 a full month', () => {
  const days = [];
  for (let d = new Date(2025, 0, 1); days.length < 220; d.setDate(d.getDate() + 1)) if (d.getDay() !== 5 && d.getDay() !== 6) days.push({ start: new Date(d).toISOString() });
  const b = balances(job({ startDate: '2025-01-01' }), days, [], new Date(2025, 11, 31));
  near(b.vac.accrued, lawVacDays(job()), 'full year');
  const half = balances(job({ startDate: '2025-01-01' }), days.slice(0, 100), [], new Date(2025, 11, 31));
  near(half.vac.accrued, 6, '100 of 200 days');
  assert.ok(b.sick.accrued > 15 && b.sick.accrued <= 18, 'about 1.5 a month: ' + b.sick.accrued);
});

test('used days come off the balance', () => {
  const days = [];
  for (let d = new Date(2025, 0, 1); d < new Date(2025, 5, 1); d.setDate(d.getDate() + 1)) if (d.getDay() < 5) days.push({ start: new Date(d).toISOString() });
  const ab = [{ id: 'v', kind: 'vac', date: '2025-05-10' }, { id: 's', kind: 'sick', date: '2025-05-12' }];
  const b = balances(job(), days, ab, new Date(2025, 5, 1));
  assert.equal(b.vac.used, 1); assert.equal(b.sick.used, 1);
  near(b.vac.left, b.vac.accrued - 1, 'vacation left');
});

test('a special shift: every hour at its own rate, no overtime or Shabbat', () => {
  const p = shiftPay(at('2026-11-21T09:00:00+02:00', 3, { specialPct: 200 }), job(), place);   // Saturday
  near(p.b.special, 3, 'special hours'); near(p.pay, 3 * 40 * 2, 'pay'); near(p.restHours, 0, 'no Shabbat');
  const q = shiftPay(at('2026-11-17T08:00:00+02:00', 12, { specialPct: 150 }), job(), place);
  near(q.otHours, 0, 'no overtime'); near(q.pay, 12 * 40 * 1.5, 'long special shift');
});

test('one vacation is one run: a weekend in the middle keeps it together, a longer gap starts a new one', async () => {
  const { runStarts } = await import('../../js/leave.js');
  const ab = ['2026-11-18', '2026-11-19', '2026-11-22', '2026-11-23', '2026-12-10'].map((date, i) => ({ id: 'v' + i, kind: 'vac', date }));
  assert.deepEqual(Object.values(runStarts(ab)), ['2026-11-18', '2026-11-18', '2026-11-18', '2026-11-18', '2026-12-10']);
});
