// The on-device tests screen (from the developer dashboard): runs js/device-tests.js with live progress,
// shows each result, and shares the report as a text file to send.
import { runDeviceTests, restartTest, lastRun, reportText, count, testCount } from '../device-tests.js';
import { openSheet, sheetOpen, toast, buzz } from '../ui.js';
import { deliver, copyText } from '../files.js';
import { I } from '../svg-icons.js';
import { $, esc } from '../util.js';

/* translations: skip-start (developer only) */
const AREAS = { app: 'האפליקציה', data: 'שמירת נתונים', math: 'חישובים בטלפון הזה', notify: 'התראות', widget: 'ווידג׳ט', play: 'Google Play', net: 'הורדות מהאתר' };
const mark = s => s === 'pass' ? `<span class="db-ok">${I.check}</span>` : s === 'fail' ? `<span class="db-bad">${I.x}</span>` : s === 'run' ? `<span class="db-q">…</span>` : `<span class="db-q">–</span>`;

/** One line for the dashboard: how the last run went. */
export function lastRunLine() {
  const r = lastRun(); if (!r) return { text: 'עוד לא הורצו בטלפון הזה', level: 'unknown' };
  const c = count(r), when = new Date(r.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  return { text: `${c.pass} עברו${c.fail ? ` · ${c.fail} נכשלו` : ''}${c.skip ? ` · ${c.skip} דולגו` : ''} · ${when}`, level: c.fail ? 'bad' : 'ok' };
}

function list(results, running) {
  const all = [...results, ...(running ? [{ area: '', id: '', name: 'רץ…', status: 'run', note: '' }] : [])];
  let area = '', out = '';
  for (const r of all) {
    if (r.area && r.area !== area) { if (area) out += '</div>'; area = r.area; out += `<div class="sec"><span>${AREAS[area] || area}</span></div><div class="card">`; }
    out += `<div class="cell db-row">${mark(r.status)}<span class="grow">${esc(r.name)}${r.note ? `<div class="sub${r.status === 'fail' ? ' db-fail' : ''}">${esc(r.note)}</div>` : ''}</span>${r.ms != null && r.status !== 'run' ? `<span class="val num">${r.ms}ms</span>` : ''}</div>`;
  }
  return out + (area ? '</div>' : '');
}

export function openDeviceCheck({ run = true } = {}) {
  let last = lastRun();
  openSheet(`<div data-keep><h2>בדיקות במכשיר</h2><p class="shsub">${testCount} בדיקות שרק הטלפון יכול להריץ: תוספי אנדרואיד, התראות, קבצים, Google Play, הווידג׳ט, וחישובים מול התשובות מהמחשב. לא משנות כלום.</p>
    <div class="card pad db-hero" id="dc-head"></div>
    <div id="dc-list"></div>
    <div class="db-actions">
      <button class="btn" id="dc-share">${I.share} לשלוח את הדוח</button>
      <button class="btn soft" id="dc-copy">${I.copy} להעתיק</button>
    </div>
    <button class="btn soft db-wide" id="dc-again">להריץ שוב</button>
    <button class="btn soft db-wide" id="dc-restart">בדיקה אחרי הפעלה מחדש<div class="sub">שומר, מפעיל מחדש ובודק שכלום לא אבד</div></button></div>`, root => {
    const head = $('#dc-head', root), body = $('#dc-list', root);
    const show = (r, running) => {
      const c = count(r || { results: [] });
      head.className = `card pad db-hero lvl-${running ? 'busy' : !r ? 'unknown' : c.fail ? 'bad' : 'ok'}`;
      head.innerHTML = running ? `<b>רץ… ${r.results.length}/${testCount}</b>`
        : r ? `<div class="grow"><b>${c.fail ? `${c.fail} נכשלו` : 'הכול עבר'}</b><div class="sub">${c.pass} עברו · ${c.skip} דולגו · ${(r.took / 1000).toFixed(1)} שנ׳</div></div>` : '<b>עוד לא הורצו</b>';
      body.innerHTML = r ? list(r.results, running) : '';
      $('#dc-share', root).disabled = $('#dc-copy', root).disabled = running || !r;
    };
    const go = async () => {
      $('#dc-again', root).disabled = true;
      const r = await runDeviceTests(results => sheetOpen() && show({ results }, true));
      last = r; $('#dc-again', root).disabled = false;
      if (!body.isConnected) return;
      show(r, false); buzz(count(r).fail ? 60 : 20);
    };
    $('#dc-share', root).onclick = () => last && deliver(`etzba-device-tests-${new Date(last.at).toISOString().slice(0, 16).replace(/[T:]/g, '-')}.txt`, reportText(last), 'text/plain');
    $('#dc-copy', root).onclick = () => last && copyText(reportText(last));
    $('#dc-again', root).onclick = go;
    $('#dc-restart', root).onclick = () => { toast('מפעיל מחדש…'); setTimeout(restartTest, 400); };
    show(last, false);
    if (run) go();
  });
}
/* translations: skip-end */
