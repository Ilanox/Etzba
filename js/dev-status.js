// The developer dashboard's data: what the website deploy did (GitHub Actions), what is live (data/status.json),
// and what this phone runs. Read-only, no sign-in: the repository and the status file are public.
import BUILD from './build-info.js';
import BUILT_PACKS from '../languages/pack-versions.js';
import * as native from './native-bridge.js';
import { rules } from './rules.js';
import { VERSION } from './diagnostics.js';

const REPO = 'Ilanox/Etzba', API = `https://api.github.com/repos/${REPO}`;
export const LINKS = {
  actions: `https://github.com/${REPO}/actions`,
  commits: `https://github.com/${REPO}/commits/main`,
  site: 'https://etzba.co.il',
  console: 'https://search.google.com/search-console?resource_id=sc-domain:etzba.co.il',
};
const STATUS_URL = 'https://etzba.co.il/data/status.json', KEY = 'etzba.devstatus', FRESH = 60e3;
/* translations: skip-start (developer only) */
// the jobs and steps in .github/workflows/pages.yml, in plain words
const NAMES = { test: 'בדיקות', deploy: 'פרסום', 'live-check': 'בדיקה באתר החי', 'Unit tests': 'בדיקות יחידה', 'Browser tests': 'בדיקות דפדפן',
  'Translation check': 'בדיקת תרגום', 'Install': 'התקנה', 'Open the live site': 'פתיחת האתר החי' };
export const plain = n => NAMES[n] || n;

let memo = null, loading = null;

/** The last result, even an old one (for the dot in Settings before anything loads). */
export function lastStatus() {
  if (memo) return memo;
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

/** Fetches everything (at most once a minute unless forced). Never throws: problems become part of the result. */
export function loadStatus({ force = false } = {}) {
  if (!force && memo && Date.now() - memo.at < FRESH) return Promise.resolve(memo);
  return (loading ||= build().then(r => { memo = r; loading = null; try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {} return r; }));
}

const getJSON = async (url, ms = 9000) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl.signal, headers: url.startsWith(API) ? { Accept: 'application/vnd.github+json' } : {} });
    if (res.status === 403 && url.startsWith(API)) throw new Error('GitHub limit reached: try again in a few minutes');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
};

/** The jobs of a run, each with the step that failed or is running now. */
async function jobsOf(run) {
  const { jobs = [] } = await getJSON(`${API}/actions/runs/${run.id}/jobs`);
  return jobs.map(j => ({
    name: j.name, status: j.status, conclusion: j.conclusion, url: j.html_url,
    step: (j.steps || []).find(s => s.conclusion === 'failure') || (j.steps || []).find(s => s.status === 'in_progress') || null,
  }));
}
const runOf = r => r && ({ id: r.id, status: r.status, conclusion: r.conclusion, commit: r.head_sha.slice(0, 7), event: r.event,
  rollback: /^Rollback to [0-9a-f]+/.test(r.display_title || '') ? r.display_title.slice(12, 19) : '',
  message: (r.head_commit?.message || r.display_title || '').split('\n')[0], at: r.run_started_at || r.created_at, url: r.html_url });

async function phone() {
  const info = native.NATIVE ? await native.appInfo() : null;
  let cache = '';
  try { cache = (await caches.keys()).find(k => /^etzba-(?!share)/.test(k)) || ''; } catch {}
  const packs = {};
  for (const [code, v] of Object.entries(BUILT_PACKS)) {
    let have = v; try { have = Math.max(v, JSON.parse(localStorage.getItem('etzba.pack.' + code) || 'null')?.version || 0); } catch {}
    packs[code] = have;
  }
  return { commit: BUILD.commit, built: BUILD.built, version: info?.version || VERSION, build: info?.build || '', native: native.NATIVE,
    cache, rules: rules().version, packs };
}

