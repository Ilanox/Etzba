// Data screens: backup, export to CSV, restoring a backup, importing shifts from a file, and asking the browser to keep the data.
import { S, jobById, place, setState } from '../state.js';
import { openSheet, closeSheet, announce, toast, confirmBtn } from '../ui.js';
import { I } from '../svg-icons.js';
import { $, esc, uid, dFull, hm, nm, money, $$, pad } from '../util.js';
import { rowsToShifts, guessYear } from '../shift-import.js';
import { defaultJob, jobAt, computeAll, normalizeJob } from '../pay-engine.js';
import { showMonth, commit, go, viewY, viewM, persist, view } from '../nav.js';
import * as dbg from '../diagnostics.js';
import { readSheets } from '../file-reader.js';
import { report, VERSION } from '../app.js';
import { monthCalc } from '../pay.js';
import { shiftsCSV, summaryCSV } from '../csv.js';
import { copyText, deliver } from '../files.js';
import { MONTHS } from '../lang.js';
import { renderSet } from './settings.js';
import * as native from '../native-bridge.js';
import { applyTheme } from '../theme.js';

export function openFileImport(f0) {
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

export async function takeSharedFile() {
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

export async function backupNow(how = 'file') {
  const j = JSON.stringify({ app: 'etzba', version: VERSION, exported: new Date().toISOString(), ...S }, null, 1);
  const ok = how === 'copy' ? await copyText(j) : await deliver(`אצבע-גיבוי-${dFull(new Date()).replace(/\//g, '-')}.json`, j, 'application/json');
  if (ok) { S.settings.lastBackup = new Date().toISOString(); persist(); if (view === 'set') renderSet(); updateBackupDot(); }
}

export function backupDue() {
  if (S.shifts.length < 10) return false;
  const last = S.settings.lastBackup ? new Date(S.settings.lastBackup) : null;
  return !last || Date.now() - last > 30 * 864e5;
}

export function updateBackupDot() { $('#tabs [data-v=set]')?.classList.toggle('dot', backupDue()); }

export async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}

export async function persistState() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}

function summarize(d) {
  const ts = d.shifts.map(s => +new Date(s.start)).filter(x => !isNaN(x)).sort((x, y) => x - y);
  return { shifts: d.shifts.length, jobs: d.jobs.length, from: ts[0], to: ts[ts.length - 1], exported: d.exported };
}

export function storeNote() {
  return native.NATIVE
    ? `${I.info}<span>הנתונים נשמרים <b>רק בטלפון הזה</b>, בלי חשבון ובלי שרת. מחיקת האפליקציה מוחקת אותם, אז כדאי לגבות מדי פעם. כדי לעבור לטלפון חדש: גיבוי מלא כאן, ואז ״שחזור״ בטלפון החדש.</span>`
    : `${I.info}<span>הנתונים נשמרים <b>רק בדפדפן הזה</b>, בלי חשבון ובלי שרת. ניקוי נתוני האתר מוחק אותם. כדי לעבור למכשיר אחר: גיבוי מלא כאן, ואז ״שחזור״ במכשיר החדש. <span id="persistLine"></span></span>`;
}

export function openImport() {
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
