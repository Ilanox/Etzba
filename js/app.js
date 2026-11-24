// אצבע — app
import { taxFor } from './net-pay.js';
import { rateChanges, computeAll, shiftPay, defaultJob, normalizeJob, shiftKind, KIND_NAME, TIERS, jobAt, applyRulesFrom, rulesChanged } from './pay-engine.js';
import { readSheets } from './file-reader.js';
import { rowsToShifts, guessYear } from './shift-import.js';
import { CITIES } from './hebrew-calendar.js';
import { I, mark } from './svg-icons.js';
import { loadRules, checkForUpdates, rules } from './rules.js';
import { preferPack, checkPack } from './remote-packs.js';
import { usePack, startTranslating, stopTranslating, tr } from './translate.js';
import { LANGS, loadPack, langInfo } from '../languages/index.js';
import * as dbg from './diagnostics.js';
import * as native from './native-bridge.js';
import { buzz, toast, announce, openSheet, closeSheet, sheetOpen, confirmBtn } from './ui.js';
import { LANG, EN, DAYS, MONTHS, useLanguage } from './lang.js';
import { view, viewY, viewM, showMonth, setView, VIEWS, setRenderHooks, go, render, onSave, setSaveFailed, persist, commit } from './nav.js';
import { viewAs, isSup, isOwner, applyTheme, startTheme } from './theme.js';
import { NET, refreshAge, ageAt, minWage, pensionAge, netOpts, electionDate, PAY, recompute, weekRegBefore, monthCalc, withLive } from './pay.js';
import { S, setState, save, hadLocal, jobById, place, index } from './state.js';
import { lawVacDays } from './leave.js';
import { $, $$, esc, nm, uid, pad, money, money2, hm, tm, dFull, dateKey } from './util.js';
import DEV_KEY from './dev-key.js';
import { setSpeech, startA11y, speechLang } from './a11y.js';
import FEATURES from './features.js';
import { openShiftSheet } from './views/shift-form.js';
import { tierLabel, countUp } from './views/common.js';
import { renderHome, renderRestCard, tickHome, planReminders, onPunch } from './views/home.js';
import { renderShifts } from './views/shifts.js';
import { renderSum } from './views/summary.js';
import { recapBanner, hrs } from './views/recap.js';
import { checkEarly } from './early.js';
import { renderRights } from './views/rights.js';

const VERSION = '1.0.0';
dbg.log('boot', 'v' + VERSION);

loadRules();
document.documentElement.lang = LANG; document.documentElement.dir = langInfo(LANG).dir;

function ageLine() {
  const a = ageAt(new Date());
  if (a == null) return 'לשכר מינימום לנוער, ביטוח לאומי ופנסיה לפי הגיל. נשמר רק בטלפון';
  if (a < 18) return `גיל ${a}: שכר מינימום לנוער ₪${minWage()} לשעה, ובלי ביטוח לאומי ובריאות מהשכר`;
  return `גיל ${a}`;
}
function pensionLine() {
  const a = ageAt(new Date()), from = pensionAge();
  if (a != null && a < from) return `חובה רק מגיל ${from}. עד אז לא יורד לך כסף לפנסיה`;
  return `חלק מהשכר נחסך לגיל פרישה, והמעסיק מוסיף יותר. חובה מגיל ${from}, בדרך כלל אחרי 6 חודשים בעבודה`;
}
startTheme(() => syncWidget());
onSave(() => planNotifications()); onSave(() => syncGeo()); onSave(() => syncWidget());
setSaveFailed(() => toast('לא הצלחתי לשמור בטלפון. כדאי לגבות', 'err', { label: 'גיבוי עכשיו', fn: () => backupNow() }));

/* ================= helpers ================= */
const COLORS = ['#E4572E', '#1E7A4A', '#4B5BD0', '#C98E00', '#1F8F84', '#A1458F', '#5E574C', '#2A6FB0'];


/* ================= HOME ================= */


/* ================= SHIFT SHEET ================= */

/* ================= SHIFTS ================= */

/* ================= SUMMARY (תלוש) ================= */

/* ================= sick days and vacation ================= */

/* ================= monthly report (PDF) ================= */

const SUPPORT_MAIN = [['support_10', 10], ['support_20', 20], ['support_50', 50]];
const SUPPORT_MORE = [['support_5', 5], ['support_15', 15], ['support_30', 30], ['support_75', 75], ['support_100', 100], ['support_200', 200]];
export async function openSupport() {
  const all = [...SUPPORT_MAIN, ...SUPPORT_MORE];
  let prices = new Map(), chosen = 'support_20', owned = new Set();
  const price = (id, n) => prices.get(id) || `₪${n}`;
  const amountOf = id => all.find(x => x[0] === id);
  const draw = root => {
    $('#sp-main', root).innerHTML = SUPPORT_MAIN.map(([id, n], i) => `<button type="button" class="sp-amt${chosen === id ? ' on' : ''}${owned.has(id) ? ' given' : ''}" data-id="${id}"${(prices.size && !prices.has(id)) || owned.has(id) ? ' disabled' : ''}>
      <b class="num">${price(id, n)}</b><small>${owned.has(id) ? 'נתת, תודה!' : ['קפה', 'ארוחה קלה', 'תמיכה גדולה'][i]}</small></button>`).join('');
    $('#sp-more', root).innerHTML = SUPPORT_MORE.filter(([id]) => !prices.size || prices.has(id)).map(([id, n]) => `<button type="button" class="num${chosen === id ? ' on' : ''}" data-id="${id}"${owned.has(id) ? ' disabled aria-label="נתת, תודה!"' : ''}>${owned.has(id) ? '✓ ' : ''}${price(id, n)}</button>`).join('');
    const [cid, cn] = amountOf(chosen);
    $('#sp-pay', root).innerHTML = `${I.heart}תמיכה ב־${price(cid, cn)}`;
    $('#sp-pay', root).disabled = owned.has(chosen);
    // choosing an amount only selects it; the button below pays
    $$('[data-id]', root).forEach(b => b.onclick = () => { chosen = b.dataset.id; buzz(8); draw(root); });
  };
  const pay = async id => {
    $$('[data-id], #sp-pay', sheet).forEach(b => b.disabled = true);
    try {
      const r = await native.billing.buy(id);
      if (r?.ok) {
        if (!S.settings.supported) S.settings.supportedAt = new Date().toISOString();
        S.settings.supported = true; S.settings.supportCount = (S.settings.supportCount || 0) + 1; persist(); applyTheme();
        closeSheet(); buzz(40); toast('תודה רבה! זה עוזר להמשיך לפתח את אצבע', 'ok'); if (view === 'set') renderSet();
      } else if (r?.why === 'pending') toast('התשלום ממתין לאישור. תודה!', 'ok');
      else if (!r?.cancelled) toast('התשלום לא עבר. אפשר לנסות שוב', 'err');
    } catch (e) { report(e); toast('לא הצלחתי לפתוח את Google Play', 'err'); }
    finally { $$('[data-id], #sp-pay', sheet).forEach(b => b.disabled = false); }
  };
  openSheet(`<div class="sp-ic">${I.heart}</div><h2 style="text-align:center">תמיכה באצבע</h2>
    <p class="shsub" style="text-align:center">אצבע חינמית, בלי פרסומות, והנתונים שלך נשארים בטלפון. אם היא עוזרת לך, אפשר לתמוך בפיתוח בתשלום חד־פעמי.</p>
    <div class="note info" style="margin-top:12px">${I.heart}<span>בתודה: 12 ערכות צבע מיוחדות (גם עם מעברי צבע), אייקונים אחרים לאפליקציה וטבעת צבעונית סביב החוגה. רק המראה משתנה: כל החישובים והזכויות זמינים לכולם.</span></div>
    <div class="sp-main" id="sp-main"></div>
    <details class="sp-other"${SUPPORT_MORE.some(x => x[0] === chosen) ? ' open' : ''}><summary>סכום אחר</summary><div class="qchips" id="sp-more"></div></details>
    <div class="btnrow"><button class="btn primary sp-pay" id="sp-pay"></button></div>
    <p class="hint" style="text-align:center">התשלום דרך Google Play. כל סכום אפשר לתת פעם אחת, והוא נשמר בחשבון Google: בהתקנה מחדש או בטלפון חדש עם אותו חשבון, ההטבות חוזרות.</p>
    ${isSup() ? '' : '<button class="btn ghost" id="sp-restore" type="button" style="width:100%">כבר תמכתי: שחזור</button>'}`, root => {
    draw(root);
    $('#sp-restore', root) && ($('#sp-restore', root).onclick = async () => {
      const r = await native.billing.owned();
      if (r.supported) { S.settings.supported = true; persist(); applyTheme(); render(); closeSheet(); toast('התמיכה שלך שוחזרה. תודה!', 'ok'); }
      else toast('לא נמצא תשלום בחשבון Google שבטלפון. אם תמכת מחשבון אחר, צריך להיכנס אליו ב־Play.');
    });
    $('#sp-pay', root).onclick = () => pay(chosen);
    native.billing.owned().then(r => {
      owned = new Set(r.owned || []);
      if (owned.has(chosen)) chosen = (all.find(([id]) => !owned.has(id)) || [chosen])[0];
      if (r.supported && !S.settings.supported) { S.settings.supported = true; persist(); applyTheme(); }
      draw(root);
    });
    native.billing.products(all.map(x => x[0])).then(list => {
      if (!list.length) return;
      prices = new Map(list.map(p => [p.id, p.price])); draw(root);
    }).catch(e => dbg.log('warn', 'billing: ' + (e?.message || e)));
  });
}


/* ================= STATS ================= */

/* ================= RIGHTS ================= */


