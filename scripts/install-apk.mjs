import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adb, requirePhone } from './adb.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const release = process.argv[2] === 'release';
const apk = join(root, release ? `etzba-${version}.apk` : 'etzba.apk');
if (!existsSync(apk)) { console.error(`No ${apk.split('/').pop()} yet. Run: npm run ${release ? 'release' : 'apk'}`); process.exit(1); }
requirePhone();

const r = spawnSync(adb, ['install', '-r', apk], { encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (/UPDATE_INCOMPATIBLE|signatures do not match/.test((r.stdout || '') + (r.stderr || ''))) {
  console.error(`\n✗ The phone has the ${release ? 'test' : 'release'} build, signed with a different key.`);
  console.error(`  Use: npm run ${release ? 'install-apk' : 'release && npm run install-release'}  (keeps your data)`);
  console.error('  Uninstalling the app would also work, but deletes its data: back up first (Settings → Data & backup).');
  process.exit(1);
}
if (r.status === 0) console.log('\n✓ Installed. Open אצבע on the phone.');
process.exit(r.status || 0);
