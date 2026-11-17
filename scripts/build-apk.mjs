// Builds an installable APK without opening Android Studio:  npm run apk
// Result: etzba.apk in the project folder. Copy it to the phone and open it, or: adb install etzba.apk
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const run = (cmd, args, cwd = root) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n✗ ${cmd} ${args.join(' ')} failed`); process.exit(r.status || 1); }
};
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!existsSync(android)) { console.error('No android/ folder yet. Run first:  npm run android:init'); process.exit(1); }
run(process.execPath, [join(root, 'scripts/build-www.mjs')]);
run(process.execPath, [join(root, 'scripts/native-setup.mjs')]);
run(npx, ['cap', 'sync', 'android']);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], android);

const apk = join(android, 'app/build/outputs/apk/debug/app-debug.apk');
copyFileSync(apk, join(root, 'etzba.apk'));
console.log('\n✓ etzba.apk is ready in the project folder.\n  Phone on USB with USB debugging on:  npm run install-apk\n  Or copy etzba.apk to the phone and open it (allow "install unknown apps").\n');
