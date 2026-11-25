// The developer dashboard (Settings → לוח בקרה, developer mode only): is the website healthy, did the tests pass,
// and is this phone up to date. Everything comes from js/dev-status.js.
import { loadStatus, lastStatus, plain, LINKS } from '../dev-status.js';
import { openSheet, sheetOpen, toast, buzz } from '../ui.js';
import { I } from '../svg-icons.js';
import { $, esc } from '../util.js';
import * as native from '../native-bridge.js';
import { openDeviceCheck, lastRunLine } from './device-check.js';

/* translations: skip-start (developer tools stay in Hebrew) */
const COLOR = { ok: 'var(--up)', busy: 'var(--accent)', warn: 'var(--gold)', bad: 'var(--down)', unknown: 'var(--ink3)' };

/** A coloured dot for a level; used here and next to the Settings row. */
export const statusDot = level => `<i class="db-dot${level === 'busy' ? ' busy' : ''}" style="background:${COLOR[level] || COLOR.unknown}"></i>`;

const ago = t => {
  if (!t) return '';
  const m = Math.round((Date.now() - new Date(t)) / 6e4);
  return m < 1 ? 'עכשיו' : m < 60 ? `לפני ${m} דק׳` : m < 1440 ? `לפני ${Math.round(m / 60)} שע׳` : `לפני ${Math.round(m / 1440)} ימים`;
};
const mark = ok => ok == null ? `<span class="db-q">?</span>` : ok ? `<span class="db-ok">${I.check}</span>` : `<span class="db-bad">${I.x}</span>`;
const row = (label, value, ok, sub = '') => `<div class="cell db-row">${mark(ok)}<span class="grow">${label}${sub ? `<div class="sub">${sub}</div>` : ''}</span><span class="val num">${value}</span></div>`;
const link = (id, label) => `<button class="cell" data-go="${id}"><span class="grow">${label}</span><span class="chev">${I.chevL}</span></button>`;

