// Adds אצבע's native pieces to the generated android/ and ios/ projects. Safe to run any number of times.
//   node scripts/native-setup.mjs   (iOS support is kept for later: it only runs if an ios/ folder exists)
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const only = process.argv[2];
const [maj, min, pat] = pkg.version.split('.').map(Number);
const versionCode = maj * 10000 + min * 100 + pat;           // 1.17.0 → 11700, always increasing
const MIMES = ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/tab-separated-values', 'text/plain',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'];

function android() {
  const app = join(root, 'android/app');
  if (!existsSync(app)) return console.log('android/ not found, run: npx cap add android');
  // 1. the share plugin + activity that registers it
  const pkgDir = join(app, 'src/main/java/com/edvinstudios/etzba'); mkdirSync(pkgDir, { recursive: true });
  for (const f of ['ShareInPlugin.java', 'MainActivity.java']) copyFileSync(join(root, 'native/android', f), join(pkgDir, f));
  // 2. appear in the Share menu and in "Open with" for spreadsheets and CSV
  const mf = join(app, 'src/main/AndroidManifest.xml'); let x = readFileSync(mf, 'utf8');
  if (!x.includes('etzba-share-in')) {
    const data = MIMES.map(m => `                <data android:mimeType="${m}" />`).join('\n');
    const filters = `
            <!-- etzba-share-in: files shared to the app or opened with it -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
${data}
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="content" />
${data}
            </intent-filter>
`;
    // after the launcher intent-filter of MainActivity
    x = x.replace(/(<action android:name="android.intent.action.MAIN" \/>[\s\S]*?<\/intent-filter>)/, `$1\n${filters}`);
    writeFileSync(mf, x);
  }
  // 3. version from package.json
  const bg = join(app, 'build.gradle');
  if (existsSync(bg)) {
    let g = readFileSync(bg, 'utf8');
    g = g.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
    writeFileSync(bg, g);
  }
  console.log(`android ready · ${pkg.version} (${versionCode})`);
}

function ios() {
  const plist = join(root, 'ios/App/App/Info.plist');
  if (!existsSync(plist)) return console.log('ios/ not found, run: npx cap add ios (on a Mac)');
  let x = readFileSync(plist, 'utf8');
  const add = (key, xml) => { if (!x.includes(`<key>${key}</key>`)) x = x.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n${xml}\n</dict>\n</plist>\n`); };
  // "Open in / Copy to אצבע" for CSV and Excel files
  add('CFBundleDocumentTypes', `\t<array>
\t\t<dict>
\t\t\t<key>CFBundleTypeName</key><string>Spreadsheet</string>
\t\t\t<key>CFBundleTypeRole</key><string>Viewer</string>
\t\t\t<key>LSHandlerRank</key><string>Alternate</string>
\t\t\t<key>LSItemContentTypes</key>
\t\t\t<array>
\t\t\t\t<string>public.comma-separated-values-text</string>
\t\t\t\t<string>public.tab-separated-values-text</string>
\t\t\t\t<string>com.microsoft.excel.xls</string>
\t\t\t\t<string>org.openxmlformats.spreadsheetml.sheet</string>
\t\t\t</array>
\t\t</dict>
\t</array>`);
  add('LSSupportsOpeningDocumentsInPlace', '\t<false/>');
  add('ITSAppUsesNonExemptEncryption', '\t<false/>');          // no export-compliance question on every upload
  add('CFBundleDevelopmentRegion', '\t<string>he</string>');
  x = x.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*/, `$1${pkg.version}`);
  writeFileSync(plist, x);
  console.log(`ios ready · ${pkg.version}`);
}

if (!only || only === 'android') android();
if (!only || only === 'ios') ios();
