import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'www');
const WEB = ['index.html', 'style.css', 'manifest.webmanifest', 'js', 'languages', 'icons', 'fonts'];

{ const f = JSON.parse(readFileSync(join(root, 'features.json'), 'utf8'));
  writeFileSync(join(root, 'js/features.js'), `// Generated from features.json by scripts/build-www.mjs: edit features.json, not this.\nexport default ${JSON.stringify(Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('_'))))};\n`); }

spawnSync(process.execPath, [join(root, 'scripts/build-data.mjs')], { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'fonts'), { recursive: true });
for (const f of WEB) cpSync(join(root, f), join(out, f), { recursive: true });

const coreSrc = join(root, 'node_modules/@capacitor/core/dist/index.js');
if (existsSync(coreSrc)) { mkdirSync(join(out, 'js/vendor'), { recursive: true }); cpSync(coreSrc, join(out, 'js/vendor/capacitor-core.js')); }
else console.warn('! @capacitor/core not installed: run npm install (the Android app needs it)');

// fonts: Hebrew + Latin subsets of Heebo, weights the app uses
const src = join(root, 'node_modules/@fontsource/heebo/files');
const RANGES = {
  hebrew: 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
};
let css = '', n = 0;
if (existsSync(src)) {
  for (const w of [400, 500, 600, 700, 800]) for (const [sub, range] of Object.entries(RANGES)) {
    const file = `heebo-${sub}-${w}-normal.woff2`;
    if (!existsSync(join(src, file))) continue;
    cpSync(join(src, file), join(out, 'fonts', file)); n++;
    css += `@font-face{font-family:'Heebo';font-style:normal;font-display:swap;font-weight:${w};src:url(${file}) format('woff2');unicode-range:${range}}\n`;
  }
}
writeFileSync(join(out, 'fonts/fonts.css'), css);

// index.html: local font instead of Google Fonts
let html = readFileSync(join(out, 'index.html'), 'utf8');
html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '').replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');
const mods = [...readdirSync(join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => 'js/' + f), ...readdirSync(join(root, 'languages')).filter(f => f.endsWith('.js')).map(f => 'languages/' + f)];
html = html.replace('<script type="module"', mods.map(m => `<link rel="modulepreload" href="${m}">`).join('') + '\n<script type="module"');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*data-web-only>\n?/, '');
writeFileSync(join(out, 'index.html'), html);
console.log(`www ready: ${mods.length} modules, ${n} font files${n ? '' : ' (run npm install to bundle Heebo; system font used meanwhile)'}`);
