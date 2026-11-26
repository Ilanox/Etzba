// Builds the website's generated pages into site/: the guides, the pages per kind of work, Shabbat times per city,
// the embeddable calculators, the sitemap, the home page's generated parts, and this year's figures in the calculators.
// Content: scripts/site/guides.mjs, audiences.mjs, cities.mjs, embed.mjs, seasons.mjs. Switches: scripts/site/config.mjs.
// The frame and look: scripts/site/layout.mjs and guide.css.
// Run `npm run site` after changing any of them, and commit the output. The deploy also runs it every week (for the
// Shabbat times and the home page's line of the season), without committing.
process.env.TZ = 'Asia/Jerusalem';   // Shabbat times are local times
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { PAGES, R, MIN, AVG_WAGE } from './site/guides.mjs';
import { AUDIENCES } from './site/audiences.mjs';
import { cityPages, SLUGS, HUB } from './site/cities.mjs';
import { embedPages } from './site/embed.mjs';
import { seasonal } from './site/seasons.mjs';
import { page, heDate, esc, ld } from './site/layout.mjs';
import { qrSvg } from './site/qr.mjs';
import { SITE, PLAY, GET, QUOTES, RATING } from './site/config.mjs';
import * as cal from '../js/hebrew-calendar.js';
import { upcoming, hm, dm, dayName } from '../site/shabbat-render.js';

const NOW = new Date(), TODAY = NOW.toISOString().slice(0, 10);
const site = path => new URL(`../site/${path}`, import.meta.url);
const read = path => existsSync(site(path)) ? readFileSync(site(path), 'utf8') : '';

/** A guide or a page for one kind of worker. */
const guide = (p, list, crumb) => date => page({
  path: `/${p.slug}/`, date, title: p.title, desc: p.desc, h1: p.h1, lead: p.lead, faq: p.faq, crumbs: crumb ? [crumb] : [],
  top: p.calc ? `<section class="calc" data-calc="${p.calc}"><noscript><p>המחשבון צריך JavaScript.</p></noscript></section>\n` : '',
  body: p.body, scripts: p.calc ? ['/calc.js'] : [],
  note: `המידע כללי ונכון ל־${heDate(date)}. הוא לא ייעוץ משפטי, ובמקום עבודה עם הסכם קיבוצי או חוזה מיטיב ייתכנו תנאים טובים יותר.`,
  more: `<h2>${crumb ? 'עוד לפי סוג העבודה' : 'עוד מדריכים'}</h2>\n<ul class="more">${list.filter(x => x !== p).map(o => `<li><a href="/${o.slug}/">${o.nav}</a></li>`).join('')}</ul>`,
});

// every page: [path, page(date)]; a page keeps its date unless its content changed, so rebuilding doesn't touch every page
const ALL = [
  ...PAGES.map(p => [`/${p.slug}/`, guide(p, PAGES)]),
  ...AUDIENCES.map(p => [`/${p.slug}/`, guide(p, AUDIENCES, ['לפי סוג העבודה', '/#who'])]),
  ...cityPages(NOW),
  ...embedPages(),
];
const dates = {};
for (const [path, make] of ALL) {
  const file = `${path.slice(1)}index.html`, before = read(file);
  const was = /"dateModified":"(\d{4}-\d\d-\d\d)"/.exec(before)?.[1];
  dates[path] = was && make(was) === before ? was : TODAY;
  mkdirSync(site(path.slice(1)), { recursive: true });
  writeFileSync(site(file), make(dates[path]));
}

