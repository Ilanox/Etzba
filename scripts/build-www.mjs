// Builds www/, the copy of the app that goes into the Android app: the app files, the Capacitor bridge,
// and module preloads so the app starts without waiting on each import.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJSON, run, stampBuild } from './lib.mjs';

const out = join(root, 'www');
const WEB = ['index.html', 'css', 'manifest.webmanifest', 'js', 'languages', 'icons', 'fonts'];

// js/features.js from features.json (only the switches the app reads)
const features = readJSON('features.json');
writeFileSync(join(root, 'js/features.js'), `// Generated from features.json by scripts/build-www.mjs: edit features.json, not this.\nexport default ${JSON.stringify(Object.fromEntries(Object.entries(features).filter(([k]) => !k.startsWith('_'))))};\n`);

run(process.execPath, [join(root, 'scripts/build-data.mjs')]);

rmSync(out, { recursive: true, force: true });
for (const f of WEB) cpSync(join(root, f), join(out, f), { recursive: true });

const core = join(root, 'node_modules/@capacitor/core/dist/index.js');
if (existsSync(core)) { mkdirSync(join(out, 'js/vendor'), { recursive: true }); cpSync(core, join(out, 'js/vendor/capacitor-core.js')); }
else console.warn('! @capacitor/core not installed: run npm install (the Android app needs it)');

stampBuild(join(out, 'js/build-info.js'));

// index.html: preload every module; the web-only security policy is replaced by the app's own
const mods = [...readdirSync(join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => 'js/' + f),
  ...readdirSync(join(root, 'languages')).filter(f => f.endsWith('.js')).map(f => 'languages/' + f)];
let html = readFileSync(join(out, 'index.html'), 'utf8');
html = html.replace('<script type="module"', mods.map(m => `<link rel="modulepreload" href="${m}">`).join('') + '\n<script type="module"');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*data-web-only>\n?/, '');
writeFileSync(join(out, 'index.html'), html);
console.log(`www ready: ${mods.length} modules`);