const devOK = () => FEATURES.devTools || !!S.settings.owner;
async function devUnlock(sig) {
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
const THEMES = [['auto', 'אוטומטי', 'linear-gradient(90deg,#F1EEE6 50%,#141518 50%)'], ['light', 'בהיר', '#F1EEE6'], ['dark', 'כהה', '#141518'], ['blurple', 'בלרפל', 'linear-gradient(90deg,#1E1F22 60%,#5865F2 60%)']];
const THEMES_SUPPORT = [['gold', 'זהב', 'linear-gradient(135deg,#15130E 50%,#E2B65A 50%)'], ['night', 'לילה', 'linear-gradient(135deg,#0C1322 50%,#8DB8FF 50%)'], ['sunset', 'שקיעה', 'linear-gradient(135deg,#F7EEE8 50%,#D2486A 50%)'], ['forest', 'יער', 'linear-gradient(135deg,#0F1712 50%,#7FD6A0 50%)'],
  ['ocean', 'ים', 'linear-gradient(135deg,#0B1A1E 50%,#5FD3D0 50%)'], ['plum', 'שזיף', 'linear-gradient(135deg,#171021 50%,#C49BFF 50%)'],
  ['ember', 'גחלים', 'linear-gradient(135deg,#1A100C 50%,#FF8A4C 50%)'], ['sand', 'חול', 'linear-gradient(135deg,#F2EDDF 50%,#6E7F2E 50%)'],
];
const THEMES_GRAD = [['aurora', 'זוהר', 'linear-gradient(135deg,#8B5CF6,#22D3EE)'], ['dawn', 'שחר', 'linear-gradient(135deg,#FFB199,#F0708A,#9B7BF0)'],
  ['neon', 'ניאון', 'linear-gradient(135deg,#FF2EC4,#4D7CFF)'], ['rosegold', 'רוז גולד', 'linear-gradient(135deg,#B76E79,#E8C3A8)']];
// only on the developer's own phone
const THEME_DEV = ['dev', 'מפתח', 'linear-gradient(135deg,#07090B 50%,#39D98A 50%)'];
const ICONS = [['default', 'רגיל', 'app-default.png'], ['gold', 'זהב', 'app-gold.png'], ['night', 'לילה', 'app-night.png'], ['paper', 'נייר', 'app-paper.png'], ['forest', 'יער', 'app-forest.png'],
  ['sunset', 'שקיעה', 'app-sunset.png'], ['ocean', 'ים', 'app-ocean.png'], ['plum', 'שזיף', 'app-plum.png'], ['ember', 'גחלים', 'app-ember.png'], ['sand', 'חול', 'app-sand.png']];
const themeBtn = ([k, n, bg]) => { const locked = [...THEMES_SUPPORT, ...THEMES_GRAD].some(t => t[0] === k) && !isSup();
  return `<button data-t="${k}" class="${(S.settings.theme || 'auto') === k ? 'on' : ''}${locked ? ' locked' : ''}"><i style="background:${bg}"></i>${n}${locked ? `<span class="lk">${I.lock}</span>` : ''}</button>`; };
export const secIc = (i, t) => `<i class="sec-ic t-${t}">${I[i]}</i>`;
function renderSet() {
  const el = $('#v-set'), st = S.settings;
  const sw = (id, on) => `<span class="switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><i></i></span>`;
  el.innerHTML = `<h1 class="title">הגדרות</h1>
    <div class="sec"><span>${secIc('briefcase', 'blue')}מקומות עבודה</span></div>
    <div class="card">${S.jobs.map(j => `<button class="cell" data-job="${j.id}"><span class="cell-ic" style="color:${j.color}">${I.briefcase}</span>
      <span class="grow">${nm(j.name)}<div class="sub num">₪${j.rate} לשעה · שבוע של ${j.weekDays} ימים${j.restMode === 'fixed' ? ' · שבת לפי חוזה' : ''}</div></span><span class="chev">${I.chevL}</span></button>`).join('')}
      <button class="cell" id="addJob"><span class="cell-ic">${I.plus}</span><span class="grow" style="color:var(--accent);font-weight:600">הוספת מקום עבודה</span></button></div>

    <div class="sec"><span>${secIc('noon', 'gold')}מראה</span></div>
    <div class="card pad"><div class="themes" id="s-theme">${THEMES.map(themeBtn).join('')}</div>
      ${native.billing.available() || isSup() ? `<div class="themes-h">${I.heart}${isSup() ? 'בתודה על התמיכה' : 'לתומכים באצבע'}</div><div class="themes" id="s-theme2">${THEMES_SUPPORT.map(themeBtn).join('')}</div>
        <div class="themes-h">מעברי צבע</div><div class="themes" id="s-theme3">${THEMES_GRAD.map(themeBtn).join('')}</div>` : ''}
      ${isOwner() ? `<div class="themes-h dev">${I.gear}מצב מפתח</div><div class="themes" id="s-theme4">${themeBtn(THEME_DEV)}</div>` : ''}</div>
    ${isSup() && (native.billing.available() || native.PLATFORM === 'android') ? `<div class="card" style="margin-top:12px"><details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.gear}</span><span class="grow">ווידג׳ט ואייקון<div class="sub">סגנון הווידג׳ט ואייקון האפליקציה</div></span><span class="chev">${I.chevDown}</span></summary><div class="pad">${isSup() && native.PLATFORM === 'android' ? `<div class="themes-h">סגנון הווידג׳ט</div><div class="seg" id="s-wstyle">${[['classic', 'רגיל'], ['glass', 'שקוף'], ['bold', 'גדול'], ['accent', 'צבעוני']].map(([k, n]) => `<button data-w="${k}" class="${(st.widgetStyle || 'classic') === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}${isSup() && (native.billing.available() || native.PLATFORM === 'android') ? `<div class="themes-h">אייקון האפליקציה</div><div class="icons" id="s-icon">${ICONS.map(([k, n, f]) => `<button data-ic="${k}" class="${(st.icon || 'default') === k ? 'on' : ''}"><img src="icons/${f}" alt="">${n}</button>`).join('')}</div>` : ''}</div></details></div>` : ''}

    <div class="sec"><span>${secIc('coins', 'green')}שכר ונטו</span></div>
    <div class="card">
      <label class="cell"><span class="cell-ic t-blue">${I.cal}</span><span class="grow">תאריך לידה<div class="sub">${ageLine()}</div></span><input class="input num" type="date" id="s-birth" style="width:150px;height:44px" value="${esc(st.birth || '')}" max="${dateKey(new Date())}"></label>
      <label class="cell"><span class="cell-ic t-green">${I.coins}</span><span class="grow">הצגת נטו משוער<div class="sub">${NET() ? 'נטו הוא מה שנכנס לחשבון, אחרי מס, ביטוח לאומי ופנסיה' : 'כבוי: מוצג רק ברוטו. השכר עצמו לא משתנה'}</div></span>${sw('s-net', NET())}</label>
      ${NET() ? `<details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.receipt}</span><span class="grow">נקודות זיכוי ופנסיה<div class="sub"><span class="num">${netOpts(new Date().getFullYear(), new Date().getMonth()).points}</span> נק׳ זיכוי${st.pension ? ' · פנסיה' : ''}${st.hish ? ' · השתלמות' : ''}</div></span><span class="chev">${I.chevDown}</span></summary><div class="pad"><p class="hint" style="margin-top:0">כל נקודת זיכוי מורידה ₪${taxFor().pointValue} ממס ההכנסה בכל חודש. עם ${+st.sex} נקודות לא משלמים מס הכנסה עד בערך ₪${Math.round(+st.sex * taxFor().pointValue / taxFor().brackets[0][1] / 50) * 50} בחודש.</p><div class="seg" id="s-sex"><button data-v="2.25">גבר · 2.25 נק׳</button><button data-v="2.75">אישה · 2.75 נק׳</button></div>
      <label class="field"><span>נקודות זיכוי נוספות</span><input class="input num" type="number" step="0.25" inputmode="decimal" id="s-extraPts" value="${st.extraPts}">
        <p class="hint">למשל: ילדים, תואר אקדמי, חייל/ת משוחרר/ת, צעירים עד גיל 23. אפשר לבדוק בטופס 101.</p></label></div><label class="cell"><span class="cell-ic t-green">${I.coins}</span><span class="grow">פנסיה<div class="sub">${pensionLine()}</div></span>${sw('s-pension', st.pension)}</label>
      <div class="cell ${st.pension ? '' : 'hidden'}" id="penRow"><span class="grow">עובד / מעסיק / פיצויים %</span>
        <input class="input num" style="width:64px;height:44px;text-align:center;padding:0 4px" type="number" step="0.5" id="s-pEmp" value="${st.pEmp}">
        <input class="input num" style="width:64px;height:44px;text-align:center;padding:0 4px" type="number" step="0.5" id="s-pEr" value="${st.pEr}">
        <select class="input num" style="width:76px;height:44px" id="s-sev"><option${+st.sev === 8.33 ? ' selected' : ''}>8.33</option><option${+st.sev === 6 ? ' selected' : ''}>6</option></select></div>
      <p class="hint pad ${st.pension ? '' : 'hidden'}" id="penHint" style="margin:0">עובד: יורד מהשכר שלך. מעסיק: מה שהמעסיק מוסיף לחיסכון שלך, מעבר לשכר. פיצויים: עוד כסף מהמעסיק שנשמר לך, למשל אם יפטרו אותך.</p>
      <label class="cell"><span class="cell-ic t-teal">${I.book}</span><span class="grow">קרן השתלמות<div class="sub">חיסכון שאפשר למשוך אחרי 6 שנים בלי מס. רק אם זה כתוב בחוזה</div></span>${sw('s-hish', st.hish)}</label></details>` : ''}
    </div>

    <div class="sec"><span>${secIc('shabbat', 'gold')}כללי</span></div>
    <div class="card">
      <label class="cell"><span class="cell-ic t-orange">${I.pin}</span><span class="grow">עיר</span>
        <select class="val" id="s-city" style="border:0;background:none;text-align:end;font-weight:600">${Object.keys(CITIES).map(c => `<option value="${c}"${c === st.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.clockEdit}</span><span class="grow">כניסת ויציאת שבת<div class="sub num">${st.candleMin} דק׳ לפני השקיעה · ${st.havdalahMin} דק׳ אחריה</div></span><span class="chev">${I.chevDown}</span></summary>
            <label class="cell"><span class="cell-ic t-gold">${I.shabbat}</span><span class="grow">הדלקת נרות<div class="sub">דקות לפני השקיעה</div></span>
        <input class="input num" style="width:76px;height:44px;text-align:center" type="number" id="s-candleMin" value="${st.candleMin}"></label>
      <label class="cell"><span class="cell-ic t-indigo">${I.night}</span><span class="grow">צאת שבת<div class="sub">דקות אחרי השקיעה</div></span>
        <input class="input num" style="width:76px;height:44px;text-align:center" type="number" id="s-havdalahMin" value="${st.havdalahMin}"></label>
      </details>
      <details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.book}</span><span class="grow">שפה וקריאה בקול<div class="sub">${LANGS.find(l => l.code === LANG)?.name || LANG} · <span>${speechLang() === 'en' ? 'TalkBack באנגלית' : 'TalkBack בעברית'}</span></div></span><span class="chev">${I.chevDown}</span></summary><div class="pad"><div class="field"><span>שפה</span><div class="seg" id="s-lang">${LANGS.map(l => `<button data-l="${l.code}" class="${l.code === LANG ? 'on' : ''}" data-keep>${l.name}</button>`).join('')}</div></div>
      <div class="field"><span>קריאה בקול (TalkBack)</span><div class="seg" id="s-speech"><button data-s="en" class="${speechLang() === 'en' ? 'on' : ''}" data-keep>English</button><button data-s="he" class="${speechLang() === 'he' ? 'on' : ''}" data-keep>עברית</button></div>
        <p class="hint">השפה שבה קורא המסך מקריא כפתורים והודעות. בסמסונג הקול לרוב לא תומך בעברית, ולכן ברירת המחדל היא אנגלית.</p></div></div></details>
      ${native.NATIVE ? `<label class="cell"><span class="cell-ic t-orange">${I.bell}</span><span class="grow">התראות במשמרת<div class="sub">כשמתחילות שעות נוספות, בכניסת שבת וחג, ואם שכחת לצאת</div></span><span class="switch"><input type="checkbox" id="s-notif"${notifOn() ? ' checked' : ''}><i></i></span></label><div id="s-nstat"></div>` : ''}
    </div>

    <div class="sec"><span>${secIc('download', 'blue')}נתונים וגיבוי</span></div>
    ${backupDue() ? `<div class="note" style="margin-bottom:10px">${I.warn}<span>${S.settings.lastBackup ? `הגיבוי האחרון לפני ${Math.floor((Date.now() - new Date(S.settings.lastBackup)) / 864e5)} ימים.` : 'עוד לא גיבית.'} יש ${S.shifts.length} משמרות שקיימות רק בטלפון הזה.</span></div>` : ''}
    <div class="card">
      <button class="cell" id="s-backup"><span class="cell-ic t-blue">${I.download}</span><span class="grow">גיבוי מלא עכשיו<div class="sub">${S.settings.lastBackup ? 'גיבוי אחרון: ' + dFull(S.settings.lastBackup) : 'עוד לא גיבית'}</div></span><span class="chev">${I.chevL}</span></button>
      <details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.file}</span><span class="grow">שחזור, ייבוא וייצוא<div class="sub">מטלפון אחר, מאקסל, או ל־CSV</div></span><span class="chev">${I.chevDown}</span></summary><button class="cell" id="s-import"><span class="cell-ic t-blue">${I.file}</span><span class="grow">שחזור או העברה מטלפון אחר<div class="sub">מציג מה בקובץ לפני שמשנים משהו</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-fimport"><span class="cell-ic t-teal">${I.list}</span><span class="grow">ייבוא משמרות מקובץ<div class="sub">Excel או CSV, גם מאפליקציות אחרות</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-export"><span class="cell-ic t-green">${I.receipt}</span><span class="grow">ייצוא ל־CSV<div class="sub">לאקסל או לגוגל שיטס</div></span><span class="chev">${I.chevL}</span></button><div class="pad"><div class="note info" id="storeNote">${storeNote()}</div></div></details>
    </div>
    <div class="card" style="margin-top:12px">
    ${devOK() ? `<button class="cell" id="s-debug"><span class="cell-ic t-violet">${I.info}</span><span class="grow">אבחון ותקלות<div class="sub">${dbg.lastCrash() ? 'האפליקציה נסגרה בפעם הקודמת · פרטים כאן' : 'מידע טכני לשליחה כשמשהו לא עובד'}</div></span><span class="chev">${I.chevL}</span></button>` : ''}
    ${devOK() && S.settings.dev ? `<button class="cell" id="s-dev"><span class="cell-ic t-gray">${I.gear}</span><span class="grow">כלי פיתוח<div class="sub">בדיקת התראות, משמרות לדוגמה ועוד</div></span><span class="chev">${I.chevL}</span></button>` : ''}
    ${native.billing.available() || isOwner() ? `<button class="cell" id="s-support"><span class="cell-ic t-red">${I.heart}</span><span class="grow">${isOwner() ? 'מפתח' : isSup() ? 'תומך/ת באצבע' : 'תמיכה באצבע'}<div class="sub">${isOwner() ? 'כל האפשרויות פתוחות במכשיר הזה' : isSup() ? `מאז ${dFull(S.settings.supportedAt || S.updatedAt)} · תודה! אפשר לתמוך שוב מתי שרוצים` : 'האפליקציה חינמית ובלי פרסומות. תומכים מקבלים ערכות צבע ואייקונים'}</div></span><span class="chev">${I.chevL}</span></button>` : ''}
    <button class="cell" id="s-legal"><span class="cell-ic t-gray">${I.lock}</span><span class="grow">פרטיות ומשפטי<div class="sub">מה נשמר, ומה החישוב כן ולא</div></span><span class="chev">${I.chevL}</span></button>
    </div>
    <p class="fine" id="s-ver"><b>אצבע</b> · גרסה ${VERSION}${isSup() ? ' <span style="color:#D9534F">♥</span>' : ''}<br>An Edvin Studios Project</p>`;
  $$('[data-job]', el).forEach(b => b.onclick = () => openJobSheet(jobById(b.dataset.job), false));
  $('#addJob', el).onclick = () => { const j = defaultJob('עבודה ' + (S.jobs.length + 1)); j.color = COLORS[S.jobs.length % COLORS.length]; openJobSheet(j, true); };
  const set = (k, v) => { S.settings[k] = v; commit(); };
  $('#s-city', el).onchange = e => { S.settings.candleMin = CITIES[e.target.value][2]; set('city', e.target.value); };
  for (const k of ['candleMin', 'havdalahMin', 'extraPts', 'pEmp', 'pEr', 'sev']) $('#s-' + k, el) && ($('#s-' + k, el).onchange = e => set(k, +e.target.value || 0));
  for (const k of ['pension', 'hish']) $('#s-' + k, el) && ($('#s-' + k, el).onchange = e => set(k, e.target.checked));
  $('#s-net', el).onchange = e => { set('net', e.target.checked); renderSet(); };
  $('#s-birth', el).onchange = e => { const v = e.target.value; S.settings.birth = /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= dateKey(new Date()) ? v : ''; refreshAge(); commit(); };
  $$('#s-sex button', el).forEach(b => { b.classList.toggle('on', +b.dataset.v === +st.sex); b.onclick = () => set('sex', +b.dataset.v); });
  $$('#s-theme button, #s-theme2 button, #s-theme3 button, #s-theme4 button', el).forEach(b => b.onclick = () => {
    if ([...THEMES_SUPPORT, ...THEMES_GRAD].some(t => t[0] === b.dataset.t) && !isSup()) return openSupport();
    S.settings.theme = b.dataset.t; applyTheme(); commit();
  });
  $$('#s-wstyle button', el).forEach(b => b.onclick = () => { S.settings.widgetStyle = b.dataset.w; persist(); renderSet(); toast('הווידג׳ט יתעדכן בעוד רגע', 'ok'); });
  $$('#s-icon button', el).forEach(b => b.onclick = async () => {
    try { await native.billing.setIcon(b.dataset.ic); S.settings.icon = b.dataset.ic; persist(); renderSet(); toast('האייקון יתחלף בעוד רגע במסך הבית', 'ok'); }
    catch (e) { report(e); toast('לא הצלחתי להחליף את האייקון', 'err'); }
  });
  $$('#s-speech button', el).forEach(b => b.onclick = () => {
    S.settings.speech = b.dataset.s; persist(); setSpeech(b.dataset.s); buzz(8);
    $$('#s-speech button', el).forEach(x => x.classList.toggle('on', x === b));
    announce(b.dataset.s === 'en' ? 'Screen reader: English' : 'קורא המסך: עברית');
  });
  $$('#s-lang button', el).forEach(b => b.onclick = () => {
    if (b.dataset.l === LANG) return;
    try { localStorage.setItem('etzba.langBoot', b.dataset.l); } catch {}
    setLang(b.dataset.l).then(() => setTimeout(() => { try { localStorage.removeItem('etzba.langBoot'); } catch {} }, 4000));
  });
  $('#s-export', el).onclick = openExport;
  $('#s-import', el).onclick = openImport;
  $('#s-debug', el) && ($('#s-debug', el).onclick = openDebug);
  $('#s-dev', el) && ($('#s-dev', el).onclick = openDevTools);
  { let taps = 0, t; $('#s-ver', el).onclick = () => { clearTimeout(t); t = setTimeout(() => taps = 0, 1500);
      if (++taps < 7) return; taps = 0;
      if (devOK() && !S.settings.dev) { S.settings.dev = true; persist(); buzz(30); toast('מצב מפתח פעיל', 'ok'); renderSet(); } }; }
  $('#s-notif', el) && ($('#s-notif', el).onchange = e => {
    const on = e.target.checked; S.settings.notif = { rates: on, rest: on, long: on };
    persist(); if (on) planNotifications(true); drawNotifStatus();
  });
  drawNotifStatus();
  $('#s-backup', el).onclick = () => backupNow();
  $('#s-legal', el).onclick = openLegal;
  $('#s-support', el) && ($('#s-support', el).onclick = openSupport);
  $('#s-fimport', el).onclick = openFileImport;
  persistState().then(v => { const pl = $('#persistLine', el); if (pl && v !== null) pl.textContent = v ? 'הדפדפן אישר אחסון קבוע, כך שלא ימחק את הנתונים כשחסר מקום.' : 'הדפדפן עוד לא אישר אחסון קבוע, ועלול למחוק נתונים כשחסר מקום בטלפון.'; });
}

/* ================= RETROACTIVE OR NOT ================= */
const rulesDiffer = (rules, job) => JSON.stringify({ ...rules, rate: 0 }) !== JSON.stringify({ ...Object.fromEntries(Object.keys(rules).map(k => [k, job[k]])), rate: 0 });
function openApplyFrom(old, nj) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1), yearStart = new Date(today.getFullYear(), 0, 1);
  const mine = S.shifts.filter(s => s.jobId === old.id);
  const first = new Date(Math.min(...mine.map(s => +new Date(s.start))));
  const effect = from => {
    const tmp = applyRulesFrom(old, nj, from ? from.toISOString() : null);
    const after = computeAll(mine, () => tmp, place());
    let n = 0, before = 0, aft = 0;
    for (const s of mine) { const x = PAY.get(s.id)?.pay || 0, y2 = after.get(s.id)?.pay || 0; before += x; aft += y2; if (Math.abs(x - y2) > 0.005) n++; }
    return { n, diff: aft - before };
  };
  const opts = [
    ['today', 'מהיום והלאה', `${dFull(today)}. משמרות קודמות נשארות כמו שהן`, today],
    ['month', `מתחילת ${MONTHS[monthStart.getMonth()]}`, dFull(monthStart), monthStart],
    ['year', `מתחילת ${yearStart.getFullYear()}`, dFull(yearStart), yearStart],
    ['all', 'על כל המשמרות, גם אחורה', `${mine.length} משמרות, החל מ־${dFull(first)}`, null],
  ];
  const line = e => e.n ? `${e.n} משמרות יחושבו מחדש · ${e.diff >= 0 ? '+' : '−'}${money(Math.abs(e.diff))}` : 'אף משמרת קיימת לא משתנה';
  const ys = [...new Set(mine.map(s => new Date(s.start).getFullYear()))].concat(today.getFullYear()).sort();
  openSheet(`<h2>ממתי זה חל?</h2><p class="shsub">שינית כללי שכר ב"${esc(nj.name)}". משמרות שלפני התאריך שתבחרו ימשיכו להיות מחושבות לפי הכללים הישנים.</p>
    <div class="card" style="margin-top:14px">${opts.map(([k, t, sub, d]) => { const e = effect(d); return `<button class="cell" data-from="${k}"><span class="grow">${t}<div class="sub num">${sub}</div><div class="sub num" style="color:${e.n ? 'var(--accent-ink)' : 'var(--ink3)'}">${line(e)}</div></span><span class="chev">${I.chevL}</span></button>`; }).join('')}
      <div class="cell" style="flex-wrap:wrap"><span class="grow">מתאריך אחר<div class="sub" id="af-eff"></div></span>
        <span class="datepick"><select class="input num" id="af-d">${Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select><select class="input num" id="af-m">${MONTHS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select><select class="input num" id="af-y">${ys.map(y => `<option>${y}</option>`).join('')}</select></span>
        <button class="btn soft" id="af-go" style="height:44px;margin-top:8px">החלה מהתאריך הזה</button></div></div>
    <div class="btnrow"><button class="btn soft" id="af-back">חזרה לעריכה</button></div>`, root => {
    const pick = () => new Date(+$('#af-y', root).value, +$('#af-m', root).value, +$('#af-d', root).value);
    $('#af-d', root).value = monthStart.getDate(); $('#af-m', root).value = monthStart.getMonth(); $('#af-y', root).value = monthStart.getFullYear();
    const upd = () => { $('#af-eff', root).textContent = line(effect(pick())); };
    $$('#af-d,#af-m,#af-y', root).forEach(x => x.onchange = upd); upd();
    const save = (from, label) => {
      const out = applyRulesFrom(old, nj, from ? from.toISOString() : null);
      S.jobs[S.jobs.findIndex(x => x.id === old.id)] = out;
      closeSheet(); commit(); toast(label, 'ok');
    };
    $$('[data-from]', root).forEach(b => b.onclick = () => { const o = opts.find(x => x[0] === b.dataset.from); save(o[3], o[3] ? `נשמר. חל מ־${dFull(o[3])}` : 'נשמר. חל על כל המשמרות'); });
    $('#af-go', root).onclick = () => save(pick(), `נשמר. חל מ־${dFull(pick())}`);
    $('#af-back', root).onclick = () => openJobSheet(nj, false);
  });
}

function openFileImport(f0) {
  let parsed = null, sheetIx = 0, year = null, jobId = S.settings.lastJob, newJobName = null, fileName = '';
  openSheet(`<h2>ייבוא משמרות מקובץ</h2><p class="shsub">Excel (xls, xlsx) או CSV, גם מאפליקציות משמרות אחרות. קודם רואים מה ייכנס, ורק אז מייבאים.</p>
    <label class="btn soft" style="margin-top:14px">${I.file}בחירת קובץ<input type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" id="fi-file" hidden></label>
    <div id="fi-prev"></div>`, root => {
    const draw = () => {
      const el = $('#fi-prev', root);
      if (!parsed) return;
      const sheets = parsed.filter(s => s.res && !s.res.error && s.res.shifts.length);
      if (!sheets.length) { el.innerHTML = `<div class="note">${I.warn}<span>${esc(parsed.find(s => s.res?.error)?.res.error || 'לא מצאתי משמרות בקובץ.')} צריך עמודות של תאריך, כניסה ויציאה.</span></div>`; return; }
      const sh = sheets[Math.min(sheetIx, sheets.length - 1)];
      const res = rowsToShifts(sh.rows, { year: year ?? sh.year });
      const job = jobId === '__new' ? null : jobById(jobId);
      const jid = job ? job.id : '__new';
      const rates = res.shifts.map(s => s.rate).filter(x => x != null), common = k => { const c = {}; for (const s of res.shifts) if (s[k] != null) c[s[k]] = (c[s[k]] || 0) + 1; const e = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; return e ? +e[0] : null; };
      const draftJob = job || Object.assign(defaultJob(newJobName || 'מיובא'), { rate: common('rate') ?? 40, travel: common('travel') ?? 0 });
      // build the shifts exactly as they would be saved
      const sig = s => `${jid}|${+new Date(s.start)}|${+new Date(s.end)}`, have = new Set(S.shifts.map(s => `${s.jobId}|${+new Date(s.start)}|${+new Date(s.end)}`));
      const fresh = [], dup = [];
      for (const s of res.shifts) {
        const out = { id: uid(), jobId: draftJob.id, start: s.start, end: s.end, breakMin: s.breakMin, bonus: s.bonus, note: s.note, rest: 'auto', src: 'import' };
        if (s.tips) out.tips = s.tips;
        if (s.rate != null && s.rate !== jobAt(draftJob, s.start).rate) out.rate = s.rate;
        if (s.travel != null && s.travel !== jobAt(draftJob, s.start).travel) out.travel = s.travel;
        (have.has(sig(s)) ? dup : fresh).push(out);
      }
      const odd = fresh.filter(s => s.rate != null).length;
      const pays = computeAll(fresh, () => draftJob, place());
      const gross = fresh.reduce((x, s) => x + pays.get(s.id).pay, 0), hours = fresh.reduce((x, s) => x + pays.get(s.id).hours, 0);
      const allHours = res.shifts.reduce((x, s) => x + ((new Date(s.end) - new Date(s.start)) / 6e4 - s.breakMin) / 60, 0);
      const ts = res.shifts.map(s => +new Date(s.start));
      const fileH = res.summary.hours, hoursOk = fileH != null && Math.abs(fileH - allHours) < 1 / 60;
      const yearsSel = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];
      const L = (l, v, sub = '', cls = '') => `<div class="ln ${cls}"><span class="l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num">${v}</span></div>`;
      el.innerHTML = `
        ${sheets.length > 1 ? `<div class="chips">${sheets.map((s, i) => `<button class="chip${i === sheetIx ? ' on' : ''}" data-sh="${i}"><bdi data-keep>${esc(s.name)}</bdi></button>`).join('')}</div>` : ''}
        <div class="card" style="margin-top:14px">
          ${L('קובץ', `<bdi data-keep>${esc(fileName)}</bdi>`, sheets.length === 1 && sh.name ? `גיליון: <bdi data-keep>${esc(sh.name)}</bdi>` : '')}
          ${L('משמרות בקובץ', res.shifts.length, ts.length ? `${dFull(Math.min(...ts))} – ${dFull(Math.max(...ts))}` : '')}
          ${L('שעות', hm(allHours) + ' ש׳', fileH != null ? (hoursOk ? '✓ תואם לסיכום שבקובץ' : `הסיכום בקובץ: ${hm(fileH)}. כדאי לבדוק`) : '', fileH != null && !hoursOk ? 'neg' : '')}
          ${res.skippedEmpty ? L('ימים בלי שעות', res.skippedEmpty, `לא יובאו${res.summary.sick ? ` (בקובץ: ${res.summary.sick} ימי מחלה)` : ''}`) : ''}
          ${res.skippedBad.length ? L('שורות שלא הבנתי', res.skippedBad.length, 'שורות ' + res.skippedBad.slice(0, 6).map(x => x.row).join(', '), 'neg') : ''}
          ${dup.length ? L('כבר קיימות', dup.length, 'אותן שעות באותה עבודה. ידלגו') : ''}
          ${odd ? L('תעריף אחר', odd, 'תעריף מהקובץ נשמר לכל משמרת כזו') : ''}
        </div>
        ${res.needsYear ? `<label class="field"><span>שנה</span><div class="seg" id="fi-year">${yearsSel.map(y => `<button type="button" data-y="${y}" class="${y === (year ?? res.year) ? 'on' : ''}">${y}</button>`).join('')}</div><p class="hint">בקובץ אין שנה ליד התאריכים${sh.year ? `. לקחתי ${sh.year} משם הקובץ או הגיליון` : ''}.</p></label>` : ''}
        <div class="field"><span>לאיזה מקום עבודה</span><div class="chips" id="fi-job" style="padding-top:0">${S.jobs.map(j => `<button type="button" class="chip${j.id === jid ? ' on' : ''}" data-j="${j.id}"><span class="dot" style="background:${j.color}"></span>${nm(j.name)}</button>`).join('')}<button type="button" class="chip${jid === '__new' ? ' on' : ''}" data-j="__new">${I.plus}חדש</button></div>
          ${jid === '__new' ? `<input class="input" id="fi-newname" value="${esc(newJobName || 'מיובא')}" style="margin-top:8px"><p class="hint">ייווצר עם ₪${draftJob.rate} לשעה ונסיעות ₪${draftJob.travel}, לפי מה שהכי נפוץ בקובץ.</p>` : ''}</div>
        <div class="card" style="margin-top:12px">
          ${L('אצבע תחשב', money(gross), `ברוטו ל־${fresh.length} משמרות · ${hm(hours)} ש׳, לפי הגדרות "${esc(draftJob.name)}"`)}
          ${res.summary.gross != null ? L('הקובץ חישב', money(res.summary.gross), 'ההפרש בא בדרך כלל משעות נוספות, שבת, חג ולילה, שכל אפליקציה מחשבת אחרת. אפשר לשנות את הכללים בהגדרות העבודה') : ''}
        </div>
        <div class="btnrow"><button class="btn primary" id="fi-go"${fresh.length ? '' : ' disabled'}>${I.check}ייבוא ${fresh.length} משמרות</button></div>`;
      $$('[data-sh]', el).forEach(b => b.onclick = () => { sheetIx = +b.dataset.sh; year = null; draw(); });
      $$('#fi-year button', el).forEach(b => b.onclick = () => { year = +b.dataset.y; draw(); });
      $$('#fi-job .chip', el).forEach(b => b.onclick = () => { jobId = b.dataset.j; draw(); });
      $('#fi-newname', el) && ($('#fi-newname', el).onchange = e => { newJobName = e.target.value.trim() || 'מיובא'; draw(); });
      $('#fi-go', el).onclick = () => {
        if (!job) { S.jobs.push(draftJob); S.settings.lastJob = draftJob.id; }
        const batch = 'imp-' + Date.now();
        for (const s of fresh) { s.batch = batch; S.shifts.push(s); }
        const last = new Date(Math.max(...fresh.map(s => +new Date(s.start))));
        showMonth(last.getFullYear(), last.getMonth());
        closeSheet(); commit(); go('shifts');
        announce(`יובאו ${fresh.length} משמרות`);
        toast(`יובאו ${fresh.length} משמרות`, 'ok', { label: 'ביטול', fn: () => {
          S.shifts = S.shifts.filter(s => s.batch !== batch);
          if (!job && !S.shifts.some(s => s.jobId === draftJob.id)) { S.jobs = S.jobs.filter(j => j.id !== draftJob.id); S.settings.lastJob = S.jobs[0].id; }
          commit(); toast('הייבוא בוטל'); announce('הייבוא בוטל');
        } });
      };
    };
    const take = async f => {
      dbg.log('info', 'import file ' + f.name);
      fileName = f.name; $('#fi-prev', root).innerHTML = `<p class="hint" style="margin-top:12px">קורא את הקובץ…</p>`;
      try {
        const sheets = await readSheets(await f.arrayBuffer(), f.name);
        parsed = sheets.map(s => ({ ...s, year: guessYear(s.name, f.name), res: rowsToShifts(s.rows, { year: guessYear(s.name, f.name) ?? new Date().getFullYear() }) }));
        sheetIx = 0; year = null;
      } catch (err) { parsed = [{ res: { error: 'לא הצלחתי לקרוא את הקובץ.' } }]; dbg.log('error', 'read file: ' + (err?.message || err)); }
      draw();
    };
    $('#fi-file', root).onchange = e => { const f = e.target.files[0]; if (f) take(f); };
    if (f0) take(f0);
  });
}