function html(s) {
  if (!s) return `<div class="card pad db-hero">${statusDot('unknown')}<div><b>בודק…</b></div></div>`;
  const t = s.live?.tests || {}, done = s.lastDone, p = s.phone || {}, l = s.live?.data;
  const job = name => (done?.jobs || []).find(j => j.name === name);
  const jobOk = name => { const j = job(name); return !j || j.conclusion === 'skipped' ? null : j.conclusion === 'success'; };   // skipped: neither good nor bad
  const count = x => x?.pass == null ? '—' : `${x.pass}${x.fail ? ` · ${x.fail} נכשלו` : ''}`;
  const lastFailed = done?.conclusion === 'failure';

  return `
  <div class="card pad db-hero lvl-${s.level}">
    ${statusDot(s.level)}
    <div class="grow"><b>${esc(s.headline)}</b>${s.detail ? `<div class="sub">${esc(s.detail)}</div>` : ''}</div>
  </div>
  ${s.latest ? `<p class="hint db-commit"><bdi>${esc(s.latest.message)}</bdi> · <span class="num">${s.latest.commit}</span> · ${ago(s.latest.at)}</p>` : ''}

  <div class="sec"><span>האתר</span></div>
  <div class="card">
    ${row('הגרסה באוויר', s.live ? `<span class="num">${esc(s.live.commit)}</span>` : '—', s.live ? true : null, s.live ? `עלתה ${ago(s.live.deployed)}` : 'לא הצלחתי לקרוא את האתר')}
    ${row('בדיקות לפני פרסום', job('test') ? (jobOk('test') ? 'עברו' : plain(job('test').step?.name || 'נכשלו')) : '—', jobOk('test'))}
    ${row('פרסום', job('deploy') ? (jobOk('deploy') ? 'הצליח' : job('deploy').conclusion === 'skipped' ? 'לא רץ: הבדיקות נכשלו' : 'נכשל') : '—', jobOk('deploy'))}
    ${row('בדיקה באתר החי', job('live-check') ? (jobOk('live-check') ? 'כל הדפים נפתחים' : job('live-check').conclusion === 'skipped' ? 'לא רצה' : 'משהו לא נפתח') : '—', jobOk('live-check'), 'הבית, האפליקציה, 7 המדריכים, הפרטיות והנתונים')}
  </div>
  ${lastFailed ? `<button class="btn soft db-wide" data-go="run">לראות מה נכשל ב־GitHub</button>` : ''}

  <div class="sec"><span>בדיקות של הגרסה שבאוויר</span></div>
  <div class="card">
    ${row('בדיקות יחידה', count(t.unit), t.unit?.pass == null ? null : !t.unit.fail, 'חישובי שכר, נטו, תרגום, נתונים')}
    ${row('בדיקות דפדפן', count(t.browser), t.browser?.pass == null ? null : !t.browser.fail, 'כל המסכים, אנגלית, אנדרואיד')}
    ${row('תרגום לאנגלית', t.translations?.texts == null ? '—' : `${t.translations.texts} טקסטים${t.translations.missing ? ` · ${t.translations.missing} חסרים` : ''}`, t.translations?.texts == null ? null : !t.translations.missing)}
  </div>

  <div class="sec"><span>הטלפון הזה</span></div>
  <div class="card">
    ${row('גרסה', `<span class="num">${esc(p.version || '')}${p.build ? ` (${esc(p.build)})` : ''}</span>`, true, p.native ? 'אפליקציית אנדרואיד' : 'אפליקציית אינטרנט')}
    ${row('נבנתה מ־', `<span class="num">${esc(p.commit || '')}</span>`, p.commit === 'dev' ? null : s.behind == null ? null : s.behind === 0,
      p.commit === 'dev' ? 'מתיקיית הפרויקט' : s.behind > 0 ? `מאחור ב־${s.behind} עדכונים${p.native ? ': צריך לבנות ולהתקין מחדש' : ': לרענן'}` : s.behind === 0 ? 'כמו האתר' : '')}
    ${row('נתוני שכר', `<span class="num">v${p.rules}${l ? ` / v${l.rules}` : ''}</span>`, l ? p.rules >= l.rules : null, 'בטלפון / באתר')}
    ${Object.entries(p.packs || {}).map(([c, v]) => row(`חבילת שפה (${c})`, `<span class="num">v${v}${l?.packs?.[c] ? ` / v${l.packs[c]}` : ''}</span>`, l?.packs?.[c] ? v >= l.packs[c] : null)).join('')}
    ${!p.native && p.cache ? row('מטמון לא מקוון', `<span class="num">${esc(p.cache.replace('etzba-', ''))}</span>`, s.live ? p.cache === 'etzba-' + s.live.commit : null) : ''}
  </div>

  <div class="sec"><span>בדיקות במכשיר</span></div>
  <div class="card">${(d => `<button class="cell" data-go="device"><span>${statusDot(d.level)}</span><span class="grow">להריץ את הבדיקות בטלפון<div class="sub">${esc(d.text)}</div></span><span class="chev">${I.chevL}</span></button>`)(lastRunLine())}</div>

  <div class="sec"><span>קישורים</span></div>
  <div class="card">${link('actions', 'כל הפרסומים ב־GitHub')}${link('commits', 'השינויים האחרונים')}${link('console', 'Search Console')}${link('site', 'האתר')}</div>
  ${s.errors?.length ? `<p class="hint">לא הצלחתי לבדוק: ${esc(s.errors.join(' · '))}</p>` : ''}
  <p class="hint db-commit">נבדק ${ago(s.at)}. כש־GitHub מגביל את מספר הבקשות, מספיק לחכות כמה דקות.</p>`;
}

export function openDashboard() {
  let timer = null;
  openSheet(`<div data-keep><div class="db-head"><h2>לוח בקרה</h2><button class="iconbtn" id="db-refresh" aria-label="לבדוק שוב">${I.refresh}</button></div>
    <div id="db-body">${html(lastStatus())}</div></div>`, root => {
    const body = $('#db-body', root);
    const show = async force => {
      const s = await loadStatus({ force });
      if (!sheetOpen() || !body.isConnected) return clearTimeout(timer);
      body.innerHTML = html(s);
      body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
        if (b.dataset.go === 'device') return openDeviceCheck();
        const url = b.dataset.go === 'run' ? s.lastDone?.url : LINKS[b.dataset.go];
        if (url) native.NATIVE ? window.open(url, '_system') : window.open(url, '_blank', 'noopener');
      });
      clearTimeout(timer);
      if (s.level === 'busy') timer = setTimeout(() => show(true), 15000);   // follow a running deploy
      return s;
    };
    $('#db-refresh', root).onclick = async () => { buzz(10); const s = await show(true); toast(s.headline, s.level === 'bad' ? 'err' : 'ok'); };
    show(false);
  });
}
/* translations: skip-end */
