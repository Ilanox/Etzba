import BUILT from '../languages/pack-versions.js';
import * as dbg from './diagnostics.js';

export const PACK_URL = code => `https://etzba.ilanox.dev/data/lang/${code}.json`;
const KEY = code => 'etzba.pack.' + code, CHECKED = code => 'etzba.pack.checked.' + code, DAY = 864e5;

export function validate(d, code) {
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(d) || d.format !== 1 || !Number.isInteger(d.version) || d.code !== code) throw new Error('header');
  if (!isObj(d.phrases) || !isObj(d.words) || !Array.isArray(d.templates)) throw new Error('content');
  if (!d.templates.every(t => Array.isArray(t) && typeof t[0] === 'string' && typeof t[1] === 'string')) throw new Error('templates');
  if (!Object.values(d.phrases).every(v => typeof v === 'string')) throw new Error('phrases');
  for (const k of ['days', 'daysShort']) if (d[k] && (!Array.isArray(d[k]) || d[k].length !== 7)) throw new Error(k);
  if (d.months && (!Array.isArray(d.months) || d.months.length !== 12)) throw new Error('months');
  if (Object.keys(d.phrases).length < 50) throw new Error('too small');
  return d;
}
export function revive(d) {
  const polish = [];
  for (const [src, flags, to] of d.polish || []) { try { polish.push([new RegExp(src, flags), to]); } catch {  } }
  return { ...d, polish };
}

export function preferPack(code, builtIn) {
  if (!builtIn) return builtIn;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY(code)) || 'null');
    if (saved && saved.version > (BUILT[code] || 0)) return revive(validate(saved, code));
  } catch (e) { dbg.log('warn', `pack ${code}: saved copy unusable (${e.message})`); }
  return builtIn;
}

export async function checkPack(code, onChange, { force = false } = {}) {
  if (!code || code === 'he') return false;
  try {
    if (!navigator.onLine) return false;
    const last = +(localStorage.getItem(CHECKED(code)) || 0);
    if (!force && Date.now() - last < DAY) return false;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(PACK_URL(code), { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = validate(await res.json(), code);
    try { localStorage.setItem(CHECKED(code), String(Date.now())); } catch {}
    let have = BUILT[code] || 0;
    try { have = Math.max(have, JSON.parse(localStorage.getItem(KEY(code)) || 'null')?.version || 0); } catch {}
    if (d.version <= have) { dbg.log('info', `pack ${code}: up to date (v${have})`); return false; }
    localStorage.setItem(KEY(code), JSON.stringify(d));
    dbg.log('info', `pack ${code}: updated to v${d.version}`);
    onChange?.();
    return true;
  } catch (e) {
    dbg.log('warn', `pack ${code}: check failed: ${e?.message || e}`);
    return false;
  }
}
