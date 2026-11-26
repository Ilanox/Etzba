// Etzba Wrapped (the year in stories) and the early-access announcements for it.
import { isSup } from '../theme.js';
import { popOpen, sheetOpen, openPop, closePop, toast, buzz } from '../ui.js';
import { tr } from '../translate.js';
import * as native from '../native-bridge.js';
import { I, mark, ridges } from '../svg-icons.js';
import { $, dateKey, money, tm, dShort, pad, dFull, sameDay, money2, $$ } from '../util.js';
import { S, jobById } from '../state.js';
import { persist } from '../nav.js';
import { PAY, monthCalc, yearVsLast } from '../pay.js';
import { shiftKind, weekStart } from '../pay-engine.js';
import { dlt, countUp } from './common.js';
import { MONTHS, DAYS, EN } from '../lang.js';
import { celebrate } from './celebrate.js';
import { openForMe, EARLY_URL, earlyDate } from '../early.js';
import { deliver } from '../files.js';

const EARLY_NEWS = {
  recap: { title: 'השנה שלך באצבע פתוחה לכולם', supTitle: 'השנה שלך באצבע כאן, לפני כולם', body: 'סיכום השנה שלך כמו סטורי, עם תמונה לשיתוף.', btn: 'לסיכום השנה', go: () => openRecap(RECAP_YEAR) },
};

export function announceEarly() {
  let locked; try { locked = new Set(JSON.parse(localStorage.getItem('etzba.early.locked') || '[]')); } catch { locked = new Set(); }
  let news = null;
  const who = isSup() ? 'supporters' : 'all', newsFor = n => ({ ...EARLY_NEWS[n], title: isSup() ? EARLY_NEWS[n].supTitle : EARLY_NEWS[n].title });
  for (const name of Object.keys(EARLY_NEWS)) {
    if (!openForMe(name)) locked.add(name);
    else if (locked.has(name) && !news && !popOpen() && !sheetOpen()) { locked.delete(name); news = newsFor(name); }
  }
  try { localStorage.setItem('etzba.early.locked', JSON.stringify([...locked])); } catch {}
  const watch = [...locked].filter(n => EARLY_NEWS[n]).map(n => ({ name: n, group: who, title: tr(newsFor(n).title), body: tr(newsFor(n).body) })), wsig = JSON.stringify(watch);
  if (wsig !== announceEarly.watched) { announceEarly.watched = wsig; native.watchEarly(EARLY_URL, watch); }
  if (!news) return;
  const pop = openPop(`<div class="pop-ic">${I.cal}</div>
    <h2 id="pop-h">${news.title}</h2>
    <p class="pop-sub">${news.body}</p>
    <div class="pop-btns">
      <button class="btn primary" id="en-go">${news.btn}</button>
      <button class="btn ghost" id="en-later">אחר כך</button>
    </div>`);
  $('#en-go', pop).onclick = () => { closePop(); news.go(); };
  $('#en-later', pop).onclick = closePop;
}

export const recapOpen = () => openForMe('recap');

export const RECAP_YEAR = 2026;

export function recapBanner() {
  const el = $('#rcBanner'); if (!el) return;
  const now = new Date(), y = RECAP_YEAR;
  const d = (isSup() && earlyDate('recap', 'supporters')) || earlyDate('recap'), justOpened = d && d < '2090' && (now - new Date(d + 'T00:00:00')) / 864e5 < 60 && recapOpen();
  // November to March: people who join in the new year still get last year's story
  const show = recapOpen() && (now.getMonth() >= 10 || now.getMonth() <= 2 || justOpened) && S.ui?.rcBanner !== y
    && S.shifts.some(s => new Date(s.start).getFullYear() === y);
  if (!show) { el.hidden = true; el.innerHTML = ''; return; }
  if (el.dataset.y === String(y) && !el.hidden) return;
  el.dataset.y = y; el.hidden = false;
  el.innerHTML = `<button class="rcb-go" type="button"><span class="rcb-ic">${mark({ ink: '#fff', accent: '#FFD9C7' })}</span><span class="grow"><b>השנה שלך באצבע כאן</b><small>${y} כמו סטורי, עם תמונה לשיתוף</small></span>${I.chevL}</button>
    <button class="rcb-x" type="button" aria-label="סגירה">${I.x}</button>`;
  const seen = () => { S.ui = { ...(S.ui || {}), rcBanner: y }; persist(); el.hidden = true; };
  $('.rcb-go', el).onclick = () => { seen(); openRecap(y); };
  $('.rcb-x', el).onclick = seen;
}

