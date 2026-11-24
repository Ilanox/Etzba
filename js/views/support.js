// Supporting the app: the amounts, buying through Google Play, and restoring past support.
import { $, $$ } from '../util.js';
import { I } from '../svg-icons.js';
import { buzz, closeSheet, toast, openSheet } from '../ui.js';
import * as native from '../native-bridge.js';
import { S } from '../state.js';
import { persist, view, render } from '../nav.js';
import { applyTheme, isSup } from '../theme.js';
import { report } from '../app.js';
import * as dbg from '../diagnostics.js';
import { renderSet } from './settings.js';

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
