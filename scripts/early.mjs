// Early access: supporters get a feature right away, everyone else from a date in the yearly rules file.
// Phones pick up the new date within a day (from etzba.ilanox.dev/data/rules.json), no release needed.
//
//   npm run early                      what's in early access and when it opens
//   npm run early recap 2026-12-25     open "recap" to everyone on that date
//   npm run early recap now            open it to everyone today
//   npm run early recap off            supporters only, no date (far future)
//   add --no-push to only edit the files
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2).filter(a => a !== '--no-push'), push = !process.argv.includes('--no-push');
const JSON_P = 'data/rules.json', JS_P = 'js/rules.js';
const data = JSON.parse(readFileSync(JSON_P, 'utf8'));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

if (!args.length) {
  const e = data.early || {};
  if (!Object.keys(e).length) console.log('Nothing in early access.');
  for (const [k, d] of Object.entries(e)) console.log(`${k.padEnd(10)} ${d <= today ? 'open to everyone since' : 'supporters only until'} ${d}`);
  process.exit(0);
}

const [name, when] = args;
const date = when === 'now' ? today : when === 'off' ? '2099-12-31' : when;
if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  console.error('Usage: npm run early <feature> <YYYY-MM-DD | now | off>');
  process.exit(1);
}
if (!(name in (data.early || {}))) console.warn(`Note: "${name}" is new. The app only locks features that check earlyOpen('${name}').`);

const version = data.version + 1;
data.early = { ...data.early, [name]: date };
data.version = version;
data.updated = today;
// edit the text in place so the file keeps its hand-made layout
const early = obj => '{ ' + Object.entries(obj).map(([k, d]) => `${q(k)}: ${q(d)}`).join(', ') + ' }';
let q = JSON.stringify;
writeFileSync(JSON_P, readFileSync(JSON_P, 'utf8')
  .replace(/"version": \d+/, `"version": ${version}`)
  .replace(/"updated": "[^"]*"/, `"updated": "${today}"`)
  .replace(/"early": \{[^}]*\}/, `"early": ${early(data.early)}`));

// keep the built-in copy in step
let js = readFileSync(JS_P, 'utf8');
q = v => /^\w+$/.test(v) && !/^\d/.test(v) ? v : `'${v}'`;
js = js.replace(/(BUILT_IN = \{\s*version: )\d+/, `$1${version}`).replace(/early: \{[^}]*\}/, `early: ${early(data.early)}`);
writeFileSync(JS_P, js);

console.log(`${name}: ${date <= today ? 'open to everyone now' : `supporters only until ${date}`} (rules version ${version})`);

if (push) {
  const sh = c => execSync(c, { stdio: 'inherit' });
  sh(`git add ${JSON_P} ${JS_P}`);
  sh(`git -c user.name="Ilan Levy (Ilanox)" -c user.email="ilanox@users.noreply.github.com" commit -qm "Early access: ${name} ${date}"`);
  try {
    sh('git pull --rebase -q origin main');
    sh('git -c push.negotiate=true push -q origin main');
    console.log('Pushed. Phones get it within a day.');
  } catch {
    console.error('\nSaved and committed here, but the push failed. Sign in to GitHub once (gh auth login, then gh auth setup-git) and run: git push');
    process.exit(1);
  }
}
