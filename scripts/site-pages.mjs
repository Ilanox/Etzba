// Builds the website's guide pages (site/<slug>/index.html), the sitemap, the home page's guide links,
// and this year's figures in the calculators. The content is in scripts/site/guides.mjs, the look in scripts/site/guide.css.
// Run `npm run site` after changing either, and commit the output.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { PAGES, R, MIN } from './site/guides.mjs';

const SITE = 'https://etzba.co.il';
const TODAY = new Date().toISOString().slice(0, 10);
const CSS = readFileSync(new URL('./site/guide.css', import.meta.url), 'utf8').trim();

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

/** A guide page. `date` is when its content last changed. */
function page(p, date) {
  const url = `${SITE}/${p.slug}/`;
  const others = PAGES.filter(x => x !== p);
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} | אצבע</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="#141518">
<link rel="canonical" href="${url}">
<link rel="icon" href="/app/icons/icon-192.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="אצבע">
<meta property="og:locale" content="he_IL">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:image" content="${SITE}/img/he/home.jpg">
<meta name="twitter:card" content="summary_large_image">
${ld({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.desc, inLanguage: 'he', mainEntityOfPage: url, dateModified: date, image: `${SITE}/img/he/home.jpg`, author: { '@type': 'Person', name: 'Ilan Levy' }, publisher: { '@type': 'Organization', name: 'אצבע', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/app/icons/icon-512.png` } } })}
${ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'אצבע', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: p.h1, item: url }] })}
${ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })}
<link rel="preload" href="/heebo.woff" as="font" type="font/woff" crossorigin>
<style>${CSS}</style>${p.calc ? '\n<script type="module" src="/calc.js"></script>' : ''}
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">אצבע</a><nav><a href="/app/">לפתוח את האפליקציה</a></nav></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="מיקום"><a href="/">אצבע</a> › ${p.h1}</nav>
<article>
<h1>${p.h1}</h1>
<p class="lead">${p.lead}</p>
${p.calc ? `<section class="calc" data-calc="${p.calc}"><noscript><p>המחשבון צריך JavaScript.</p></noscript></section>` : ''}
${p.body.trim()}
<div class="cta"><p>אצבע מחשבת את כל זה לבד: שמים אצבע בכניסה וביציאה, ורואים את השכר לפי החוק, עד הנטו. חינם, בלי חשבון ובלי פרסומות.</p><a class="btn" href="/app/">לפתוח את אצבע</a></div>
<h2>שאלות נפוצות</h2>
<div class="faq">${p.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
<p class="note">המידע כללי ונכון ל־${date.split('-').reverse().join('.')}. הוא לא ייעוץ משפטי, ובמקום עבודה עם הסכם קיבוצי או חוזה מיטיב ייתכנו תנאים טובים יותר.</p>
</article>
<h2>עוד מדריכים</h2>
<ul class="more">${others.map(o => `<li><a href="/${o.slug}/">${o.nav}</a></li>`).join('')}</ul>
</main>
<footer><div class="wrap"><a href="/">אצבע</a><a href="/privacy">מדיניות פרטיות</a><a href="mailto:ilan@edvin.co.il">ilan@edvin.co.il</a></div></footer>
</body>
</html>
`;
}

// a page keeps its date unless its content changed, so rebuilding doesn't touch every page
const site = path => new URL(`../site/${path}`, import.meta.url);
const read = path => existsSync(site(path)) ? readFileSync(site(path), 'utf8') : '';
const dates = {};
for (const p of PAGES) {
  const file = `${p.slug}/index.html`, before = read(file);
  const was = /"dateModified":"(\d{4}-\d\d-\d\d)"/.exec(before)?.[1];
  dates[p.slug] = was && page(p, was) === before ? was : TODAY;
  mkdirSync(site(p.slug), { recursive: true });
  writeFileSync(site(file), page(p, dates[p.slug]));
}

// the home page's guide links, between the markers
const homeF = site('index.html');
const homeBefore = readFileSync(homeF, 'utf8');
const links = PAGES.map(p => `<a class="guide" dir="rtl" lang="he" href="${p.slug}/"><b>${p.nav}</b><span>${p.title}</span></a>`).join('\n    ');
const home = homeBefore.replace(/(<!-- guides -->)[\s\S]*?(<!-- \/guides -->)/, `$1\n    ${links}\n    $2`);
if (home !== homeBefore) { writeFileSync(homeF, home); dates[''] = TODAY; }

// the sitemap: each guide's own date, the home page's if its links changed; the rest keep theirs
const oldMap = read('sitemap.xml');
const lastmod = u => dates[u.slice(1, -1)] ?? new RegExp(`<loc>${SITE}${u}</loc><lastmod>([\\d-]+)<`).exec(oldMap)?.[1] ?? TODAY;
const urls = [['/', '1.0', 'weekly'], ...PAGES.map(p => [`/${p.slug}/`, '0.8', 'monthly']), ['/app/', '0.6', 'weekly'], ['/privacy', '0.3', 'yearly']];
writeFileSync(site('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr, f]) => `  <url><loc>${SITE}${u}</loc><lastmod>${lastmod(u)}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);

// the calculators use this year's figures
const calcF = site('calc.js');
writeFileSync(calcF, readFileSync(calcF, 'utf8').replace(/^const MIN_HOURLY = [\d.]+, YOUTH = (\{[^}]*\}), TRAVEL_MAX = [\d.]+;/m, `const MIN_HOURLY = ${MIN.toFixed(2)}, YOUTH = $1, TRAVEL_MAX = ${R.travelMaxDaily.toFixed(2)};`));
console.log(`${PAGES.length} guide pages, sitemap with ${urls.length} URLs`);