// the home page's generated parts, each between <!-- name --> and <!-- /name -->
const homeF = site('index.html'), homeBefore = readFileSync(homeF, 'utf8');
const fill = (html, name, inner) => {
  const re = new RegExp(`(<!-- ${name} -->)[\\s\\S]*?(<!-- /${name} -->)`);
  if (!re.test(html)) throw new Error(`site/index.html has no <!-- ${name} --> marker`);
  return html.replace(re, (_, a, b) => `${a}${inner}${b}`);
};
const TIMES_CITIES = ['ירושלים', 'תל אביב', 'חיפה', 'באר שבע'];
const week = upcoming(cal, 'תל אביב', NOW, 12).find(w => w.name.includes('שבת'));
let home = homeBefore;
const li = (href, text) => `<li><a href="${href}">${text}</a></li>`;
home = fill(home, 'guides', PAGES.map(p => li(`${p.slug}/`, p.nav)).join(''));
home = fill(home, 'audiences', AUDIENCES.map(p => li(`${p.slug}/`, p.nav)).join(''));
home = fill(home, 'times', `<p>שבת ${dm(week.end)} בתל אביב: כניסה ${hm(week.start)}, יציאה ${hm(week.end)}</p><ul>${TIMES_CITIES.map(c => li(`zmanei-shabbat/${SLUGS[c]}/`, c)).join('')}${li('zmanei-shabbat/', 'כל הערים')}</ul>`);
home = fill(home, 'season', seasonal(NOW).join(''));
home = fill(home, 'qr', `<div class="hqr" aria-hidden="true">${qrSvg(GET)}<span><span data-l="he">סורקים ופותחים בטלפון</span><span data-l="en">Scan to open on your phone</span></span></div>`);
const playIcon = /<svg[\s\S]*?<\/svg>/.exec(home.slice(home.indexOf('<!-- play -->')))[0];
home = fill(home, 'play', PLAY
  ? `\n      <a class="btn" href="${PLAY}" rel="noopener">${playIcon}<span data-l="he">להורדה מ־Google Play</span><span data-l="en">Get it on Google Play</span></a>\n      `
  : `\n      <span class="btn" aria-disabled="true" style="cursor:default">${playIcon}<span data-l="he">Google Play · בקרוב</span><span data-l="en">Google Play · soon</span></span>\n      `);
home = fill(home, 'proof', !QUOTES.length && !RATING ? '' : `\n<section id="said"><div class="wrap" dir="rtl" lang="he">
  <h2>מה אומרים</h2>
  ${RATING ? `<p class="rating">${RATING.value.toFixed(1)} מתוך 5 ב־Google Play, מ־${RATING.count} דירוגים.</p>` : ''}
  ${QUOTES.length ? `<div class="quotes">${QUOTES.map(q => `<blockquote><p>${esc(q.text)}</p><cite>${esc(q.name)}${q.role ? `, ${esc(q.role)}` : ''}</cite></blockquote>`).join('')}</div>` : ''}
  ${RATING ? ld({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'אצבע', operatingSystem: 'Android', applicationCategory: 'BusinessApplication', url: PLAY || `${SITE}/`, offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: RATING.value, ratingCount: RATING.count, bestRating: 5 } }) : ''}
</div></section>\n`);
if (home !== homeBefore) { writeFileSync(homeF, home); dates['/'] = TODAY; }

// the sitemap: each page's own date; the bare embed calculators stay out (they point search engines at the guides)
const oldMap = read('sitemap.xml');
const lastmod = u => dates[u] ?? new RegExp(`<loc>${SITE}${u}</loc><lastmod>([\\d-]+)<`).exec(oldMap)?.[1] ?? TODAY;
const urls = [['/', '1.0', 'weekly'], ...PAGES.map(p => [`/${p.slug}/`, '0.8', 'monthly']), ...AUDIENCES.map(p => [`/${p.slug}/`, '0.7', 'monthly']),
  [HUB, '0.8', 'weekly'], ...Object.values(SLUGS).map(s => [`${HUB}${s}/`, '0.7', 'weekly']), ['/embed/', '0.4', 'monthly'],
  ['/app/', '0.6', 'weekly'], ['/privacy', '0.3', 'yearly']];
writeFileSync(site('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr, f]) => `  <url><loc>${SITE}${u}</loc><lastmod>${lastmod(u)}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);

// the calculators use this year's figures
const calcF = site('calc.js');
writeFileSync(calcF, readFileSync(calcF, 'utf8')
  .replace(/^const MIN_HOURLY = [\d.]+, YOUTH = (\{[^}]*\}), TRAVEL_MAX = [\d.]+;/m, `const MIN_HOURLY = ${MIN.toFixed(2)}, YOUTH = $1, TRAVEL_MAX = ${R.travelMaxDaily.toFixed(2)};`)
  .replace(/^const HAVRAA = [\d.]+, HAVRAA_DAYS = \[[\d, ]+\], AVG_WAGE = \d+;/m, `const HAVRAA = ${Object.values(R.havraa).at(-1).toFixed(2)}, HAVRAA_DAYS = [${R.havraaDays.join(', ')}], AVG_WAGE = ${AVG_WAGE};`));

console.log(`${ALL.length} pages, sitemap with ${urls.length} URLs`);
