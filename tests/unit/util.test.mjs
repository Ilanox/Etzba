// Small helpers used everywhere (js/util.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, hm, pad, pctChange, niceMax, dateKey, money2 } from '../../js/util.js';

test('util: text and numbers', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(hm(8.6), '8:36'); assert.equal(hm(0.999), '1:00');
  assert.equal(pad(7), '07');
  assert.equal(pctChange(113, 100), 13); assert.equal(pctChange(5, 0), null);
  assert.equal(niceMax(7.3), 10); assert.equal(niceMax(140), 200); assert.equal(niceMax(0), 1);
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.match(money2(5.5), /5\.50/);
});
