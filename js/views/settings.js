// The settings screen: workplaces, look, pay and net, general, data, and the legal page.
import { ageAt, minWage, pensionAge, NET, netOpts, refreshAge } from '../pay.js';
import { isSup, isOwner, applyTheme } from '../theme.js';
import { S, jobById } from '../state.js';
import { I } from '../svg-icons.js';
import { $, nm, esc, dateKey, dFull, $$ } from '../util.js';
import * as native from '../native-bridge.js';
import { taxFor } from '../net-pay.js';
import { CITIES } from '../hebrew-calendar.js';
import { LANGS } from '../../languages/index.js';
import { LANG } from '../lang.js';
import { speechLang, setSpeech } from '../a11y.js';
import * as dbg from '../diagnostics.js';
import { openJobSheet, COLORS } from './job.js';
import { defaultJob } from '../pay-engine.js';
import { commit, persist } from '../nav.js';
import { openSupport } from './support.js';
import { toast, buzz, announce, openSheet } from '../ui.js';
import { backupDue, storeNote, openExport, openImport, backupNow, openFileImport, persistState } from './data.js';
import { notifOn, planNotifications, drawNotifStatus } from '../notifications.js';
import { devOK, openDevTools } from './dev-tools.js';
import { VERSION } from '../diagnostics.js';
import { report } from '../problems.js';
import { setLang } from '../switch-language.js';
import { openDebug } from './debug.js';

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

/** An on/off switch. */
const sw = (id, on) => `<span class="switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><i></i></span>`;

/** Workplaces. */
const jobsSection = st => `
    <div class="sec"><span>${secIc('briefcase', 'blue')}מקומות עבודה</span></div>
    <div class="card">${S.jobs.map(j => `<button class="cell" data-job="${j.id}"><span class="cell-ic" style="color:${j.color}">${I.briefcase}</span>
      <span class="grow">${nm(j.name)}<div class="sub num">₪${j.rate} לשעה · שבוע של ${j.weekDays} ימים${j.restMode === 'fixed' ? ' · שבת לפי חוזה' : ''}</div></span><span class="chev">${I.chevL}</span></button>`).join('')}
      <button class="cell" id="addJob"><span class="cell-ic">${I.plus}</span><span class="grow" style="color:var(--accent);font-weight:600">הוספת מקום עבודה</span></button></div>`;

