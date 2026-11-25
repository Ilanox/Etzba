// אצבע — app
import { I, mark } from './svg-icons.js';
import { loadRules, checkForUpdates } from './rules.js';
import { checkPack } from './remote-packs.js';
import { LANGS, langInfo } from '../languages/index.js';
import * as dbg from './diagnostics.js';
import * as native from './native-bridge.js';
import { toast, openSheet, closeSheet, sheetOpen } from './ui.js';
import { LANG } from './lang.js';
import { view, showMonth, VIEWS, setRenderHooks, go, render, onSave, setSaveFailed, persist } from './nav.js';
import { applyTheme, startTheme } from './theme.js';
import { NET, recompute, monthCalc, withLive } from './pay.js';
import { S, setState, hadLocal, jobById } from './state.js';
import { $, $$ } from './util.js';
import { setSpeech, startA11y } from './a11y.js';
import FEATURES from './features.js';
import { openShiftSheet } from './views/shift-form.js';
import { countUp } from './views/common.js';
import { renderHome, renderRestCard, tickHome } from './views/home.js';
import { renderShifts } from './views/shifts.js';
import { renderSum } from './views/summary.js';
import { recapBanner } from './views/recap.js';
import { checkEarly } from './early.js';
import { renderRights } from './views/rights.js';
import { openOnboarding } from './views/onboarding.js';
import { renderSet, openLegal } from './views/settings.js';
import { copyText } from './files.js';
import { openFileImport, takeSharedFile, backupNow, updateBackupDot } from './views/data.js';
import { loadStatus } from './dev-status.js';
import { pendingAfterRestart } from './device-tests.js';
import { openDeviceCheck } from './views/device-check.js';
import { devOK } from './views/dev-tools.js';
import { planNotifications, askFirstPerms } from './notifications.js';
import { syncWidget } from './widget.js';
import { syncGeo, appAction } from './outside.js';
import { report, showFailure } from './problems.js';
import { openDebug } from './views/debug.js';
import { setLang } from './switch-language.js';
import { takeAddLink, doneAddLink } from './add-link.js';

dbg.log('boot', 'v' + dbg.VERSION);

loadRules();
document.documentElement.lang = LANG; document.documentElement.dir = langInfo(LANG).dir;

startTheme(() => syncWidget());
onSave(() => planNotifications()); onSave(() => syncGeo()); onSave(() => syncWidget());
setSaveFailed(() => toast('לא הצלחתי לשמור בטלפון. כדאי לגבות', 'err', { label: 'גיבוי עכשיו', fn: () => backupNow() }));


Object.assign(VIEWS, { home: renderHome, shifts: renderShifts, sum: renderSum, rights: renderRights, set: renderSet });
setRenderHooks(drawHeader, (el, e) => showFailure(el, e));
/** The figures in the top bar, redrawn after every screen. */
function drawHeader() {
  try {
    const now = new Date(), M = withLive(monthCalc(now.getFullYear(), now.getMonth()));
    countUp($('#barNet'), NET() ? M.net.net : M.gross);
    { const l = $('#chipNet small'); if (l) l.textContent = NET() ? 'נטו משוער' : 'ברוטו החודש'; $('#chipNet')?.setAttribute('aria-label', NET() ? 'נטו משוער החודש, לסיכום' : 'ברוטו החודש, לסיכום'); }
    $('#brandMark').innerHTML = mark({ t: now, sw: 5.4 });
    recapBanner();
  } catch (e) { report(e); }
}

