// Developer mode: unlocking it with a signed device id, and the developer tools sheet
import FEATURES from '../features.js';
import { S, jobById } from '../state.js';
import DEV_KEY from '../dev-key.js';
import * as native from '../native-bridge.js';
import { persist, go, render, commit } from '../nav.js';
import { applyTheme, viewAs } from '../theme.js';
import { buzz, toast, openSheet, closeSheet } from '../ui.js';
import * as dbg from '../diagnostics.js';
import { $$, $, esc, tm, uid } from '../util.js';
import { buildNotifications, planNotifications } from '../notifications.js';
import { tr } from '../translate.js';
import { jobAt } from '../pay-engine.js';
import { syncGeo } from '../outside.js';
import { openOnboarding } from './onboarding.js';
import { report } from '../problems.js';
import { renderSet } from './settings.js';
import { openDashboard } from './dashboard.js';

export const devOK = () => FEATURES.devTools || !!S.settings.owner;

export async function devUnlock(sig) {
  try {
    if (!DEV_KEY || !sig) throw new Error(DEV_KEY ? 'no signature' : 'no public key in this build');
    const id = await native.appActions.deviceId(); if (!id) throw new Error('no device id');
    const key = await crypto.subtle.importKey('jwk', DEV_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, new TextEncoder().encode('etzba-dev:' + id));
    if (!ok) throw new Error('bad signature');
    S.settings.owner = true; S.settings.dev = true; S.settings.supported = true; S.settings.supportedAt ||= new Date().toISOString();
    persist(); applyTheme(); buzz(40); toast('מצב מפתח פעיל: הכול פתוח', 'ok'); go('set');
  } catch (e) { dbg.log('warn', 'dev unlock: ' + (e?.message || e)); toast('לא הצלחתי להפעיל מצב מפתח', 'err'); }
}

