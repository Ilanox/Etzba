// Turns on developer mode on the connected phone, without any code inside the app.
//   npm run dev-unlock
//
// The first run makes a key pair: the private key stays on this computer (~/.etzba/dev-key.pem, never in
// the project), and the public key is written to js/dev-key.js. Rebuild and install the app once after that.
// Every run then signs the connected phone's Android ID and opens the app with the signature; the app checks
// it with the public key. A signature only works on the phone it was made for.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adb, APP, requirePhone } from './adb.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(homedir(), '.etzba'), keyFile = join(dir, 'dev-key.pem'), pubFile = join(root, 'js/dev-key.js');

// 1. the key pair
let priv;
if (existsSync(keyFile)) priv = createPrivateKey(readFileSync(keyFile));
else {
  mkdirSync(dir, { recursive: true });
  ({ privateKey: priv } = generateKeyPairSync('ec', { namedCurve: 'P-256' }));
  writeFileSync(keyFile, priv.export({ type: 'pkcs8', format: 'pem' }));
  try { chmodSync(keyFile, 0o600); } catch { /* Windows */ }
  console.log(`Made a new developer key: ${keyFile}\nKeep it private, and back it up: without it, developer mode can't be turned on again.`);
}
const jwk = createPublicKey(priv).export({ format: 'jwk' });
const pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
const pubJs = `// The developer's PUBLIC key (written by \`npm run dev-unlock\` on his computer). It can only check a
// signature, never make one, so it's safe to publish. null: developer mode can't be turned on in this build.
export default ${JSON.stringify(pub)};
`;
const before = existsSync(pubFile) ? readFileSync(pubFile, 'utf8') : '';
if (before !== pubJs) {
  writeFileSync(pubFile, pubJs);
  console.log(`\nWrote the public key to js/dev-key.js. Commit it, then rebuild and install the app once:
  npm run release && npm run install-release
and run npm run dev-unlock again.`);
  process.exit(0);
}

// 2. the phone
requirePhone();
const id = spawnSync(adb, ['shell', 'settings', 'get', 'secure', 'android_id'], { encoding: 'utf8' }).stdout.trim();
if (!/^[0-9a-f]{8,}$/i.test(id)) { console.error('Couldn\'t read the phone\'s ID: ' + id); process.exit(1); }
const sig = sign('sha256', Buffer.from('etzba-dev:' + id), { key: priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');

// 3. open the app with it
const r = spawnSync(adb, ['shell', 'am', 'start', '-n', `${APP}/.MainActivity`, '--es', 'etzba_action', 'dev_unlock', '--es', 'etzba_sig', sig], { encoding: 'utf8' });
if (r.status !== 0 || /Error/.test(r.stdout + r.stderr)) { console.error(r.stdout + r.stderr); process.exit(1); }
console.log(`Sent to the phone (${id}). The app should open on Settings with developer mode on.`);