async function takeSharedFile() {
  try {
    if (!/[?&]shared=1/.test(location.search) || !('caches' in window)) return;
    history.replaceState(null, '', location.pathname);
    const c = await caches.open('etzba-share'), r = await c.match('shared-file');
    if (!r) { toast('הקובץ ששותף לא הגיע. אפשר לנסות שוב'); dbg.log('warn', 'share: no file'); return; }
    const name = decodeURIComponent(r.headers.get('x-name') || 'shared.xls'), buf = await r.arrayBuffer();
    await c.delete('shared-file');
    dbg.log('info', `share: ${name} ${buf.byteLength}B`);
    $('#onboard')?.remove();
    go('set');
    openFileImport({ name, arrayBuffer: async () => buf });
  } catch (e) { report(e); }
}

/* ================= JOB SHEET ================= */
export function openJobSheet(job, isNew) {
  const j = structuredClone(job);
  const days = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  const K = (k, label, step = 0.1) => `<label class="field"><span>${label}</span><input class="input num" type="number" step="${step}" inputmode="decimal" data-k="${k}" value="${j[k]}"></label>`;
  const R = (k, label) => `<label class="field"><span>${label}</span><div class="pct"><input class="input num" type="number" inputmode="numeric" data-r="${k}" value="${j.r[k]}"><i>%</i></div></label>`;
  const SW = (k, on) => `<span class="switch"><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}><i></i></span>`;
  const rule = (id, kc, ic, title, sub, k, body) => `<div class="rule" id="rule-${id}"><label class="rule-h"><span class="kic k-${kc}">${I[ic]}</span><span class="grow"><b>${title}</b><div class="sub">${sub}</div></span>${SW(k, j[k] !== false)}</label><div class="rule-b">${body}</div></div>`;
  openSheet(`
    <h2>${isNew ? 'מקום עבודה חדש' : 'הגדרות עבודה'}</h2>
    <p class="shsub">כל מקום עבודה שונה. מדליקים רק את התוספות שבאמת משלמים לך, ומשנים את האחוזים לפי החוזה.</p>
    <label class="field"><span>שם</span><input class="input" type="text" data-k="name" value="${esc(j.name)}"></label>
    <div class="field"><span>צבע</span><div class="swatches" id="j-col">${COLORS.map((c, i) => `<button type="button" data-c="${c}" style="background:${c}" aria-label="צבע ${i + 1}"></button>`).join('')}</div></div>
    <label class="field"><span class="ih">${secIc('coins', 'green')}שכר לשעה (₪)</span><input class="input num" type="number" step="0.01" inputmode="decimal" data-k="rate" value="${j.rate}"><p class="hint" id="j-minw"></p></label>

    <h3 class="ih">${secIc('coffee', 'gray')}הפסקה קבועה</h3>
    <div class="qchips" id="j-brk">${[0, 15, 30, 45, 60].map(b => `<button type="button" data-b="${b}">${b ? b + ' דק׳' : 'בלי'}</button>`).join('')}</div>
    <p class="hint">תיכנס אוטומטית לכל משמרת, ואפשר לשנות בכל משמרת.</p>

    <h3 class="ih">${secIc('pin', 'blue')}נסיעות</h3>
    <div class="grid2">
      <label class="field"><span>החזר נסיעות (₪)</span><input class="input num" type="number" step="0.5" inputmode="decimal" data-k="travel" value="${j.travel}"></label>
      <label class="field"><span>תקרה לחודש (₪)</span><input class="input num" type="number" step="1" inputmode="decimal" data-k="travelMonthCap" value="${+j.travelMonthCap || ''}" placeholder="בלי"></label>
    </div>
    <div class="seg" id="j-tmode" style="margin-top:10px"><button type="button" data-t="day">פעם ביום עבודה</button><button type="button" data-t="shift">על כל משמרת</button></div>
    <p class="hint" id="j-thint"></p>

    <div class="rule" id="rule-tips"><label class="rule-h"><span class="kic" style="--kc:var(--c-tips)">${I.coins}</span><span class="grow"><b>טיפים</b><div class="sub">שדה טיפים בכל משמרת</div></span>${SW('tipsOn', j.tipsOn)}</label>
      <div class="rule-b" id="tips-body">
        <div class="seg" id="j-tips"><button type="button" data-m="own">הטיפים שלי</button><button type="button" data-m="wage">דרך המעסיק</button></div>
        <p class="hint" id="j-tipshint"></p>
      </div></div>

    <details class="adv-sec"><summary><span class="ih">${secIc('ot', 'orange')}תוספות שכר</span><small>שעות נוספות, שבת, חגים ויום הבחירות. ברירת המחדל לפי החוק</small>${I.chevDown}</summary>
    ${rule('ot', 'noon', 'ot', 'שעות נוספות ביום חול', 'תוספת אחרי יום עבודה מלא', 'otOn', `
      <div class="seg" id="j-week"><button type="button" data-w="5">שבוע של 5 ימים</button><button type="button" data-w="6">שבוע של 6 ימים</button></div>
      <div class="grid2">${K('regHours', 'אחרי (שעות ביום)')}${R('ot1', 'תוספת ראשונה')}</div>
      <div class="grid2">${K('ot1Hours', 'למשך (שעות)', 0.5)}${R('ot2', 'ואחר כך')}</div>
      <p class="hint" id="j-othint"></p>
      <label class="cell flat"><span class="grow">גם לפי שבוע<div class="sub">מעבר למכסה השבועית נחשב שעות נוספות</div></span>${SW('weeklyRule', j.weeklyRule)}</label>
      <div id="j-weekly">${K('weeklyLimit', 'מכסה שבועית (שעות)', 0.5)}<p class="hint">שעות רגילות בשבוע לפני שעות נוספות. לפי החוק 42.</p></div>
      <details class="adv"><summary>${I.chevDown}יום מקוצר ולילה</summary>
        ${K('shortHours', 'שעות ביום המקוצר')}
        <label class="field"><span>היום המקוצר</span><select class="input" data-k="shortDay">${days}</select></label>
        <label class="cell flat"><span class="grow">משמרת לילה<div class="sub">שעתיים או יותר בין 22:00 ל־06:00 מקצרות את היום</div></span>${SW('nightRule', j.nightRule)}</label>
        ${K('nightRegHours', 'שעות רגילות במשמרת לילה')}
      </details>`)}
    ${rule('shab', 'shabbat', 'shabbat', 'שבת', 'תוספת על שעות בתוך השבת', 'shabbatOn', `
      <div class="grid3">${R('rest', 'שעה בשבת')}<span class="otx">${R('restOt1', 'נוספות א׳')}</span><span class="otx">${R('restOt2', 'נוספות ב׳')}</span></div>
      <div class="seg" id="j-rest" style="margin-top:14px"><button type="button" data-m="city">לפי זמני השבת בעיר</button><button type="button" data-m="fixed">שעות קבועות בחוזה</button></div>
      <div class="grid2" id="j-fixed">
        <label class="field"><span>מתחיל</span><select class="input" data-k="fsDay">${days}</select><input class="input num" style="margin-top:6px" type="time" data-k="fsTime" value="${j.fixedStart.time}"></label>
        <label class="field"><span>נגמר</span><select class="input" data-k="feDay">${days}</select><input class="input num" style="margin-top:6px" type="time" data-k="feTime" value="${j.fixedEnd.time}"></label>
      </div>`)}
    ${rule('chag', 'chag', 'chag', 'חגים', 'תוספת על שעות בתוך החג', 'chag', `
      <div class="grid3">${R('chag', 'שעה בחג')}<span class="otx">${R('chagOt1', 'נוספות א׳')}</span><span class="otx">${R('chagOt2', 'נוספות ב׳')}</span></div>`)}
    ${rule('elect', 'chag', 'check', 'יום הבחירות', electionDate() ? `עבודה ביום הבחירות לכנסת (${electionDate()})` : 'עבודה ביום הבחירות לכנסת', 'election', `
      <div class="grid3">${R('elect', 'שעה ביום בחירות')}<span class="otx">${R('electOt1', 'נוספות א׳')}</span><span class="otx">${R('electOt2', 'נוספות ב׳')}</span></div>
      <p class="hint">הנוהג המקובל: 200%, ובשעות נוספות 250% ו־300%. יש מקומות שמשלמים במקום זה שכר רגיל ויום חופש אחר.</p>`)}
    <div class="rule"><label class="rule-h"><span class="kic k-chag">${I.receipt}</span><span class="grow"><b>דמי חגים</b><div class="sub">תשלום על חג שלא עבדת בו (אחרי 3 חודשים)</div></span>${SW('holidayPay', j.holidayPay)}</label>
      <div class="rule-b" id="hp-body">${K('holidayPayHours', 'שעות לתשלום על יום חג', 0.5)}</div></div>
    ${R('reg', 'אחוז שעה רגילה')}
    </details>
    <details class="adv-sec"><summary><span class="ih">${secIc('vac', 'teal')}ימי מחלה, חופשה והבראה</span><small>ותק, ימי חופשה ואיך משלמים עליהם</small>${I.chevDown}</summary>
    <div class="grid2">
      <label class="field"><span>התחלתי לעבוד ב־</span><input class="input num" type="date" data-k="startDate" value="${esc(j.startDate || '')}"></label>
      <label class="field"><span>ימי חופשה בשנה</span><input class="input num" type="number" step="1" inputmode="numeric" data-k="vacDays" value="${+j.vacDays || ''}" placeholder="${lawVacDays(j)}"></label>
    </div>
    <p class="hint">ריק: מהמשמרת הראשונה, וימי החופשה לפי החוק לשנים הראשונות. ימי מחלה נצברים לבד: 1.5 לחודש מלא, ופחות בחודש חלקי.</p>${(ageAt(new Date()) ?? 99) < 18 ? `<p class="hint">עד גיל 18 מגיעים יותר ימי חופשה: 18 ימים בשנה כולל סופי שבוע, כלומר ${lawVacDays(j)} ימי עבודה.</p>` : ''}
    <div class="field"><span>תשלום על יום חופשה או מחלה</span>
      <div class="seg" id="j-leave"><button type="button" data-m="hours">שעות × תעריף</button><button type="button" data-m="avg">ממוצע 3 חודשים</button></div></div>
    <div id="j-lhours">${K('leaveHours', 'שעות ליום', 0.5)}</div>
    <p class="hint" id="j-lhint"></p>
    <div class="field"><span>דמי הבראה</span>
      <div class="seg" id="j-hav"><button type="button" data-m="year">פעם בשנה</button><button type="button" data-m="month">כל חודש בתלוש</button></div></div>
    <p class="hint">אחרי שנה בעבודה: 5 ימים בשנה ויותר עם הוותק, לפי היקף המשרה. בבחירה של כל חודש, חלק מהם נכנס לשכר של כל חודש.</p>
    </details>
    ${native.geo.available() ? `<h3 class="ih">${secIc('pin', 'orange')}מיקום העבודה</h3>
    <div class="card pad" id="j-place"></div>
    <p class="hint">כשמגיעים לעבודה (אחרי כ־3 דקות במקום) תגיע התראה שמציעה להתחיל משמרת, וכשיוצאים באמצע משמרת, הצעה לסיים אותה. הטלפון עצמו עוקב אחרי האזור, כך שזה כמעט לא צורך סוללה.</p>` : ''}
    <div class="btnrow">
      <button class="btn primary" id="j-save">${I.check}שמירה</button>
      ${(job.versions || []).length ? `<div class="card" style="margin-top:6px"><div class="ln"><span class="l" style="font-weight:700;color:var(--ink)">כללים קודמים</span><span class="v"></span></div>${[...job.versions].sort((x, y) => +new Date(x.until) - +new Date(y.until)).map((v, i, arr) => `<div class="ln"><span class="l num">${i ? dFull(arr[i - 1].until) + ' – ' : 'עד '}${dFull(new Date(+new Date(v.until) - 1))}</span><span class="v num">₪${v.rules.rate} לשעה${rulesDiffer(v.rules, job) ? ' · כללים אחרים' : ''}</span></div>`).join('')}<div class="ln"><span class="l num">מ־${dFull(job.versions.reduce((mx, v) => +new Date(v.until) > mx ? +new Date(v.until) : mx, 0))}</span><span class="v num">₪${job.rate} לשעה (עכשיו)</span></div></div>` : ''}
      ${!isNew && S.jobs.length > 1 ? `<button class="btn danger" id="j-del">${I.trash}מחיקת מקום העבודה</button>` : ''}
    </div>`, root => {
    const v = k => $(`[data-k=${k}]`, root);
    v('fsDay').value = j.fixedStart.day; v('feDay').value = j.fixedEnd.day; v('shortDay').value = j.shortDay;
    const ui = () => {
      $$('#j-col button', root).forEach(b => b.classList.toggle('on', b.dataset.c === j.color));
      $$('#j-week button', root).forEach(b => b.classList.toggle('on', +b.dataset.w === +j.weekDays));
      $$('#j-rest button', root).forEach(b => b.classList.toggle('on', b.dataset.m === j.restMode));
      $$('#j-brk button', root).forEach(b => b.classList.toggle('on', +b.dataset.b === +j.breakMin));
      $$('#j-tmode button', root).forEach(b => b.classList.toggle('on', b.dataset.t === (j.travelMode || 'day')));
      $$('#j-tips button', root).forEach(b => b.classList.toggle('on', b.dataset.m === (j.tipsMode || 'own')));
      $$('#j-leave button', root).forEach(b => b.classList.toggle('on', b.dataset.m === (j.leaveMode || 'hours')));
      $$('#j-hav button', root).forEach(b => b.classList.toggle('on', b.dataset.m === (j.havraaMode || 'year')));
      $('#j-lhours', root).classList.toggle('hidden', j.leaveMode === 'avg');
      $('#j-lhint', root).textContent = j.leaveMode === 'avg'
        ? 'השכר בשלושת החודשים שלפני החופשה, חלקי ימי העבודה בהם. כך החוק מחשב לעובדים לפי שעה עם שעות משתנות.'
        : `כל יום שווה ${hm(+v('leaveHours').value || 0)} שעות × ₪${+v('rate').value || 0} = ${money2((+v('leaveHours').value || 0) * (+v('rate').value || 0))}. מתאים כשיום העבודה קבוע; אם השעות משתנות, החוק מחשב לפי ממוצע שלושה חודשים.`;
      $('#rule-tips', root).classList.toggle('off', !v('tipsOn').checked);
      $('#tips-body', root).classList.toggle('hidden', !v('tipsOn').checked);
      $('#j-tipshint', root).textContent = j.tipsMode === 'wage'
        ? 'הטיפים נכנסים לקופה ונחשבים לשכר. אם במשמרת הם פחות מהשכר לשעות, המעסיק משלים את ההפרש.'
        : 'הטיפים שלך במזומן או מהלקוחות, מעבר לשכר לשעה. הם לא חלק מהברוטו.';
      const tr0 = +v('travel').value || 0, maxD = rules().travelMaxDaily;
      // one sentence per span, so each is translated on its own
      $('#j-thint', root).innerHTML = `<span>${j.travelMode === 'shift' ? 'נסיעות על כל משמרת, גם כשיש שתיים באותו יום.' : 'לפי החוק נסיעות משולמות פעם אחת על כל יום עבודה.'}</span>`
        + (maxD && tr0 > maxD ? ` <span>לפי צו ההרחבה ההחזר עד ₪${maxD} ליום.</span>` : '') + ' <span>התקרה לחודש: מחיר חופשי חודשי, אם זול יותר.</span>';
      $('#j-fixed', root).classList.toggle('hidden', j.restMode !== 'fixed');
      const ot = v('otOn').checked;
      $('#rule-ot', root).classList.toggle('off', !ot);
      $('#rule-shab', root).classList.toggle('off', !v('shabbatOn').checked);
      $('#rule-chag', root).classList.toggle('off', !v('chag').checked);
      $('#rule-elect', root).classList.toggle('off', !v('election').checked);
      $('#j-weekly', root).classList.toggle('hidden', !v('weeklyRule').checked);
      $('#hp-body', root).classList.toggle('hidden', !v('holidayPay').checked);
      $$('.otx', root).forEach(e => e.classList.toggle('dim', !ot));
      const r = +v('rate').value, mw = $('#j-minw', root);
      mw.innerHTML = r < minWage() ? `<span>נמוך משכר המינימום (₪${minWage()})</span> ${!S.settings.birth ? '<span>מתחת לגיל 18? אפשר להזין תאריך לידה בהגדרות, ואז השכר והניכויים יחושבו לפי הגיל.</span>' : ''}` : ''; mw.className = 'hint' + (r < minWage() ? ' bad' : '');
      const g = k => +$(`[data-r=${k}]`, root).value;
      $('#j-othint', root).textContent = `כלומר: עד ${hm(+v('regHours').value)} ש׳ ביום ${g('reg')}%, אחר כך ${v('ot1Hours').value} שעות ב־${g('ot1')}%, ומשם ${g('ot2')}%.`;
    };
    $$('#j-col button', root).forEach(b => b.onclick = () => { j.color = b.dataset.c; ui(); });
    $$('#j-rest button', root).forEach(b => b.onclick = () => { j.restMode = b.dataset.m; ui(); });
    $$('#j-brk button', root).forEach(b => b.onclick = () => { j.breakMin = +b.dataset.b; ui(); });
    $$('#j-tmode button', root).forEach(b => b.onclick = () => { j.travelMode = b.dataset.t; ui(); });
    $$('#j-tips button', root).forEach(b => b.onclick = () => { j.tipsMode = b.dataset.m; ui(); });
    $$('#j-leave button', root).forEach(b => b.onclick = () => { j.leaveMode = b.dataset.m; ui(); });
    $$('#j-hav button', root).forEach(b => b.onclick = () => { j.havraaMode = b.dataset.m; ui(); });
    $$('#j-week button', root).forEach(b => b.onclick = () => {
      j.weekDays = +b.dataset.w; const five = j.weekDays === 5;
      v('regHours').value = five ? 8.6 : 8; v('shortHours').value = five ? 7.6 : 7; v('shortDay').value = five ? 4 : 5; ui();
    });
    $$('input,select', root).forEach(i => i.addEventListener('input', ui));
    ui();
    if ($('#j-place', root)) drawPlace(root, j);
    $('#j-save', root).onclick = () => {
      j.name = v('name').value.trim() || 'עבודה';
      for (const k of ['rate', 'travel', 'travelMonthCap', 'vacDays', 'leaveHours', 'regHours', 'shortHours', 'shortDay', 'ot1Hours', 'weeklyLimit', 'nightRegHours', 'holidayPayHours']) j[k] = Math.max(0, +v(k).value || 0);
      for (const k of ['otOn', 'shabbatOn', 'chag', 'election', 'holidayPay', 'weeklyRule', 'nightRule', 'tipsOn']) j[k] = v(k).checked;
      j.startDate = /^\d{4}-\d{2}-\d{2}$/.test(v('startDate').value) ? v('startDate').value : '';
      j.rateOk = true;
      j.fixedStart = { day: +v('fsDay').value, time: v('fsTime').value || '16:00' };
      j.fixedEnd = { day: +v('feDay').value, time: v('feTime').value || '04:00' };
      $$('[data-r]', root).forEach(i => j.r[i.dataset.r] = +i.value || 0);
      const old = S.jobs.find(x => x.id === j.id);
      if (old && rulesChanged(old, j) && S.shifts.some(s => s.jobId === j.id)) return openApplyFrom(old, j);
      const i = S.jobs.findIndex(x => x.id === j.id);
      if (i >= 0) S.jobs[i] = j; else S.jobs.push(j);
      if (isNew) S.settings.lastJob = j.id;
      closeSheet(); commit(); toast('נשמר');
    };
    $('#j-del', root) && ($('#j-del', root).onclick = () => confirmBtn($('#j-del', root), 'ללחוץ שוב (המשמרות יעברו לעבודה אחרת)', () => {
      S.jobs = S.jobs.filter(x => x.id !== j.id);
      S.shifts.forEach(s => { if (s.jobId === j.id) s.jobId = S.jobs[0].id; });
      if (S.active?.jobId === j.id) S.active.jobId = S.jobs[0].id;
      if (S.settings.lastJob === j.id) S.settings.lastJob = S.jobs[0].id;
      closeSheet(); commit(); toast('נמחק');
    }));
  });
}

