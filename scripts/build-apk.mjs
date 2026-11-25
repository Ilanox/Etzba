import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { root, pkg, run, WIN, versionCode } from './lib.mjs';

const android = join(root, 'android');
const npx = WIN ? 'npx.cmd' : 'npx';
const RELEASE = process.argv[2] === 'release';
const version = pkg.version;

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
if (!existsSync(android)) { console.error('No android/ folder yet. Run first:  npm run android:init'); process.exit(1); }
// a Play build only from code that passes: the unit tests and the translation check (the website deploy also runs
// the browser tests on every push). Skip with: npm run release -- --skip-tests
if (RELEASE && !process.argv.includes('--skip-tests')) {
  console.log('Checking before building for Play…');
  run(process.execPath, [join(root, 'scripts/test.mjs')]);
  run(process.execPath, [join(root, 'scripts/check-translations.mjs'), '--strict']);
}
// a Play upload needs a higher build number than the last one, even with the same version
if (RELEASE) {
  pkg.androidBuild = versionCode(pkg) + 1;
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Build number ${pkg.androidBuild} (version ${pkg.version}). Commit package.json after uploading, so the next one is higher.`);
}
run(process.execPath, [join(root, 'scripts/build-www.mjs')]);
run(process.execPath, [join(root, 'scripts/native-setup.mjs')]);
run(npx, ['cap', 'sync', 'android']);

async function ensureKey() {
  const props = join(root, 'keystore.properties');
  if (existsSync(props)) return;
  console.log('\nNo signing key yet. Making one now (once). It stays in this folder and is never committed to git.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pass = (await rl.question('Choose a password for the key (at least 6 characters, write it down): ')).trim();
  rl.close();
  if (pass.length < 6) { console.error('✗ Too short.'); process.exit(1); }
  const keytool = join(process.env.JAVA_HOME || '', 'bin', WIN ? 'keytool.exe' : 'keytool');
  run(existsSync(keytool) ? keytool : 'keytool', ['-genkeypair', '-keystore', join(root, 'etzba-upload.jks'), '-alias', 'etzba', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-storepass', pass, '-keypass', pass, '-dname', 'CN=Ilan Levy, O=Edvin Studios, C=IL']);
  writeFileSync(props, `storeFile=etzba-upload.jks\nstorePassword=${pass}\nkeyAlias=etzba\nkeyPassword=${pass}\n`);
  console.log('\n✓ Key made: etzba-upload.jks + keystore.properties.\n  BACK THEM UP NOW (e.g. a password manager or a USB stick). Without them you cannot update the app.\n');
  run(process.execPath, [join(root, 'scripts/native-setup.mjs')]);
}

const gradlew = WIN ? 'gradlew.bat' : './gradlew';
if (RELEASE) {
  await ensureKey();
  run(gradlew, ['bundleRelease', 'assembleRelease'], android);
  copyFileSync(join(android, 'app/build/outputs/bundle/release/app-release.aab'), join(root, `etzba-${version}.aab`));
  copyFileSync(join(android, 'app/build/outputs/apk/release/app-release.apk'), join(root, `etzba-${version}.apk`));
  console.log(`\n✓ Ready for Google Play:\n  etzba-${version}.aab  → upload this in Play Console\n  etzba-${version}.apk  → the same build, to try on your phone first (uninstall the test build before: different key)\n`);
  process.exit(0);
}
run(gradlew, ['assembleDebug'], android);

const apk = join(android, 'app/build/outputs/apk/debug/app-debug.apk');
copyFileSync(apk, join(root, 'etzba.apk'));
console.log('\n✓ etzba.apk is ready in the project folder.\n  Phone on USB with USB debugging on:  npm run install-apk\n  Or copy etzba.apk to the phone and open it (allow "install unknown apps").\n');
