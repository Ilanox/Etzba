// אצבע — native glue for the Android / iOS app (Capacitor). On the web every function here quietly does nothing,
// so the same files run as a website, an installed PWA and a store app.

const C = window.Capacitor;
export const NATIVE = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
export const PLATFORM = NATIVE ? C.getPlatform() : 'web';     // 'android' | 'ios' | 'web'

/* The app has no bundler, so Capacitor's JS core (which provides registerPlugin) is copied next to the
   app at build time (scripts/build-www.mjs → js/vendor/capacitor-core.js) and loaded only inside the
   native app. Everything below waits for it, so nothing breaks while it loads. */
let core = null;
const loaded = NATIVE
  ? (typeof C.registerPlugin === 'function' ? Promise.resolve() : import('./vendor/capacitor-core.js').then(m => { core = m; }).catch(() => {}))
  : Promise.resolve();
const plugins = {};
function P(name) {
  if (!NATIVE) return null;
  if (plugins[name]) return plugins[name];
  const reg = (core && core.registerPlugin) || (typeof window.Capacitor?.registerPlugin === 'function' && window.Capacitor.registerPlugin);
  const p = reg ? reg(name) : window.Capacitor?.Plugins?.[name];
  return p ? (plugins[name] = p) : null;
}
/** Runs fn(plugin) once Capacitor's core is ready. Plugins are proxies that answer any property, including
    "then", so a plugin must never be the value a promise resolves with: always use it inside fn. */
const withP = (name, fn) => loaded.then(() => { const p = P(name); return p ? fn(p) : undefined; });

/* ---- files out: write to the app's cache, then open the system share sheet (Save to Files, Drive, WhatsApp…) ---- */
export async function saveFile(name, text) {
  await loaded;
  const { uri } = await P('Filesystem').writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
  try { await P('Share').share({ title: name, files: [uri], dialogTitle: name }); }
  catch (e) { if (!/cancel/i.test(e?.message || '')) throw e; return false; }
  return true;
}

/* ---- files in: shared from another app, or opened with אצבע ---- */
const b64ToBuf = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };

/** Calls onFile({name, arrayBuffer}) for a file waiting at launch and for every file shared while open. */
export async function onSharedFile(onFile) {
  if (!NATIVE) return;
  await loaded;
  const deliver = (name, b64) => onFile({ name, arrayBuffer: async () => b64ToBuf(b64) });
  if (PLATFORM === 'android') {
    const si = P('ShareIn'); if (!si) return;
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
  if (!NATIVE) return false;
  withP('Haptics', h => {
    if (kind === 'success') h.notification({ type: 'SUCCESS' });
    else if (kind === 'warn') h.notification({ type: 'WARNING' });
    else h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
  }).catch(() => {});
  return true;
}

/* ---- Android back button: handler returns true when it handled it (closed a sheet, went home) ---- */
export async function onBack(handler) {
  if (PLATFORM !== 'android') return;
  await loaded; if (!P('App')) return;
  P('App').addListener('backButton', () => { if (!handler()) P('App').minimizeApp().catch(() => P('App').exitApp()); });
}

/* ---- system bars and splash ---- */
export function setBars(dark) {
  withP('SystemBars', sb => { sb.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {}); }).catch(() => {});
}
export function ready() { withP('SplashScreen', s => { s.hide({ fadeOutDuration: 150 }).catch(() => {}); }).catch(() => {}); }

/* ---- notifications (local, scheduled on the phone; nothing goes through a server) ---- */
export async function notifyAllowed(ask = false) {
  if (!NATIVE) return false;
  return (await withP('LocalNotifications', async n => {
    let s = await n.checkPermissions();
    if (s.display !== 'granted' && ask) s = await n.requestPermissions();
    return s.display === 'granted';
  }).catch(() => false)) || false;
}
/** Replaces every scheduled notification with `items` ([{ at: Date, title, body }]). */
export async function scheduleNotifications(items) {
  if (!NATIVE) return;
  await withP('LocalNotifications', async n => {
    const { notifications: pend } = await n.getPending();
    if (pend.length) await n.cancel({ notifications: pend.map(x => ({ id: x.id })) });
    const now = Date.now() + 5000;
    const list = items.filter(x => +x.at > now).slice(0, 30).map((x, i) => ({
      id: 100 + i, title: x.title, body: x.body,
      schedule: { at: x.at, allowWhileIdle: true },
      smallIcon: 'ic_stat_etzba', iconColor: '#FF6A3D',
    }));
    if (list.length) await n.schedule({ notifications: list });
  }).catch(() => {});
}
export function exitApp() { withP('App', a => { a.exitApp().catch(() => a.minimizeApp()); }).catch(() => {}); }
/** Developer tools: show these right away, `gap` seconds apart, without touching the shift's own schedule. */
export async function testNotifications(items, gap = 6) {
  if (!NATIVE) return false;
  return (await withP('LocalNotifications', async n => {
    let ok = (await n.checkPermissions()).display === 'granted';
    if (!ok) ok = (await n.requestPermissions()).display === 'granted';
    if (!ok) return false;
    const t0 = Date.now() + 3000;
    await n.schedule({ notifications: items.map((x, i) => ({ id: 900 + i, title: x.title, body: x.body, schedule: { at: new Date(t0 + i * gap * 1000), allowWhileIdle: true }, smallIcon: 'ic_stat_etzba', iconColor: '#FF6A3D' })) });
    return true;
  }).catch(() => false)) || false;
}
export async function pendingNotifications() {
  if (!NATIVE) return [];
  return (await withP('LocalNotifications', async n => (await n.getPending()).notifications.map(x => ({ id: x.id, title: x.title, body: x.body, at: x.schedule?.at })))
    .catch(() => [])) || [];
}
