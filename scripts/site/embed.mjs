// Calculators other sites can put on their pages: /embed/<name>/ is the bare calculator (for an iframe),
// and /embed/ explains how, with the code to copy.
import { readFileSync } from 'node:fs';
import { SITE } from './config.mjs';
import { page, esc } from './layout.mjs';

const CSS = readFileSync(new URL('./guide.css', import.meta.url), 'utf8').trim();
export const EMBEDS = [
  ['overtime', 'שעות נוספות', 'shaot-nosafot', 640], ['shabbat', 'שכר לשבת', 'shabbat', 560], ['net', 'ברוטו לנטו', 'neto', 760],
  ['minimum', 'שכר מינימום', 'sachar-minimum', 420], ['travel', 'דמי נסיעות', 'nesiot', 440], ['havraa', 'דמי הבראה', 'dmei-havraa', 480],
  ['sick', 'דמי מחלה', 'yemei-machala', 560], ['severance', 'פיצויי פיטורים', 'pitzuim', 620], ['pension', 'הפרשות לפנסיה', 'pensia', 560],
  ['payslip', 'בדיקת תלוש', 'bdikat-tlush', 900],
];

const code = ([calc, name, , h]) => `<iframe src="${SITE}/embed/${calc}/" title="מחשבון ${name}" width="100%" height="${h}" style="border:0;max-width:640px" loading="lazy"></iframe>`;

/** The bare calculator, with one link back. Not for search engines: the guide page is the real one. */
const bare = ([calc, name, guide]) => `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="/app/icons/icon-192.png">
<link rel="canonical" href="${SITE}/${guide}/">
<title>מחשבון ${name} | אצבע</title>
<style>${CSS}
body{background:transparent;padding:0}.calc{margin:0}.by{font-size:13px;color:var(--ink3);margin:8px 4px 0}.by a{color:var(--ink2)}</style>
<script type="module" src="/calc.js"></script>
</head>
<body>
<section class="calc" data-calc="${calc}"><noscript><p>המחשבון צריך JavaScript.</p></noscript></section>
<p class="by">מחשבון של <a href="${SITE}/${guide}/" target="_blank" rel="noopener">אצבע</a>, שעון נוכחות ומחשבון שכר חינמי</p>
</body>
</html>
`;

const howTo = date => page({
  path: '/embed/', date, type: 'WebPage', noCta: true,
  title: 'מחשבוני שכר לאתר שלך, בחינם',
  desc: 'מחשבון שעות נוספות, שבת, נטו, הבראה ועוד, להטמעה באתר, בבלוג או באתר של ארגון. מעתיקים שורה אחת, בלי הרשמה ובלי פרסומות.',
  h1: 'מחשבון לאתר שלך',
  lead: 'יש לך אתר, בלוג או דף של ארגון עובדים? אפשר לשים בו כל אחד מהמחשבונים של אצבע. מעתיקים שורה אחת, והמחשבון מתעדכן לבד כשהמספרים משתנים.',
  body: `
<p>בלי הרשמה, בלי פרסומות ובלי מעקב אחרי הגולשים שלך. המחשבון רץ בדפדפן, ושום דבר שמקלידים בו לא נשלח לשום מקום.</p>
${EMBEDS.map((e, i) => `<h2>${e[1]}</h2>
<pre class="code" id="code${i}">${esc(code(e))}</pre>
<p><button class="btn small" type="button" data-copy="code${i}">להעתיק</button> <a href="/embed/${e[0]}/">לראות איך זה נראה</a></p>`).join('\n')}
<p class="note">אפשר לשנות את הגובה (height) אם המחשבון נחתך. רוצים מחשבון אחר? <a href="mailto:ilan@edvin.co.il">ilan@edvin.co.il</a></p>`,
});

/** Every embed page, as [path, html-for-date]. */
export const embedPages = () => [['/embed/', howTo], ...EMBEDS.map(e => [`/embed/${e[0]}/`, () => bare(e)])];
