// The app's data: what's stored, how it's checked, how it's saved, and quick lookups over it.
import { defaultJob, normalizeJob, jobAt, weekStart } from './pay-engine.js';
import * as native from './native-bridge.js';

const KEY = 'etzba.v1', OLD_KEY = 'shifts.v1';

/** A new user's data: one job, default settings, nothing recorded yet. */
export function fresh() {
  const job = defaultJob('העבודה שלי');
  return {
    settings: {
      city: 'תל אביב', candleMin: 20, havdalahMin: 40,
      sex: 2.25, extraPts: 0, pension: false, pEmp: 6, pEr: 6.5, sev: 8.33, hish: false,
      theme: 'auto', lang: 'he', lastJob: job.id,
      notif: { rates: true, rest: true, long: true },
    },
    jobs: [job], shifts: [], absences: [], plans: [], active: null, ui: {},
  };
}

const okId = v => typeof v === 'string' && /^[\w.:-]{1,80}$/.test(v);
const okColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
const okDate = v => v && !isNaN(new Date(v));

/** Checks and repairs data from storage, a backup or an import, so the rest of the app can trust it. */
export function normalizeState(d) {
  if (!d || !Array.isArray(d.jobs) || !d.jobs.length) d = fresh();
  const f = fresh();
  d.jobs = d.jobs.map(normalizeJob);

  // ids end up in HTML attributes and colours in CSS: anything odd gets replaced
  const idMap = new Map();
  d.jobs.forEach((j, i) => {
    if (!okId(j.id)) { const n = 'j' + Date.now().toString(36) + i; idMap.set(j.id, n); j.id = n; }
    if (!okColor(j.color)) j.color = f.jobs[0].color;
  });
  const fix = x => {
    if (idMap.has(x.jobId)) x.jobId = idMap.get(x.jobId);
    if (!okId(x.id)) x.id = 'x' + Math.random().toString(36).slice(2, 12);
    return x;
  };

  d.settings = { ...f.settings, ...d.settings };
  if (d.settings.birth && !/^(19|20)\d\d-\d\d-\d\d$/.test(d.settings.birth)) d.settings.birth = '';
  d.shifts = (d.shifts || []).filter(s => s && okDate(s.start) && okDate(s.end)).map(fix);
  d.absences = (d.absences || []).filter(a => a && /^\d{4}-\d\d-\d\d$/.test(a.date) && (a.kind === 'sick' || a.kind === 'vac')).map(fix);
  d.plans = (d.plans || []).filter(x => x && x.jobId && okDate(x.start)).map(fix);
  if (d.active && !okDate(d.active.start)) d.active = null;
  else if (d.active && idMap.has(d.active.jobId)) d.active.jobId = idMap.get(d.active.jobId);

  d.ui = { sort: 'old', filter: 'all', ...(d.ui || {}) };
  if (d.settings.onboarded == null && (d.shifts.length || d.active)) d.settings.onboarded = true;
  migrate(d);
  return d;
}

/** One-time fixes for data saved by older versions. Each sets a flag so it runs once. */
function migrate(d) {
  if (!d.settings.migSort) { if (d.ui.sort === 'new') d.ui.sort = 'old'; d.settings.migSort = 1; }
  if (!d.settings.migTravel) {
    // imported shifts used to copy the job's travel onto every shift; drop the copies
    const byJob = new Map();
    for (const s of d.shifts) if (s.src === 'import' && s.travel != null) {
      const m = byJob.get(s.jobId) || new Map(); m.set(s.travel, (m.get(s.travel) || 0) + 1); byJob.set(s.jobId, m);
    }
    for (const [jid, m] of byJob) {
      const common = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0], job = d.jobs.find(j => j.id === jid);
      if (!job) continue;
      for (const s of d.shifts) if (s.jobId === jid && s.src === 'import' && s.travel === common) {
        const jt = +jobAt(job, s.start).travel || 0;
        if (jt > 0 || jt === common) delete s.travel;
      }
    }
    d.settings.migTravel = 1;
  }
}

function readSaved() {
  try { return localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); } catch { return null; }
}
const parse = json => { try { return JSON.parse(json); } catch { return null; } };

/** Whether this browser already had saved data when the app opened. */
export const hadLocal = !!(() => { try { return localStorage.getItem(KEY); } catch { return null; } })();

/** The current data. Read it anywhere; replace it only through setState. */
export let S = normalizeState(parse(readSaved()));

/** Replaces all data (restore, import, the app's own copy). Saves it as given. */
export function setState(d, json = JSON.stringify(d)) {
  S = normalizeState(d);
  try { localStorage.setItem(KEY, json); } catch {}
  invalidate();
}

/** Saves the current data; false if the browser refused (storage full or blocked). */
export function save() {
  S.updatedAt = Date.now();
  const json = JSON.stringify(S);
  native.snapshot.save(json);
  try { localStorage.setItem(KEY, json); return true; } catch { return false; }
}

/* ---- lookups ---- */
export const jobById = id => S.jobs.find(j => j.id === id) || S.jobs[0];
export const place = () => ({ city: S.settings.city, candleMin: S.settings.candleMin, havdalahMin: S.settings.havdalahMin });

let IDX = null;
/** Memo for values worked out from the data; cleared on every change. */
export const MEMO = new Map();
export function invalidate() { IDX = null; MEMO.clear(); }

/** Shifts grouped by month and week, each sorted by start, plus newest-first and by id. */
export function index() {
  if (IDX) return IDX;
  const month = new Map(), week = new Map(), t = new Map();
  const add = (map, k, s) => (map.get(k) || map.set(k, []).get(k)).push(s);
  for (const s of S.shifts) {
    const d = new Date(s.start);
    t.set(s, +d);
    add(month, d.getFullYear() * 12 + d.getMonth(), s);
    add(week, +weekStart(d), s);
  }
  const byStart = (x, y) => t.get(x) - t.get(y);
  for (const a of month.values()) a.sort(byStart);
  for (const a of week.values()) a.sort(byStart);
  const newest = [...S.shifts].sort((x, y) => t.get(y) - t.get(x));
  return (IDX = { month, week, newest, byId: new Map(S.shifts.map(s => [s.id, s])), t });
}
export const inMonth = (y, m) => index().month.get(y * 12 + m) || [];
export const inWeek = ws => index().week.get(+ws) || [];
