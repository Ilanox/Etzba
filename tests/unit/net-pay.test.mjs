// Gross to net: income tax with credit points, National Insurance, health tax and pension, by year and age.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grossToNet, taxFor, setTaxTables, TAX_2026 } from '../../js/net-pay.js';

const s = { points: 2.25, pension: true, pEmp: 6, pEr: 6.5, sev: 6, hish: false };

test('low salary: no income tax after credit points', () => {
  const r = grossToNet(6000, s);
  assert.equal(r.tax, 0); assert.ok(r.net < 6000 && r.net > 5000, String(r.net));
});

test('net is always below gross and rises with it', () => {
  let prev = 0;
  for (let g = 2000; g <= 60000; g += 2000) {
    const r = grossToNet(g, s);
    assert.ok(r.net < g && r.net > prev, `gross ${g} → net ${r.net}`); prev = r.net;
  }
});

test('tax table by year: a year without its own uses the latest earlier one', () => {
  assert.equal(taxFor(2026), TAX_2026);
  assert.equal(taxFor(2031), TAX_2026);
  const t27 = { ...TAX_2026, pointValue: 250 };
  setTaxTables({ 2027: t27 });
  assert.equal(taxFor(2026), TAX_2026); assert.equal(taxFor(2027), t27); assert.equal(taxFor(2030), t27);
  setTaxTables({});
});

test('under 18: no National Insurance or health tax taken from pay', () => {
  const s = { points: 3.25, pension: false, pEmp: 6, pEr: 6.5, sev: 6, hish: false };
  const adult = grossToNet(4000, s), minor = grossToNet(4000, { ...s, minor: true });
  assert.ok(adult.ni + adult.health > 0);
  assert.equal(minor.ni, 0); assert.equal(minor.health, 0);
  assert.equal(minor.net, 4000 - minor.tax);
});

test('under 18: the employer pays the youth National Insurance rate (0.61% / 2.12%)', () => {
  const s = { points: 3.25, pension: false, pEmp: 6, pEr: 6.5, sev: 6, hish: false, minor: true };
  assert.ok(Math.abs(grossToNet(4000, s).employer.bl - 24.4) < 0.01);
  assert.ok(Math.abs(grossToNet(10000, s).employer.bl - (7703 * .0061 + 2297 * .0212)) < 0.01);
});