addEventListener('error', e => { if (window.__etzbaReady && e.error) report(e.error); });
addEventListener('unhandledrejection', e => { if (window.__etzbaReady) report(e.reason); });
$$('#tabs button').forEach(b => { b.querySelector('.tic').innerHTML = I[b.querySelector('.tic').dataset.i]; b.onclick = () => go(b.dataset.v); });
$('#fab').innerHTML = I.plus;
{ let lastY = scrollY; addEventListener('scroll', () => { const y = scrollY; if (Math.abs(y - lastY) > 6) { $('#fab').classList.toggle('tuck', y > lastY && y > 80); lastY = y; } }, { passive: true }); }
/** The "new shift" sheet, for the given hours or the job's usual day ending this hour. */
function newShift(start, end) {
  const job = jobById(S.settings.lastJob);
  if (!end) { end = new Date(); end.setMinutes(0, 0, 0); start = new Date(+end - Math.round(job.regHours) * 3.6e6); }
  openShiftSheet({ id: null, jobId: job.id, start: start.toISOString(), end: end.toISOString(), breakMin: job.breakMin, bonus: 0, note: '', rest: 'auto' }, 'new');
}
$('#fab').onclick = () => newShift();
// a shift from the website's calculators: after the welcome screens, if those are showing
function openAddLink() { const a = takeAddLink(); if (!a) return; doneAddLink(); go('home'); newShift(a.start, a.end); }

