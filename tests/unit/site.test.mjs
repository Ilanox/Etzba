// The website's generated parts: links that go somewhere, Shabbat times that match a known calendar, the QR code,
// the line of the season, and the app link the calculators hand over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import * as cal from '../../js/hebrew-calendar.js';
import { upcoming, hm } from '../../site/shabbat-render.js';
import { qrMatrix } from '../../scripts/site/qr.mjs';
import { seasonal } from '../../scripts/site/seasons.mjs';

globalThis.location ??= { search: '' };
const { parseAddLink } = await import('../../js/add-link.js');

const SITE = new URL('../../site/', import.meta.url);
const ROOT = new URL('../../', import.meta.url);

/** Every generated page: [path like /neto/, html]. */
function pages(dir = '') {
  const out = [];
  for (const name of readdirSync(new URL(dir, SITE))) {
    const rel = dir + name;
    if (statSync(new URL(rel, SITE)).isDirectory()) { if (name !== 'img') out.push(...pages(rel + '/')); }
    else if (name === 'index.html') out.push(['/' + dir, readFileSync(new URL(rel, SITE), 'utf8')]);
  }
  return out;
}

test('every link inside the site goes to a page that exists', () => {
  const broken = [];
  for (const [path, html] of pages()) {
    for (const [, href] of html.matchAll(/href="([^"#?]*)[^"]*"/g)) {
      if (!href || /^(https?:|mailto:)/.test(href)) continue;
      const u = new URL(href, 'https://x' + path).pathname;
      if (u === '/privacy') { assert.ok(existsSync(new URL('privacy.html', ROOT))); continue; }
      if (u.startsWith('/app/')) { if (!existsSync(new URL(u === '/app/' ? 'index.html' : u.slice(5), ROOT))) broken.push(`${path} → ${href}`); continue; }
      const f = new URL('.' + u + (u.endsWith('/') ? 'index.html' : ''), SITE);
      if (!existsSync(f)) broken.push(`${path} → ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every page in the sitemap exists and names itself as canonical', () => {
  const map = readFileSync(new URL('sitemap.xml', SITE), 'utf8');
  const urls = [...map.matchAll(/<loc>https:\/\/etzba\.co\.il(\/[^<]*)<\/loc>/g)].map(m => m[1]);
  assert.ok(urls.length > 40, `${urls.length} URLs`);
  for (const u of urls) {
    if (u === '/app/' || u === '/privacy') continue;
    const html = readFileSync(new URL('.' + u + 'index.html', SITE), 'utf8');
    if (u !== '/') assert.match(html, new RegExp(`<link rel="canonical" href="https://etzba.co.il${u}">`), u);
  }
});

test('the bare embeddable calculators stay out of search engines', () => {
  for (const [path, html] of pages()) if (/^\/embed\/.+\//.test(path)) assert.match(html, /<meta name="robots" content="noindex">/, path);
});

test('Shabbat times: Tel Aviv and Jerusalem on 27-28 November 2026, as on a printed calendar', () => {
  const at = c => upcoming(cal, c, new Date(2026, 10, 25, 12), 1)[0];
  assert.deepEqual([hm(at('תל אביב').start), hm(at('תל אביב').end)], ['16:16', '17:16']);
  assert.equal(hm(at('ירושלים').start), '15:55');   // 40 minutes before sunset in Jerusalem
  const pesach = upcoming(cal, 'תל אביב', new Date(2027, 3, 20), 3).find(w => w.name === 'פסח');
  assert.equal(pesach.start.getDate(), 21, 'Pesach 2027 starts on the evening of 21 April');
});

test('QR codes: the size grows with the text, and the three corner squares are there', () => {
  for (const [text, size] of [['https://etzba.co.il/app/', 25], ['https://play.google.com/store/apps/details?id=com.edvinstudios.etzba', 37]]) {
    const m = qrMatrix(text), n = m.length;
    assert.equal(n, size, text);
    for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      assert.ok(m[y][x] && m[y + 6][x + 6] && m[y + 3][x + 3], 'finder corner and centre');
      assert.ok(!m[y + 1][x + 1], 'finder ring');
    }
    assert.deepEqual(qrMatrix(text), m, 'the same every time');
  }
  assert.throws(() => qrMatrix('x'.repeat(200)));
});

test('the line of the season', () => {
  assert.deepEqual(seasonal(new Date(2026, 10, 25)), [], 'nothing at the end of November');
  assert.match(seasonal(new Date(2026, 11, 10))[0], /סיכום של 2026/);
  assert.match(seasonal(new Date(2027, 0, 5))[0], /סיכום של 2026/, 'early January still means last year');
  assert.match(seasonal(new Date(2026, 3, 10))[0], /שכר המינימום מאפריל 2026/);
  assert.match(seasonal(new Date(2025, 3, 10))[0], /מאפריל 2025: ₪34\.32/, 'that year\'s figure');
  assert.ok(!seasonal(new Date(2024, 3, 10)).some(l => /שכר המינימום/.test(l)), 'not when the rules have no April raise that year');
  assert.ok(seasonal(new Date(2026, 6, 1)).length <= 2);
});

test('a shift handed over by the website: what the app accepts', () => {
  const now = new Date(2026, 10, 25);
  const a = parseAddLink('2026-11-27,08:00,17:30', now);
  assert.equal(a.start.getHours(), 8); assert.equal(+a.end - +a.start, 9.5 * 36e5);
  const night = parseAddLink('2026-11-27,22:00,06:00', now);
  assert.equal(night.end.getDate(), 28, 'ends the next day');
  for (const bad of ['', 'x', '2026-02-31,08:00,10:00', '2026-11-27,25:00,10:00', '2020-01-01,08:00,10:00', '2026-11-27,08:00']) assert.equal(parseAddLink(bad, now), null, bad);
});

test('the calculators carry this year\'s figures from the rules file', () => {
  const R = JSON.parse(readFileSync(new URL('data/rules.json', ROOT)));
  const js = readFileSync(new URL('calc.js', SITE), 'utf8');
  assert.match(js, new RegExp(`MIN_HOURLY = ${R.minWage.at(-1).hourly.toFixed(2)}`));
  assert.match(js, new RegExp(`HAVRAA = ${Object.values(R.havraa).at(-1).toFixed(2)}`));
});