function recapStats(y) {
  const list = S.shifts.filter(s => new Date(s.start).getFullYear() === y).map(s => ({ s, p: PAY.get(s.id) })).filter(x => x.p);
  if (!list.length) return null;
  const Ms = Array.from({ length: 12 }, (_, m) => monthCalc(y, m));
  const gross = Ms.reduce((a, M) => a + M.gross, 0), net = Ms.reduce((a, M) => a + (M.gross ? M.net.net : 0), 0);
  const hours = list.reduce((a, x) => a + x.p.hours, 0);
  const longest = list.reduce((a, x) => x.p.hours > a.p.hours ? x : a);
  const best = Ms.reduce((a, M) => M.gross > a.gross ? M : a, Ms[0]);
  const kinds = {}; for (const x of list) { const k = shiftKind(x.s, x.p); kinds[k] = (kinds[k] || 0) + 1; }
  const day = [0, 0, 0, 0, 0, 0, 0]; for (const x of list) day[new Date(x.s.start).getDay()]++;
  const topDay = day.indexOf(Math.max(...day));
  const daily = ['morning', 'noon', 'evening', 'night'].sort((a, b) => (kinds[b] || 0) - (kinds[a] || 0))[0];
  const rest = list.filter(x => x.p.restHours > 0.01);
  const ot = list.reduce((a, x) => a + x.p.otHours, 0);
  const tips = list.reduce((a, x) => a + (x.p.tips || 0), 0);
  const first = list.reduce((a, x) => new Date(x.s.start) < new Date(a.s.start) ? x : a);
  const jobs = {}; for (const x of list) jobs[x.s.jobId] = (jobs[x.s.jobId] || 0) + x.p.hours;
  const topJob = jobById(Object.entries(jobs).sort((a, b) => b[1] - a[1])[0][0]);
  const dayKeys = [...new Set(list.map(x => dateKey(new Date(x.s.start))))].sort();
  let streak = 1, runN = 1, streakEnd = dayKeys[0];
  for (let k = 1; k < dayKeys.length; k++) {
    const gap = Math.round((new Date(dayKeys[k] + 'T12:00:00') - new Date(dayKeys[k - 1] + 'T12:00:00')) / 864e5);
    runN = gap === 1 ? runN + 1 : 1; if (runN > streak) { streak = runN; streakEnd = dayKeys[k]; }
  }
  const monthRank = Ms.map((M, m) => ({ m, g: M.gross, n: M.shifts.length })).filter(x => x.g > 0).sort((a, b) => b.g - a.g).slice(0, 5);
  const dayRank = day.map((n, d) => ({ d, n })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
  const hourH = Array(24).fill(0);
  for (const x of list) {
    let t = +new Date(x.s.start); const e = +new Date(x.s.end);
    while (t < e) { const d = new Date(t), nx = Math.min(e, +new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1)); hourH[d.getHours()] += (nx - t) / 36e5; t = nx > t ? nx : t + 36e5; }
  }
  const peak = hourH.indexOf(Math.max(...hourH));
  const bestShift = list.reduce((a, x) => x.p.pay > a.p.pay ? x : a);
  const weeks = {}; for (const x of list) { const k = +weekStart(new Date(x.s.start)); weeks[k] = (weeks[k] || 0) + x.p.hours; }
  const [bwK, bwH] = Object.entries(weeks).sort((a, b) => b[1] - a[1])[0];
  const lateKey = x => { const e = new Date(x.s.end), m = e.getHours() * 60 + e.getMinutes(); return m < 6 * 60 ? m + 1440 : m; };
  const latest = list.reduce((a, x) => lateKey(x) > lateKey(a) ? x : a);
  const last = list.reduce((a, x) => new Date(x.s.start) > new Date(a.s.start) ? x : a);
  return { y, count: list.length, hours, gross, net, longest, best, kinds, topDay, daily, rest: rest.length, restHours: rest.reduce((a, x) => a + x.p.restHours, 0),
    ot, tips, first, last, topJob, months: Ms.map(M => M.gross), perHour: hours ? gross / hours : 0,
    vs: (() => { const v = yearVsLast(y); return v.b.g ? v : null; })(),
    workDays: dayKeys.length, dayKeys, streak, streakEnd, monthRank, dayRank, hourH, peak, bestShift, bestWeek: { start: +bwK, hours: bwH }, latest };
}