async function build() {
  const out = { at: Date.now(), errors: [], online: navigator.onLine !== false };
  const safe = (what, p) => p.catch(e => { out.errors.push(`${what}: ${e.message || e}`); return null; });
  const [live, runs, me] = await Promise.all([
    safe('status.json', getJSON(STATUS_URL + '?t=' + Date.now())),
    safe('GitHub', getJSON(`${API}/actions/workflows/pages.yml/runs?branch=main&per_page=6`)),
    phone(),
  ]);
  out.live = live; out.phone = me;
  const list = (runs?.workflow_runs || []).map(runOf);
  out.latest = list[0] || null;
  out.lastDone = list.find(r => r.status === 'completed' && r.conclusion !== 'cancelled') || null;
  // a rollback only counts when the newest push failed and the site went back to an older commit
  // (republishing the same commit by hand is not one)
  const push = list.find(r => r.event === 'push' && r.status === 'completed' && r.conclusion !== 'cancelled');
  if (out.lastDone?.rollback && push && push.conclusion === 'failure' && !push.commit.startsWith(out.lastDone.rollback)) out.rolledBackFrom = push;
  if (out.latest) out.latest.jobs = await safe('GitHub', jobsOf(out.latest)) || [];
  if (out.lastDone && out.lastDone !== out.latest) out.lastDone.jobs = await safe('GitHub', jobsOf(out.lastDone)) || [];
  // how far behind the website this phone's copy is
  if (live?.commit && me.commit !== 'dev' && me.commit !== live.commit) {
    const cmp = await safe('GitHub', getJSON(`${API}/compare/${me.commit}...${live.commit}`));
    out.behind = cmp ? cmp.ahead_by : null;
  } else out.behind = me.commit === 'dev' ? null : 0;
  Object.assign(out, verdict(out));
  return out;
}

/**
 * One line that says it all, and a level: ok (all good), busy (a deploy is running), warn (works, but something
 * to do), bad (something is broken), or unknown (couldn't check).
 */
export function verdict(s) {
  const failedIn = run => (run?.jobs || []).find(j => j.conclusion === 'failure');
  // three different "can't tell" cases: this phone is offline, the website doesn't answer, GitHub doesn't answer
  if (s.online === false) return { level: 'unknown', headline: 'הטלפון לא מחובר לאינטרנט', detail: 'אי אפשר לבדוק את האתר עכשיו' };
  if (!s.latest && !s.live) return { level: 'unknown', headline: 'לא הצלחתי להגיע לאתר ול־GitHub', detail: s.errors.join(' · ') };
  if (!s.live) return { level: 'bad', headline: 'האתר לא עונה', detail: 'GitHub עונה, אבל etzba.co.il לא החזיר את קובץ המצב' };
  if (s.latest && s.latest.status !== 'completed') {
    const job = (s.latest.jobs || []).find(j => j.status === 'in_progress');
    return { level: 'busy', headline: 'פרסום רץ עכשיו', detail: job ? `${plain(job.name)}${job.step ? ' · ' + plain(job.step.name) : ''}` : 'ממתין להתחלה' };
  }
  const done = s.lastDone, bad = failedIn(done);
  if (done?.rollback && s.rolledBackFrom && done.conclusion === 'success')
    return { level: 'bad', headline: `חזר אוטומטית לגרסה ${done.rollback}`, detail: `הגרסה ${s.rolledBackFrom?.commit || 'האחרונה'} נכשלה בבדיקה באתר החי; האתר הוחזר לגרסה שעבדה. צריך לתקן ולדחוף שוב` };
  if (done && done.conclusion === 'failure') {
    const where = bad ? plain(bad.step ? bad.step.name : bad.name) : 'בפרסום';
    const kept = bad?.name === 'live-check' ? 'האתר עלה, אבל משהו בו לא נפתח כמו שצריך' : 'האתר נשאר בגרסה הקודמת, שעבדה';
    return { level: 'bad', headline: `נכשל: ${where}`, detail: kept };
  }
  if (s.live && s.live.commit !== s.lastDone?.commit && s.lastDone) return { level: 'warn', headline: 'האתר עוד לא מראה את העדכון האחרון', detail: 'בדרך כלל מסתדר תוך דקה' };
  const p = s.phone, l = s.live?.data;
  const late = [];
  if (s.behind > 0) late.push(`הטלפון מאחור ב־${s.behind} עדכונים`);
  if (l && l.rules > p.rules) late.push('נתוני השכר בטלפון ישנים');
  if (l) for (const [c, v] of Object.entries(l.packs || {})) if (v > (p.packs[c] || 0)) late.push(`חבילת השפה ${c} ישנה`);
  if (late.length) return { level: 'warn', headline: 'האתר תקין', detail: late.join(' · ') };
  if (!s.latest) return { level: 'warn', headline: 'האתר תקין', detail: 'GitHub לא ענה, אז אין מידע על הפרסום האחרון' + (s.errors.length ? ` (${s.errors.join(' · ')})` : '') };
  return { level: 'ok', headline: 'הכול תקין', detail: s.live ? 'כל הבדיקות עברו, האתר והטלפון מעודכנים' : '' };
}

/** For the dot on the Settings tab: something broke in the last deploy. */
export const devAlarm = () => lastStatus()?.level === 'bad';
/* translations: skip-end */
