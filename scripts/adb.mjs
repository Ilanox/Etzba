// Finds adb and checks a phone is connected, for the scripts that talk to the phone.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sdkDirs, WIN } from './lib.mjs';

export const adb = sdkDirs().map(d => join(d, 'platform-tools', WIN ? 'adb.exe' : 'adb')).find(existsSync) || 'adb';
export const APP = 'com.edvinstudios.etzba';

/** Stops with a plain explanation when no phone is ready. */
export function requirePhone() {
  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' });
  if (devices.error) { console.error('adb not found. Open Android Studio → SDK Manager → SDK Tools → install "Android SDK Platform-Tools".'); process.exit(1); }
  const list = devices.stdout.split('\n').slice(1).filter(l => l.trim());
  if (!list.length) { console.error('No phone found. Connect it by USB, turn on USB debugging (Settings → Developer options), and tap "Allow" on the phone.'); process.exit(1); }
  if (list.some(l => l.includes('unauthorized'))) { console.error('The phone is asking for permission: unlock it and tap "Allow USB debugging", then run this again.'); process.exit(1); }
}
