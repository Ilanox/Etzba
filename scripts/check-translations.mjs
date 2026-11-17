// Finds every Hebrew text in the app and checks each language pack for it.
//   npm run check:translations          → all languages
//   npm run check:translations -- en    → one language
// Writes languages/missing-<code>.txt, ready to paste into the pack.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEB = /[֐-׿]/;
const { usePack, how, tr } = await import(join(root, 'js/translate.js'));
const { LANGS, loadPack } = await import(join(root, 'languages/index.js'));

/* 1. collect Hebrew texts from the code */
const IGNORE = new Set(['אצבע', 'עברית']);   // never translated
const found = new Map();                       // text → first place it appears
for (const f of readdirSync(join(root, 'js'))) {
  let src = readFileSync(join(root, 'js', f), 'utf8');
  src = src.replace(/\/\* translations: skip-start[\s\S]*?translations: skip-end \*\//g, '');   // Hebrew-only parts
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/\s.*$/gm, '');                // comments
  src.split('\n').forEach((line, i) => {
    const flat = line.replace(/\$\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '{}');                     // ${…} → {}
    for (let seg of flat.split(/[`'"<>]|\\n/)) {
      // a ${…} at the very edge is usually an icon or tag beside the text, not part of it
      seg = seg.replace(/\s+/g, ' ').trim().replace(/^(\{\})+|(\{\})+$/g, '').trim();
      if (!HEB.test(seg) || seg.length > 400) continue;
      if (/\.(csv|json|xls)$/.test(seg) || /[=;]|\/\[|\)\./.test(seg) || IGNORE.has(seg)) continue;   // file names, code, brand
      if (/^[{}\s·:,.()\-–—/|+%₪0-9]*$/.test(seg.replace(/[֐-׿]/g, ''))) { /* fine */ }
      if (!found.has(seg)) found.set(seg, `${f}:${i + 1}`);
    }
  });
}

/* 2. check each pack */
const only = process.argv[2];
for (const L of LANGS.filter(l => l.code !== 'he' && (!only || l.code === only))) {
  const pack = await loadPack(L.code); usePack(pack);
  const missing = [], rough = [];
  for (const [text, where] of found) {
    const sample = text.replace(/\{\}/g, '7');            // fill placeholders to test templates
    const kind = how(sample);
    if (kind === 'exact' || kind === 'template') continue;
    (HEB.test(tr(sample)) ? missing : rough).push([text, where, tr(sample)]);
  }
  const line = ([t, w, got]) => t.includes('{}')
    ? `  ['${t.replace(/'/g, "\\'")}', ''],   // ${w}${got ? '  now: ' + got : ''}`
    : `  '${t.replace(/'/g, "\\'")}': '',   // ${w}${got ? '  now: ' + got : ''}`;
  const out = [
    `Translation check for ${L.name} (${L.code}) · ${found.size} Hebrew texts in the app`,
    `${found.size - missing.length - rough.length} translated properly · ${rough.length} only word-by-word · ${missing.length} missing`,
    '', 'Lines with [ ] go into "templates", the rest into "phrases" in languages/' + L.code + '.js',
    '', `== MISSING (${missing.length}): still shows Hebrew ==`, ...missing.map(line),
    '', `== WORD-BY-WORD (${rough.length}): works, but worth a proper translation ==`, ...rough.map(line), '',
  ].join('\n');
  writeFileSync(join(root, 'languages', `missing-${L.code}.txt`), out);
  console.log(`${L.code}: ${found.size - missing.length - rough.length} proper · ${rough.length} word-by-word · ${missing.length} missing → languages/missing-${L.code}.txt`);
}
