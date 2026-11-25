// Shared by the scripts: paths, the app version, running commands, and where the Android SDK is.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The project folder. */
export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fromRoot = (...parts) => join(root, ...parts);
export const readJSON = file => JSON.parse(readFileSync(fromRoot(file), 'utf8'));
export const pkg = readJSON('package.json');
export const WIN = process.platform === 'win32';

/** True when the file is run directly (node scripts/x.mjs), not imported. */
export const isMain = url => !!process.argv[1] && fileURLToPath(url) === process.argv[1];

/** Runs a command in the terminal and stops everything if it fails. */
export function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: WIN });
  if (r.status !== 0) { console.error(`\n✗ ${cmd} ${args.join(' ')} failed`); process.exit(r.status || 1); }
}

/** Where the Android SDK may be: the environment first, then where Android Studio puts it on each system. */
export const sdkDirs = () => [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Android/Sdk'), join(homedir(), 'Library/Android/sdk'),
  join(homedir(), 'AppData/Local/Android/Sdk'), '/opt/android-sdk'].filter(Boolean);
export const androidSdk = () => sdkDirs().find(d => existsSync(d));
