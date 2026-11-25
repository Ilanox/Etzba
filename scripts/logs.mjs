import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';
import { adb, APP, requirePhone } from './adb.mjs';

requirePhone();
const start = process.argv.includes('--start');
const verbose = process.argv.includes('--verbose');

const d = new Date(), z = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
mkdirSync(join(root, 'logs'), { recursive: true });
const file = join(root, 'logs', `etzba-${stamp}.log`);
const out = createWriteStream(file);

spawnSync(adb, ['logcat', '-c']);
if (start) {
  spawnSync(adb, ['shell', 'am', 'force-stop', APP]);
  spawnSync(adb, ['shell', 'monkey', '-p', APP, '-c', 'android.intent.category.LAUNCHER', '1'], { stdio: 'ignore' });
}

const tty = process.stdout.isTTY, col = (c, s) => tty ? `\x1b[${c}m${s}\x1b[0m` : s;
const RED = '31', YEL = '33', DIM = '2', CYAN = '36', GRN = '32';
console.log(col(CYAN, `Listening to אצבע${start ? ' (restarted)' : ''}. Saving to ${file.replace(root + '/', '')}. Ctrl+C to stop.\n`));

const tags = ['Capacitor/Console:V', 'Capacitor:W', 'Capacitor/Plugin:V', 'Etzba:V', 'AndroidRuntime:E', 'chromium:W', 'ActivityManager:W', '*:S'];
const lc = spawn(adb, ['logcat', '-v', 'time', ...tags]);
let buf = '', crashing = false;
lc.stdout.on('data', d => {
  buf += d; const lines = buf.split('\n'); buf = lines.pop();
  for (const raw of lines) {
    const line = raw.replace(/\r$/, ''); if (!line.trim()) continue;
    // ActivityManager is noisy: keep only lines about this app
    if (/ActivityManager/.test(line) && !line.includes(APP)) continue;
    if (!verbose && (/Capacitor\/Plugin/.test(line) || /Msg: (\[object Object\]|undefined|\{.*\})$/.test(line) && /File:\s+- Line/.test(line))) { out.write(line + '\n'); continue; }
    if (!verbose && /tile memory limits exceeded|Seed missing signature|Failed to read DnsConfig|android_setCpu|overlays are enabled|public\/plugins/.test(line)) continue;
    out.write(line + '\n');
    const m = line.match(/^(\S+ \S+) ([VDIWEF])\/([^(]+)\(\s*\d+\): (.*)$/);
    if (!m) { console.log(crashing ? col(RED, line) : line); continue; }
    const [, time, lvl, tag, msg0] = m;
    let msg = msg0.replace(/^File: \S+ - Line \d+ - Msg: /, '');
    if (tag.startsWith('AndroidRuntime')) crashing = /FATAL EXCEPTION/.test(msg) || crashing;
    const t = col(DIM, time.slice(6, 18));
    const c = lvl === 'E' || lvl === 'F' || crashing || /\berror\b|uncaught|exception/i.test(msg) ? RED
      : lvl === 'W' || /\bwarn\b/i.test(msg) ? YEL : /^\[etzba\]/.test(msg) ? GRN : '';
    console.log(`${t} ${col(DIM, tag.trim().replace('Capacitor/Console', 'js'))} ${c ? col(c, msg) : msg}`);
  }
});
lc.on('exit', () => { out.end(); console.log(col(CYAN, `\nSaved: ${file}`)); });
process.on('SIGINT', () => { lc.kill(); });
