// A workplace's settings: pay, premiums, travel, tips, location, and whether a change applies to past shifts.
import { rules } from '../rules.js';
import { S, place, save } from '../state.js';
import { applyRulesFrom, computeAll, rulesChanged } from '../pay-engine.js';
import { PAY, electionDate, ageAt, minWage } from '../pay.js';
import { dFull, money, esc, $, $$, hm, money2 } from '../util.js';
import { MONTHS, DAYS } from '../lang.js';
import { openSheet, closeSheet, toast, confirmBtn } from '../ui.js';
import { I } from '../svg-icons.js';
import { commit } from '../nav.js';
import { lawVacDays } from '../leave.js';
import * as native from '../native-bridge.js';
import { secIc } from './settings.js';
import { syncGeo } from '../outside.js';

export const COLORS = ['#E4572E', '#1E7A4A', '#4B5BD0', '#C98E00', '#1F8F84', '#A1458F', '#5E574C', '#2A6FB0'];

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
