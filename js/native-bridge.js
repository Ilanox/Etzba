// אצבע — native glue for the Android / iOS app (Capacitor). On the web every function here quietly does nothing,
// so the same files run as a website, an installed PWA and a store app.

const C = window.Capacitor;
export const NATIVE = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
export const PLATFORM = NATIVE ? C.getPlatform() : 'web';     // 'android' | 'ios' | 'web'

const plugins = {};
const P = name => NATIVE ? (plugins[name] ||= C.registerPlugin(name)) : null;

/* ---- files out: write to the app's cache, then open the system share sheet (Save to Files, Drive, WhatsApp…) ---- */
export async function saveFile(name, text) {
  const fs = P('Filesystem'), share = P('Share');
  const { uri } = await fs.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  try { await share.share({ title: name, files: [uri], dialogTitle: name }); }
  catch (e) { if (!/cancel/i.test(e?.message || '')) throw e; return false; }
  return true;
}

/* ---- files in: shared from another app, or opened with אצבע ---- */
const b64ToBuf = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };

/** Calls onFile({name, arrayBuffer}) for a file waiting at launch and for every file shared while open. */
export function onSharedFile(onFile) {
  if (!NATIVE) return;
  const deliver = (name, b64) => onFile({ name, arrayBuffer: async () => b64ToBuf(b64) });
  if (PLATFORM === 'android') {
    const si = P('ShareIn');
    const take = async () => { try { const r = await si.take(); if (r && r.data) deliver(r.name || 'shared.xls', r.data); } catch {} };
    take();
    si.addListener('shared', take);
  } else {
    // iOS: "Open in אצבע" / "Copy to אצבע" hands the app a file URL
    const fromUrl = async url => {
      if (!url || !url.startsWith('file:')) return;
      try { const { data } = await P('Filesystem').readFile({ path: url }); deliver(decodeURIComponent(url.split('/').pop()), data); } catch {}
    };
    P('App').addListener('appUrlOpen', e => fromUrl(e.url));
    P('App').getLaunchUrl().then(r => fromUrl(r?.url)).catch(() => {});
  }
}

/* ---- haptics (iOS has no navigator.vibrate) ---- */
export function haptic(kind = 'light') {
  const h = P('Haptics'); if (!h) return false;
  try {
    if (kind === 'success') h.notification({ type: 'SUCCESS' });
    else if (kind === 'warn') h.notification({ type: 'WARNING' });
    else h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
  } catch {}
  return true;
}

/* ---- Android back button: handler returns true when it handled it (closed a sheet, went home) ---- */
export function onBack(handler) {
  if (PLATFORM !== 'android') return;
  P('App').addListener('backButton', () => { if (!handler()) P('App').minimizeApp().catch(() => P('App').exitApp()); });
}

/* ---- system bars and splash ---- */
export function setBars(dark) {
  const sb = P('SystemBars'); if (!sb) return;
  try { sb.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); } catch {}
}
export function ready() { try { P('SplashScreen')?.hide({ fadeOutDuration: 150 }); } catch {} }