/** Themes, and for supporters the widget style and app icon. */
const lookSection = st => `
    <div class="sec"><span>${secIc('noon', 'gold')}מראה</span></div>
    <div class="card pad"><div class="themes" id="s-theme">${THEMES.map(themeBtn).join('')}</div>
      ${native.billing.available() || isSup() ? `<div class="themes-h">${I.heart}${isSup() ? 'בתודה על התמיכה' : 'לתומכים באצבע'}</div><div class="themes" id="s-theme2">${THEMES_SUPPORT.map(themeBtn).join('')}</div>
        <div class="themes-h">מעברי צבע</div><div class="themes" id="s-theme3">${THEMES_GRAD.map(themeBtn).join('')}</div>` : ''}
      ${isOwner() ? `<div class="themes-h dev">${I.gear}מצב מפתח</div><div class="themes" id="s-theme4">${themeBtn(THEME_DEV)}</div>` : ''}</div>
    ${isSup() && (native.billing.available() || native.PLATFORM === 'android') ? `<div class="card" style="margin-top:12px"><details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.gear}</span><span class="grow">ווידג׳ט ואייקון<div class="sub">סגנון הווידג׳ט ואייקון האפליקציה</div></span><span class="chev">${I.chevDown}</span></summary><div class="pad">${isSup() && native.PLATFORM === 'android' ? `<div class="themes-h">סגנון הווידג׳ט</div><div class="seg" id="s-wstyle">${[['classic', 'רגיל'], ['glass', 'שקוף'], ['bold', 'גדול'], ['accent', 'צבעוני']].map(([k, n]) => `<button data-w="${k}" class="${(st.widgetStyle || 'classic') === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}${isSup() && (native.billing.available() || native.PLATFORM === 'android') ? `<div class="themes-h">אייקון האפליקציה</div><div class="icons" id="s-icon">${ICONS.map(([k, n, f]) => `<button data-ic="${k}" class="${(st.icon || 'default') === k ? 'on' : ''}"><img src="icons/${f}" alt="">${n}</button>`).join('')}</div>` : ''}</div></details></div>` : ''}`;

/** Date of birth, net pay, credit points and pension. */
const paySection = st => `
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
    </div>`;

/** City and Shabbat times, language, notifications. */
const generalSection = st => `
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
    </div>`;

/** Backup, restore, import and export. */
const dataSection = st => `
    <div class="sec"><span>${secIc('download', 'blue')}נתונים וגיבוי</span></div>
    ${backupDue() ? `<div class="note" style="margin-bottom:10px">${I.warn}<span>${S.settings.lastBackup ? `הגיבוי האחרון לפני ${Math.floor((Date.now() - new Date(S.settings.lastBackup)) / 864e5)} ימים.` : 'עוד לא גיבית.'} יש ${S.shifts.length} משמרות שקיימות רק בטלפון הזה.</span></div>` : ''}
    <div class="card">
      <button class="cell" id="s-backup"><span class="cell-ic t-blue">${I.download}</span><span class="grow">גיבוי מלא עכשיו<div class="sub">${S.settings.lastBackup ? 'גיבוי אחרון: ' + dFull(S.settings.lastBackup) : 'עוד לא גיבית'}</div></span><span class="chev">${I.chevL}</span></button>
      <details class="adv-cell"><summary class="cell"><span class="cell-ic">${I.file}</span><span class="grow">שחזור, ייבוא וייצוא<div class="sub">מטלפון אחר, מאקסל, או ל־CSV</div></span><span class="chev">${I.chevDown}</span></summary><button class="cell" id="s-import"><span class="cell-ic t-blue">${I.file}</span><span class="grow">שחזור או העברה מטלפון אחר<div class="sub">מציג מה בקובץ לפני שמשנים משהו</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-fimport"><span class="cell-ic t-teal">${I.list}</span><span class="grow">ייבוא משמרות מקובץ<div class="sub">Excel או CSV, גם מאפליקציות אחרות</div></span><span class="chev">${I.chevL}</span></button>
      <button class="cell" id="s-export"><span class="cell-ic t-green">${I.receipt}</span><span class="grow">ייצוא ל־CSV<div class="sub">לאקסל או לגוגל שיטס</div></span><span class="chev">${I.chevL}</span></button><div class="pad"><div class="note info" id="storeNote">${storeNote()}</div></div></details>
    </div>`;

/** Diagnostics, developer tools, support, legal and the version line. */
const moreSection = st => `
    <div class="card" style="margin-top:12px">
    ${devOK() ? `<button class="cell" id="s-debug"><span class="cell-ic t-violet">${I.info}</span><span class="grow">אבחון ותקלות<div class="sub">${dbg.lastCrash() ? 'האפליקציה נסגרה בפעם הקודמת · פרטים כאן' : 'מידע טכני לשליחה כשמשהו לא עובד'}</div></span><span class="chev">${I.chevL}</span></button>` : ''}
    ${devOK() && S.settings.dev ? `<button class="cell" id="s-dev"><span class="cell-ic t-gray">${I.gear}</span><span class="grow">כלי פיתוח<div class="sub">בדיקת התראות, משמרות לדוגמה ועוד</div></span><span class="chev">${I.chevL}</span></button>` : ''}
    ${native.billing.available() || isOwner() ? `<button class="cell" id="s-support"><span class="cell-ic t-red">${I.heart}</span><span class="grow">${isOwner() ? 'מפתח' : isSup() ? 'תומך/ת באצבע' : 'תמיכה באצבע'}<div class="sub">${isOwner() ? 'כל האפשרויות פתוחות במכשיר הזה' : isSup() ? `מאז ${dFull(S.settings.supportedAt || S.updatedAt)} · תודה! אפשר לתמוך שוב מתי שרוצים` : 'האפליקציה חינמית ובלי פרסומות. תומכים מקבלים ערכות צבע ואייקונים'}</div></span><span class="chev">${I.chevL}</span></button>` : ''}
    <button class="cell" id="s-legal"><span class="cell-ic t-gray">${I.lock}</span><span class="grow">פרטיות ומשפטי<div class="sub">מה נשמר, ומה החישוב כן ולא</div></span><span class="chev">${I.chevL}</span></button>
    </div>
    <p class="fine" id="s-ver"><b>אצבע</b> · גרסה ${VERSION}${isSup() ? ' <span style="color:#D9534F">♥</span>' : ''}<br>An Edvin Studios Project</p>`;

export function renderSet() {
  const el = $('#v-set'), st = S.settings;
  el.innerHTML = `<h1 class="title">הגדרות</h1>
${jobsSection(st)}
${lookSection(st)}
${paySection(st)}
${generalSection(st)}
${dataSection(st)}
${moreSection(st)}`;
  bindSettings(el);
}

/** Wires every control on the settings screen. */
function bindSettings(el) {
  const st = S.settings;
  // workplaces
  $$('[data-job]', el).forEach(b => b.onclick = () => openJobSheet(jobById(b.dataset.job), false));
  $('#addJob', el).onclick = () => { const j = defaultJob('עבודה ' + (S.jobs.length + 1)); j.color = COLORS[S.jobs.length % COLORS.length]; openJobSheet(j, true); };
  // pay, net and general settings save on change
  const set = (k, v) => { S.settings[k] = v; commit(); };
  $('#s-city', el).onchange = e => { S.settings.candleMin = CITIES[e.target.value][2]; set('city', e.target.value); };
  for (const k of ['candleMin', 'havdalahMin', 'extraPts', 'pEmp', 'pEr', 'sev']) $('#s-' + k, el) && ($('#s-' + k, el).onchange = e => set(k, +e.target.value || 0));
  for (const k of ['pension', 'hish']) $('#s-' + k, el) && ($('#s-' + k, el).onchange = e => set(k, e.target.checked));
  $('#s-net', el).onchange = e => { set('net', e.target.checked); renderSet(); };
  $('#s-birth', el).onchange = e => { const v = e.target.value; S.settings.birth = /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= dateKey(new Date()) ? v : ''; refreshAge(); commit(); };
  $$('#s-sex button', el).forEach(b => { b.classList.toggle('on', +b.dataset.v === +st.sex); b.onclick = () => set('sex', +b.dataset.v); });
  // look
  $$('#s-theme button, #s-theme2 button, #s-theme3 button, #s-theme4 button', el).forEach(b => b.onclick = () => {
    if ([...THEMES_SUPPORT, ...THEMES_GRAD].some(t => t[0] === b.dataset.t) && !isSup()) return openSupport();
    S.settings.theme = b.dataset.t; applyTheme(); commit();
  });
  $$('#s-wstyle button', el).forEach(b => b.onclick = () => { S.settings.widgetStyle = b.dataset.w; persist(); renderSet(); toast('הווידג׳ט יתעדכן בעוד רגע', 'ok'); });
  $$('#s-icon button', el).forEach(b => b.onclick = async () => {
    try { await native.billing.setIcon(b.dataset.ic); S.settings.icon = b.dataset.ic; persist(); renderSet(); toast('האייקון יתחלף בעוד רגע במסך הבית', 'ok'); }
    catch (e) { report(e); toast('לא הצלחתי להחליף את האייקון', 'err'); }
  });
  // language and screen reader
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
  // data, diagnostics and the hidden developer switch (tap the version 7 times)
  $('#s-export', el).onclick = openExport;
  $('#s-import', el).onclick = openImport;
  $('#s-debug', el) && ($('#s-debug', el).onclick = openDebug);
  $('#s-dev', el) && ($('#s-dev', el).onclick = openDevTools);
  { let taps = 0, t; $('#s-ver', el).onclick = () => { clearTimeout(t); t = setTimeout(() => taps = 0, 1500);
      if (++taps < 7) return; taps = 0;
      if (devOK() && !S.settings.dev) { S.settings.dev = true; persist(); buzz(30); toast('מצב מפתח פעיל', 'ok'); renderSet(); } }; }
  // notifications
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

const PRIVACY_URL = 'https://etzba.co.il/privacy', CONTACT = 'ilan@edvin.co.il';

export function openLegal() {
  openSheet(`<h2>פרטיות ומשפטי</h2>
    <div class="card legal">
      <div class="cell flat">${I.lock}<span class="grow">הכל נשמר רק בטלפון שלך<div class="sub">משמרות, שכר והגדרות. אין חשבון, אין שרת, אין פרסומות ואין מעקב.</div></span></div>
      <div class="cell flat">${I.download}<span class="grow">גיבוי ומחיקה בידיים שלך<div class="sub">גיבוי וייצוא ב״נתונים וגיבוי״. מחיקת האפליקציה או ניקוי הנתונים שלה מוחקים הכל, אז כדאי לגבות לפני.</div></span></div>
      <div class="cell flat">${I.info}<span class="grow">מה נשלח לאינטרנט<div class="sub">רק בדיקה יומית של נתוני שכר מינימום ומס, בהורדה של קובץ ציבורי. שום מידע שלך.</div></span></div>
    </div>
    <div class="note" style="margin-top:12px">${I.warn}<span><b>החישובים הם הערכה.</b> לפי חוק שעות עבודה ומנוחה, הכללים המקובלים וההגדרות שהזנת. זה לא תלוש שכר רשמי ולא ייעוץ משפטי, מיסוי או פיננסי. הסכם קיבוצי או חוזה אישי יכולים לקבוע אחרת.</span></div>
    <div class="btnrow"><a class="btn soft" href="${PRIVACY_URL}" target="_blank" rel="noopener">${I.file}מדיניות הפרטיות המלאה</a><a class="btn soft" href="mailto:${CONTACT}">${I.receipt}יצירת קשר · ${CONTACT}</a></div>`);
}