/* ================= CSV / EXPORT ================= */
function toCSV(rows) {
  const cell = c => { c = c == null ? '' : String(c); if (/^[=+\-@\t\r]/.test(c) && isNaN(+c)) c = "'" + c; return /[",\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
const n2 = x => (Math.round(x * 100) / 100).toFixed(2);
/* translations: skip-start (CSV file contents are Hebrew by design) */
const CSV_TIER = { reg: 'שעות רגילות', ot1: 'שעות נוספות א׳', ot2: 'שעות נוספות ב׳', rest: 'שעות שבת', restOt1: 'שבת נוספות א׳', restOt2: 'שבת נוספות ב׳', chag: 'שעות חג', chagOt1: 'חג נוספות א׳', chagOt2: 'חג נוספות ב׳' , elect: 'שעות יום בחירות', electOt1: 'יום בחירות נוספות א׳', electOt2: 'יום בחירות נוספות ב׳', special: 'שעות בתעריף מיוחד' };
function shiftsCSV(list) {
  const head = ['תאריך', 'יום', 'מקום עבודה', 'סוג משמרת', 'כניסה', 'יציאה', 'תאריך יציאה', 'הפסקה (דקות)', 'שעות לתשלום',
    ...TIERS.map(k => CSV_TIER[k]), 'מתוכן נוספות שבועיות', 'שבת/חג (שם)', 'תעריף לשעה', 'שכר על שעות', 'נסיעות', 'בונוס', 'טיפים', 'סה״כ ברוטו', 'הערה'];
  const rows = [head], T = new Array(head.length).fill(0), n = TIERS.length;
/* translations: skip-end */
  const sumCols = [8, ...TIERS.map((_, i) => 9 + i), 9 + n, 12 + n, 13 + n, 14 + n, 15 + n, 16 + n];
  for (const s of [...list].sort((a, b) => new Date(a.start) - new Date(b.start))) {
    const p = PAY.get(s.id), job = jobById(s.jobId), d = new Date(s.start);
    const r = [dFull(s.start), DAYS[d.getDay()], job.name, KIND_NAME[shiftKind(s, p)], tm(s.start), tm(s.end), dFull(s.end), +s.breakMin || 0, n2(p.hours),
      ...TIERS.map(k => n2(p.b[k])), n2(p.weeklyOT), p.names.join(' / '), n2(p.rate), n2(p.base), n2(p.travel), n2(p.bonus), n2(p.tips), n2(p.pay), s.note || ''];
    sumCols.forEach(i => T[i] += +r[i]);
    rows.push(r);
  }
  const tot = new Array(head.length).fill(''); tot[0] = 'סה״כ'; sumCols.forEach(i => tot[i] = n2(T[i]));
  rows.push(tot);
  return toCSV(rows);
}
export function summaryCSV() {
  const keys = [...index().month.keys()].sort((a, b) => a - b);
  const rows = [['חודש', 'משמרות', 'שעות', 'ברוטו', 'מס הכנסה', 'ביטוח לאומי', 'ביטוח בריאות', 'פנסיה (עובד)', 'קרן השתלמות (עובד)', 'נטו משוער', 'פנסיה (מעסיק)', 'פיצויים', 'עלות מעסיק']];
  for (const k of keys) {
    const y = Math.floor(k / 12), m = k % 12, M = monthCalc(y, m), n = M.net;
    rows.push([`${pad(m + 1)}/${y}`, M.shifts.length, n2(M.hours), n2(M.gross), n2(n.tax), n2(n.ni), n2(n.health), n2(n.pEmp), n2(n.hEmp), n2(n.net), n2(n.employer.pension), n2(n.employer.severance), n2(n.cost)]);
  }
  return toCSV(rows);
}
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
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('הועתק ללוח'); return true; } catch { toast('לא הצלחתי להעתיק'); return false; }
}
export function exportShifts(scope, how = 'file') {
  const list = scope === 'month' ? monthCalc(viewY, viewM).shifts : S.shifts;
  if (!list.length) return toast('אין משמרות לייצא');
  const csv = shiftsCSV(list), name = scope === 'month' ? `אצבע-משמרות-${viewY}-${pad(viewM + 1)}.csv` : `אצבע-כל-המשמרות.csv`;
  how === 'copy' ? copyText(csv.slice(1)) : deliver(name, csv, 'text/csv;charset=utf-8');
}
export function openExport() {
  let how = 'file';
  openSheet(`<h2>ייצוא</h2><p class="shsub">קובצי CSV נפתחים באקסל ובגוגל שיטס, עם עברית תקינה וטור לכל סוג שעות.</p>
    <div class="seg" id="x-how" style="margin-top:14px"><button data-h="file" class="on">שיתוף / הורדה</button><button data-h="copy">העתקה</button></div>
    <div class="card" style="margin-top:12px">
      <button class="cell" data-x="month"><span class="cell-ic t-blue">${I.file}</span><span class="grow">משמרות ${MONTHS[viewM]} ${viewY}<div class="sub">כל משמרת בשורה, עם שורת סיכום</div></span></button>
      <button class="cell" data-x="all"><span class="cell-ic t-teal">${I.list}</span><span class="grow">כל המשמרות<div class="sub">${S.shifts.length} משמרות</div></span></button>
      <button class="cell" data-x="sum"><span class="cell-ic t-green">${I.receipt}</span><span class="grow">סיכום לפי חודשים<div class="sub">ברוטו, ניכויים ונטו לכל חודש</div></span></button>
      <button class="cell" data-x="backup"><span class="cell-ic t-blue">${I.download}</span><span class="grow">גיבוי מלא (JSON)<div class="sub">להעברה לטלפון אחר</div></span></button>
    </div>`, root => {
    $$('#x-how button', root).forEach(b => b.onclick = () => { how = b.dataset.h; $$('#x-how button', root).forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-x]', root).forEach(b => b.onclick = () => {
      const x = b.dataset.x;
      if (x === 'month' || x === 'all') return exportShifts(x, how);
      if (x === 'sum') { if (!S.shifts.length) return toast('אין נתונים'); const c = summaryCSV(); return how === 'copy' ? copyText(c.slice(1)) : deliver('אצבע-סיכום-חודשי.csv', c, 'text/csv;charset=utf-8'); }
      backupNow(how);
    });
  });
}
async function backupNow(how = 'file') {
  const j = JSON.stringify({ app: 'etzba', version: VERSION, exported: new Date().toISOString(), ...S }, null, 1);
  const ok = how === 'copy' ? await copyText(j) : await deliver(`אצבע-גיבוי-${dFull(new Date()).replace(/\//g, '-')}.json`, j, 'application/json');
  if (ok) { S.settings.lastBackup = new Date().toISOString(); persist(); if (view === 'set') renderSet(); updateBackupDot(); }
}
function backupDue() {
  if (S.shifts.length < 10) return false;
  const last = S.settings.lastBackup ? new Date(S.settings.lastBackup) : null;
  return !last || Date.now() - last > 30 * 864e5;
}
function updateBackupDot() { $('#tabs [data-v=set]')?.classList.toggle('dot', backupDue()); }
export async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}
async function persistState() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}
function summarize(d) {
  const ts = d.shifts.map(s => +new Date(s.start)).filter(x => !isNaN(x)).sort((x, y) => x - y);
  return { shifts: d.shifts.length, jobs: d.jobs.length, from: ts[0], to: ts[ts.length - 1], exported: d.exported };
}
function storeNote() {
  return native.NATIVE
    ? `${I.info}<span>הנתונים נשמרים <b>רק בטלפון הזה</b>, בלי חשבון ובלי שרת. מחיקת האפליקציה מוחקת אותם, אז כדאי לגבות מדי פעם. כדי לעבור לטלפון חדש: גיבוי מלא כאן, ואז ״שחזור״ בטלפון החדש.</span>`
    : `${I.info}<span>הנתונים נשמרים <b>רק בדפדפן הזה</b>, בלי חשבון ובלי שרת. ניקוי נתוני האתר מוחק אותם. כדי לעבור למכשיר אחר: גיבוי מלא כאן, ואז ״שחזור״ במכשיר החדש. <span id="persistLine"></span></span>`;
}

