// Early access: supporters get a feature right away, everyone else from a date the server sends.
// The app reads etzba.ilanox.dev/data/early.json whenever it's opened (no app update, no rules update),
// and tells anyone who saw the feature locked once it opens.
//
//   npm run early                      what's in early access and when it opens
//   npm run early recap 2026-12-25     open "recap" to everyone on that date
//   npm run early recap now            open it to everyone now
//   npm run early recap off            supporters only, no date
//   add --no-push to only edit the file
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2).filter(a => a !== '--no-push'), push = !process.argv.includes('--no-push');
const FILE = 'data/early.json';
const early = JSON.parse(readFileSync(FILE, 'utf8'));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const say = d => d >= '2090' ? 'supporters only' : d <= today ? `open to everyone (since ${d})` : `supporters only until ${d}`;

if (!args.length) {
  if (!Object.keys(early).length) console.log('Nothing in early access.');
  for (const [k, d] of Object.entries(early)) console.log(`${k.padEnd(10)} ${say(d)}`);
  process.exit(0);
}

const [name, when] = args;
const date = when === 'now' ? today : when === 'off' ? '2099-12-31' : when;
if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  console.error('Usage: npm run early <feature> <YYYY-MM-DD | now | off>');
  process.exit(1);
}
if (!(name in early)) console.warn(`Note: "${name}" is new. The app only locks features that check earlyOpen('${name}').`);
early[name] = date;
writeFileSync(FILE, '{ ' + Object.entries(early).map(([k, d]) => `${JSON.stringify(k)}: "${d}"`).join(', ') + ' }\n');
console.log(`${name}: ${say(date)}`);

if (push) {
  const sh = c => execSync(c, { stdio: 'inherit' });
  try {
    sh(`git add ${FILE}`);
    let same = false; try { execSync(`git diff --cached --quiet -- ${FILE}`); same = true; } catch { /* there's a change */ }
    if (same) console.log('Already set that way here; making sure the site has it.');
    else sh(`git commit -qm "Early access: ${name} ${when === 'off' ? 'off' : date}" -- ${FILE}`);
    sh('git pull --rebase --autostash -q origin main');
    sh('git -c push.negotiate=true push -q origin main');
    console.log('Sent. Phones get it the next time the app is opened (a few minutes for the site to update).');
  } catch {
    console.error('\nSaved here, but sending failed. Fix the message above, then run: git push');
    process.exit(1);
  }
}
