// Languages the app offers. Hebrew is built in (the app is written in it); every other language is a pack file.
// To add one: copy lang/en.js to lang/<code>.js, translate it, and add a line below. See lang/README.md.
import en from './en.js';

export const LANGS = [
  { code: 'he', name: 'עברית', dir: 'rtl' },
  { code: 'en', name: 'English', dir: 'ltr', pack: en },
  // { code: 'ru', name: 'Русский', dir: 'ltr', load: () => import('./ru.js') },
  // { code: 'ar', name: 'العربية', dir: 'rtl', load: () => import('./ar.js') },
];

/** The pack for a language code (loads it if it's a separate file). Hebrew has no pack. */
export async function loadPack(code) {
  const l = LANGS.find(x => x.code === code);
  if (!l || code === 'he') return null;
  if (!l.pack && l.load) l.pack = (await l.load()).default;
  return l.pack || null;
}
export const langInfo = code => LANGS.find(x => x.code === code) || LANGS[0];
