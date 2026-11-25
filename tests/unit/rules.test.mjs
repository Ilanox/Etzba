// Offline-first rules: the built-in copy must match data/rules.json, and a bad download is rejected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const { BUILT_IN, validate, apply, loadRules, checkForUpdates, rules } = await import('../../js/rules.js');
const pay = await import('../../js/pay-engine.js');
const file = JSON.parse(readFileSync(new URL('../../data/rules.json', import.meta.url), 'utf8'));

test('built-in rules match data/rules.json', () => {
  assert.equal(file.version, BUILT_IN.version);
  assert.deepEqual(file.minWage, BUILT_IN.minWage);
  assert.deepEqual(file.elections, BUILT_IN.elections);
  assert.deepEqual(JSON.parse(JSON.stringify(BUILT_IN.tax)), file.tax);
});

test('both copies are valid', () => { validate(BUILT_IN); validate(file); });

test('bad rules are rejected', () => {
  const bad = [null, {}, { ...file, version: '2' }, { ...file, minWage: [] }, { ...file, minWage: [{ from: '2027-01-01', hourly: 3 }] },
    { ...file, elections: [{ date: '27/10/2026' }] }, { ...file, tax: { 2027: { ...file.tax[2026], niLow: 7 } } }, { ...file, tax: { 2027: { ...file.tax[2026], brackets: [[1, 2]] } } }];
  for (const b of bad) assert.throws(() => validate(b));
});

test('applying rules sets minimum wage and election days', () => {
  apply({ ...file, version: 9, minWage: [{ from: '2020-01-01', hourly: 30 }, { from: '2099-01-01', hourly: 99 }], elections: [{ date: '2030-01-01' }] });
  assert.equal(pay.MIN_WAGE_HOURLY, 30);
  assert.deepEqual(pay.ELECTION_DAYS, ['2030-01-01']);
  apply(BUILT_IN);
  assert.equal(pay.MIN_WAGE_HOURLY, 35.40);
});

test('works offline: no network → built-in rules, no error', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  loadRules();
  assert.equal(await checkForUpdates(null, { force: true }), false);
  assert.equal(rules().version, BUILT_IN.version);
});

test('a newer valid file is applied and saved; an older one is ignored', async () => {
  let changed = 0;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...file, version: BUILT_IN.version + 1, elections: [{ date: '2031-06-01' }] }) });
  assert.equal(await checkForUpdates(() => changed++, { force: true }), true);
  assert.equal(changed, 1); assert.deepEqual(pay.ELECTION_DAYS, ['2031-06-01']);
  assert.equal(JSON.parse(localStorage.getItem('etzba.rules')).version, BUILT_IN.version + 1);
  // next launch, still offline: the saved copy is used
  globalThis.fetch = async () => { throw new Error('offline'); };
  loadRules(); assert.deepEqual(pay.ELECTION_DAYS, ['2031-06-01']);
  // not more than once a day
  assert.equal(await checkForUpdates(() => changed++), false);
  localStorage.removeItem('etzba.rules'); apply(BUILT_IN);
});

test('a broken download never replaces working rules', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: 99, minWage: 'oops' }) });
  assert.equal(await checkForUpdates(null, { force: true }), false);
  assert.equal(rules().version, BUILT_IN.version);
});
