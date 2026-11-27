// The project fits together: every file is cached, imported names exist, generated files are current,
// and the Android setup copies every Java file. Each failure says what to fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/** Paths inside the project, as plain strings ('js/views/../ui.js' → 'js/ui.js'). */
const dirname = p => p.split('/').slice(0, -1).join('/');
const join = (...a) => a.join('/').replace(/\/+/g, '/');
const normalize = p => { const out = []; for (const s of p.split('/')) s === '..' ? out.pop() : s !== '.' && out.push(s); return out.join('/'); };

test('offline cache lists every app module and stylesheet, and the page loads every stylesheet', () => {
  const sw = readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  for (const f of readdirSync(new URL('../../js/', import.meta.url), { recursive: true }).filter(f => f.endsWith('.js')))
    assert.ok(sw.includes(`'js/${f}'`), `js/${f} missing from service-worker.js`);
  for (const f of readdirSync(new URL('../../css/', import.meta.url))) {
    assert.ok(sw.includes(`'css/${f}'`), `css/${f} missing from service-worker.js`);
    assert.ok(html.includes(`href="css/${f}"`), `css/${f} missing from index.html`);
  }
});

test('every imported name is exported by the file it comes from', () => {
  const root = new URL('../../', import.meta.url).pathname;
  const files = readdirSync(join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => join('js', f));
  const exported = f => new Set([...readFileSync(join(root, f), 'utf8').matchAll(/^export (?:async function|function|const|let) ([\w$]+)/gm)].map(m => m[1]).concat([...readFileSync(join(root, f), 'utf8').matchAll(/^export \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(' as ').pop()))));
  for (const f of files) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/^import \{([^}]*)\} from '(\.[^']*)';/gm)) {
    const target = normalize(join(dirname(f), m[2])), have = exported(target);
    for (const n of m[1].split(',').map(x => x.trim().split(' as ')[0]).filter(Boolean)) assert.ok(have.has(n), `${f}: '${n}' is not exported by ${target}`);
  }
});

test('translation skip markers come in pairs, start before end', () => {
  const root = new URL('../../js/', import.meta.url);
  for (const f of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.js'))) {
    const marks = [...readFileSync(new URL(f, root), 'utf8').matchAll(/translations: skip-(start|end)/g)].map(m => m[1]);
    for (let i = 0; i < marks.length; i++) assert.equal(marks[i], i % 2 ? 'end' : 'start', `js/${f}: markers out of order`);
    assert.equal(marks.length % 2, 0, `js/${f}: a skip-start without its skip-end`);
  }
});

test('the Android setup copies every Java file in native/android', () => {
  const setup = readFileSync(new URL('../../scripts/native-setup.mjs', import.meta.url), 'utf8');
  for (const f of readdirSync(new URL('../../native/android/', import.meta.url)).filter(f => f.endsWith('.java')))
    assert.ok(setup.includes(`'${f}'`), `${f} missing from scripts/native-setup.mjs`);
});

test('js/features.js matches features.json (run npm run build after editing it)', async () => {
  const f = JSON.parse(readFileSync(new URL('../../features.json', import.meta.url), 'utf8'));
  const { default: js } = await import('../../js/features.js');
  assert.deepEqual(js, Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith('_'))));
});

test('the website names the offline cache after each commit, so it never has to be bumped by hand', () => {
  const sw = readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  const wf = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(sw, /^const VERSION = '[^']*';$/m, 'the line the deploy rewrites');
  assert.match(wf, /sed -i "s\/\^const VERSION = '\[\^'\]\*';\//, 'pages.yml rewrites it');
});

test('alarms: none needs the exact-alarm permission, and the widget redraws every minute while on shift', () => {
  const dir = new URL('../../native/android/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.java'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /setExact|setAlarmClock/, `${f}: exact alarms need a permission Play doesn't give this app`);
  }
  const w = readFileSync(new URL('EtzbaWidget.java', dir), 'utf8');
  assert.match(w, /am\.set\(AlarmManager\.ELAPSED_REALTIME, SystemClock\.elapsedRealtime\(\) \+ 60_000, minute\)/);
});
