// Small pay calculators for the guide pages. The net one uses the app's own engine.
import { grossToNet, taxFor } from '/app/js/net-pay.js';

const MIN_HOURLY = 35.40, YOUTH = { 15: .70, 16: .75, 17: .83 }, TRAVEL_MAX = 22.60;
const ils = (x, d = 2) => '₪' + (+x || 0).toLocaleString('he-IL', { minimumFractionDigits: d, maximumFractionDigits: d });
const hrs = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const youthMin = p => Math.round(MIN_HOURLY * 182.03 * p / 173 * 100) / 100;

const field = (id, label, attrs = '', hint = '') => `<label class="cf"><span>${label}</span><input id="${id}" class="ci" inputmode="decimal" ${attrs}>${hint ? `<small>${hint}</small>` : ''}</label>`;
const seg = (id, opts, on) => `<div class="cs" id="${id}" role="group">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${String(v) === String(on) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
const rows = (list, total) => `<table class="ct"><tbody>${list.filter(r => r).map(([a, b, c]) => `<tr><td>${c ? `${c}<small>${a}</small>` : a}</td><td>${b}</td></tr>`).join('')}${total ? `<tr class="tot"><th>${total[0]}</th><th>${total[1]}</th></tr>` : ''}</tbody></table>`;

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
        (a ? `<p class="cn">בלי שעות נוספות: ${ils(h * rate)}. ההפרש: ${ils(total - h * rate)}.</p>` : `<p class="cn">עד ${hrs(lim)} שעות אין שעות נוספות במשמרת כזו.</p>`);
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
        `<p class="cn">אותן שעות ביום חול: ${ils(Math.min(h, lim) * rate + a * rate * 1.25 + b * rate * 1.5)}.</p>`;
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
};

for (const el of document.querySelectorAll('[data-calc]')) {
  const c = CALCS[el.dataset.calc]; if (!c) continue;
  el.innerHTML = `<h2>${c.title}</h2><div class="cin">${c.html()}</div><div class="cout" aria-live="polite"></div>`;
  wire(el, c.calc);
}
