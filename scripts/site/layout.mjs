// The frame every generated page shares: head, header, the "get the app" card and bar, footer.
import { readFileSync } from 'node:fs';
import { SITE, PLAY, GET, WHATSAPP, QUOTES } from './config.mjs';
import { qrSvg } from './qr.mjs';

const CSS = readFileSync(new URL('./guide.css', import.meta.url), 'utf8').trim();
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
export const heDate = iso => iso.split('-').reverse().join('.');
const QR = qrSvg(GET, { label: 'קוד לסריקה: פותחים את אצבע בטלפון' });
const GET_LABEL = PLAY ? 'להורדה מ־Google Play' : 'לפתוח את האפליקציה';

/** A "send to a friend" link: WhatsApp without JavaScript, the phone's share sheet with it. */
export const shareLink = (title, url, text = 'לשלוח לחבר') =>
  `<a class="share" href="https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}" data-share data-title="${esc(title)}" data-url="${url}" rel="noopener" target="_blank">${text}</a>`;

/** The card at the end of each page: what the app does, the button, a QR code on computers, and sharing. */
export function cta(title, url, line = 'אצבע מחשבת את כל זה לבד: שמים אצבע בכניסה וביציאה, ורואים את השכר לפי החוק, עד הנטו. חינם, בלי חשבון ובלי פרסומות.') {
  const q = QUOTES[0];
  return `<div class="cta"><div class="cta-t"><p>${line}</p>${q ? `<blockquote><p>${esc(q.text)}</p><cite>${esc(q.name)}${q.role ? `, ${esc(q.role)}` : ''}</cite></blockquote>` : ''}<div class="cta-b"><a class="btn" href="${GET}">${GET_LABEL}</a>${shareLink(title, url)}</div></div><div class="cta-q">${QR}<span>סורקים ופותחים בטלפון</span></div></div>`;
}

/**
 * A whole page. path is like '/shabbat/'; date (YYYY-MM-DD) is when its content last changed.
 * body is the HTML between the lead and the card; faq is [[question, answer], …].
 */
export function page({ path, title, desc, h1, crumbs = [], lead = '', top = '', body = '', faq = [], note = '', more = '', date, scripts = [], type = 'Article', noCta = false }) {
  const url = SITE + path;
  const trail = [['אצבע', '/'], ...crumbs, [h1, path]];
  const lds = [
    { '@context': 'https://schema.org', '@type': type, headline: title, name: title, description: desc, inLanguage: 'he', mainEntityOfPage: url, dateModified: date, image: `${SITE}/img/he/home.jpg`, author: { '@type': 'Person', name: 'Ilan Levy' }, publisher: { '@type': 'Organization', name: 'אצבע', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/app/icons/icon-512.png` } } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + u })) },
    faq.length && { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
  ].filter(Boolean);
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | אצבע</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="theme-color" content="#141518">
<link rel="canonical" href="${url}">
<link rel="icon" href="/app/icons/icon-192.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="אצבע">
<meta property="og:locale" content="he_IL">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/img/he/home.jpg">
<meta name="twitter:card" content="summary_large_image">
${lds.map(ld).join('\n')}
<link rel="preload" href="/heebo.woff" as="font" type="font/woff" crossorigin>
<style>${CSS}</style>
<script type="module" src="/site.js"></script>${scripts.map(s => `\n<script type="module" src="${s}"></script>`).join('')}
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">אצבע</a><nav><a href="/#guides">מדריכים</a><a href="/zmanei-shabbat/">זמני שבת</a><a href="${GET}">לפתוח את האפליקציה</a></nav></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="מיקום">${trail.slice(0, -1).map(([n, u]) => `<a href="${u}">${n}</a> › `).join('')}${h1}</nav>
<article>
<h1>${h1}</h1>
${lead ? `<p class="lead">${lead}</p>\n` : ''}${top}${body.trim()}
${noCta ? '' : cta(title, url)}
${faq.length ? `<h2>שאלות נפוצות</h2>\n<div class="faq">${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>\n` : ''}${note ? `<p class="note">${note}</p>\n` : ''}</article>
${more}
</main>
<footer><div class="wrap"><a href="/">אצבע</a><a href="/zmanei-shabbat/">זמני שבת</a><a href="/embed/">מחשבון לאתר שלך</a>${WHATSAPP ? `<a href="${WHATSAPP}" rel="noopener">ערוץ הווטסאפ</a>` : ''}<a href="/privacy">מדיניות פרטיות</a><a href="mailto:ilan@edvin.co.il">ilan@edvin.co.il</a></div></footer>
<div class="getbar"><span><b>אצבע</b> שעון נוכחות ומחשבון שכר, חינם</span><a class="btn" href="${GET}">${PLAY ? 'להורדה' : 'לפתוח'}</a></div>
</body>
</html>
`;
}
