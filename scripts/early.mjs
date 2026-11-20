import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2).filter(a => a !== '--no-push'), push = !process.argv.includes('--no-push');
const FILE = 'data/early.json';
const early = JSON.parse(readFileSync(FILE, 'utf8'));
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const entry = v => v && typeof v === 'object' ? v : { all: v };
const say = d => !d ? 'right away' : d >= '2090' ? 'not yet (no date)' : d <= today ? `open (since ${d})` : `from ${d}`;
const show = (k, v) => { const e = entry(v); console.log(`${k.padEnd(10)} supporters: ${say(e.supporters)} · everyone: ${say(e.all)}`); };

if (!args.length) {
  if (!Object.keys(early).length) console.log('Nothing in early access.');
  for (const [k, v] of Object.entries(early)) show(k, v);
  process.exit(0);
}

let [name, who, when] = args;
if (!['supporters', 'all'].includes(who)) { when = who; who = 'all'; }
const date = when === 'now' ? today : when === 'off' ? '2099-12-31' : when;
if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  console.error('Usage: npm run early <feature> [supporters|all] <YYYY-MM-DD | now | off>');
  process.exit(1);
}
if (!(name in early)) console.warn(`Note: "${name}" is new. The app only locks features that check openForMe('${name}').`);
const e = { ...entry(early[name]), [who]: date };
if (!e.all) e.all = '2099-12-31';
early[name] = e.supporters ? { supporters: e.supporters, all: e.all } : e.all;
writeFileSync(FILE, '{ ' + Object.entries(early).map(([k, v]) => `${JSON.stringify(k)}: ${typeof v === 'object' ? `{ "supporters": "${v.supporters}", "all": "${v.all}" }` : `"${v}"`}`).join(', ') + ' }\n');
show(name, early[name]);

if (push) {
  const sh = c => execSync(c, { stdio: 'inherit' });
  try {
    sh(`git add ${FILE}`);
    let same = false; try { execSync(`git diff --cached --quiet -- ${FILE}`); same = true; } catch {  }
    if (same) console.log('Already set that way here; making sure the site has it.');
    else sh(`git commit -qm "Early access: ${name} ${who} ${when === 'off' ? 'off' : date}" -- ${FILE}`);
    sh('git pull --rebase --autostash -q origin main');
    sh('git -c push.negotiate=true push -q origin main');
    console.log('Sent. Phones get it the next time the app is opened (a few minutes for the site to update).');
  } catch {
    console.error('\nSaved here, but sending failed. Fix the message above, then run: git push');
    process.exit(1);
  }
}
