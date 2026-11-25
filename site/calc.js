// Small pay calculators for the guide pages. The net one uses the app's own engine.
// The figures on the next two lines are written by `npm run site` from data/rules.json and scripts/site/guides.mjs.
import { grossToNet, taxFor } from '/app/js/net-pay.js';

const MIN_HOURLY = 35.40, YOUTH = { 15: .70, 16: .75, 17: .83 }, TRAVEL_MAX = 22.60;
const HAVRAA = 451.50, HAVRAA_DAYS = [5, 6, 6, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 9, 9, 9, 9, 10], AVG_WAGE = 13769;
const ils = (x, d = 2) => '₪' + (+x || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
const hrs = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const youthMin = p => Math.round(MIN_HOURLY * 182.03 * p / 173 * 100) / 100;

const field = (id, label, attrs = '', hint = '') => `<label class="cf"><span>${label}</span><input id="${id}" class="ci" inputmode="decimal" ${attrs}>${hint ? `<small>${hint}</small>` : ''}</label>`;
const seg = (id, opts, on) => `<div class="cs" id="${id}" role="group">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${String(v) === String(on) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
const rows = (list, total) => `<table class="ct"><tbody>${list.filter(r => r).map(([a, b, c]) => `<tr><td>${c ? `${c}<small>${a}</small>` : a}</td><td>${b}</td></tr>`).join('')}${total ? `<tr class="tot"><th>${total[0]}</th><th>${total[1]}</th></tr>` : ''}</tbody></table>`;

// "add this shift to the app": the app opens its new-shift form with these hours (js/add-link.js)
const p2 = n => String(n).padStart(2, '0');
const FRAMED = window.top !== window;   // inside another site's page (/embed/): links open a new tab
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
function addLink(day, startH, hours) {
  if (!(hours > 0 && hours <= 24)) return '';
  const end = new Date(day); end.setHours(startH, 0, 0, 0); end.setMinutes(end.getMinutes() + Math.round(hours * 60));
  return `<a class="addapp" href="/app/?add=${ymd(day)},${p2(startH)}:00,${p2(end.getHours())}:${p2(end.getMinutes())}"${FRAMED ? ' target="_blank" rel="noopener"' : ''}>לרשום את המשמרת באצבע</a>`;
}
const nextSaturday = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d; };

function wire(root, calc) {
  const val = id => { const v = root.querySelector('#' + id); return v.tagName === 'INPUT' ? (v.type === 'checkbox' ? v.checked : parseFloat(String(v.value).replace(',', '.')) || 0) : v.querySelector('.on')?.dataset.v; };
  const out = root.querySelector('.cout');
  const run = () => { out.innerHTML = calc(val); };
  root.querySelectorAll('input').forEach(i => i.addEventListener('input', run));
  root.querySelectorAll('.cs').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); run();
  }));
  run();
}

const CALCS = {
  overtime: {
    title: 'מחשבון שעות נוספות',
    html: () => field('rate', 'שכר לשעה (₪)', 'value="40"') + field('hours', 'שעות במשמרת', 'value="11"', 'אחרי ניכוי הפסקה שלא בתשלום') +
      `<div class="cf"><span>סוג המשמרת</span>${seg('kind', [['5', 'שבוע של 5 ימים'], ['6', 'שבוע של 6 ימים'], ['short', 'יום מקוצר'], ['night', 'משמרת לילה']], '5')}</div>`,
    calc: v => {
      const rate = v('rate'), h = v('hours'), lim = { 5: 8.6, 6: 8, short: 7, night: 7 }[v('kind')];
      const reg = Math.min(h, lim), a = Math.min(2, Math.max(0, h - lim)), b = Math.max(0, h - lim - 2);
      const total = reg * rate + a * rate * 1.25 + b * rate * 1.5;
      return rows([[`${hrs(reg)} ש׳ × ${ils(rate)}`, ils(reg * rate), 'שעות רגילות 100%'], a && [`${hrs(a)} ש׳ × ${ils(rate * 1.25)}`, ils(a * rate * 1.25), 'שעות נוספות 125%'], b && [`${hrs(b)} ש׳ × ${ils(rate * 1.5)}`, ils(b * rate * 1.5), 'שעות נוספות 150%']], ['סה״כ למשמרת', ils(total)]) +
        (a ? `<p class="cn">בלי שעות נוספות: ${ils(h * rate)}. ההפרש: ${ils(total - h * rate)}.</p>` : `<p class="cn">עד ${hrs(lim)} שעות אין שעות נוספות במשמרת כזו.</p>`) +
        addLink(new Date(), v('kind') === 'night' ? 22 : 8, h);
    },
  },
  shabbat: {
    title: 'מחשבון שכר לשבת',
    html: () => field('rate', 'שכר לשעה (₪)', 'value="40"') + field('hours', 'שעות בתוך שבת או חג', 'value="9"') +
      `<div class="cf"><span>שבוע העבודה</span>${seg('kind', [['5', '5 ימים'], ['6', '6 ימים']], '5')}</div>`,
    calc: v => {
      const rate = v('rate'), h = v('hours'), lim = v('kind') === '6' ? 8 : 8.6;
      const reg = Math.min(h, lim), a = Math.min(2, Math.max(0, h - lim)), b = Math.max(0, h - lim - 2);
      const total = reg * rate * 1.5 + a * rate * 1.75 + b * rate * 2;
      return rows([[`${hrs(reg)} ש׳ × ${ils(rate * 1.5)}`, ils(reg * rate * 1.5), 'שבת 150%'], a && [`${hrs(a)} ש׳ × ${ils(rate * 1.75)}`, ils(a * rate * 1.75), 'נוספות בשבת 175%'], b && [`${hrs(b)} ש׳ × ${ils(rate * 2)}`, ils(b * rate * 2), 'נוספות בשבת 200%']], ['סה״כ', ils(total)]) +
        `<p class="cn">אותן שעות ביום חול: ${ils(Math.min(h, lim) * rate + a * rate * 1.25 + b * rate * 1.5)}.</p>` + addLink(nextSaturday(), 8, h);
    },
  },
  net: {
    title: 'מחשבון ברוטו לנטו 2026',
    html: () => field('gross', 'ברוטו חודשי (₪)', 'value="6000"') +
      `<div class="cf"><span>נקודות זיכוי בסיס</span>${seg('sex', [['2.25', 'גבר · 2.25'], ['2.75', 'אישה · 2.75']], '2.25')}</div>` +
      field('extra', 'נקודות זיכוי נוספות', 'value="0"', 'ילדים, תואר, שחרור מצבא') +
      `<div class="cf"><span>גיל</span>${seg('age', [['adult', '18 ומעלה'], ['16', '16 או 17 השנה'], ['minor', 'מתחת ל־16']], 'adult')}</div>` +
      `<label class="cc"><input type="checkbox" id="pension"> <span>מפרישים לפנסיה (6% ממך)</span></label>`,
    calc: v => {
      const g = v('gross'), age = v('age');
      const n = grossToNet(g, { points: +v('sex') + v('extra') + (age === '16' ? 1 : 0), pension: v('pension'), pEmp: 6, pEr: 6.5, sev: 6, hish: false, minor: age !== 'adult' }, taxFor(2026));
      return rows([['מס הכנסה', '−' + ils(n.tax, 0)], ['ביטוח לאומי ובריאות', '−' + ils(n.ni + n.health, 0), age !== 'adult' ? 'עד גיל 18 לא יורד מהשכר' : ''], v('pension') && ['פנסיה', '−' + ils(n.pEmp, 0)]], ['נטו משוער', ils(n.net, 0)]);
    },
  },
  minimum: {
    title: 'בדיקת שכר מינימום',
    html: () => field('rate', 'השכר שלך לשעה (₪)', 'value="34"') +
      `<div class="cf"><span>גיל</span>${seg('age', [['18', '18 ומעלה'], ['17', '17'], ['16', '16'], ['15', 'מתחת ל־16']], '18')}</div>`,
    calc: v => {
      const a = +v('age'), min = a >= 18 ? MIN_HOURLY : youthMin(YOUTH[a]), r = v('rate');
      return r >= min ? `<p class="cok">${ils(r)} לשעה מעל שכר המינימום לגילך, ${ils(min)}.</p>`
        : `<p class="cbad">${ils(r)} לשעה נמוך משכר המינימום לגילך, ${ils(min)}. חסרים ${ils(min - r)} לכל שעה: בחודש של 100 שעות, ${ils((min - r) * 100, 0)}.</p>`;
    },
  },
  travel: {
    title: 'מחשבון דמי נסיעות',
    html: () => field('fare', 'מחיר נסיעה הלוך וחזור ביום (₪)', 'value="16"') + field('days', 'ימי עבודה בחודש', 'value="13"'),
    calc: v => {
      const per = Math.min(v('fare'), TRAVEL_MAX);
      return rows([[`${v('days')} ימים × ${ils(per)}`, ils(per * v('days')), v('fare') > TRAVEL_MAX ? `לפי התקרה של ${ils(TRAVEL_MAX)} ליום` : '']], ['דמי נסיעות לחודש', ils(per * v('days'))]);
    },
  },
  havraa: {
    title: 'מחשבון דמי הבראה',
    html: () => field('years', 'שנות ותק אצל המעסיק', 'value="1"', 'שנים שלמות. בשנה הראשונה עדיין לא מגיע') + field('scope', 'היקף משרה (%)', 'value="100"', 'לעובד לפי שעה: השעות בשנה ביחס למשרה מלאה'),
    calc: v => {
      const y = Math.floor(v('years')), scope = Math.min(100, Math.max(0, v('scope'))) / 100;
      if (y < 1) return `<p class="cn">דמי הבראה מגיעים אחרי שנת עבודה מלאה. אחרי השנה הראשונה: ${HAVRAA_DAYS[0]} ימים, ${ils(HAVRAA_DAYS[0] * HAVRAA * scope, 0)} בהיקף הזה.</p>`;
      const days = HAVRAA_DAYS[Math.min(y, HAVRAA_DAYS.length) - 1];
      return rows([[`${days} ימים × ${ils(HAVRAA)}${scope < 1 ? ` × ${Math.round(scope * 100)}%` : ''}`, ils(days * HAVRAA * scope, 0), `שנה ${y}`]], ['דמי הבראה לשנה', ils(days * HAVRAA * scope, 0)]) +
        `<p class="cn">לפי התעריף במגזר הפרטי. במגזר הציבורי ובהסכמים קיבוציים התעריף גבוה יותר.</p>`;
    },
  },
  sick: {
    title: 'מחשבון דמי מחלה',
    html: () => field('day', 'שכר ליום עבודה רגיל (₪)', 'value="300"', 'למשל 8.6 שעות × השכר לשעה') + field('days', 'ימי מחלה ברצף', 'value="3"', 'ימי עבודה שהחמצת, עם אישור מחלה'),
    calc: v => {
      const d = Math.max(0, Math.floor(v('days'))), pay = v('day'), half = Math.max(0, Math.min(d, 3) - 1), full = Math.max(0, d - 3);
      const total = half * pay * .5 + full * pay;
      return rows([[d ? 'בלי תשלום' : '', ils(0), 'היום הראשון'], half && [`${half} × ${ils(pay * .5)}`, ils(half * pay * .5), 'היום השני והשלישי, 50%'], full && [`${full} × ${ils(pay)}`, ils(full * pay), 'מהיום הרביעי, 100%']].filter((r, i) => i || d), ['דמי מחלה', ils(total)]) +
        `<p class="cn">כל עוד יש מספיק ימי מחלה צבורים: 1.5 ימים על כל חודש מלא, עד 90.</p>`;
    },
  },
  severance: {
    title: 'מחשבון פיצויי פיטורים',
    html: () => field('rate', 'השכר האחרון לשעה (₪)', 'value="40"') + field('hours', 'ממוצע שעות בחודש', 'value="120"', 'בשנה האחרונה') + field('years', 'שנות עבודה', 'value="2.5"', 'אפשר עם חלקי שנה, למשל 2.5'),
    calc: v => {
      const month = v('rate') * v('hours'), y = v('years');
      if (y < 1) return `<p class="cn">פיצויי פיטורים מגיעים אחרי שנת עבודה רצופה אחת לפחות.</p>`;
      return rows([[`${ils(v('rate'))} × ${v('hours')} שעות`, ils(month, 0), 'שכר חודשי קובע'], [`${ils(month, 0)} × ${y}`, ils(month * y, 0), 'שנות עבודה']], ['פיצויים', ils(month * y, 0)]) +
        `<p class="cn">אם המעסיק הפריש 6% לפיצויים בקרן הפנסיה לפי סעיף 14, הכסף הזה מחליף חלק מהסכום, והוא כבר בקרן שלך.</p>`;
    },
  },
  pension: {
    title: 'מחשבון הפרשות לפנסיה',
    html: () => field('gross', 'שכר חודשי בלי שעות נוספות (₪)', 'value="6000"'),
    calc: v => {
      const base = Math.min(v('gross'), AVG_WAGE), capped = v('gross') > AVG_WAGE;
      return rows([[`6% × ${ils(base, 0)}`, ils(base * .06, 0), 'ממך, יורד מהשכר'], [`6.5% × ${ils(base, 0)}`, ils(base * .065, 0), 'מהמעסיק, תגמולים'], [`6% × ${ils(base, 0)}`, ils(base * .06, 0), 'מהמעסיק, פיצויים']], ['נכנס לקרן כל חודש', ils(base * .185, 0)]) +
        (capped ? `<p class="cn">החובה היא עד השכר הממוצע במשק, ${ils(AVG_WAGE, 0)}. מעבר לזה לפי ההסכם שלך.</p>` : `<p class="cn">על כל שקל שיורד ממך, המעסיק מוסיף יותר משני שקלים.</p>`);
    },
  },
  payslip: {
    title: 'בדיקת תלוש שכר',
    html: () => field('rate', 'שכר לשעה (₪)', 'value="40"') + field('reg', 'שעות רגילות', 'value="140"', 'כולל שעות רגילות בשבת') +
      field('o125', 'שעות נוספות 125%', 'value="6"') + field('o150', 'שעות נוספות 150%', 'value="0"') +
      field('shab', 'שעות שבת וחג', 'value="8"', 'שעות שבתוך שבת או חג. התוספת של 50% עליהן') + field('travel', 'דמי נסיעות בחודש (₪)', 'value="0"') +
      field('slip', 'ברוטו בתלוש (₪)', 'value=""', 'השורה "סך הכל ברוטו" או "סך התשלומים"'),
    calc: v => {
      const r = v('rate'), base = v('reg') * r, a = v('o125') * r * 1.25, b = v('o150') * r * 1.5, sh = v('shab') * r * .5, tr = v('travel');
      const exp = base + a + b + sh + tr, slip = v('slip'), diff = slip - exp;
      const table = rows([[`${v('reg')} × ${ils(r)}`, ils(base), 'שעות רגילות'], a && [`${v('o125')} × ${ils(r * 1.25)}`, ils(a), 'נוספות 125%'], b && [`${v('o150')} × ${ils(r * 1.5)}`, ils(b), 'נוספות 150%'],
        sh && [`${v('shab')} × ${ils(r * .5)}`, ils(sh), 'תוספת שבת וחג 50%'], tr && ['', ils(tr), 'נסיעות']], ['ברוטו לפי השעות שלך', ils(exp)]);
      if (!slip) return table + `<p class="cn">אפשר להזין את הברוטו מהתלוש ולראות אם הוא מתאים.</p>`;
      if (Math.abs(diff) < Math.max(5, exp * .005)) return table + `<p class="cok">הברוטו בתלוש מתאים לשעות שלך.</p>`;
      return table + (diff > 0
        ? `<p class="cok">בתלוש ${ils(diff)} יותר. ייתכן שיש בו רכיבים שלא הזנת כאן, כמו הבראה, בונוס או תוספת ותק.</p>`
        : `<p class="cbad">בתלוש ${ils(-diff)} פחות מהחישוב.</p><p class="cn">זה לא אומר שמישהו טעה בכוונה: אולי שעות נרשמו אחרת, הפסקה נוכתה, או שחלק ישולם בחודש הבא. כדאי להשוות את השעות בתלוש לרישום שלך ולשאול את מי שמכין את התלוש.</p>`);
    },
  },
};

for (const el of document.querySelectorAll('[data-calc]')) {
  const c = CALCS[el.dataset.calc]; if (!c) continue;
  el.innerHTML = `<h2>${c.title}</h2><div class="cin">${c.html()}</div><div class="cout" aria-live="polite"></div>`;
  wire(el, c.calc);
}
