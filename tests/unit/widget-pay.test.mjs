// The widget adds up time × rate per segment (native/android/WidgetState.java, earned()). The segments come
// from the pay engine, the same way js/widget.js builds them. Here the same sum, written exactly like the Java,
// must match the engine's pay for the shifts where rates change: overtime, into Shabbat, a holiday, a night.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftPay, defaultJob, rateChanges } from '../../js/pay-engine.js';

process.env.TZ ||= 'Asia/Jerusalem';
const place = { city: 'תל אביב', candleMin: 18, havdalahMin: 40 };

/** The segments js/widget.js sends: [from (ms), pay per hour, name]. */
function segments(start, job) {
  const first = shiftPay({ start, end: new Date(+new Date(start) + 6e4).toISOString(), breakMin: 0 }, job, place);
  const per = key => Math.round(job.rate * job.r[key]) / 100;
  return [[+new Date(start), per(first.lastKey || 'reg')], ...rateChanges(start, job, place, 0, 16).map(c => [+new Date(c.at), per(c.key)])];
}

/** WidgetState.earned(), line for line. */
function earned(segs, now) {
  let sum = 0;
  for (let i = 0; i < segs.length; i++) {
    const from = segs[i][0], to = i + 1 < segs.length ? segs[i + 1][0] : Number.MAX_SAFE_INTEGER;
    const b = Math.min(to, now);
    if (b > from) sum += (b - from) / 3.6e6 * segs[i][1];
  }
  return sum;
}

const CASES = [
  ['a long weekday: 100%, 125%, 150%', '2026-11-17T08:00:00+02:00', 12],
  ['Friday into Shabbat, then Shabbat overtime', '2026-11-20T09:00:00+02:00', 13],
  ['Yom Kippur', '2026-09-21T10:00:00+03:00', 10],
  ['a night shift', '2026-11-17T22:00:00+02:00', 10],
  ['Saturday night, Shabbat ends mid-shift', '2026-11-21T14:00:00+02:00', 9],
];

for (const [name, start, hours] of CASES) test(`widget pay = app pay: ${name}`, () => {
  const job = { ...defaultJob('test'), rate: 43.5 }, segs = segments(start, job);
  for (let h = 0.5; h <= hours; h += 0.5) {
    const end = new Date(+new Date(start) + h * 36e5).toISOString();
    const app = shiftPay({ start, end, breakMin: 0 }, job, place).pay, widget = earned(segs, +new Date(end));
    assert.ok(Math.abs(app - widget) < 0.05, `after ${h} h: the app says ₪${app.toFixed(2)}, the widget ₪${widget.toFixed(2)}`);
  }
});
