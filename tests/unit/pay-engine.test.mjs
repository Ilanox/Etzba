// Pay engine: tiers, overtime, Shabbat, holidays, election day, the weekly limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftPay, defaultJob, rateChanges, setElectionDays } from '../../js/pay-engine.js';

process.env.TZ ||= 'Asia/Jerusalem';
const place = { city: 'תל אביב', candleMin: 18, havdalahMin: 40 };
const job = (over = {}) => ({ ...defaultJob('test'), ...over });
const at = (s, hours) => { const a = new Date(s); return { start: a.toISOString(), end: new Date(+a + hours * 36e5).toISOString() }; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

test('a plain 8-hour weekday is all regular hours', () => {
  const p = shiftPay(at('2026-11-17T08:00:00+02:00', 8), job(), place);   // Tuesday
  near(p.hours, 8, 'hours'); near(p.b.reg, 8, 'regular minutes'); near(p.pay, 8 * 40, 'pay');
});

test('a 12-hour weekday: 8.6 regular, 2 at 125%, the rest at 150%', () => {
  const p = shiftPay(at('2026-11-17T08:00:00+02:00', 12), job(), place);
  near(p.b.reg, 8.6, 'regular'); near(p.b.ot1, 2, 'ot1'); near(p.b.ot2, 1.4, 'ot2');
  near(p.pay, 40 * (8.6 + 2 * 1.25 + 1.4 * 1.5), 'pay');
});

test('overtime switched off: everything at 100%', () => {
  const p = shiftPay(at('2026-11-17T08:00:00+02:00', 12), job({ otOn: false }), place);
  near(p.pay, 12 * 40, 'pay');
});

test('Saturday daytime is paid at 150%', () => {
  const p = shiftPay(at('2026-11-21T09:00:00+02:00', 6), job(), place);    // Saturday
  near(p.b.rest, 6, 'rest hours'); near(p.pay, 6 * 40 * 1.5, 'pay');
});

test('Friday shift crosses into Shabbat at candle lighting', () => {
  const p = shiftPay(at('2026-11-20T12:00:00+02:00', 6), job(), place);    // Friday 12–18
  assert.ok(p.b.rest > 0 && p.b.reg > 0, 'both regular and Shabbat minutes');
  assert.ok(p.restHours > 1 && p.restHours < 3, 'about 2 hours of Shabbat: ' + p.restHours);
});

test('Yom Kippur 2026 counts as a holiday', () => {
  const p = shiftPay(at('2026-09-21T10:00:00+03:00', 4), job(), place);    // Monday, Yom Kippur
  near(p.b.chag, 4, 'holiday hours');
});

test('election day: 200%, and only when the rule is on', () => {
  const s = at('2026-10-27T09:00:00+02:00', 6);
  near(shiftPay(s, job(), place).pay, 6 * 40 * 2, 'with the rule');
  near(shiftPay(s, job({ election: false }), place).pay, 6 * 40, 'without');
});

test('election days come from the rules data', () => {
  const s = at('2030-03-05T09:00:00+02:00', 4);
  near(shiftPay(s, job(), place).pay, 4 * 40, 'not an election day yet');
  setElectionDays(['2026-10-27', '2030-03-05']);
  near(shiftPay(s, job(), place).pay, 4 * 40 * 2, 'after adding it');
  setElectionDays(['2026-10-27']);
});

test('weekly limit: hours past it are overtime, and the limit can be changed', () => {
  const s = at('2026-11-19T08:00:00+02:00', 6);                          // Thursday
  const def = shiftPay(s, job(), place, 40);                             // 40 regular hours already this week
  near(def.b.reg, 2, 'regular up to 42'); assert.ok(def.b.ot1 > 0, 'then overtime');
  const custom = shiftPay(s, job({ weeklyLimit: 45 }), place, 40);
  near(custom.b.reg, 5, 'regular up to 45');
  const off = shiftPay(s, job({ weeklyRule: false }), place, 40);
  near(off.b.reg, 6, 'no weekly rule');
});

test('a break is unpaid', () => {
  const p = shiftPay({ ...at('2026-11-17T08:00:00+02:00', 8), breakMin: 30 }, job(), place);
  near(p.hours, 7.5, 'paid hours');
});

test('rate changes timeline: Friday 09:00 reaches Shabbat, then Shabbat overtime', () => {
  const ch = rateChanges(new Date('2026-11-20T09:00:00+02:00'), job(), place, 0, 16);
  const keys = ch.map(c => c.key);
  assert.ok(keys.includes('rest'), 'Shabbat starts: ' + keys);
  assert.ok(keys.some(k => /Ot1$/.test(k) || k === 'ot1'), 'overtime starts: ' + keys);
  for (let i = 1; i < ch.length; i++) assert.ok(+new Date(ch[i].at) > +new Date(ch[i - 1].at), 'in order');
});
