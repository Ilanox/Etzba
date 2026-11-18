// אצבע — native glue for the Android / iOS app (Capacitor). On the web every function here quietly does nothing,
// so the same files run as a website, an installed PWA and a store app.

import * as dbg from './diagnostics.js';

const C = window.Capacitor;
/** For calls that may fail without harm: never silent, always in the diagnostics log. */
const warn = what => e => dbg.log('warn', `native ${what}: ${e?.message || e}`);
export const NATIVE = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
export const PLATFORM = NATIVE ? C.getPlatform() : 'web';     // 'android' | 'ios' | 'web'

/* The app has no bundler, so Capacitor's JS core (which provides registerPlugin) is copied next to the
   app at build time (scripts/build-www.mjs → js/vendor/capacitor-core.js) and loaded only inside the
   native app. Everything below waits for it, so nothing breaks while it loads. */
let core = null;
const loaded = NATIVE
  ? (typeof C.registerPlugin === 'function' ? Promise.resolve() : import('./vendor/capacitor-core.js').then(m => { core = m; }).catch(warn('core')))
  : Promise.resolve();
const plugins = {};
function P(name) {
  if (!NATIVE) return null;
  if (plugins[name]) return plugins[name];
  if (core && core[name] && typeof core[name] === 'object') return (plugins[name] = core[name]);   // built into Capacitor (SystemBars…): don't register twice
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
  // text is written as UTF-8; bytes (a PDF) as base64
  const bin = text instanceof Uint8Array;
  let data = text;
  if (bin) { let s = ''; for (let i = 0; i < text.length; i += 0x8000) s += String.fromCharCode.apply(null, text.subarray(i, i + 0x8000)); data = btoa(s); }
  const { uri } = await P('Filesystem').writeFile({ path: name, data, directory: 'CACHE', ...(bin ? {} : { encoding: 'utf8' }) });
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
    const take = async () => { try { const r = await si.take(); if (r && r.data) deliver(r.name || 'shared.xls', r.data); } catch (e) { warn('share-in')(e); } };
    take();
    si.addListener('shared', take);
  } else {
    // iOS: "Open in אצבע" / "Copy to אצבע" hands the app a file URL
    const fromUrl = async url => {
      if (!url || !url.startsWith('file:')) return;
      try { const { data } = await P('Filesystem').readFile({ path: url }); deliver(decodeURIComponent(url.split('/').pop()), data); } catch (e) { warn('open file')(e); }
    };
    P('App').addListener('appUrlOpen', e => fromUrl(e.url));
    P('App').getLaunchUrl().then(r => fromUrl(r?.url)).catch(warn('launch url'));
  }
}

/* ---- haptics (iOS has no navigator.vibrate) ---- */
export function haptic(kind = 'light') {
  if (!NATIVE) return false;
  withP('Haptics', h => {
    if (kind === 'success') h.notification({ type: 'SUCCESS' });
    else if (kind === 'warn') h.notification({ type: 'WARNING' });
    else h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
  }).catch(warn('listeners'));
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
  withP('SystemBars', sb => { sb.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(warn('bars')); }).catch(warn('bars'));
}
export function ready() { withP('SplashScreen', s => { s.hide({ fadeOutDuration: 150 }).catch(warn('splash')); }).catch(warn('splash')); }

/* ---- notifications (local, scheduled on the phone; nothing goes through a server) ---- */
/** What the phone allows: display ('granted' | 'denied' | 'prompt'), and whether times can be exact
   (Android 12+ may only allow "about then", usually within a few minutes; null when unknown). */
export async function notifyStatus() {
  if (!NATIVE) return { display: 'unsupported', exact: null };
  return withP('LocalNotifications', async n => {
    const { display } = await n.checkPermissions();
    return { display, exact: null };
  }).catch(e => { warn('notify status')(e); return { display: 'error', exact: null }; });
}
export async function notifyAllowed(ask = false) {
  if (!NATIVE) return false;
  return withP('LocalNotifications', async n => {
    let s = await n.checkPermissions();
    if (s.display !== 'granted' && ask) s = await n.requestPermissions();
    return s.display === 'granted';
  }).catch(e => { warn('notify permission')(e); return false; });
}
/** Opens the app's notification settings (to turn them back on). */
export function openNotificationSettings() { return withP('AppActions', a => a.openNotificationSettings()).catch(warn('notification settings')); }

