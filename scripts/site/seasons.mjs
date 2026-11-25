// A line at the top of the home page that changes with the time of year. The deploy rebuilds the site every week,
// so the right one is up within a few days of its date. No countdowns and no "last chance": just what is relevant now.
import { R } from './guides.mjs';

const n = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const md = d => d.toISOString().slice(5, 10);

/** [from MM-DD, to MM-DD (may wrap into January), text, link text, href, show(today)?] */
export const SEASONS = [
  ['03-15', '04-30', y => `שכר המינימום מאפריל ${y}: ₪${n(R.minWage.find(m => m.from === `${y}-04-01`).hourly, 2)} לשעה.`, 'מה בודקים בתלוש', '/sachar-minimum/',
    t => R.minWage.some(m => m.from === `${t.getFullYear()}-04-01`)],
  ['05-15', '08-31', () => 'יוצאים לעבוד בחופש? מה מגיע לנוער, ומה לבדוק לפני היום הראשון.', 'עבודה בקיץ', '/avoda-bakayitz/'],
  ['06-01', '08-15', y => `דמי הבראה ${y}: ₪${n(R.havraa[y] ?? Object.values(R.havraa).at(-1), 2)} ליום במגזר הפרטי.`, 'כמה מגיע לך', '/dmei-havraa/'],
  ['08-20', '10-20', () => 'עובדים לפי שעה? על ימי החג שבהם לא עבדת ייתכן שמגיע תשלום.', 'דמי חגים', '/dmei-chagim/'],
  ['12-01', '01-15', y => `השנה שלך במספרים: באצבע מחכה סיכום של ${y}, שעות, שכר וממוצעים.`, 'לסיכום השנה', '/app/'],
];

/** The lines for `today`, at most two. */
export function seasonal(today) {
  const t = md(today);
  return SEASONS.filter(([from, to, , , , show]) => (from <= to ? t >= from && t <= to : t >= from || t <= to) && (!show || show(today)))
    .slice(0, 2)
    .map(([from, to, text, link, href]) => {
      const y = from > to && t <= to ? today.getFullYear() - 1 : today.getFullYear();   // early January still talks about last year
      return `<a class="season" dir="rtl" lang="he" href="${href}">${text(y)}<b>${link}</b></a>`;
    });
}