function openImport() {
  openSheet(`<h2>שחזור מגיבוי</h2><p class="shsub">בוחרים קובץ גיבוי של אצבע. לפני שמשהו משתנה, תראו מה יש בקובץ.</p>
    <label class="btn soft" style="margin-top:14px">${I.file}בחירת קובץ<input type="file" accept=".json,application/json" id="imp-file" hidden></label>
    <details class="adv"><summary>${I.chevDown}או הדבקת טקסט הגיבוי</summary><textarea class="input" rows="4" id="imp-text" placeholder="{ ... }" style="margin-top:8px"></textarea>
      <div class="btnrow"><button class="btn soft" id="imp-read">בדיקת הטקסט</button></div></details>
    <div id="imp-prev"></div>`, root => {
    const show = txt => {
      let d;
      try { d = JSON.parse(txt); if (!Array.isArray(d.jobs) || !Array.isArray(d.shifts)) throw 0; }
      catch { $('#imp-prev', root).innerHTML = `<div class="note">${I.warn}<span>הקובץ לא נראה כמו גיבוי של אצבע. שום דבר לא השתנה.</span></div>`; return; }
      const f = summarize(d), cur = S.shifts.length, ids = new Set(S.shifts.map(s => s.id));
      const sig = s => `${s.jobId}|${+new Date(s.start)}|${+new Date(s.end)}`, sigs = new Set(S.shifts.map(sig));
      const isDup = s => ids.has(s.id) || sigs.has(sig(s));
      const freshList = d.shifts.filter(s => s.start && s.end && !isDup(s)), fresh = freshList.length, dups = d.shifts.length - fresh;
      $('#imp-prev', root).innerHTML = `<div class="card" style="margin-top:14px">
        <div class="ln"><span class="l">בקובץ</span><span class="v num">${f.shifts} משמרות · ${f.jobs} מקומות עבודה</span></div>
        ${f.from ? `<div class="ln"><span class="l">טווח</span><span class="v num">${dFull(f.from)} – ${dFull(f.to)}</span></div>` : ''}
        ${f.exported ? `<div class="ln"><span class="l">נוצר</span><span class="v num">${dFull(f.exported)}</span></div>` : ''}
        <div class="ln"><span class="l">בטלפון עכשיו</span><span class="v num">${cur} משמרות</span></div></div>
        <div class="btnrow">
          <button class="btn primary" id="imp-merge"${fresh ? '' : ' disabled'}>${I.check}הוספה למה שיש (${fresh} חדשות)</button>
          <button class="btn danger" id="imp-replace">החלפת כל הנתונים בקובץ</button>
          <p class="hint" style="text-align:center">${dups ? `${dups} משמרות כבר קיימות בטלפון ויידלגו. ` : ''}הוספה לא מוחקת ולא משנה כלום. החלפה מוחקת את ${cur} המשמרות שבטלפון.</p></div>`;
      $('#imp-merge', root).onclick = () => {
        const jobIds = new Set(S.jobs.map(j => j.id));
        S.jobs.push(...d.jobs.filter(j => !jobIds.has(j.id)).map(normalizeJob));
        S.shifts.push(...freshList);
        setState(S);
        closeSheet(); commit(); toast(`נוספו ${fresh} משמרות`, 'ok');
      };
      $('#imp-replace', root).onclick = () => confirmBtn($('#imp-replace', root), `ללחוץ שוב: ${cur} משמרות יימחקו`, () => {
        setState(d); applyTheme(); closeSheet(); commit(); toast(`שוחזרו ${S.shifts.length} משמרות`, 'ok');
      });
    };
    $('#imp-file', root).onchange = async e => { const f = e.target.files[0]; if (f) show(await f.text()); };
    $('#imp-read', root).onclick = () => show($('#imp-text', root).value);
  });
}

