// Handing a file to the user (share sheet, download) and copying text.
import * as native from './native-bridge.js';
import * as dbg from './diagnostics.js';
import { toast } from './ui.js';

export async function deliver(name, text, mime) {
  if (native.NATIVE) {
    try { return await native.saveFile(name, text); }
    catch (e) { dbg.log('error', 'native save: ' + (e?.message || e)); toast('לא הצלחתי לשמור את הקובץ'); return false; }
  }
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) { if (e?.name === 'AbortError') return false; }
  try {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('הקובץ נשמר בהורדות', 'ok');
    return true;
  } catch { return copyText(text); }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('הועתק ללוח'); return true; } catch { toast('לא הצלחתי להעתיק'); return false; }
}

/** "Send to a friend": the app's link with one line about it, through the share sheet, or copied. */
export async function shareApp() {
  const title = 'אצבע', text = 'אצבע: שעון נוכחות ומחשבון שכר לעובדים לפי שעה. חינם, בלי חשבון ובלי פרסומות.', url = 'https://etzba.co.il/';
  if (native.NATIVE) { try { return await native.shareText(title, text, url); } catch (e) { dbg.log('warn', 'share app: ' + (e?.message || e)); } }
  else if (navigator.share) { try { await navigator.share({ title, text, url }); return true; } catch (e) { if (e?.name === 'AbortError') return false; } }
  return copyText(`${text}\n${url}`);
}