/* translations: skip-start (developer tools stay in Hebrew) */
export function openDevTools() {
  const scen = {
    weekday: ['יום חול ארוך מ־08:00', () => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; }],
    friday: ['שישי מ־10:00, לתוך השבת', () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); d.setHours(10, 0, 0, 0); return d; }],
    current: ['המשמרת שרצה עכשיו', () => S.active ? new Date(S.active.start) : null],
  };
  let pick = S.active ? 'current' : 'friday', items = [];
  const jobId = S.active?.jobId || S.settings.lastJob;
  openSheet(`<div data-keep><h2>כלי פיתוח</h2><p class="shsub">לבדיקות בלבד. לא משנה את החישובים.</p>
    <button class="btn soft" id="dv-dash" style="width:100%;margin-bottom:6px">לוח בקרה: האתר, הבדיקות והטלפון</button>
    ${S.settings.owner ? `<div class="sec"><span>להציג את האפליקציה כמו</span></div>
    <div class="seg" id="dv-view">${[['regular', 'משתמש רגיל'], ['supporter', 'תומך'], ['dev', 'מפתח']].map(([k, n]) => `<button data-v="${k}" class="${viewAs() === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <p class="hint">רק התצוגה משתנה. מצב המפתח נשאר, וכלי הפיתוח תמיד כאן.</p>` : ''}
    <div class="sec"><span>התראות</span></div>
    <div class="card">
      <button class="cell" id="dv-one"><span class="grow">התראה אחת לבדיקה<div class="sub">מגיעה בעוד 3 שניות</div></span></button>
      <button class="cell" id="dv-soon"><span class="grow">משמרת שמגיעה לשעות נוספות בעוד 2 דקות<div class="sub">מתחילה משמרת אמיתית שהתחילה מוקדם, וההתראה תגיע כרגיל</div></span></button>
      <button class="cell" id="dv-pend"><span class="grow">ההתראות שמתוזמנות עכשיו</span></button>
      ${native.geo.available() ? `<button class="cell" id="dv-geo-in"><span class="grow">התראת "הגעת לעבודה?" לבדיקה</span></button>
      <button class="cell" id="dv-geo-out"><span class="grow">התראת "יצאת מהעבודה?" לבדיקה</span></button>` : ''}
    </div>
    <div class="sec"><span>כל ההתראות של משמרת</span></div>
    <div class="seg" id="dv-scen">${Object.entries(scen).filter(([k]) => k !== 'current' || S.active).map(([k, [l]]) => `<button data-s="${k}">${l}</button>`).join('')}</div>
    <div class="card pad" id="dv-list" style="margin-top:10px"></div>
    <button class="btn soft" id="dv-send" style="margin-top:10px">לשלוח את כולן עכשיו, כל 6 שניות</button>
    <div class="sec"><span>עוד</span></div>
    <div class="card">
      <button class="cell" id="dv-onb"><span class="grow">להציג שוב את מסך הפתיחה</span></button>
      <button class="cell" id="dv-demo"><span class="grow">להוסיף משמרות לדוגמה (3 חודשים)</span></button>
      <button class="cell" id="dv-undemo"><span class="grow">למחוק את משמרות הדוגמה</span></button>
      <button class="cell" id="dv-err"><span class="grow">שגיאה לבדיקה<div class="sub">מציג את פס התקלה</div></span></button>
      <button class="cell" id="dv-reload"><span class="grow">טעינה מחדש של האפליקציה</span></button>
      <button class="cell" id="dv-off"><span class="grow">כיבוי מצב מפתח</span></button>
    </div></div>`, root => {
    const draw = () => {
      $$('#dv-scen button', root).forEach(b => b.classList.toggle('on', b.dataset.s === pick));
      const start = scen[pick][1]();
      items = start ? buildNotifications({ jobId, start: start.toISOString() }) : [];
      $('#dv-list', root).innerHTML = items.length ? items.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(tr(x.title))}</b><span class="num" style="color:var(--ink3)">${tm(x.at)}</span></div><div style="color:var(--ink2);font-size:.9rem">${esc(tr(x.body))}</div></div>`).join('') : '<div class="hint">אין התראות למשמרת הזאת</div>';
    };
    $$('#dv-scen button', root).forEach(b => b.onclick = () => { pick = b.dataset.s; draw(); });
    const send = async list => { if (!native.NATIVE) return toast('התראות עובדות רק באפליקציה לאנדרואיד', 'err');
      const ok = await native.testNotifications(list.map(x => ({ title: tr(x.title), body: tr(x.body) })));
      planNotifications.last = null;
      toast(ok ? `נשלחו ${list.length} התראות` : 'אין הרשאה להתראות. אפשר לאשר בהגדרות הטלפון', ok ? 'ok' : 'err'); };
    $('#dv-one', root).onclick = () => send([{ title: 'אצבע · בדיקה', body: 'ככה נראית התראה. אם רואים את זה, הכל עובד.' }]);
    $('#dv-send', root).onclick = () => send(items);
    $('#dv-soon', root).onclick = () => {
      const job = jobAt(jobById(jobId), new Date());
      S.active = { jobId, start: new Date(Date.now() - (job.regHours * 60 - 2) * 6e4).toISOString() };
      persist(); closeSheet(); go('home'); planNotifications(true); toast('משמרת בדיקה התחילה. ההתראה תגיע בעוד כ־2 דקות', 'ok');
    };
    $('#dv-pend', root).onclick = async () => {
      const p = await native.pendingNotifications();
      $('#dv-list', root).innerHTML = p.length ? p.map(x => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(x.title)}</b> <span class="num" style="color:var(--ink3)">${x.at ? tm(x.at) : ''}</span><div style="color:var(--ink2);font-size:.9rem">${esc(x.body)}</div></div>`).join('') : `<div class="hint">${native.NATIVE ? 'אין התראות מתוזמנות' : 'רק באפליקציה לאנדרואיד'}</div>`;
    };
    const geoTest = kind => { if (!native.geo.available()) return toast('רק באפליקציה לאנדרואיד', 'err'); const j = jobById(jobId); syncGeo(true); setTimeout(() => native.geo.test(kind, j.id, j.name), 300); toast('נשלחה התראה', 'ok'); };
    $('#dv-geo-in', root) && ($('#dv-geo-in', root).onclick = () => geoTest('in'));
    $('#dv-geo-out', root) && ($('#dv-geo-out', root).onclick = () => geoTest('out'));
    $$('#dv-view button', root).forEach(b => b.onclick = () => {
      S.settings.viewAs = b.dataset.v; persist(); applyTheme(); render(); buzz(10);
      $$('#dv-view button', root).forEach(x => x.classList.toggle('on', x === b));
      toast(`מוצג כמו ${b.textContent}`, 'ok');
    });
    $('#dv-dash', root).onclick = () => openDashboard();
    $('#dv-onb', root).onclick = () => { closeSheet(); openOnboarding(); };
    $('#dv-demo', root).onclick = () => {
      const days = 90, out = []; const now = new Date();
      for (let i = days; i > 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); if (d.getDay() === 6 || Math.random() < .3) continue;
        const h = [8, 10, 14, 16][i % 4], st = new Date(d); st.setHours(h, [0, 15, 30][i % 3], 0, 0); const en = new Date(+st + (6 + (i % 5)) * 3.6e6);
        out.push({ id: uid(), jobId, start: st.toISOString(), end: en.toISOString(), breakMin: i % 3 ? 0 : 30, bonus: 0, note: '', rest: 'auto', src: 'demo' }); }
      S.shifts.push(...out); commit(); toast(`נוספו ${out.length} משמרות לדוגמה`, 'ok');
    };
    $('#dv-undemo', root).onclick = () => { const n = S.shifts.length; S.shifts = S.shifts.filter(x => x.src !== 'demo'); commit(); toast(`נמחקו ${n - S.shifts.length} משמרות לדוגמה`, 'ok'); };
    $('#dv-err', root).onclick = () => { closeSheet(); report(new Error('שגיאה לבדיקה מכלי הפיתוח')); };
    $('#dv-reload', root).onclick = () => location.reload();
    $('#dv-off', root).onclick = () => { S.settings.dev = false; persist(); closeSheet(); renderSet(); toast('מצב מפתח כבוי'); };
    draw();
  });
}
/* translations: skip-end */