export const notifOn = () => { const n = S.settings.notif || {}; return n.rates !== false || n.rest !== false || n.long !== false; };
function buildNotifications(a, N = { rates: true, rest: true, long: true, ...(S.settings.notif || {}) }) {
  const job = jobAt(jobById(a.jobId), a.start), start = +new Date(a.start), items = [], wb = weekRegBefore(job, a.start);
  const special = k => /^(rest|chag|elect)/.test(k);
  const perHour = k => money(job.rate * (job.r[k] ?? 100) / 100);
  const earned = at => money(shiftPay({ start: a.start, end: new Date(at), breakMin: 0 }, job, place(), wb).base);
  const changes = rateChanges(a.start, job, place(), wb, 14);
  changes.forEach((c, i) => {
    const pct = job.r[c.key] ?? 100;
    if (special(c.key) && !special(c.from)) {
      if (!N.rest) return;
      const until = changes.slice(i + 1).find(x => !special(x.key));
      const tail = until ? `, עד ${tm(until.at)}` : '';
      if (c.key.startsWith('rest')) items.push({ at: c.at, title: 'שבת שלום · התוספת התחילה', body: `מעכשיו ${pct}% (${perHour(c.key)} לשעה)${tail}.` });
      else if (c.key.startsWith('elect')) items.push({ at: c.at, title: 'יום הבחירות · התוספת התחילה', body: `מעכשיו ${pct}% (${perHour(c.key)} לשעה)${tail}.` });
      else items.push({ at: c.at, title: `חג שמח${c.names[0] ? ' · ' + c.names[0] : ''}`, body: `התוספת התחילה: ${pct}% (${perHour(c.key)} לשעה)${tail}.` });
    } else if (special(c.from) && !special(c.key)) {
      if (!N.rest) return;
      const title = c.from.startsWith('rest') ? 'שבוע טוב · השבת יצאה' : c.from.startsWith('elect') ? 'יום הבחירות נגמר' : 'החג יצא';
      items.push({ at: c.at, title, body: `חוזרים ל־${pct}% (${perHour(c.key)} לשעה). עד עכשיו: ${earned(c.at)}.` });
    } else if (N.rates && pct !== job.r[c.from]) {
      const hrs = hm((+c.at - start) / 3.6e6);
      if (c.weekly) items.push({ at: c.at, title: `עברת ${job.weeklyLimit} שעות השבוע`, body: `מעכשיו זה שעות נוספות: ${pct}% (${perHour(c.key)} לשעה). עד עכשיו: ${earned(c.at)}.` });
      else if (/ot1$/i.test(c.key)) items.push({ at: c.at, title: 'השעות הנוספות התחילו', body: `${hrs} שעות במשמרת. מעכשיו ${pct}% (${perHour(c.key)} לשעה). עד עכשיו: ${earned(c.at)}.` });
      else items.push({ at: c.at, title: `שעות נוספות · ${pct}%`, body: `${hrs} שעות במשמרת. מעכשיו ${perHour(c.key)} לשעה. עד עכשיו: ${earned(c.at)}.` });
    }
  });
  if (N.long) items.push({ at: new Date(start + 12 * 3.6e6), title: 'עדיין במשמרת?', body: 'המשמרת פתוחה כבר 12 שעות. אם כבר יצאת, אפשר לסיים אותה ולתקן את שעת היציאה.' });
  return items;
}
var planTimer = null;
let NOTIF = { state: 'unknown', next: null, exact: null };
const PRIVACY_URL = 'https://etzba.co.il/privacy', CONTACT = 'ilan@edvin.co.il';
function openLegal() {
  openSheet(`<h2>פרטיות ומשפטי</h2>
    <div class="card legal">
      <div class="cell flat">${I.lock}<span class="grow">הכל נשמר רק בטלפון שלך<div class="sub">משמרות, שכר והגדרות. אין חשבון, אין שרת, אין פרסומות ואין מעקב.</div></span></div>
      <div class="cell flat">${I.download}<span class="grow">גיבוי ומחיקה בידיים שלך<div class="sub">גיבוי וייצוא ב״נתונים וגיבוי״. מחיקת האפליקציה או ניקוי הנתונים שלה מוחקים הכל, אז כדאי לגבות לפני.</div></span></div>
      <div class="cell flat">${I.info}<span class="grow">מה נשלח לאינטרנט<div class="sub">רק בדיקה יומית של נתוני שכר מינימום ומס, בהורדה של קובץ ציבורי. שום מידע שלך.</div></span></div>
    </div>
    <div class="note" style="margin-top:12px">${I.warn}<span><b>החישובים הם הערכה.</b> לפי חוק שעות עבודה ומנוחה, הכללים המקובלים וההגדרות שהזנת. זה לא תלוש שכר רשמי ולא ייעוץ משפטי, מיסוי או פיננסי. הסכם קיבוצי או חוזה אישי יכולים לקבוע אחרת.</span></div>
    <div class="btnrow"><a class="btn soft" href="${PRIVACY_URL}" target="_blank" rel="noopener">${I.file}מדיניות הפרטיות המלאה</a><a class="btn soft" href="mailto:${CONTACT}">${I.receipt}יצירת קשר · ${CONTACT}</a></div>`);
}
async function drawNotifStatus() {
  const box = $('#s-nstat'); if (!box || !native.NATIVE) return;
  if (!notifOn()) { box.innerHTML = ''; return; }
  const st = await native.notifyStatus();
  // a line under the switch, lined up with its title
  const row = (icon, text, btn) => `<div class="nline${icon === I.check ? ' ok' : ''}">${icon}<span>${text}</span>${btn ? `<button class="btn soft mini" type="button" data-n="${btn[0]}">${btn[1]}</button>` : ''}</div>`;
  box.innerHTML = st.display === 'denied' ? row(I.bellOff, 'חסומות בהגדרות הטלפון, אז לא יגיעו.', ['open', 'לאפשר'])
    : st.display !== 'granted' ? row(I.bell, 'הטלפון יבקש אישור בפעם הבאה שנכנסים למשמרת.')
    : row(I.check, 'מאושרות. מגיעות גם כשהאפליקציה סגורה. כשהטלפון במנוחה או בחיסכון בסוללה הן יכולות לאחר בכמה דקות.');
}
export function notifLine() {
  if (!native.NATIVE || !S.active) return '';
  if (NOTIF.state === 'denied') return `<button class="nstat warn" type="button" data-n="open">${I.bellOff}ההתראות חסומות בטלפון · לפתוח הגדרות</button>`;
  if (NOTIF.state === 'error') return `<span class="nstat warn">${I.bellOff}לא הצלחתי לקבוע התראות</span>`;
  if (NOTIF.state === 'ok' && NOTIF.next) return `<span class="nstat">${I.bell}${'התראה הבאה בסביבות '}${tm(NOTIF.next.at)}</span>`;
  return '';
}
export function planNotifications(ask = false) {
  if (!native.NATIVE) return;
  clearTimeout(planTimer);
  planTimer = setTimeout(async () => {
    try {
      const a = S.active, N = { rates: true, rest: true, long: true, ...(S.settings.notif || {}) };
      const on = N.rates || N.rest || N.long, ahead = on ? planReminders() : [];
      if (!on || (!a && !ahead.length)) { NOTIF = { state: 'off', next: null, exact: null }; if (planNotifications.last !== '[]') await native.scheduleNotifications([]); planNotifications.last = '[]'; return; }
      if (!(await native.notifyAllowed(ask))) { NOTIF = { state: 'denied', next: null, exact: null }; dbg.log('warn', 'notifications: not allowed'); return; }
      const st = await native.notifyStatus();
      const items = [...(a ? buildNotifications(a, N) : []), ...ahead].filter(x => +x.at > Date.now() + 5000).sort((x, y) => x.at - y.at);
      const send = items.map(x => ({ ...x, title: tr(x.title), body: tr(x.body) })), sig = JSON.stringify(send.map(x => [+x.at, x.title, x.body]));
      const n = sig === planNotifications.last ? items.length : await native.scheduleNotifications(send);
      planNotifications.last = sig;
      NOTIF = { state: 'ok', next: items[0] || null, exact: st.exact, count: n };
      dbg.log('info', `notifications: ${n} scheduled`);
    } catch (e) {
      NOTIF = { state: 'error', next: null, exact: null };
      dbg.log('error', 'notifications: ' + (e?.message || e));
    } finally { if (view === 'home') renderHome(); if (view === 'set') drawNotifStatus(); }
  }, 400);
}

function drawPlace(root, j) {
  const el = $('#j-place', root), p = j.place;
  el.innerHTML = `
    ${p ? `<div class="ln flat"><span class="l">${I.pin}${esc(p.label || 'המיקום שנשמר')}</span><button class="btn soft" style="width:auto;height:40px;padding:0 14px" id="pl-del" type="button">הסרה</button></div>
      <label class="cell flat"><span class="grow">לשאול כשמגיעים ויוצאים</span><span class="switch"><input type="checkbox" id="pl-on"${p.on !== false ? ' checked' : ''}><i></i></span></label>
      <div class="field"><span>רדיוס</span><div class="seg" id="pl-r">${[150, 300, 500].map(r => `<button type="button" data-r="${r}" class="${(p.radius || 300) === r ? 'on' : ''}">${r} מ׳</button>`).join('')}</div></div>
      <div id="pl-perm"></div>`
    : `<button class="btn soft" type="button" id="pl-here">${I.pin}אני בעבודה עכשיו</button>
      <div class="field"><span>או כתובת</span><div style="display:flex;gap:8px"><input class="input" id="pl-addr" type="text" placeholder="למשל: יפו 97, ירושלים" autocomplete="street-address"><button class="btn soft" type="button" style="width:auto;padding:0 16px" id="pl-find">חיפוש</button></div></div>
      <div id="pl-res"></div>`}`;
  const set = place => { j.place = place; drawPlace(root, j); };
  if (p && p.on !== false) native.geo.status().then(st => {
    const box = $('#pl-perm', el); if (!box || st.background) return;
    box.innerHTML = `<div class="note" style="margin-top:12px">${I.info}<span>${st.location ? 'עוד אישור אחד: כדי לדעת שהגעת לעבודה גם כשאצבע סגורה, צריך לבחור במסך הבא <b>"לאפשר כל הזמן"</b>. אצבע לא שומרת ולא שולחת את המיקום לשום מקום.' : 'צריך אישור מיקום כדי שההתראות על הגעה יעבדו.'}</span></div>
      <button class="btn soft" type="button" id="pl-allow" style="margin-top:8px">${st.location ? 'לאפשר כל הזמן' : 'לאשר מיקום'}</button>`;
    $('#pl-allow', box).onclick = async () => {
      let r = await native.geo.status();
      if (!r.location) r = await native.geo.requestLocation();
      if (r.location && !r.background) r = await native.geo.requestBackground();
      if (!r.background) toast('בלי "כל הזמן" ההתראה תגיע רק כשהאפליקציה פתוחה', 'err');
      drawPlace(root, j); syncGeo(true);
    };
  });
  $('#pl-del', el) && ($('#pl-del', el).onclick = () => set(null));
  $('#pl-on', el) && ($('#pl-on', el).onchange = e => { j.place.on = e.target.checked; drawPlace(root, j); });
  $$('#pl-r button', el).forEach(b => b.onclick = () => { j.place.radius = +b.dataset.r; drawPlace(root, j); });
  $('#pl-here', el) && ($('#pl-here', el).onclick = async () => {
    let st = await native.geo.status();
    if (!st.location) st = await native.geo.requestLocation();
    if (!st.location) return toast('צריך אישור מיקום כדי לשמור את המקום', 'err');
    toast('מאתר מיקום…');
    try { const c = await native.geo.current(); set({ lat: c.lat, lng: c.lng, label: `המיקום שלך (±${Math.round(c.accuracy)} מ׳)`, radius: 300, on: true }); }
    catch { toast('לא הצלחתי לקבל מיקום. כדאי לנסות ליד חלון או בחוץ', 'err'); }
  });
  $('#pl-find', el) && ($('#pl-find', el).onclick = async () => {
    const q = $('#pl-addr', el).value.trim(); if (!q) return;
    $('#pl-res', el).innerHTML = '<p class="hint">מחפש…</p>';
    let res = []; try { res = await native.geo.geocode(q); } catch {}
    $('#pl-res', el).innerHTML = res.length ? `<div class="card" style="margin-top:8px">${res.map((r, i) => `<button class="cell" type="button" data-i="${i}"><span class="cell-ic t-orange">${I.pin}</span><span class="grow">${esc(r.label)}</span></button>`).join('')}</div>`
      : '<p class="hint bad">לא נמצאה כתובת כזו (חיפוש כתובת צריך אינטרנט). אפשר גם "אני בעבודה עכשיו".</p>';
    $$('#pl-res [data-i]', el).forEach(b => b.onclick = () => { const r = res[+b.dataset.i]; set({ lat: r.lat, lng: r.lng, label: r.label, radius: 300, on: true }); });
  });
}
var geoSent = '';
function syncGeo(force = false) {
  if (!native.geo.available()) return;
  const fences = S.jobs.filter(j => j.place && j.place.on !== false).map(j => ({ id: j.id, name: j.name, lat: j.place.lat, lng: j.place.lng, radius: j.place.radius || 300 }));
  const texts = { inTitle: tr('הגעת לעבודה?'), inBody: tr('{job} · להתחיל משמרת עכשיו?'), inAction: tr('להתחיל משמרת'),
    outTitle: tr('יצאת מהעבודה?'), outBody: tr('{job} · המשמרת עדיין רצה. לסיים אותה?'), outAction: tr('לסיים משמרת'), channel: tr('הגעה ויציאה מהעבודה') };
  const key = JSON.stringify([fences, texts, !!S.active, S.active?.jobId]);
  if (key === geoSent && !force) return;
  geoSent = key;
  native.geo.setFences(fences, texts).then(r => dbg.log('info', `geofences: ${fences.length}${r.registered ? '' : ' (not allowed)'}`));
  native.geo.setActive(!!S.active, S.active?.jobId);
}
let lastWidget = '';
function cssHex(name) {
  try {
    const el = document.createElement('i'); el.style.color = `var(${name})`; el.style.display = 'none'; document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/[\d.]+/g); el.remove();
    if (!m || m.length < 3) return '';
    return '#' + m.slice(0, 3).map(x => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  } catch { return ''; }
}
function syncWidget() {
  if (!native.NATIVE) return;
  const a = S.active, job = a ? jobAt(jobById(a.jobId), a.start) : jobById(S.settings.lastJob);
  let segs = [], thr = job?.regHours || 8.6;
  if (a) {
    const k = JSON.stringify([a.start, a.jobId, LANG, job, place(), S.settings.birth]);
    if (syncWidget.k !== k) {
      const wb = weekRegBefore(job, a.start), p1 = shiftPay({ start: a.start, end: new Date(+new Date(a.start) + 6e4).toISOString(), breakMin: 0 }, job, place(), wb);
      const per = key => Math.round(job.rate * job.r[key]) / 100, lab = key => tr(tierLabel(key, job));
      syncWidget.segs = [[+new Date(a.start), per(p1.lastKey || 'reg'), lab(p1.lastKey || 'reg')], ...rateChanges(a.start, job, place(), wb, 16).map(c => [+new Date(c.at), per(c.key), lab(c.key)])];
      syncWidget.thr = p1.threshold; syncWidget.k = k;
    }
    segs = syncWidget.segs; thr = syncWidget.thr;
  }
  const now = new Date(), M = monthCalc(now.getFullYear(), now.getMonth());
  const theme = Object.fromEntries([['bg', '--bg'], ['surface', '--surface'], ['line', '--line'], ['ink', '--ink'], ['ink3', '--ink3'],
    ['accent', '--accent'], ['rega', '--g-money-a'], ['regb', '--g-money-b'], ['ot1a', '--g-ot-a'], ['ot1b', '--g-ot-b'], ['ot2a', '--g-hot-a'], ['ot2b', '--g-hot-b'], ['hub', '--g-acc-a']]
    .map(([k, v]) => [k, cssHex(v)]));
  const state = { active: !!a, start: a ? +new Date(a.start) : 0, job: job?.name || '', rate: +job?.rate || 0, rtl: document.documentElement.dir === 'rtl', segs,
    extra: { thr, ot1: job?.ot1Hours ?? 2, otOn: job?.otOn !== false, theme: isSup() ? { ...theme, ring: (S.settings.theme === 'gold' ? '#D9A93F' : cssHex('--accent')) } : theme, wstyle: isSup() ? (S.settings.widgetStyle || 'classic') : 'classic', month: { name: MONTHS[now.getMonth()], gross: money(M.gross), count: M.shifts.length } },
    labels: EN
      ? { idle: 'Not on shift', starts: 'Starts ', since: 'since ', perHour: 'per hour', toOt: 'Overtime in {t}', now: 'Now: ', shortReg: 'regular', shortOt: 'overtime',
          tapStart: 'Tap the dial to clock in', tapShort: 'Tap to start', gross: 'gross', shifts: 'shifts' }
      : { idle: 'לא במשמרת', starts: 'מתחילה ב־', since: 'מ־', perHour: 'לשעה', toOt: 'עוד {t} לשעות נוספות', now: 'עכשיו ', shortReg: 'רגילות', shortOt: 'נוספות',
          tapStart: 'נגיעה בחוגה כדי להתחיל', tapShort: 'נגיעה להתחלה', gross: 'ברוטו', shifts: 'משמרות' } };
  const k = JSON.stringify(state); if (k === lastWidget) return; lastWidget = k;
  native.appActions.updateWidget(state);
}
function appAction({ action, jobId, sig }) {
  dbg.log('info', 'app action ' + action);
  if (action === 'dev_unlock') return devUnlock(sig);
  if (action === 'toggle') {
    go('home');
    if (S.active) openSheet(`<h2>לסיים את המשמרת?</h2><p class="shsub">${nm(jobById(S.active.jobId).name)} · ${hm((Date.now() - new Date(S.active.start)) / 36e5)}</p>
      <div class="btnrow"><button class="btn primary" id="wa-end">${I.check}סיום משמרת</button><button class="btn soft" id="wa-no">עדיין לא</button></div>`, root => {
      $('#wa-end', root).onclick = () => { closeSheet(); if (S.active) onPunch(); };
      $('#wa-no', root).onclick = closeSheet;
    });
    else onPunch();
    return;
  }
  const job = S.jobs.find(j => j.id === jobId); if (!job) return;
  go('home');
  if (action === 'start' && !S.active) { S.settings.lastJob = job.id; onPunch(); return; }
  if ((action === 'end' || action === 'ask_end') && S.active) { onPunch(); return; }
  if (action === 'ask_start' && !S.active) openSheet(`<h2>הגעת לעבודה?</h2><p class="shsub">${nm(job.name)}</p>
    <div class="btnrow"><button class="btn primary" id="ga-yes">${I.check}להתחיל משמרת</button><button class="btn soft" id="ga-no">לא עכשיו</button></div>`, root => {
    $('#ga-yes', root).onclick = () => { closeSheet(); S.settings.lastJob = job.id; onPunch(); };
    $('#ga-no', root).onclick = closeSheet;
  });
}

