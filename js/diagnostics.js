
/** The app's version, shown in settings, backups and diagnostic reports. */
export const VERSION = '1.0.0';

const KEY = 'etzba.log', MAX = 300;
const T0 = performance.now();
let entries = [];
let crashNote = null;

const store = (() => { for (const s of ['localStorage', 'sessionStorage']) { try { const x = window[s]; x.setItem('etzba.t', '1'); x.removeItem('etzba.t'); return x; } catch {} } return null; })();
try { entries = JSON.parse(store?.getItem(KEY) || '[]'); } catch { entries = []; }

(() => {
  const open = new Map();
  for (const e of entries) { if (e.k === 'begin') open.set(e.m, e); else if (e.k === 'end') open.delete(e.m); else if (e.k === 'boot') open.clear(); }
  const last = [...open.values()].pop();
  if (last) crashNote = { step: last.m, at: last.t };
})();

let saveTimer = null;
function save(now) {
  if (!store) return;
  clearTimeout(saveTimer);
  const go = () => { try { store.setItem(KEY, JSON.stringify(entries.slice(-MAX))); } catch {} };
  if (now) go(); else saveTimer = setTimeout(go, 300);
}

export function log(k, m, d) {
  try {
    entries.push({ t: Date.now(), k, m: String(m).slice(0, 300), ...(d !== undefined ? { d } : {}) });
    if (k !== 'begin' && k !== 'end') (k === 'error' ? console.error : k === 'warn' ? console.warn : console.info)(`[etzba] ${k}: ${String(m).slice(0, 300)}`);
    if (entries.length > MAX * 1.5) entries = entries.slice(-MAX);
    save(k === 'begin' || k === 'boot' || k === 'error');
  } catch {}
}

const timings = {};
export function timed(name, fn) {
  log('begin', name);
  const t = performance.now();
  try { return fn(); }
  catch (e) { log('error', name + ': ' + (e?.message || e)); throw e; }
  finally { const ms = Math.round(performance.now() - t); (timings[name] ||= []).push(ms); if (timings[name].length > 20) timings[name].shift(); log('end', name, ms); }
}

export const lastCrash = () => crashNote;
export const getLog = () => entries.slice();
export function clearLog() { entries = []; crashNote = null; save(true); }
export const sinceStart = () => Math.round(performance.now() - T0);

/** True when the app runs inside another page's frame (the website's live preview). */
export const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();

export function env() {
  const ua = navigator.userAgent, standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let storageOk = false, bytes = 0;
  try { localStorage.setItem('etzba.t', '1'); localStorage.removeItem('etzba.t'); storageOk = true; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); bytes += (localStorage.getItem(k) || '').length * 2; } } catch {}
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' / ' + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB' : 'n/a';
  return {
    where: window.Capacitor?.isNativePlatform?.() ? 'Android app' : framed ? 'embedded frame' : standalone ? 'installed app' : 'browser tab',
    webview: /; wv\)/.test(ua) ? 'Android WebView' : /Android/.test(ua) ? 'Android Chrome' : /iPhone|iPad/.test(ua) ? 'iOS' : 'desktop',
    lite: document.documentElement.classList.contains('lite'),
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    deviceMemory: navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'n/a',
    cores: navigator.hardwareConcurrency || 'n/a',
    heap: mem,
    localStorage: storageOk ? `ok · ${(bytes / 1024).toFixed(0)} KB used` : 'blocked',
    online: navigator.onLine,
    ua,
  };
}

export function timingSummary() {
  const out = {};
  for (const [k, v] of Object.entries(timings)) out[k] = { last: v[v.length - 1], max: Math.max(...v), n: v.length };
  return out;
}

try {
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 200) log('perf', 'long task', Math.round(e.duration)); })
    .observe({ type: 'longtask', buffered: true });
} catch {}

/* ---- on-screen meter (Settings → diagnostics → "show meter") ---- */
let meter = null, raf = 0;
export function setMeter(on) {
  try {
    if (!on) { cancelAnimationFrame(raf); meter?.remove(); meter = null; return; }
    if (meter) return;
    meter = document.createElement('div'); meter.id = 'dbgmeter'; meter.dataset.keep = ''; meter.setAttribute('aria-hidden', 'true');
    document.body.appendChild(meter);
    let frames = 0, last = performance.now(), worst = 0, prev = last;
    const tick = t => {
      frames++; worst = Math.max(worst, t - prev); prev = t;
      if (t - last > 1000) {
        const fps = Math.round(frames * 1000 / (t - last));
        const heap = performance.memory ? ' · ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '';
        const lastStep = [...entries].reverse().find(e => e.k === 'end' && e.d !== undefined);
        meter.textContent = `${fps}fps · worst ${Math.round(worst)}ms${heap}${lastStep ? ` · ${lastStep.m} ${lastStep.d}ms` : ''} · ${document.querySelectorAll('*').length} el`;
        frames = 0; last = t; worst = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch {}
}

addEventListener('pagehide', () => { log('info', 'page hidden/closed'); save(true); });
addEventListener('visibilitychange', () => log('info', document.hidden ? 'went to background' : 'came back'));