const step = (name, fn) => { try { fn(); } catch (e) { (window.__etzbaErr || []).push(name + ': ' + (e && e.message)); console.error(name, e); } };
step('recompute', recompute);
step('render', render);
if (LANG !== 'he') step('language', () => { setLang(LANG, false); });
step('langCheck', () => {
  let failed = null; try { failed = localStorage.getItem('etzba.langFailed'); localStorage.removeItem('etzba.langFailed'); } catch {}
  if (failed) {
    dbg.log('error', `language ${failed}: the last start didn't finish, back to Hebrew`);
    let errs = ''; try { errs = localStorage.getItem('etzba.bootErr') || ''; } catch {}
    const details = [`language ${failed} failed to start · v${dbg.VERSION}`, errs || '(no error recorded: it stopped responding)', ...dbg.getLog().slice(-40).map(e => JSON.stringify(e)), navigator.userAgent].join('\n');
    setTimeout(() => toast('השפה הוחזרה לעברית בגלל תקלה. אפשר לנסות שוב בהגדרות', 'err', { label: 'העתקת פרטים', fn: () => copyText(details).then(() => toast('הועתק', 'ok')) }), 800);
  }
  setTimeout(() => { try { localStorage.removeItem('etzba.langBoot'); } catch {} }, 4000);
});
window.__etzbaReady = true;
dbg.log('perf', 'ready', dbg.sinceStart());
step('crashNote', () => { const c = dbg.lastCrash(); if (c) { dbg.log('warn', 'last session ended during: ' + c.step); if (FEATURES.devTools) toast(`בפעם הקודמת האפליקציה נסגרה (${c.step}). פרטים באבחון`, 'err', { label: 'פרטים', fn: openDebug }); } });
step('debugHash', () => { if (!FEATURES.devTools) return; if (location.hash === '#debug') openDebug(); addEventListener('hashchange', () => { if (location.hash === '#debug') openDebug(); }); });
step('restore', async () => {
  if (!native.NATIVE || hadLocal) return;
  const json = await native.snapshot.load(); if (!json) return;
  let d; try { d = JSON.parse(json); } catch (e) { dbg.log('error', 'snapshot unreadable'); return; }
  if (!d || !Array.isArray(d.shifts) || (!d.shifts.length && !d.active)) return;
  setState(d, json);
  $('#onboard')?.remove(); applyTheme(); recompute(); render();
  dbg.log('warn', `restored ${S.shifts.length} shifts from the app's copy`);
  toast(`שוחזרו ${S.shifts.length} משמרות מהעותק השמור בטלפון`, 'ok');
});
step('welcome', () => { if (!S.settings.onboarded && !S.shifts.length && !S.active) openOnboarding(); });
step('addLink', () => { if (!takeAddLink()) return; if ($('#onboard')) addEventListener('etzba:onboarded', openAddLink, { once: true }); else setTimeout(openAddLink, 300); });
step('shared', () => {
  takeSharedFile();
  native.onSharedFile(f => { dbg.log('info', 'native share: ' + f.name); $('#onboard')?.remove(); go('set'); openFileImport(f); });
});
step('back', () => native.onBack(() => {
  if (sheetOpen()) { closeSheet(); return true; }
  if ($('#onboard')) return false;
  if (view !== 'home') { go('home'); return true; }
  openSheet(`<h2>לצאת מאצבע?</h2>${S.active ? '<p class="shsub">המשמרת ממשיכה להיספר גם כשהאפליקציה סגורה.</p>' : ''}
    <div class="btnrow"><button class="btn primary" id="x-stay">להישאר</button><button class="btn soft" id="x-exit">יציאה מהאפליקציה</button></div>`, root => {
    $('#x-stay', root).onclick = closeSheet;
    $('#x-exit', root).onclick = () => { closeSheet(); native.exitApp(); };
  });
  return true;
}));
step('splash', native.ready);
step('perms', () => { if (S.settings.onboarded) setTimeout(askFirstPerms, 1200); });
step('notifications', () => {
  planNotifications();
  document.addEventListener('click', e => {
    if (e.target.closest('[data-legal]')) return openLegal();
    const b = e.target.closest('[data-n="open"]'); if (!b) return;
    native.openNotificationSettings();
  });
});
function measureTextZoom() {
  let z = 1;
  try {
    const o = +localStorage.getItem('etzba.tz');
    if (o) { z = o; document.documentElement.style.fontSize = (o * 100) + '%'; }
    else {
      const t = document.createElement('span');
      t.style.cssText = 'position:absolute;visibility:hidden;font:100px/1 sans-serif;white-space:nowrap';
      t.textContent = '0'; document.body.appendChild(t); z = t.getBoundingClientRect().height / 100; t.remove();
    }
  } catch { }
  z = Math.max(1, Math.round(z * 100) / 100);
  const h = document.documentElement;
  h.style.setProperty('--tz', z); h.classList.toggle('tz-big', z >= 1.3); h.classList.toggle('tz-huge', z >= 1.65);
  dbg.log('info', 'text zoom ' + z);
}
step('textzoom', measureTextZoom);
step('billing', () => {
  if (!native.billing.available()) return;
  native.billing.onPaid(() => { if (S.settings.supported) return; S.settings.supported = true; persist(); applyTheme(); render(); toast('התשלום עבר. תודה על התמיכה!', 'ok'); });
  if (!S.settings.supported && !S.settings.histChecked) native.billing.owned().then(r => {
    if (r.error) return dbg.log('warn', 'billing: ' + r.error);   // Play unreachable: try again next start
    S.settings.histChecked = 1;
    if (r.supported) { S.settings.supported = true; applyTheme(); render(); toast('התמיכה שלך שוחזרה. תודה!', 'ok'); }
    persist();
  });
});
step('a11y', () => { setSpeech(S.settings.speech || 'en', LANGS.find(l => l.code === 'en')?.pack); startA11y(); });
step('rules', () => {
  const changed = () => { recompute(); render(); toast('עודכנו נתוני השכר והחגים', 'ok'); };
  const packChanged = () => { if (LANG !== 'he') setLang(LANG, false); };
  const both = () => { checkForUpdates(changed); checkPack(LANG, packChanged); };
  both(); checkEarly();
  addEventListener('online', () => { both(); checkEarly(); });
});
step('geo', () => { syncGeo(true); native.appActions.onAction(appAction); syncWidget(); });
step('meter', () => { try { if (localStorage.getItem('etzba.meter') === '1') dbg.setMeter(true); } catch {} });
step('backupDot', updateBackupDot);
// developer mode: check the website in the background, so a failed deploy shows as a dot on the Settings tab
// a restart test reopens the device tests to check nothing was lost
step('deviceTests', () => { if (pendingAfterRestart()) setTimeout(() => openDeviceCheck(), 600); });
step('devStatus', () => { if (S.settings.dev && devOK()) loadStatus().then(updateBackupDot); });
setInterval(() => { if (document.hidden) return; tickHome(false); if (new Date().getSeconds() === 0) { renderRestCard(); $('#brandMark').innerHTML = mark({ t: new Date(), sw: 5.4 }); } }, 1000);
$('#chipNet') && ($('#chipNet').onclick = () => { const n = new Date(); showMonth(n.getFullYear(), n.getMonth()); S.ui.sumView = 'month'; go('sum'); setTimeout(() => $('#steps')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); planNotifications(); checkEarly(); } });

try {
  if (!native.NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    if (dbg.framed) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    else navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
} catch {}
