import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEB = /[֐-׿]/;
const { usePack, how, tr } = await import(join(root, 'js/translate.js'));
const { LANGS, loadPack } = await import(join(root, 'languages/index.js'));

const IGNORE = new Set(['אצבע', 'עברית']);
const found = new Map();
for (const f of readdirSync(join(root, 'js'))) {
  let src = readFileSync(join(root, 'js', f), 'utf8');
  src = src.replace(/\/\* translations: skip-start[\s\S]*?translations: skip-end \*\//g, '');
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/\s.*$/gm, '');
  src.split('\n').forEach((line, i) => {
    const flat = line.replace(/\$\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '{}');
    for (let seg of flat.split(/[`'"<>]|\\n/)) {
      seg = seg.replace(/\s+/g, ' ').trim().replace(/^(\{\})+|(\{\})+$/g, '').trim();
      if (!HEB.test(seg) || seg.length > 400) continue;
      if (/\.(csv|json|xls)$/.test(seg) || /[=;]|\/\[|\)\./.test(seg) || IGNORE.has(seg)) continue;
      if (/^[{}\s·:,.()\-–—/|+%₪0-9]*$/.test(seg.replace(/[֐-׿]/g, ''))) {  }
      if (!found.has(seg)) found.set(seg, `${f}:${i + 1}`);
    }
  });
}

const only = process.argv[2];
for (const L of LANGS.filter(l => l.code !== 'he' && (!only || l.code === only))) {
  const pack = await loadPack(L.code); usePack(pack);
  const missing = [], rough = [];
  for (const [text, where] of found) {
    const sample = text.replace(/\{\}/g, '7');
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