/* translations: skip-start (developer tools stay in Hebrew) */
function openDevTools() {
  const scen = {
    weekday: ['יום חול ארוך מ־08:00', () => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; }],
    friday: ['שישי מ־10:00, לתוך השבת', () => { const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); d.setHours(10, 0, 0, 0); return d; }],
    current: ['המשמרת שרצה עכשיו', () => S.active ? new Date(S.active.start) : null],
  };
  let pick = S.active ? 'current' : 'friday', items = [];
  const jobId = S.active?.jobId || S.settings.lastJob;
  openSheet(`<div data-keep><h2>כלי פיתוח</h2><p class="shsub">לבדיקות בלבד. לא משנה את החישובים.</p>
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

async function askFirstPerms() {
  if (!native.NATIVE || S.settings.askedPerms) return;
  S.settings.askedPerms = true; persist();
  const ok = await native.notifyAllowed(true);
  dbg.log('info', 'notification permission: ' + (ok ? 'allowed' : 'not allowed'));
  planNotifications();
}
function openOnboarding() {
  const job = S.jobs[0];
  const d = { lang: LANG, name: job.name === 'העבודה שלי' ? '' : job.name, rate: job.rate, travel: job.travel || 0,
    weekDays: job.weekDays, otOn: job.otOn !== false, shabbatOn: job.shabbatOn !== false, city: S.settings.city,
    startDate: job.startDate || '', tipsOn: !!job.tipsOn, tipsMode: job.tipsMode || 'own', goal: +S.settings.goal?.amount || '' };
  const LAST = 4;
  let step = 0;
  const el = document.createElement('div');
  el.id = 'onboard'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ob-title');
  document.body.appendChild(el);
  dbg.log('info', 'onboarding opened');
  const dots = () => `<div class="ob-dots" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  const yesNo = (k, on, unsure) => `<div class="seg" data-k="${k}"><button type="button" data-v="1" class="${on && !d[k + 'Unsure'] ? 'on' : ''}">כן</button><button type="button" data-v="0" class="${on ? '' : 'on'}">לא</button>${unsure ? `<button type="button" data-v="?" class="${d[k + 'Unsure'] ? 'on' : ''}">לא בטוח/ה</button>` : ''}</div>`;
  const STEPS = [
    () => `<div class="ob-hero sm">${mark({ ink: 'var(--ink)', accent: 'var(--accent)' })}</div>
      <h1 id="ob-title">ברוכים הבאים לאצבע</h1>
      <p class="ob-sub">שמים אצבע כשנכנסים למשמרת, ושמים אצבע כשיוצאים. השאר עליה.</p>
      <div class="ob-feats">
        ${[[I.coins, 'orange', 'שכר לפי החוק', 'שעות נוספות, שבת, חגים, נסיעות וטיפים'],
          [I.receipt, 'blue', 'נטו ודוח חודשי', 'מס, ביטוח לאומי ופנסיה, ודוח PDF להשוואה עם התלוש'],
          [I.vac, 'teal', 'חופשה, מחלה והבראה', 'כמה ימים צברת וכמה מגיע לך'],
          [I.cal, 'violet', 'יעד ומשמרות מתוכננות', 'כמה משמרות נשארו ליעד, ותזכורת לפני משמרת'],
          [I.heart, 'red', 'חינם, בלי פרסומות ובלי חשבון', 'הכל נשמר בטלפון שלך']]
          .map(([ic, t, h, sub]) => `<div class="ob-feat"><span class="cell-ic t-${t}">${ic}</span><span><b>${h}</b><small>${sub}</small></span></div>`).join('')}
      </div>
      <div class="field"><span>שפה</span><div class="seg" id="ob-lang">${LANGS.map(l => `<button type="button" data-l="${l.code}" class="${l.code === LANG ? 'on' : ''}" data-keep>${l.name}</button>`).join('')}</div></div>`,
    () => `<h1 id="ob-title">איפה את/ה עובד/ת?</h1>
      <p class="ob-sub">אפשר להוסיף עוד מקומות עבודה אחר כך בהגדרות.</p>
      <label class="field"><span>שם מקום העבודה</span><input class="input" id="ob-name" type="text" autocomplete="organization" placeholder="למשל: קפה רחביה" value="${esc(d.name)}"></label>
      <label class="field"><span>שכר לשעה (₪)</span><input class="input num" id="ob-rate" type="number" step="0.01" inputmode="decimal" value="${d.rate}"><p class="hint" id="ob-minw"></p></label>
      <label class="field"><span>נסיעות ליום עבודה (₪)</span><input class="input num" id="ob-travel" type="number" step="0.5" inputmode="decimal" value="${d.travel || ''}" placeholder="0"><p class="hint">לפי החוק נסיעות משולמות פעם אחת על כל יום עבודה, עד ₪${rules().travelMaxDaily} ליום. אם לא מחזירים לך, אפשר להשאיר ריק.</p></label>
      <label class="field"><span>תאריך לידה (לא חובה)</span><input class="input num" id="ob-birth" type="date" value="${esc(S.settings.birth || '')}" max="${dateKey(new Date())}"><p class="hint">מתחת לגיל 21 זה משנה: שכר מינימום לנוער, ביטוח לאומי ופנסיה. נשמר רק בטלפון.</p></label>`,
    () => `<h1 id="ob-title">איך נראה שבוע העבודה?</h1>
      <p class="ob-sub">זה קובע מתי מתחילות שעות נוספות. לא בטוח/ה? אפשר להשאיר את מה שמסומן.</p>
      <div class="field"><span>ימי עבודה בשבוע</span><div class="seg" data-k="weekDays"><button type="button" data-v="5" class="${d.weekDays === 5 ? 'on' : ''}">5 ימים</button><button type="button" data-v="6" class="${d.weekDays === 6 ? 'on' : ''}">6 ימים</button></div>
        <p class="hint">${d.weekDays === 5 ? 'שעות נוספות אחרי 8.6 שעות ביום (7.6 ביום חמישי).' : 'שעות נוספות אחרי 8 שעות ביום (7 ביום שישי).'}</p></div>
      <div class="field"><span>משלמים לך שעות נוספות (125% / 150%)?</span>${yesNo('otOn', d.otOn, true)}${!d.otOn ? '<p class="hint">לפי החוק כמעט כל עובד זכאי לשעות נוספות. “לא” רק אם את/ה פטור/ה מהן (למשל משרת אמון). אם מגיע לך והמעסיק לא משלם, עדיף “כן”: כך תראה/י כמה מגיע לך.</p>' : '<p class="hint">מגיע לפי חוק לכמעט כל עובד.</p>'}</div>
      <div class="field"><span>משלמים תוספת על שבת וחגים?</span>${yesNo('shabbatOn', d.shabbatOn, true)}${!d.shabbatOn ? '<p class="hint">עבודה בשבת ובחג מזכה בתוספת לפי החוק. “לא” רק אם התוספת כבר כלולה בשכר או שאת/ה פטור/ה. אם המעסיק פשוט לא משלם, עדיף “כן”, כדי לראות כמה מגיע לך.</p>' : ''}${d.otOnUnsure || d.shabbatOnUnsure ? '<p class="hint">לא בטוח/ה? נחשב לפי החוק, ואפשר לשנות בכל רגע בהגדרות העבודה.</p>' : ''}</div>
      <label class="field"><span>העיר שלך (לזמני כניסת ויציאת שבת)</span><select class="input" id="ob-city">${Object.keys(CITIES).map(c => `<option value="${c}"${c === d.city ? ' selected' : ''}>${c}</option>`).join('')}</select></label>`,
    () => `<h1 id="ob-title">עוד שני דברים</h1>
      <p class="ob-sub">כדי לחשב חופשה, מחלה, הבראה וטיפים נכון.</p>
      <label class="field"><span>מתי התחלת לעבוד שם?</span><input class="input num" id="ob-start" type="date" value="${esc(d.startDate)}" max="${dateKey(new Date())}"><p class="hint">אפשר בערך. ככה יודעים כמה ימי חופשה ומחלה צברת וכמה דמי הבראה מגיעים לך.</p></label>
      <div class="field"><span>מקבלים טיפים?</span>${yesNo('tipsOn', d.tipsOn)}</div>
      ${d.tipsOn ? `<div class="field"><span>איך הטיפים עובדים אצלך?</span><div class="seg" data-k="tipsMode"><button type="button" data-v="own" class="${d.tipsMode === 'own' ? 'on' : ''}">הטיפים שלי</button><button type="button" data-v="wage" class="${d.tipsMode === 'wage' ? 'on' : ''}">דרך המעסיק</button></div>
        <p class="hint">${d.tipsMode === 'wage' ? 'הטיפים נכנסים לקופה ונחשבים לשכר. אם במשמרת הם פחות מהשכר לשעות, המעסיק משלים את ההפרש.' : 'הטיפים שלך במזומן או מהלקוחות, מעבר לשכר לשעה. הם לא חלק מהברוטו.'}</p></div>` : ''}`,
    () => `<div class="ob-hero">${mark({ ink: 'var(--ink)', accent: 'var(--accent)' })}</div>
      <h1 id="ob-title">הכל מוכן</h1>
      <p class="ob-sub">${esc(d.name || 'העבודה שלי')} · ₪${d.rate} לשעה${d.travel ? ` · נסיעות ₪${d.travel}` : ''} · שבוע של ${d.weekDays} ימים</p>
      <label class="field" style="margin-top:18px"><span>יעד נטו לחודש (₪, לא חובה)</span><input class="input num" id="ob-goal" type="number" step="50" inputmode="numeric" value="${d.goal || ''}" placeholder="למשל 5000"><p class="hint">נראה לך כמה משמרות נשארו כדי להגיע אליו.</p></label>
      <div class="card" style="margin-top:6px">
        <button class="cell" id="ob-import"><span class="cell-ic t-blue">${I.file}</span><span class="grow">יש לי משמרות מאפליקציה אחרת<div class="sub">ייבוא מקובץ Excel או CSV</div></span><span class="chev">${I.chevL}</span></button>
      </div>
      <p class="ob-note">${I.info}<span>כל זה ניתן לשינוי בכל רגע: הגדרות ← מקום העבודה.</span></p>`,
  ];
  const read = () => {
    const v = id => el.querySelector(id);
    if (step === 1) { d.name = v('#ob-name').value.trim(); d.rate = Math.max(0, +v('#ob-rate').value || 0); d.travel = Math.max(0, +v('#ob-travel').value || 0); }
    if (step === 2) d.city = v('#ob-city').value;
    if (step === 3) d.startDate = /^\d{4}-\d{2}-\d{2}$/.test(v('#ob-start').value) ? v('#ob-start').value : '';
    if (step === LAST) d.goal = Math.max(0, +v('#ob-goal').value || 0);
  };
  const finish = (andImport = false) => {
    read();
    Object.assign(job, { name: d.name || 'העבודה שלי', rate: d.rate || job.rate, travel: d.travel, travelMode: 'day', weekDays: d.weekDays, otOn: d.otOn, shabbatOn: d.shabbatOn, chag: d.shabbatOn,
      startDate: d.startDate, tipsOn: d.tipsOn, tipsMode: d.tipsMode, rateOk: true });
    if (d.goal > 0) S.settings.goal = { amount: d.goal, kind: 'net' };
    if (d.weekDays === 6) Object.assign(job, { regHours: 8, shortHours: 7, shortDay: 5 });
    else Object.assign(job, { regHours: 8.6, shortHours: 7.6, shortDay: 4 });
    S.settings.city = d.city; S.settings.onboarded = true;
    commit();
    el.classList.add('out'); setTimeout(() => el.remove(), 250);
    dbg.log('info', 'onboarding done');
    setTimeout(askFirstPerms, 600);
    go('home');
    if (andImport) { go('set'); openFileImport(); }
    else toast('מוכן. שמים אצבע כדי להתחיל משמרת', 'ok');
  };
  const draw = () => {
    el.innerHTML = `<div class="ob-top">${step ? `<button class="ob-link" id="ob-back">${I.chevR} חזרה</button>` : '<span></span>'}${dots()}<button class="ob-link" id="ob-skip">${step === LAST ? '' : 'דילוג'}</button></div>
      <div class="ob-body">${STEPS[step]()}</div>
      <div class="ob-foot"><button class="btn primary" id="ob-next">${step === 0 ? 'מתחילים' : step === LAST ? 'לאפליקציה' : 'המשך'}</button></div>`;
    el.querySelector('.ob-body').scrollTop = 0;
    const $o = q => el.querySelector(q);
    $o('#ob-next').onclick = () => { read(); if (step === LAST) return finish(); step++; draw(); };
    if ($o('#ob-back')) $o('#ob-back').onclick = () => { read(); step--; draw(); };
    $o('#ob-skip').onclick = () => { if (step < LAST) { S.settings.onboarded = true; persist(); el.remove(); dbg.log('info', 'onboarding skipped'); setTimeout(askFirstPerms, 400); } };
    el.querySelectorAll('#ob-lang button').forEach(b => b.onclick = async () => { await setLang(b.dataset.l); d.lang = b.dataset.l; draw(); });
    el.querySelectorAll('.seg[data-k]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = g.dataset.k; read();
      if (b.dataset.v === '?') { d[k] = true; d[k + 'Unsure'] = true; }
      else { d[k] = k === 'weekDays' ? +b.dataset.v : k === 'tipsMode' ? b.dataset.v : b.dataset.v === '1'; d[k + 'Unsure'] = false; }
      draw(); buzz(8);
    }));
    if ($o('#ob-import')) $o('#ob-import').onclick = () => finish(true);
    const rate = $o('#ob-rate');
    if (rate) { const mw = () => { const r = +rate.value; $o('#ob-minw').innerHTML = r && r < minWage() ? `<span>נמוך משכר המינימום (₪${minWage()} לשעה)</span> ${!S.settings.birth ? '<span>מתחת לגיל 18? הוסיפו תאריך לידה למטה, ואז השכר והניכויים יחושבו לפי הגיל.</span>' : ''}` : ''; $o('#ob-minw').className = 'hint' + (r && r < minWage() ? ' bad' : ''); }; rate.oninput = mw; mw();
      $o('#ob-birth').onchange = e => { const v = e.target.value; S.settings.birth = /^(19|20)\d\d-\d\d-\d\d$/.test(v) && v <= dateKey(new Date()) ? v : ''; refreshAge(); mw(); }; }
    const first = $o('#ob-name'); if (first && !d.name) setTimeout(() => first.focus(), 250);
  };
  draw();
}

