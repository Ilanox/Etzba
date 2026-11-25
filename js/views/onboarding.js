// The first-run screens: language, the first job, rules, start date and a goal.
import { S } from '../state.js';
import { LANG } from '../lang.js';
import * as dbg from '../diagnostics.js';
import { mark, I } from '../svg-icons.js';
import { LANGS } from '../../languages/index.js';
import { esc, dateKey } from '../util.js';
import { rules } from '../rules.js';
import { CITIES } from '../hebrew-calendar.js';
import { commit, go, persist } from '../nav.js';
import { toast, buzz } from '../ui.js';
import { minWage, refreshAge } from '../pay.js';
import { openFileImport } from './data.js';
import { askFirstPerms } from '../notifications.js';
import { setLang } from '../switch-language.js';

export function openOnboarding() {
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
