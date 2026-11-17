// Builds an installable APK without opening Android Studio:  npm run apk
// Result: etzba.apk in the project folder. Copy it to the phone and open it, or: adb install etzba.apk
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
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
// Gradle 8 runs on Java 17–24 (not 25). Use JAVA_HOME if it's a version that works, otherwise find one:
// a system JDK 21/17, or Android Studio's bundled Java if that is 24 or older.
const javaMajor = home => {
  try { const m = /JAVA_VERSION="(\d+)/.exec(readFileSync(join(home, 'release'), 'utf8')); return m ? +m[1] : 0; } catch { return 0; }
};
const ok = home => { const v = javaMajor(home); return v >= 17 && v <= 24; };
if (!process.env.JAVA_HOME || !ok(process.env.JAVA_HOME)) {
  const jvm = d => { try { return readdirSync(d).map(x => join(d, x)); } catch { return []; } };
  const candidates = [
    ...['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', 'C:/Program Files/Java', 'C:/Program Files/Eclipse Adoptium']
      .flatMap(jvm).flatMap(d => [d, join(d, 'Contents/Home')]),
    '/opt/android-studio/jbr', '/usr/local/android-studio/jbr', join(homedir(), 'android-studio/jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home', 'C:/Program Files/Android/Android Studio/jbr',
  ].filter(d => existsSync(join(d, 'release')) && ok(d)).sort((x, y) => (javaMajor(x) === 21 ? -1 : 0) - (javaMajor(y) === 21 ? -1 : 0));
  if (candidates.length) { process.env.JAVA_HOME = candidates[0]; console.log(`Using Java ${javaMajor(candidates[0])}: ${candidates[0]}`); }
  else {
    console.error('\n✗ Need Java 21 for the Android build (Android Studio bundles Java 25, which Gradle 8 can\'t run).');
    console.error('  Arch:    sudo pacman -S jdk21-openjdk');
    console.error('  Ubuntu:  sudo apt install openjdk-21-jdk');
    console.error('  Windows/Mac: install "Temurin 21" from adoptium.net\n  Then run npm run apk again.\n');
    process.exit(1);
  }
}
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], android);

const apk = join(android, 'app/build/outputs/apk/debug/app-debug.apk');
copyFileSync(apk, join(root, 'etzba.apk'));
console.log('\n✓ etzba.apk is ready in the project folder.\n  Phone on USB with USB debugging on:  npm run install-apk\n  Or copy etzba.apk to the phone and open it (allow "install unknown apps").\n');
