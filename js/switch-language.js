// Switching the app's language, and redrawing everything that shows text
import { S } from './state.js';
import { langInfo, loadPack } from '../languages/index.js';
import { preferPack } from './remote-packs.js';
import { useLanguage, LANG } from './lang.js';
import { stopTranslating, usePack, startTranslating } from './translate.js';
import { persist, render } from './nav.js';
import { updateBackupDot } from './views/data.js';
import { syncGeo } from './outside.js';
import { planNotifications } from './notifications.js';
import { syncWidget } from './widget.js';

export async function setLang(l, save = true) {
  const info = langInfo(l);
  const pack = preferPack(info.code, await loadPack(info.code).catch(() => null));
  useLanguage(info, pack);
  stopTranslating(); usePack(pack);
  if (pack) startTranslating();
  if (save) { S.settings.lang = LANG; persist(); }
  render(); updateBackupDot();
  syncGeo(true); planNotifications(); syncWidget();
}