/* ================= diagnostics ================= */
function debugReport() {
  const e = dbg.env(), c = dbg.lastCrash();
  const lines = [
    `Etzba ${VERSION} · ${e.where} · ${e.webview} · lite ${e.lite ? 'on' : 'off'} · ${LANG} · view ${view}`,
    `shifts ${S.shifts.length} · jobs ${S.jobs.length} · phone storage ${e.localStorage}`,
    `screen ${e.screen} · memory ${e.deviceMemory} · cores ${e.cores} · heap ${e.heap} · online ${e.online}`,
    c ? `LAST SESSION ENDED DURING: ${c.step} (${new Date(c.at).toLocaleString('en-GB')})` : 'last session ended normally',
    'timings ms: ' + Object.entries(dbg.timingSummary()).map(([k, v]) => `${k} ${v.last}/${v.max}`).join(', '),
    PROBLEMS.length ? 'errors:\n' + PROBLEMS.slice(-3).join('\n---\n') : 'errors: none',
    'log:', ...dbg.getLog().slice(-40).map(x => `${new Date(x.t).toTimeString().slice(0, 8)} ${x.k.padEnd(5)} ${x.m}${x.d !== undefined ? ' ' + JSON.stringify(x.d) : ''}`),
    e.ua,
  ];
  return lines.join('\n');
}
function liteSetting() { try { return localStorage.getItem('etzba.lite') || 'auto'; } catch { return 'auto'; } }
function openDebug() {
  const e = dbg.env(), c = dbg.lastCrash(), T = dbg.timingSummary(), lite = liteSetting();
  let meterOn = false; try { meterOn = localStorage.getItem('etzba.meter') === '1'; } catch {}
  const row = (l, v) => `<div class="ln flat"><span class="l">${l}</span><span class="v num" data-keep style="direction:ltr">${esc(String(v))}</span></div>`;
  openSheet(`<h2>אבחון ותקלות</h2>
    <p class="shsub">אם משהו נתקע או נסגר, להעתיק את הדוח ולשלוח אותו. אין בו משמרות, שכר או שמות, רק מידע טכני.</p>
    ${c ? `<div class="note" style="margin-top:12px">${I.warn}<span>בפעם הקודמת האפליקציה נסגרה באמצע: <b data-keep style="direction:ltr">${esc(c.step)}</b></span></div>` : ''}
    <div class="card" style="margin-top:12px">
      <button class="cell" id="d-copy"><span class="cell-ic t-blue">${I.file}</span><span class="grow">העתקת דוח אבחון</span></button>
      <button class="cell" id="d-save"><span class="cell-ic t-blue">${I.download}</span><span class="grow">שמירת הדוח כקובץ</span></button>
    </div>
    <div class="sec"><span>המכשיר</span></div>
    <div class="card pad">${row('גרסה', VERSION)}${row('רץ ב־', e.where)}${row('דפדפן', e.webview)}${row('מסך', e.screen)}${row('זיכרון', e.deviceMemory + ' · ' + e.heap)}${row('אחסון בטלפון', e.localStorage)}${row('משמרות', S.shifts.length)}</div>
    <div class="sec"><span>תצוגה</span></div>
    <div class="seg" id="d-lite"><button data-l="auto" class="${lite === 'auto' ? 'on' : ''}">אוטומטי</button><button data-l="on" class="${lite === 'on' ? 'on' : ''}">קלה</button><button data-l="off" class="${lite === 'off' ? 'on' : ''}">מלאה</button></div>
    <p class="fine" style="margin-top:6px">תצוגה קלה מכבה רקע זז, טשטוש ואנימציות. עוזרת בטלפונים חלשים.</p>
    <label class="cell" style="margin-top:8px"><span class="grow">מד ביצועים על המסך</span><input type="checkbox" id="d-meter" ${meterOn ? 'checked' : ''}></label>
    <div class="sec"><span>בדיקה עצמית</span></div>
    <div class="card"><button class="cell" id="d-test"><span class="cell-ic t-green">${I.check}</span><span class="grow">להריץ בדיקה<div class="sub" id="d-test-out">מצייר כל מסך ומחשב את כל המשמרות, ומודד זמנים</div></span></button></div>
    <div class="sec"><span>זמנים (מ״ש, אחרון / הכי איטי)</span></div>
    <div class="card pad">${Object.keys(T).length ? Object.entries(T).map(([k, v]) => row(k, v.last + ' / ' + v.max)).join('') : row('—', '')}</div>
    <div class="sec"><span>יומן</span></div>
    <pre data-keep style="white-space:pre-wrap;direction:ltr;text-align:left;font-size:11px;line-height:1.35;max-height:40vh;overflow:auto;background:var(--surface);border:1px solid var(--line);padding:8px">${esc(dbg.getLog().slice(-60).reverse().map(x => `${new Date(x.t).toTimeString().slice(0, 8)} ${x.k} ${x.m}${x.d !== undefined ? ' ' + JSON.stringify(x.d) : ''}`).join('\n'))}</pre>
    <div class="card" style="margin-top:12px"><button class="cell" id="d-clear"><span class="grow">ניקוי היומן</span></button></div>`, root => {
    $('#d-copy', root).onclick = () => copyText(debugReport());
    $('#d-save', root).onclick = () => deliver(`etzba-debug-${Date.now()}.txt`, debugReport(), 'text/plain;charset=utf-8');
    $$('#d-lite button', root).forEach(b => b.onclick = () => {
      try { b.dataset.l === 'auto' ? localStorage.removeItem('etzba.lite') : localStorage.setItem('etzba.lite', b.dataset.l); } catch {}
      const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
      const on = b.dataset.l === 'on' || (b.dataset.l === 'auto' && (framed || (navigator.deviceMemory && navigator.deviceMemory <= 2)));
      document.documentElement.classList.toggle('lite', on); dbg.log('info', 'lite ' + b.dataset.l);
      $$('#d-lite button', root).forEach(x => x.classList.toggle('on', x === b));
    });
    $('#d-meter', root).onchange = ev => { try { localStorage.setItem('etzba.meter', ev.target.checked ? '1' : '0'); } catch {} dbg.setMeter(ev.target.checked); };
    $('#d-clear', root).onclick = () => { dbg.clearLog(); closeSheet(); toast('היומן נוקה'); };
    $('#d-test', root).onclick = () => selfTest($('#d-test-out', root));
  });
}
function selfTest(out) {
  out.textContent = 'בודק…';
  setTimeout(() => {
    const res = [], keep = { view, viewY, viewM, sumView: S.ui.sumView };
    const t0 = performance.now();
    try { const P = computeAll(S.shifts, jobById, place()); let n = 0; for (const x of P.values()) n += x.pay > -1 ? 1 : 0; res.push(`pay ${n}/${S.shifts.length} ${Math.round(performance.now() - t0)}ms`); }
    catch (e) { res.push('pay FAIL ' + e.message); dbg.log('error', 'selftest pay: ' + e.message); }
    for (const v of ['home', 'shifts', 'sum', 'rights']) {
      const t = performance.now();
      try { setView(v); VIEWS[v](); res.push(`${v} ${Math.round(performance.now() - t)}ms`); }
      catch (e) { res.push(`${v} FAIL ${e.message}`); dbg.log('error', 'selftest ' + v + ': ' + e.message); }
    }
    for (const sv of ['weeks', 'year', 'month']) {
      const t = performance.now();
      try { S.ui.sumView = sv; setView('sum'); renderSum(); res.push(`sum/${sv} ${Math.round(performance.now() - t)}ms`); }
      catch (e) { res.push(`sum/${sv} FAIL ${e.message}`); dbg.log('error', 'selftest sum ' + sv + ': ' + e.message); }
    }
    setView(keep.view); showMonth(keep.viewY, keep.viewM); S.ui.sumView = keep.sumView;
    try { VIEWS[view](); } catch {}
    const txt = res.join(' · '); dbg.log('perf', 'selftest ' + txt);
    out.textContent = (res.some(r => r.includes('FAIL')) ? '✗ ' : '✓ ') + txt;
  }, 50);
}

async function setLang(l, save = true) {
  const info = langInfo(l);
  const pack = preferPack(info.code, await loadPack(info.code).catch(() => null));
  useLanguage(info, pack);
  stopTranslating(); usePack(pack);
  if (pack) startTranslating();
  if (save) { S.settings.lang = LANG; persist(); }
  render(); updateBackupDot();
  syncGeo(true); planNotifications(); syncWidget();
}

/* ================= router ================= */
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

const PROBLEMS = [];
function describe(e) { return ((e && (e.stack || e.message)) || String(e)).split('\n').slice(0, 4).join('\n'); }
function problemText() { return debugReport(); }
export function report(e) {
  const d = describe(e); if (PROBLEMS[PROBLEMS.length - 1] === d) return;
  PROBLEMS.push(d); console.error(e); dbg.log('error', d);
  let bar = $('#probbar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'probbar'; bar.setAttribute('role', 'alert'); bar.dataset.keep = '';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span>${EN ? 'Something went wrong. Your data is safe.' : 'משהו השתבש. הנתונים שלך בטוחים.'}</span>
    <button id="pb-copy">${EN ? 'Copy details' : 'העתקת פרטים'}</button><button id="pb-x" aria-label="${EN ? 'Close' : 'סגירה'}">✕</button>`;
  $('#pb-copy', bar).onclick = async () => { if (!(await copyText(problemText())) && !$('pre', bar)) bar.insertAdjacentHTML('beforeend', `<pre style="flex-basis:100%;white-space:pre-wrap;direction:ltr;font-size:11px;user-select:all">${esc(problemText())}</pre>`); };
  $('#pb-x', bar).onclick = () => bar.remove();
}
function showFailure(el, e) {
  report(e);
  if (!el) return;
  el.innerHTML = `<div class="card" style="margin-top:16px" data-keep><div class="empty">${EN ? 'This screen couldn’t be drawn.' : 'לא הצלחתי להציג את המסך הזה.'}
    <pre style="white-space:pre-wrap;direction:ltr;text-align:left;font-size:11px;margin:10px 0">${esc(describe(e))}</pre>
    <button class="btn" id="fail-copy">${EN ? 'Copy details' : 'העתקת פרטים'}</button></div></div>`;
  $('#fail-copy', el).onclick = () => copyText(problemText());
}
addEventListener('error', e => { if (window.__etzbaReady && e.error) report(e.error); });
addEventListener('unhandledrejection', e => { if (window.__etzbaReady) report(e.reason); });
$$('#tabs button').forEach(b => { b.querySelector('.tic').innerHTML = I[b.querySelector('.tic').dataset.i]; b.onclick = () => go(b.dataset.v); });
$('#fab').innerHTML = I.plus;
{ let lastY = scrollY; addEventListener('scroll', () => { const y = scrollY; if (Math.abs(y - lastY) > 6) { $('#fab').classList.toggle('tuck', y > lastY && y > 80); lastY = y; } }, { passive: true }); }
$('#fab').onclick = () => {
  const job = jobById(S.settings.lastJob), end = new Date(); end.setMinutes(0, 0, 0);
  const start = new Date(+end - Math.round(job.regHours) * 3.6e6);
  openShiftSheet({ id: null, jobId: job.id, start: start.toISOString(), end: end.toISOString(), breakMin: job.breakMin, bonus: 0, note: '', rest: 'auto' }, 'new');
};

const step = (name, fn) => { try { fn(); } catch (e) { (window.__etzbaErr || []).push(name + ': ' + (e && e.message)); console.error(name, e); } };
step('recompute', recompute);
step('render', render);
if (LANG !== 'he') step('language', () => { setLang(LANG, false); });
step('langCheck', () => {
  let failed = null; try { failed = localStorage.getItem('etzba.langFailed'); localStorage.removeItem('etzba.langFailed'); } catch {}
  if (failed) {
    dbg.log('error', `language ${failed}: the last start didn't finish, back to Hebrew`);
    let errs = ''; try { errs = localStorage.getItem('etzba.bootErr') || ''; } catch {}
    const report = [`language ${failed} failed to start · v${VERSION}`, errs || '(no error recorded: it stopped responding)', ...dbg.getLog().slice(-40).map(e => JSON.stringify(e)), navigator.userAgent].join('\n');
    setTimeout(() => toast('השפה הוחזרה לעברית בגלל תקלה. אפשר לנסות שוב בהגדרות', 'err', { label: 'העתקת פרטים', fn: () => copyText(report).then(() => toast('הועתק', 'ok')) }), 800);
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
setInterval(() => { if (document.hidden) return; tickHome(false); if (new Date().getSeconds() === 0) { renderRestCard(); $('#brandMark').innerHTML = mark({ t: new Date(), sw: 5.4 }); } }, 1000);
$('#chipNet') && ($('#chipNet').onclick = () => { const n = new Date(); showMonth(n.getFullYear(), n.getMonth()); S.ui.sumView = 'month'; go('sum'); setTimeout(() => $('#steps')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); planNotifications(); checkEarly(); } });

const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
try {
  if (!native.NATIVE && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    if (framed) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    else navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
} catch {}
