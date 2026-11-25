// Language packs that update from etzba.co.il: the downloaded copy must translate exactly like the
// built-in pack, bad downloads must be rejected, and the data files must be up to date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const { validate, revive, preferPack, checkPack } = await import('../../js/remote-packs.js');
const { usePack, tr } = await import('../../js/translate.js');
const en = (await import('../../languages/en.js')).default;
const BUILT = (await import('../../languages/pack-versions.js')).default;
const file = JSON.parse(readFileSync(new URL('../../data/lang/en.json', import.meta.url), 'utf8'));

test('data/lang/en.json is up to date with languages/en.js (run npm run data)', async () => {
  const { serialize } = await import('../../scripts/build-data.mjs');
  const hash = createHash('sha256').update(JSON.stringify(serialize(en))).digest('hex').slice(0, 16);
  assert.equal(file.hash, hash);
  assert.equal(file.version, BUILT.en);
});

test('the downloadable pack translates exactly like the built-in one', () => {
  const samples = ['לא במשמרת', 'שעת הכניסה: 08:00', '13 משמרות · 106:15 שעות · ברוטו ₪4,946', 'התראה הבאה ב־17:36', ' · ₪40 לשעה', 'מעבר ל־8:36 ש׳ ביום משלמים שעות נוספות.'];
  usePack(en); const a = samples.map(tr);
  usePack(revive(validate(file, 'en'))); const b = samples.map(tr);
  usePack(null);
  assert.deepEqual(b, a);
});

test('bad downloads are rejected', () => {
  const bad = [null, { ...file, format: 2 }, { ...file, code: 'ru' }, { ...file, version: '3' }, { ...file, phrases: [] }, { ...file, templates: [[1, 2]] },
    { ...file, days: ['a'] }, { ...file, phrases: { 'א': 'b' } }];
  for (const b of bad) assert.throws(() => validate(b, 'en'));
});

test('a newer download is used; an older or equal one is not', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...file, version: BUILT.en + 1, phrases: { ...file.phrases, 'לא במשמרת': 'Off shift' } }) });
  let changed = 0;
  assert.equal(await checkPack('en', () => changed++, { force: true }), true);
  assert.equal(changed, 1);
  usePack(preferPack('en', en)); assert.equal(tr('לא במשמרת'), 'Off shift'); usePack(null);
  // same version again: nothing to do
  assert.equal(await checkPack('en', () => changed++, { force: true }), false);
  // not more than once a day
  assert.equal(await checkPack('en', () => changed++), false);
  localStorage.removeItem('etzba.pack.en');
  assert.equal(preferPack('en', en), en);
});

test('offline or broken: the built-in pack stays', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await checkPack('en', null, { force: true }), false);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ format: 1, version: 999, code: 'en' }) });
  assert.equal(await checkPack('en', null, { force: true }), false);
  assert.equal(preferPack('en', en), en);
});
