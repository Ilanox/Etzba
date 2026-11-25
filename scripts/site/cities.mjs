// Shabbat and holiday times for each city the app knows, one page per city and one for all of them.
// The times come from the app's own calendar (js/hebrew-calendar.js), so the site and the pay agree to the minute.
// They are written into the page for the coming weeks; the deploy rebuilds them every week, and a browser in Israel
// recomputes them on the spot (site/shabbat-times.js).
import * as cal from '../../js/hebrew-calendar.js';
import { upcoming, tableRows, nextLine, hm, dm, dayName } from '../../site/shabbat-render.js';
import { page, esc } from './layout.mjs';

export const SLUGS = {
  'ירושלים': 'jerusalem', 'תל אביב': 'tel-aviv', 'חיפה': 'haifa', 'באר שבע': 'beer-sheva', 'ראשון לציון': 'rishon-lezion',
  'פתח תקווה': 'petah-tikva', 'אשדוד': 'ashdod', 'נתניה': 'netanya', 'בני ברק': 'bnei-brak', 'חולון': 'holon', 'רמת גן': 'ramat-gan',
  'רחובות': 'rehovot', 'הרצליה': 'herzliya', 'כפר סבא': 'kfar-saba', 'מודיעין': 'modiin', 'אשקלון': 'ashkelon', 'טבריה': 'tiberias',
  'צפת': 'tzfat', 'נצרת': 'nazareth', 'עפולה': 'afula', 'קריית שמונה': 'kiryat-shmona', 'אילת': 'eilat',
};
export const HUB = '/zmanei-shabbat/';
const path = city => `${HUB}${SLUGS[city]}/`;
const NAMES = Object.keys(SLUGS);

const TABLE = (city, list) => `<table class="times" data-city="${city}" data-n="${list.length}"><thead><tr><th>מה</th><th>כניסה</th><th>יציאה</th></tr></thead><tbody>${tableRows(list)}</tbody></table>`;

function cityPage(city, now, date) {
  const [, , candle] = cal.CITIES[city], list = upcoming(cal, city, now, 10), next = list[0], shab = list.find(w => w.name.includes('שבת'));
  const others = NAMES.filter(c => c !== city);
  return page({
    path: path(city), date, type: 'WebPage', crumbs: [['זמני שבת', HUB]],
    title: `זמני שבת ${city}: כניסת שבת ויציאת שבת השבוע`,
    desc: `זמני כניסת שבת ויציאת שבת ב${city} לשבוע הזה ולשבועות הבאים, כולל חגים. ${shab ? `השבת: ${hm(shab.start)} עד ${hm(shab.end)}.` : ''} ומה זה אומר על השכר אם עובדים בשבת.`,
    h1: `זמני שבת ב${city}`,
    lead: `<span data-next="${city}">${nextLine(next, city)}</span>`,
    body: `
${TABLE(city, list)}
<p class="note">הדלקת נרות ${candle} דקות לפני השקיעה${candle !== 20 ? ` (המנהג ב${city})` : ''}, ויציאה 40 דקות אחרי השקיעה. יש קהילות שנוהגות אחרת בכמה דקות.${list.some(w => w.pay) ? ' * ביום העצמאות אין הדלקת נרות: השעות הן לחישוב שכר החג.' : ''}</p>
<h2>עובדים בשבת ב${city}?</h2>
<p>כל שעה בין כניסת השבת ליציאתה משולמת לפחות <b>150%</b>, ושעה נוספת בשבת משולמת 175% ו־200%. בחגים זה אותו דבר. משמרת שמתחילה ביום שישי אחר הצהריים מקבלת 150% רק על החלק שאחרי כניסת השבת, ומשמרת במוצאי שבת רק עד היציאה.</p>
<p>אצבע יודעת את זמני השבת ב${city} ומחלקת כל משמרת לבד: איזה חלק רגיל ואיזה בתעריף שבת. <a href="/shabbat/">מחשבון שכר לשבת וחג</a> · <a href="/shaot-nosafot/">שעות נוספות</a></p>`,
    faq: [
      [`מתי נכנסת שבת ב${city} השבוע?`, shab ? `ביום ${dayName(shab.start)}, ${dm(shab.start)}, בשעה ${hm(shab.start)}. היציאה במוצאי שבת בשעה ${hm(shab.end)}.` : ''],
      [`כמה דקות לפני השקיעה מדליקים נרות ב${city}?`, `${candle} דקות. היציאה מחושבת 40 דקות אחרי השקיעה.`],
      ['מאיזו שעה משמרת בשבת משולמת 150%?', 'מכניסת השבת ועד צאתה, לפי הזמנים בעיר שבה עובדים. אם בחוזה כתובות שעות קבועות למנוחה השבועית, קובעות השעות שבחוזה.'],
    ].filter(([, a]) => a),
    more: `<h2>זמני שבת בערים נוספות</h2>\n<ul class="more">${others.map(c => `<li><a href="${path(c)}">${c}</a></li>`).join('')}</ul>`,
    scripts: ['/shabbat-times.js'],
  });
}

function hubPage(now, date) {
  const rows = NAMES.map(c => {
    const w = upcoming(cal, c, now, 12).find(x => x.name.includes('שבת'));
    return { c, w };
  });
  const ta = rows.find(r => r.c === 'תל אביב').w;
  return page({
    path: HUB, date, type: 'WebPage',
    title: 'זמני שבת השבוע: כניסת שבת ויציאת שבת בכל הערים',
    desc: 'זמני כניסת שבת ויציאת שבת השבוע ב־22 ערים בישראל, עם החגים הקרובים. ומה מגיע למי שעובד בשבת.',
    h1: 'זמני שבת השבוע',
    lead: 'כניסת השבת ויציאתה בכל עיר, לפי השקיעה במקום. לחיצה על עיר מראה את השבועות הבאים והחגים.',
    body: `
<table class="times" data-cities><caption>שבת ${dm(ta.end)}: כניסה ביום ${dayName(ta.start)}, יציאה במוצאי שבת</caption><thead><tr><th>עיר</th><th>כניסה</th><th>יציאה</th></tr></thead><tbody>
${rows.map(({ c, w }) => `<tr data-c="${c}"><td><a href="${path(c)}">${c}</a></td><td>${hm(w.start)}</td><td>${hm(w.end)}</td></tr>`).join('\n')}
</tbody></table>
<h2>למה השעות חשובות לשכר</h2>
<p>עבודה בשבת ובחג משולמת לפחות 150%, אבל רק על השעות שבתוך השבת. השעה המדויקת שבה השבת נכנסת בעיר שלך קובעת כמה מהמשמרת של יום שישי, או של מוצאי שבת, מקבלת את התעריף הגבוה. אצבע מחשבת את זה לבד לפי העיר. <a href="/shabbat/">על השכר בשבת ובחג</a></p>`,
    scripts: ['/shabbat-times.js'],
  });
}

/** Every times page, as [path, html-for-date]. */
export function cityPages(now) {
  return [[HUB, d => hubPage(now, d)], ...NAMES.map(c => [path(c), d => cityPage(c, now, d)])];
}
export const cityLinks = () => NAMES.map(c => `<a class="guide" dir="rtl" lang="he" href="${path(c).slice(1)}"><b>${esc(c)}</b><span>זמני שבת ב${esc(c)}</span></a>`);
