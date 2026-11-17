// אצבע — yearly figures (minimum wage, election days, tax tables).
// Built in so the app works fully offline from the first launch. When there's internet, at most once a
// day, the newest data/rules.json is fetched from the project's GitHub Pages and kept on the phone;
// it only replaces the built-in figures if its version is newer and it passes a sanity check.
import { setElectionDays, setMinWage } from './pay-engine.js';
import { setTaxTables } from './net-pay.js';
import * as dbg from './diagnostics.js';

export const RULES_URL = 'https://ilanox.github.io/Etzba/data/rules.json';
const KEY = 'etzba.rules', CHECKED = 'etzba.rules.checked', DAY = 864e5;

// keep in step with data/rules.json
export const BUILT_IN = {
  version: 1,
  minWage: [{ from: '2025-04-01', hourly: 34.32 }, { from: '2026-04-01', hourly: 35.40 }],
  elections: [{ date: '2026-10-27', name: 'בחירות לכנסת' }],
  tax: {
    2026: {
      brackets: [[7010, .10], [10060, .14], [19000, .20], [25100, .31], [46690, .35], [null, .47]],
      surtaxFrom: 60130, surtaxRate: .03, pointValue: 242, blLow: 7703, blMax: 51910,
      niLow: .0104, niHigh: .07, hLow: .0323, hHigh: .0517, erLow: .0451, erHigh: .076, pensionCreditCap: 9700,
    },
  },
};

let current = BUILT_IN;
export const rules = () => current;

/** Throws if a rules file looks wrong, so a bad upload can never break pay calculations. */
export function validate(r) {
  const num = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
  if (!r || typeof r !== 'object' || !Number.isInteger(r.version)) throw new Error('version');
  if (!Array.isArray(r.minWage) || !r.minWage.length || !r.minWage.every(m => /^\d{4}-\d\d-\d\d$/.test(m.from) && num(m.hourly, 20, 200))) throw new Error('minWage');
  if (!Array.isArray(r.elections) || !r.elections.every(e => /^\d{4}-\d\d-\d\d$/.test(e.date))) throw new Error('elections');
  if (!r.tax || typeof r.tax !== 'object' || !Object.keys(r.tax).length) throw new Error('tax');
  for (const [y, t] of Object.entries(r.tax)) {
    if (!/^\d{4}$/.test(y) || !Array.isArray(t.brackets) || t.brackets.length < 3) throw new Error('tax ' + y);
    if (!t.brackets.every(([cap, rate]) => (cap === null || num(cap, 1000, 1e6)) && num(rate, 0, .7))) throw new Error('brackets ' + y);
    for (const k of ['pointValue', 'blLow', 'blMax']) if (!num(t[k], 1, 1e6)) throw new Error(k + ' ' + y);
    for (const k of ['niLow', 'niHigh', 'hLow', 'hHigh', 'erLow', 'erHigh', 'surtaxRate']) if (!num(t[k], 0, .3)) throw new Error(k + ' ' + y);
  }
  return r;
}

/** Puts a rules object into effect everywhere it's used. */
export function apply(r) {
  current = r;
  const today = new Date().toISOString().slice(0, 10);
  const wage = [...r.minWage].sort((a, b) => a.from < b.from ? -1 : 1).filter(m => m.from <= today).pop() || r.minWage[0];
  setMinWage(wage.hourly);
  setElectionDays(r.elections.map(e => e.date));
  setTaxTables(Object.fromEntries(Object.entries(r.tax).map(([y, t]) => [y, { ...t, brackets: t.brackets.map(([c, rate]) => [c === null ? Infinity : c, rate]) }])));
}

/** At startup: built-in figures, or a newer copy saved from an earlier check. */
export function loadRules() {
  let r = BUILT_IN;
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.version > r.version) r = validate(saved); } catch { /* keep built-in */ }
  apply(r);
  return r;
}

/** When online, at most once a day: fetch the newest rules. Calls onChange(rules) if they changed. */
export async function checkForUpdates(onChange, { force = false } = {}) {
  try {
    if (!navigator.onLine) return false;
    const last = +(localStorage.getItem(CHECKED) || 0);
    if (!force && Date.now() - last < DAY) return false;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(RULES_URL, { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const r = validate(await res.json());
    try { localStorage.setItem(CHECKED, String(Date.now())); } catch {}
    if (r.version <= current.version) { dbg.log('info', `rules: up to date (v${current.version})`); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {}
    apply(r); dbg.log('info', `rules: updated to v${r.version}`);
    onChange?.(r);
    return true;
  } catch (e) {
    dbg.log('warn', 'rules: check failed: ' + (e?.message || e));
    return false;
  }
}