export const hrs = h => { const r = Math.round(h * 2) / 2; return (r % 1 ? r.toFixed(1) : String(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

const RECAP_PAL = [
  { bg: '#24102F', fg: '#FFF4EC', ac: '#FF6A3D' },
  { bg: '#FF6A3D', fg: '#2A0E06', ac: '#FFD9C7', light: 1 },
  { bg: '#0D3634', fg: '#EFFFF8', ac: '#62E0B6' },
  { bg: '#FFC64A', fg: '#2E1A02', ac: '#FF8A2B', light: 1 },
  { bg: '#101A3A', fg: '#EEF3FF', ac: '#7FA6FF' },
  { bg: '#F2557F', fg: '#2B0716', ac: '#FFD1DF', light: 1 },
  { bg: '#1A1A1A', fg: '#FFFFFF', ac: '#FF6A3D' },
  { bg: '#24102F', fg: '#FFF4EC', ac: '#FF6A3D' },
];

const RC_POS = [[50, 50, 1.25, 0], [88, 18, 1.1, 18], [10, 85, 1.3, -24], [92, 80, 1.05, 160], [8, 12, 1.2, 200], [80, 50, 1.4, -70], [20, 40, 1.15, 40], [50, 62, 1.35, 0]];

const rcPrint = () => `<svg class="rc-print" viewBox="-2 -2 104 112" aria-hidden="true">${ridges(50, 54, 9, 5.6, 4).map(d => `<path d="${d}"/>`).join('')}</svg>`;

const KIND_LINE = { morning: ['טיפוס של בוקר', 'רוב המשמרות שלך התחילו לפני 11 בבוקר.'], noon: ['טיפוס של צהריים', 'רוב המשמרות שלך התחילו באמצע היום.'],
  evening: ['טיפוס של ערב', 'רוב המשמרות שלך התחילו אחרי הצהריים.'], night: ['ינשוף לילה', 'רוב המשמרות שלך היו בלילה.'] };

const KIND_SHORT = { morning: 'בוקר', noon: 'צהריים', evening: 'ערב', night: 'לילה' };

const RC_MS = 6500;

export function openRecap(y) {
  const R = recapStats(y);
  if (!R) return toast(`אין משמרות ב־${y}`);
  const days = Math.floor(R.hours / 24), maxM = Math.max(...R.months, 1);
  const cnt = (v, f = 'int') => `<b class="num rc-count" data-to="${v}" data-f="${f}">${f === 'money' ? money(v) : f === 'hrs' ? hrs(v) : Math.round(v).toLocaleString('he-IL')}</b>`;
  const ls = new Date(R.longest.s.start), le = new Date(R.longest.s.end), h0 = ls.getHours() + ls.getMinutes() / 60, len = Math.min(23.9, R.longest.p.hours);
  const line = `<div class="rc-dial"><svg viewBox="0 0 200 200" aria-hidden="true">
      <circle class="tr" cx="100" cy="100" r="78" />
      ${Array.from({ length: 24 }, (_, k) => { const a = k / 24 * 2 * Math.PI, r0 = k % 6 ? 92 : 89; return `<line x1="${100 + Math.sin(a) * r0}" y1="${100 - Math.cos(a) * r0}" x2="${100 + Math.sin(a) * 96}" y2="${100 - Math.cos(a) * 96}"${k % 6 ? '' : ' class="big"'}/>`; }).join('')}
      <circle class="arc" cx="100" cy="100" r="78" pathLength="24" style="--len:${len};transform:rotate(${h0 * 15 - 90}deg)" />
    </svg><div class="rc-dial-in num" dir="ltr"><b>${tm(ls)}</b><i></i><b>${tm(le)}</b></div></div>`;
  const kindsTot = Object.values(R.kinds).reduce((a, b) => a + b, 0) || 1;
  const rank = (rows, max) => `<ol class="rc-rank">${rows.map((r, k) => `<li class="${k === 0 ? 'top' : ''}" style="--d:${(rows.length - 1 - k) * 380 + 250}ms;--w:${Math.max(8, r.v / max * 100)}%"><span class="rk num">${k + 1}</span><span class="nm">${r.name}</span><b class="num">${r.val}</b><i></i></li>`).join('')}</ol>`;
  // the streak, as the days around it
  const sEnd = new Date(R.streakEnd + 'T12:00:00'), worked = new Set(R.dayKeys), dots = [];
  const sStart = dateKey(new Date(+sEnd - (R.streak - 1) * 864e5)), winEnd = new Date(+sEnd + (R.streak < 26 ? 2 : 0) * 864e5);
  for (let k = 27; k >= 0; k--) {
    const key = dateKey(new Date(+winEnd - k * 864e5)), run = key >= sStart && key <= R.streakEnd;
    dots.push(`<i class="${worked.has(key) ? 'on' : ''}${run ? ' run' : ''}" style="--d:${(27 - k) * 35}ms"></i>`);
  }
  const maxH = Math.max(...R.hourH, 1);
  const latestEnd = new Date(R.latest.s.end), bw = new Date(R.bestWeek.start), bwEnd = new Date(+bw + 6 * 864e5);
  const slides = [
    { html: `<small>השנה שלך באצבע</small><h1 class="num rc-year">${y}</h1><p>שנה שלמה של משמרות, במספרים. מוכנים?</p>` },
    { html: `<small>שעות עבודה</small><h1>${cnt(R.hours)}</h1>${R.vs ? `<p class="rc-dlt">${dlt(R.vs.a.h, R.vs.b.h, `לעומת ${y - 1}`)} לעומת ${y - 1}</p>` : ''}<p>${days ? `<span>יותר מ־${days} ימים שלמים בלי הפסקה.</span> ` : ''}<span>${R.count} משמרות ב־${R.workDays} ימי עבודה.</span></p>` },
    { html: `<small>הרצף הכי ארוך</small><h1>${cnt(R.streak)}<em>ימים ברצף</em></h1><div class="rc-streak">${dots.join('')}</div><p>${R.streak > 1 ? `בלי יום חופש אחד, עד ${dShort(sEnd)}.` : 'אף פעם לא יותר מיום אחד ברצף. איזון יפה.'}</p>` },
    { ms: 9000, html: `<small>החודשים שלך, לפי ברוטו</small>${rank(R.monthRank.map(r => ({ name: MONTHS[r.m], val: money(r.g), v: r.g })), R.monthRank[0]?.g || 1)}<p>${MONTHS[R.best.m]} במקום הראשון, ב־${R.monthRank[0]?.n || 0} משמרות.</p>` },
    { ms: 8000, html: `<small>הימים שלך</small>${rank(R.dayRank.map(r => ({ name: DAYS[r.d], val: `${r.n} משמרות`, v: r.n })), R.dayRank[0]?.n || 1)}<p>${DAYS[R.topDay]} הוא היום שלך.</p>` },
    { html: `<small>השעה שלך</small><h1 class="num">${pad(R.peak)}:00</h1><div class="rc-heat" dir="ltr">${R.hourH.map((h, k) => `<i class="${k === R.peak ? 'on' : ''}" style="--h:${Math.max(2, h / maxH * 100)}%;--d:${k * 30}ms"></i>`).join('')}<span style="left:0">00</span><span style="left:25%">06</span><span style="left:50%">12</span><span style="left:75%">18</span></div><p>בשעה הזאת היית בעבודה יותר מכל שעה אחרת ביום: ${hrs(R.hourH[R.peak])} שעות בשנה.</p>` },
    { html: `<small>המשמרת הכי ארוכה</small><h1>${cnt(R.longest.p.hours, 'hrs')}<em>שעות</em></h1><div class="rc-dial-row">${line}<p>${DAYS[ls.getDay()]}<br>${dFull(R.longest.s.start)}${sameDay(R.longest.s.start, R.longest.s.end) ? '' : '<br><span class="rc-dim">עד למחרת</span>'}</p></div>` },
    { ms: 8000, html: `<small>השיאים שלך</small><div class="rc-facts rc-rec">
        <div style="--d:200ms"><span>המשמרת הכי משתלמת</span><b class="num">${money(R.bestShift.p.pay)}</b><em>${dShort(R.bestShift.s.start)}</em></div>
        <div style="--d:650ms"><span>השבוע הכי עמוס</span><b class="num">${hrs(R.bestWeek.hours)} ש׳</b><em class="num" dir="ltr">${dShort(bw)}–${dShort(bwEnd)}</em></div>
        <div style="--d:1100ms"><span>הכי מאוחר שסיימת</span><b class="num" dir="ltr">${tm(latestEnd)}</b><em>${dShort(R.latest.s.start)}</em></div></div>` },
    { html: `<small>הרווחת השנה</small><h1>${cnt(R.gross, 'money')}</h1>${R.vs ? `<p class="rc-dlt">${dlt(R.vs.a.g, R.vs.b.g, `לעומת ${y - 1}`)} לעומת ${y - 1}</p>` : ''}<p>ברוטו, כ־${money(R.net)} נטו. בממוצע ${money2(R.perHour)} לשעה.</p>` },
    { html: `<small>הסגנון שלך</small><h1 class="rc-word">${KIND_LINE[R.daily][0]}</h1><p>${KIND_LINE[R.daily][1]}</p>
      <div class="rc-kinds">${['morning', 'noon', 'evening', 'night'].map((k, j) => `<div${k === R.daily ? ' class="on"' : ''}><i style="--w:${(R.kinds[k] || 0) / kindsTot * 100}%;--d:${j * 90}ms"></i><span>${KIND_SHORT[k]}</span><b class="num">${Math.round((R.kinds[k] || 0) / kindsTot * 100)}%</b></div>`).join('')}</div>` },
    { html: `<small>מעבר לשגרה</small><h1>${cnt(R.ot, 'hrs')}<em>שעות נוספות</em></h1><div class="rc-facts">${R.rest ? `<div><b class="num">${R.rest}</b><span>משמרות בשבת או בחג</span></div>` : ''}${R.tips ? `<div><b class="num">${money(R.tips)}</b><span>טיפים</span></div>` : ''}<div><b class="num">${money2(R.perHour)}</b><span>ממוצע לשעה</span></div></div>` },
    { html: `<small>מההתחלה עד עכשיו</small><div class="rc-facts rc-rec">
        <div style="--d:200ms"><span>המשמרת הראשונה של השנה</span><b class="num">${dShort(R.first.s.start)}</b><em class="num" dir="ltr">${tm(R.first.s.start)}</em></div>
        <div style="--d:650ms"><span>והאחרונה עד עכשיו</span><b class="num">${dShort(R.last.s.start)}</b><em class="num" dir="ltr">${tm(R.last.s.start)}</em></div></div><p>ובאמצע: ${R.count} משמרות. כל הכבוד.</p>` },
    { html: `<small>הסיכום של ${y}</small><div class="rc-grid">
      <div><b class="num">${Math.round(R.hours).toLocaleString('he-IL')}</b><span>שעות</span></div><div><b class="num">${R.count}</b><span>משמרות</span></div>
      <div><b class="num">${money(R.gross)}</b><span>ברוטו</span></div><div><b>${MONTHS[R.best.m]}</b><span>החודש הכי חזק</span></div>
      <div><b class="num">${R.streak}</b><span>ימים ברצף</span></div><div><b class="num">${pad(R.peak)}:00</b><span>השעה שלך</span></div></div>
      <button class="rc-share" id="rc-share">${I.share}שיתוף</button>` },
  ];
  const ov = document.createElement('div'); ov.className = 'recap'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'השנה שלך באצבע');
  ov.innerHTML = `${rcPrint()}<div class="rc-prog">${slides.map(x => `<i style="--ms:${x.ms || RC_MS}ms"><b></b></i>`).join('')}</div><button class="rc-x" aria-label="סגירה">${I.x}</button><div class="rc-slide" aria-live="polite"></div>
    <div class="rc-hint">${EN ? 'Tap the right side for next' : 'הקשה בצד שמאל להמשך'}</div>`;
  document.body.appendChild(ov);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, timer, left = RC_MS, began = 0, held = false, pressAt = 0;
  const run = ms => { clearTimeout(timer); began = Date.now(); left = ms; if (i < slides.length - 1) timer = setTimeout(() => show(i + 1), ms); };
  const msOf = k => slides[k].ms || RC_MS;
  const countUp = sl => {
    if (still) return;
    $$('.rc-count', sl).forEach(el => {
      const to = +el.dataset.to, f = el.dataset.f, t0 = performance.now(), dur = 1100;
      const fmt = v => f === 'money' ? money(v) : f === 'hrs' ? hrs(v) : Math.round(v).toLocaleString('he-IL');
      const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; el.textContent = fmt(to * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };
  const show = n => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    const c = RECAP_PAL[i % RECAP_PAL.length], [px, py, sc, rot] = RC_POS[i % RC_POS.length];
    for (const [k, v] of Object.entries({ '--rc-bg': c.bg, '--rc-fg': c.fg, '--rc-ac': c.ac, '--px': px + '%', '--py': py + '%', '--sc': sc, '--rot': rot + 'deg',
      '--rc-up': c.light ? '#06582B' : '#3CCB7F', '--rc-down': c.light ? '#8A0C1C' : '#FF6B6B' })) ov.style.setProperty(k, v);
    const sl = $('.rc-slide', ov); sl.innerHTML = slides[i].html; sl.classList.remove('in'); void sl.offsetWidth; sl.classList.add('in');
    $$('.rc-prog i', ov).forEach((p, k) => { p.className = k < i ? 'done' : k === i ? 'now' : ''; });
    ov.classList.remove('paused'); ov.classList.toggle('first', i === 0);
    countUp(sl); run(msOf(i));
    if (i === slides.length - 1 && !still) celebrate('goal');
    $('#rc-share', ov) && ($('#rc-share', ov).onclick = e => { e.stopPropagation(); shareRecap(R); });
  };
  const close = () => { clearTimeout(timer); ov.remove(); };
  $('.rc-x', ov).onclick = e => { e.stopPropagation(); close(); };
  ov.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    pressAt = Date.now(); held = false;
    setTimeout(() => { if (pressAt && Date.now() - pressAt >= 240) { held = true; clearTimeout(timer); left -= Date.now() - began; ov.classList.add('paused'); } }, 250);
  });
  ov.addEventListener('pointerup', e => {
    if (e.target.closest('button') || !pressAt) return;
    pressAt = 0;
    if (held) { held = false; ov.classList.remove('paused'); run(Math.max(400, left)); return; }
    const third = innerWidth / 3, back = EN ? e.clientX < third : e.clientX > innerWidth - third;
    show(i + (back ? -1 : 1)); buzz(5);
  });
  ov.addEventListener('pointercancel', () => { pressAt = 0; if (held) { held = false; ov.classList.remove('paused'); run(Math.max(400, left)); } });
  addEventListener('keydown', function key(e) {
    if (!ov.isConnected) return removeEventListener('keydown', key);
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(i + (EN ? -1 : 1));
    if (e.key === 'ArrowRight') show(i + (EN ? 1 : -1));
  });
  show(0);
}

async function shareRecap(R) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#24102F'; x.fillRect(0, 0, W, H);
  // the fingerprint, large, off to one side
  x.save(); x.translate(W * .78, H * .2); x.scale(13, 13); x.translate(-50, -54);
  x.strokeStyle = 'rgba(255,106,61,.35)'; x.lineWidth = 1.1; x.lineCap = 'round';
  for (const d of ridges(50, 54, 9, 5.6, 4)) x.stroke(new Path2D(d));
  x.restore();
  try { await document.fonts.load('800 80px Heebo'); } catch {}
  x.direction = EN ? 'ltr' : 'rtl'; x.textAlign = EN ? 'left' : 'right';
  const T = t => tr(t), F = (w, s) => `${w} ${s}px Heebo, sans-serif`, X0 = EN ? 90 : W - 90;
  x.fillStyle = '#FF6A3D'; x.font = F(700, 46); x.fillText(T('השנה שלי באצבע'), X0, 300);
  x.fillStyle = '#FFF4EC'; x.font = F(900, 260); x.fillText(String(R.y), X0, 540);
  const rows = [[Math.round(R.hours).toLocaleString('he-IL'), T('שעות')], [String(R.count), T('משמרות')], [money(R.gross), T('ברוטו')],
    [T(MONTHS[R.best.m]), T('החודש הכי חזק')], [`${hrs(R.longest.p.hours)} ${T('ש׳')}`, T('המשמרת הכי ארוכה')], [T(KIND_LINE[R.daily][0]), T('הסגנון')]];
  rows.forEach(([v, l], k) => {
    const y0 = 760 + k * 170;
    x.fillStyle = 'rgba(255,244,236,.14)'; x.fillRect(90, y0 - 112, W - 180, 2);
    x.fillStyle = '#FFF4EC'; x.font = F(800, 84); x.fillText(v, X0, y0);
    x.fillStyle = 'rgba(255,244,236,.7)'; x.font = F(500, 36); x.textAlign = EN ? 'right' : 'left'; x.fillText(l, EN ? W - 90 : 90, y0 - 8); x.textAlign = EN ? 'left' : 'right';
  });
  x.fillStyle = 'rgba(255,244,236,.6)'; x.font = F(500, 34); x.textAlign = 'center'; x.fillText('Etzba · etzba.co.il', W / 2, H - 110);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await deliver(`etzba-${R.y}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png');
}
