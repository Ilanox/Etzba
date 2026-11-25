import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { esc, hm, pad, pctChange, niceMax, dateKey, money2 } from '../../js/util.js';

test('util: text and numbers', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(hm(8.6), '8:36'); assert.equal(hm(0.999), '1:00');
  assert.equal(pad(7), '07');
  assert.equal(pctChange(113, 100), 13); assert.equal(pctChange(5, 0), null);
  assert.equal(niceMax(7.3), 10); assert.equal(niceMax(140), 200); assert.equal(niceMax(0), 1);
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.match(money2(5.5), /5\.50/);
});

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

test('state: bad data is repaired, not trusted', async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem() {} };
  globalThis.addEventListener ??= () => {}; globalThis.window ??= globalThis;
  const { normalizeState, fresh } = await import('../../js/state.js');
  const d = normalizeState({ jobs: [{ id: '"><img>', color: 'red;x', name: 'א' }], shifts: [{ jobId: '"><img>', start: 'x', end: 'y' }, { jobId: '"><img>', start: '2026-01-01T08:00', end: '2026-01-01T16:00' }], settings: { birth: 'nope' } });
  assert.match(d.jobs[0].id, /^[\w.:-]+$/); assert.match(d.jobs[0].color, /^#/);
  assert.equal(d.shifts.length, 1); assert.equal(d.shifts[0].jobId, d.jobs[0].id);
  assert.equal(d.settings.birth, ''); assert.deepEqual(d.settings.notif, fresh().settings.notif);
  assert.equal(normalizeState(null).jobs.length, 1);
});

test('every imported name is exported by the file it comes from', () => {
  const { dirname, join, normalize } = require_path();
  const root = new URL('../../', import.meta.url).pathname;
  const files = readdirSync(join(root, 'js'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => join('js', f));
  const exported = f => new Set([...readFileSync(join(root, f), 'utf8').matchAll(/^export (?:async function|function|const|let) ([\w$]+)/gm)].map(m => m[1]).concat([...readFileSync(join(root, f), 'utf8').matchAll(/^export \{([^}]*)\}/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(' as ').pop()))));
  for (const f of files) for (const m of readFileSync(join(root, f), 'utf8').matchAll(/^import \{([^}]*)\} from '(\.[^']*)';/gm)) {
    const target = normalize(join(dirname(f), m[2])), have = exported(target);
    for (const n of m[1].split(',').map(x => x.trim().split(' as ')[0]).filter(Boolean)) assert.ok(have.has(n), `${f}: '${n}' is not exported by ${target}`);
  }
});
function require_path() { return { dirname: p => p.split('/').slice(0, -1).join('/'), join: (...a) => a.join('/').replace(/\/+/g, '/'), normalize: p => { const out = []; for (const s of p.split('/')) s === '..' ? out.pop() : s !== '.' && out.push(s); return out.join('/'); } }; }

test('translation skip markers come in pairs, start before end', () => {
  const root = new URL('../../js/', import.meta.url);
  for (const f of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.js'))) {
    const marks = [...readFileSync(new URL(f, root), 'utf8').matchAll(/translations: skip-(start|end)/g)].map(m => m[1]);
    for (let i = 0; i < marks.length; i++) assert.equal(marks[i], i % 2 ? 'end' : 'start', `js/${f}: markers out of order`);
    assert.equal(marks.length % 2, 0, `js/${f}: a skip-start without its skip-end`);
  }
});
