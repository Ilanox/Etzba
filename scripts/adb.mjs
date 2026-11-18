// Finds adb in the Android SDK even when it isn't on PATH, and checks a phone is connected and allowed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
export const adb = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(homedir(), 'Android/Sdk'), join(homedir(), 'Library/Android/sdk'),
  join(homedir(), 'AppData/Local/Android/Sdk'), '/opt/android-sdk']
  .filter(Boolean).map(d => join(d, 'platform-tools', exe)).find(existsSync) || 'adb';

export const APP = 'com.edvinstudios.etzba';

export function requirePhone() {
  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' });
  if (devices.error) { console.error('adb not found. Open Android Studio → SDK Manager → SDK Tools → install "Android SDK Platform-Tools".'); process.exit(1); }
  const list = devices.stdout.split('\n').slice(1).filter(l => l.trim());
  if (!list.length) { console.error('No phone found. Connect it by USB, turn on USB debugging (Settings → Developer options), and tap "Allow" on the phone.'); process.exit(1); }
  if (list.some(l => l.includes('unauthorized'))) { console.error('The phone is asking for permission: unlock it and tap "Allow USB debugging", then run this again.'); process.exit(1); }
}