/** Replaces every scheduled notification with `items` ([{ at: Date, title, body }]). Returns how many were scheduled. */
export async function scheduleNotifications(items) {
  if (!NATIVE) return 0;
  // the app's own scheduler (native/android/NotifyPlugin.java): no exact-alarm permission, never opens settings
  if (window.Capacitor?.isPluginAvailable?.('Notify')) {
    const list = items.filter(x => +x.at > Date.now() + 5000).slice(0, 30).map((x, i) => ({ id: 100 + i, at: +x.at, title: x.title, body: x.body }));
    const r = await withP('Notify', n => n.schedule({ items: list }));
    return r?.count ?? list.length;
  }
  return withP('LocalNotifications', async n => {
    const { notifications: pend } = await n.getPending();
    const ours = pend.filter(x => x.id >= 100 && x.id < 900);
    if (ours.length) await n.cancel({ notifications: ours.map(x => ({ id: x.id })) });
    const now = Date.now() + 5000;
    const list = items.filter(x => +x.at > now).slice(0, 30).map((x, i) => ({
      id: 100 + i, title: x.title, body: x.body,
      // allowWhileIdle: delivered even in battery saving / Doze, on time or within a few minutes (no exact-alarm permission)
      schedule: { at: x.at, allowWhileIdle: true },
      smallIcon: 'ic_stat_etzba', iconColor: '#FF6A3D',
    }));
    if (list.length) await n.schedule({ notifications: list });
    return list.length;
  });   // errors reach the caller, which shows them
}
export function exitApp() { withP('App', a => { a.exitApp().catch(() => a.minimizeApp()); }).catch(warn('exit')); }
/** Developer tools: show these right away, `gap` seconds apart, without touching the shift's own schedule. */
export async function testNotifications(items, gap = 6) {
  if (!NATIVE) return false;
  return (await withP('LocalNotifications', async n => {
    let ok = (await n.checkPermissions()).display === 'granted';
    if (!ok) ok = (await n.requestPermissions()).display === 'granted';
    if (!ok) return false;
    const t0 = Date.now() + 3000;
    if (window.Capacitor?.isPluginAvailable?.('Notify')) {   // the same scheduler the app uses (replaces what's waiting; the app plans again after)
      await P('Notify').schedule({ items: items.map((x, i) => ({ id: 900 + i, at: t0 + i * gap * 1000, title: x.title, body: x.body })) });
      return true;
    }
    await n.schedule({ notifications: items.map((x, i) => ({ id: 900 + i, title: x.title, body: x.body, schedule: { at: new Date(t0 + i * gap * 1000), allowWhileIdle: true }, smallIcon: 'ic_stat_etzba', iconColor: '#FF6A3D' })) });
    return true;
  }).catch(() => false)) || false;
}
export async function pendingNotifications() {
  if (!NATIVE) return [];
  if (window.Capacitor?.isPluginAvailable?.('Notify'))
    return (await withP('Notify', n => n.pending()).catch(() => null))?.items?.map(x => ({ id: x.id, title: x.title, body: x.body, at: new Date(x.at) })) || [];
  return (await withP('LocalNotifications', async n => (await n.getPending()).notifications.map(x => ({ id: x.id, title: x.title, body: x.body, at: x.schedule?.at })))
    .catch(() => [])) || [];
}

/* ---- supporting the app: Google Play one-time payments (see native/android/BillingPlugin.java) ---- */
export const billing = {
  available: () => PLATFORM === 'android' && !!window.Capacitor?.isPluginAvailable?.('Billing'),
  /** [{ id, price, micros }] in the person's currency, for the products that exist in Play Console. */
  products: ids => withP('Billing', b => b.products({ ids })).then(r => r?.products || []),
  /** { ok, cancelled } */
  buy: id => withP('Billing', b => b.buy({ id })),
  /** A supporter's app icon: 'default' | 'gold' | 'night' | 'paper' | 'forest'. */
  setIcon: name => withP('Billing', b => b.setIcon({ name })),
};

/* ---- workplace arrival / departure (Android geofencing; see native/android/GeoPlugin.java) ---- */
const callGeo = (m, arg) => withP('Geo', g => g[m](arg)).catch(e => { throw e; });
export const geo = {
  /** Only in builds with arrivalDetection switched on in features.json. */
  available: () => PLATFORM === 'android' && !!window.Capacitor?.isPluginAvailable?.('Geo'),
  status: () => callGeo('status').catch(() => ({ location: false, background: false })),
  requestLocation: () => callGeo('requestLocation').catch(() => ({ location: false, background: false })),
  requestBackground: () => callGeo('requestBackground').catch(() => ({ location: false, background: false })),
  current: () => callGeo('current'),
  geocode: address => callGeo('geocode', { address }).then(r => (r && r.results) || []),
  setFences: (fences, texts) => callGeo('setFences', { fences, texts }).catch(() => ({ registered: false })),
  test: (kind, jobId, name) => callGeo('test', { kind, jobId, name }).catch(warn('geo test')),
  setActive: (active, jobId) => callGeo('setActive', { active, jobId: jobId || '' }).catch(warn('geo active')),
};

/* ---- things that open the app with something to do, and the home-screen widget (native/android/AppActionsPlugin.java) ---- */
export const appActions = {
  /** cb({ action: 'toggle' | 'start' | 'end' | 'ask_start' | 'ask_end' | 'dev_unlock', jobId, sig }) — from the widget or an arrival/leaving notification. */
  async onAction(cb) {
    if (PLATFORM !== 'android') return;
    await loaded;
    const a = P('AppActions'); if (!a) return;
    const take = async () => { try { const r = await a.take(); if (r && r.action) cb(r); } catch (e) { warn('app action')(e); } };
    take(); a.addListener('action', take);
  },
  /** This phone's Android ID (for developer mode: the signature from `npm run dev-unlock` is made for it). */
  deviceId: () => withP('AppActions', a => a.deviceId()).then(r => r?.id || '').catch(() => ''),
  /** Keeps the widget showing the running shift. Android draws the ticking timer itself. */
  updateWidget(state) {
    if (PLATFORM !== 'android') return;
    withP('AppActions', a => a.updateWidget(state)).catch(warn('widget'));
  },
};

/* ---- a second copy of the data in the app's private files. localStorage lives inside the WebView, which
   Android can occasionally lose (WebView reset, storage trouble); this copy brings everything back. ---- */
const SNAP = 'etzba-data.json';
let snapTimer = null;
export const snapshot = {
  save(json) {
    if (!NATIVE) return;
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => withP('Filesystem', f => f.writeFile({ path: SNAP, data: json, directory: 'DATA', encoding: 'utf8' })).catch(warn('snapshot save')), 1500);
  },
  async load() {
    if (!NATIVE) return null;
    try { const { data } = await withP('Filesystem', f => f.readFile({ path: SNAP, directory: 'DATA', encoding: 'utf8' })); return typeof data === 'string' ? data : null; }
    catch { return null; }   // no copy yet: normal on first launch
  },
};
