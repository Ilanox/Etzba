// Builds the guide pages of the website (site/<slug>/index.html) and the sitemap.
// Content lives here; run `npm run site` after changing it, and commit the output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const R = JSON.parse(readFileSync(new URL('../data/rules.json', import.meta.url)));
const T = R.tax['2026'];
const SITE = 'https://etzba.co.il';
const TODAY = new Date().toISOString().slice(0, 10);
const n = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = x => +(x * 100).toFixed(2) + '%';
const MIN = R.minWage.at(-1).hourly, MIN_M = 6443.85;
const youth = p => n(Math.round(MIN * 182.03 * p / 173 * 100) / 100, 2);
const B = T.brackets;

const PAGES = [
  {
    slug: 'shaon-nochechut',
    nav: 'שעון נוכחות',
    title: 'שעון נוכחות בטלפון, חינם, לעובדים לפי שעה',
    desc: 'אפליקציית שעון נוכחות חינמית: נגיעה אחת בכניסה למשמרת ואחת ביציאה, והשכר מחושב לפי החוק תוך כדי. בלי חשבון, בלי פרסומות, עובד גם בלי אינטרנט.',
    h1: 'שעון נוכחות בטלפון',
    lead: 'נגיעה אחת כשנכנסים למשמרת, נגיעה אחת כשיוצאים. אצבע רושמת את השעות ומחשבת את השכר לפי החוק, תוך כדי המשמרת.',
    body: `
<h2>למה לרשום שעות בעצמך</h2>
<p>המעסיק חייב לנהל רישום של שעות העבודה, אבל טעויות בתלוש קורות: שעה נוספת שלא נספרה, משמרת שבת ששולמה כרגילה, יום שנשכח. כשהשעות רשומות אצלך, אפשר לבדוק את התלוש שורה אחר שורה ולדעת מראש כמה אמור להיכנס.</p>
<h2>איך זה עובד</h2>
<ul>
<li><b>כניסה ויציאה בנגיעה.</b> מהאפליקציה, מהווידג׳ט במסך הבית, או מההתראה. הסכום עולה בזמן אמת.</li>
<li><b>שכחת להחתים יציאה?</b> אחרי 12 שעות מגיעה תזכורת, ואפשר לתקן את שעת היציאה. אפשר גם להוסיף משמרת שכבר עבדת, או משמרת עתידית.</li>
<li><b>כמה מקומות עבודה.</b> לכל אחד תעריף, נסיעות והגדרות משלו.</li>
<li><b>הפסקות, טיפים ובונוסים.</b> מקופלים בצד, כדי שהמשמרת הרגילה תישאר פשוטה.</li>
<li><b>ייבוא וייצוא.</b> ייבוא משמרות מאקסל ו־CSV, גם מאפליקציות אחרות, וייצוא לאקסל או לגוגל שיטס.</li>
</ul>
<h2>מה מחושב אוטומטית</h2>
<p><a href="../shaot-nosafot/">שעות נוספות</a> ביום ובשבוע, <a href="../shabbat/">שבת וחג</a> לפי זמני השבת בעיר שלך, משמרות לילה, <a href="../nesiot/">דמי נסיעות</a>, ימי מחלה וחופשה, ו<a href="../neto/">נטו משוער</a> אחרי מס, ביטוח לאומי ופנסיה.</p>
<h2>הנתונים נשארים אצלך</h2>
<p>אין חשבון ואין שרת: המשמרות נשמרות רק בטלפון, והמעסיק לא רואה אותן. אין פרסומות ואין מעקב. אפשר לשמור קובץ גיבוי מלא ולהעביר לטלפון חדש.</p>`,
    faq: [
      ['שעון הנוכחות עולה כסף?', 'לא. אצבע חינמית, בלי חשבון ובלי פרסומות.'],
      ['המעסיק רואה את השעות שלי?', 'לא. הכל נשמר רק בטלפון שלך. אפשר לייצא דוח ולשלוח אותו אם רוצים.'],
      ['אפשר להוסיף משמרת אחרי שהיא נגמרה?', 'כן. מוסיפים משמרת עם שעת כניסה ויציאה, גם כזו שמסתיימת אחרי חצות.'],
      ['זה עובד בלי אינטרנט?', 'כן, מהפעם הראשונה שפותחים.'],
    ],
  },
  {
    slug: 'shaot-nosafot',
    nav: 'שעות נוספות',
    title: 'חישוב שעות נוספות 2026: 125% ו־150%, עם דוגמה',
    desc: 'איך מחשבים שעות נוספות לעובד לפי שעה: מתי מתחילות, 125% לשעתיים הראשונות ו־150% מהשלישית, שבוע של 42 שעות, משמרות לילה ויום מקוצר. עם דוגמה מחושבת.',
    h1: 'חישוב שעות נוספות',
    lead: 'שעה נוספת היא כל שעה מעבר ליום העבודה או לשבוע העבודה הרגילים. השעתיים הראשונות ביום משולמות 125%, ומהשעה השלישית 150%.',
    body: `
<h2>מתי מתחילות שעות נוספות</h2>
<table><thead><tr><th>סוג העבודה</th><th>שעות רגילות</th></tr></thead><tbody>
<tr><td>שבוע של 5 ימים</td><td>8.6 שעות ביום</td></tr>
<tr><td>שבוע של 6 ימים</td><td>8 שעות ביום, 7 ביום שלפני המנוחה השבועית</td></tr>
<tr><td>משמרת לילה (לפחות שעתיים בין 22:00 ל־06:00)</td><td>7 שעות</td></tr>
<tr><td>בכל שבוע</td><td>42 שעות</td></tr>
</tbody></table>
<p>שעות מעבר ל־42 בשבוע הן שעות נוספות גם אם אף יום לא עבר את המכסה היומית. שעה לא נספרת פעמיים: שעה שכבר שולמה כנוספת ביום לא נספרת שוב במכסה השבועית.</p>
<h2>כמה משלמים</h2>
<ul>
<li><b>125%</b> על השעתיים הנוספות הראשונות ביום.</li>
<li><b>150%</b> מהשעה הנוספת השלישית.</li>
<li><b>175% ו־200%</b> על שעות נוספות <a href="../shabbat/">בשבת או בחג</a>.</li>
</ul>
<h2>דוגמה</h2>
<p>עובד בשבוע של 5 ימים, ₪40 לשעה, משמרת של 11 שעות ביום חול:</p>
<table><tbody>
<tr><td>8.6 שעות × ₪40</td><td>₪344</td></tr>
<tr><td>2 שעות × ₪50 (125%)</td><td>₪100</td></tr>
<tr><td>0.4 שעה × ₪60 (150%)</td><td>₪24</td></tr>
<tr><th>סה״כ</th><th>₪468</th></tr>
</tbody></table>
<p>בלי שעות נוספות, אותה משמרת הייתה ₪440. ההפרש, ₪28, הוא בדיוק מה שנעלם כשתלוש סופר את כל השעות כרגילות.</p>
<h2>הפסקות</h2>
<p>במשמרת של 6 שעות ומעלה מגיעה הפסקה של 45 דקות, מתוכן 30 ברצף. אם מותר לך לצאת בזמן ההפסקה, היא לא בתשלום ולא נספרת בשעות. אם אסור לצאת, היא נחשבת זמן עבודה.</p>
<h2>עד גיל 18</h2>
<p>לבני נוער אסור לעבוד שעות נוספות, וגם השבוע קצר יותר: 40 שעות. אבל אם עבדת אותן, מגיע לך תשלום עליהן. <a href="../noar-oved/">עוד על נוער עובד</a>.</p>`,
    faq: [
      ['איך מחשבים שעות נוספות בשבוע של 5 ימים?', 'אחרי 8.6 שעות ביום, השעתיים הבאות ב־125% וכל שעה אחריהן ב־150%. גם שעות מעבר ל־42 בשבוע הן שעות נוספות.'],
      ['כמה זה 125% משכר של ₪40 לשעה?', '₪50 לשעה. 150% הם ₪60 לשעה.'],
      ['משמרת לילה מזכה ביותר?', 'כן: במשמרת לילה שעות נוספות מתחילות אחרי 7 שעות במקום 8 או 8.6.'],
    ],
  },
  {
    slug: 'shabbat',
    nav: 'שבת וחג',
    title: 'תשלום על עבודה בשבת ובחג: 150%, 175% ו־200%',
    desc: 'כמה משלמים על עבודה בשבת ובחג לעובד לפי שעה: 150% לכל שעה במנוחה השבועית, 175% ו־200% לשעות נוספות, דמי חג ויום הבחירות. מתי שבת מתחילה ונגמרת לצורך שכר.',
    h1: 'עבודה בשבת ובחג',
    lead: 'כל שעה במנוחה השבועית או בחג משולמת 150% לפחות. שעות נוספות בשבת משולמות 175%, ומהשעה הנוספת השלישית 200%.',
    body: `
<h2>מתי שבת מתחילה לצורך השכר</h2>
<p>המנוחה השבועית נמשכת לפחות 36 שעות ברצף, ואצל עובדים יהודים היא כוללת את השבת. ברוב מקומות העבודה סופרים מכניסת השבת ועד צאתה בעיר שבה עובדים, ולכן החורף והקיץ שונים: בדצמבר שבת נכנסת מוקדם יותר. אצבע יודעת את זמני השבת בכל עיר ומחלקת כל משמרת לדקות הרגילות ולדקות של שבת.</p>
<p>יש מקומות עבודה שקובעים שעות קבועות לשבת, למשל מיום שישי 16:00 ועד מוצאי שבת, בכל חודש. אם כך במקום העבודה שלך, אפשר להגדיר באצבע שעות קבועות, והחישוב יתאים לתלוש.</p>
<h2>כמה משלמים</h2>
<table><thead><tr><th></th><th>שבת או חג</th></tr></thead><tbody>
<tr><td>שעות רגילות</td><td>150%</td></tr>
<tr><td>שעתיים נוספות ראשונות</td><td>175%</td></tr>
<tr><td>מהשעה הנוספת השלישית</td><td>200%</td></tr>
</tbody></table>
<p>משמרת שמתחילה ביום שישי ונמשכת לתוך השבת מתחלקת: השעות שלפני כניסת השבת ברגיל, והשעות שאחריה ב־150% ומעלה.</p>
<h2>חגים ודמי חג</h2>
<p>עבודה ביום חג משולמת כמו שבת. בנוסף, עובד לפי שעה שעבד לפחות 3 חודשים זכאי לתשלום על ימי החג גם כשלא עבד בהם, בתנאי שלא נעדר יום לפני החג ויום אחריו בלי הסכמת המעסיק.</p>
<h2>יום הבחירות</h2>
<p>יום הבחירות לכנסת הוא יום שבתון בתשלום. מי שעובד בו מקבל 200%. אצבע מסמנת את יום הבחירות אוטומטית.</p>`,
    faq: [
      ['כמה מקבלים על שעה בשבת?', '150% מהשכר הרגיל. בשכר של ₪40 לשעה, ₪60 לשעה.'],
      ['ומה עם שעות נוספות בשבת?', 'השעתיים הנוספות הראשונות ב־175% ומהשלישית ב־200%.'],
      ['משמרת של יום שישי שנמשכת לתוך שבת?', 'מתחלקת: עד כניסת השבת בתעריף רגיל, ומשם 150%. אצבע מחשבת את זה לפי הדקה.'],
    ],
  },
  {
    slug: 'neto',
    nav: 'מחשבון נטו',
    title: 'מחשבון שכר נטו 2026: מס הכנסה, נקודות זיכוי וביטוח לאומי',
    desc: `איך מגיעים מברוטו לנטו ב־2026: מדרגות מס הכנסה, נקודת זיכוי ₪${T.pointValue}, ביטוח לאומי ובריאות, ופנסיה. עם דוגמה מתלוש אמיתי.`,
    h1: 'מברוטו לנטו',
    lead: 'נטו הוא מה שנכנס לחשבון: הברוטו פחות מס הכנסה, ביטוח לאומי, מס בריאות והפרשה לפנסיה.',
    body: `
<h2>מס הכנסה 2026</h2>
<table><thead><tr><th>הכנסה חודשית</th><th>שיעור המס</th></tr></thead><tbody>
${B.map((b, i) => `<tr><td>${b[0] ? `${i ? '₪' + n(B[i - 1][0] + 1) + ' עד ' : 'עד '}₪${n(b[0])}` : `מעל ₪${n(B[i - 1][0])}`}</td><td>${pct(b[1])}</td></tr>`).join('\n')}
</tbody></table>
<p>מהמס מורידים <b>נקודות זיכוי</b>: כל נקודה שווה ₪${T.pointValue} בחודש. גבר מקבל 2.25 נקודות ואישה 2.75, ויש נקודות נוספות לפי מצב (ילדים, תואר, שחרור מצבא ועוד). לכן גבר בלי נקודות נוספות לא משלם מס הכנסה עד בערך ₪${n(Math.round(2.25 * T.pointValue / B[0][1] / 50) * 50)} בחודש.</p>
<h2>ביטוח לאומי ובריאות</h2>
<table><thead><tr><th></th><th>עד ₪${n(T.blLow)}</th><th>מעל ₪${n(T.blLow)}</th></tr></thead><tbody>
<tr><td>ביטוח לאומי</td><td>${pct(T.niLow)}</td><td>${pct(T.niHigh)}</td></tr>
<tr><td>מס בריאות</td><td>${pct(T.hLow)}</td><td>${pct(T.hHigh)}</td></tr>
</tbody></table>
<p>עד גיל 18 לא מנכים ביטוח לאומי ובריאות מהשכר בכלל.</p>
<h2>פנסיה</h2>
<p>אחרי תקופת המתנה (בדרך כלל 6 חודשים), יורדים מהשכר שלך בדרך כלל 6% לפנסיה, והמעסיק מוסיף משלו 6.5% ועוד פיצויים. הפנסיה חובה מגיל 21 לגברים ומגיל 20 לנשים.</p>
<h2>דוגמה מתלוש אמיתי</h2>
<p>תלוש של פברואר 2026: ברוטו ₪5,608, גבר עם 2.25 נקודות זיכוי, בלי פנסיה עדיין.</p>
<table><tbody>
<tr><td>מס הכנסה: 10% × ₪5,608 פחות ₪544.5 זיכוי</td><td>₪17</td></tr>
<tr><td>ביטוח לאומי: 1.04%</td><td>₪58</td></tr>
<tr><td>מס בריאות: 3.23%</td><td>₪181</td></tr>
<tr><th>נטו</th><th>₪5,352</th></tr>
</tbody></table>
<p>אצבע, מאותן משמרות, הגיעה כמעט לאותם ניכויים: הפרש של ₪4.</p>`,
    faq: [
      ['כמה שווה נקודת זיכוי ב־2026?', `₪${T.pointValue} בחודש, כלומר ₪${n(T.pointValue * 12)} בשנה.`],
      ['על משכורת של ₪6,000 משלמים מס הכנסה?', 'גבר עם 2.25 נקודות משלם בערך ₪55, ואישה עם 2.75 נקודות לא משלמת בכלל. ביטוח לאומי ובריאות יורדים בכל מקרה.'],
      ['בני נוער משלמים מס?', 'בחוק כן, אבל בשנים שבהן מלאו להם 16 או 17 יש להם נקודת זיכוי נוספת, ולכן ברוב המקרים לא יורד מס. ביטוח לאומי ובריאות לא יורדים עד גיל 18.'],
    ],
  },
  {
    slug: 'sachar-minimum',
    nav: 'שכר מינימום',
    title: `שכר מינימום 2026: ₪${n(MIN, 2)} לשעה, ולנוער לפי גיל`,
    desc: `שכר המינימום מ־1.4.2026: ₪${n(MIN_M, 2)} לחודש ו־₪${n(MIN, 2)} לשעה. שכר מינימום לנוער: ₪${youth(.7)}, ₪${youth(.75)} ו־₪${youth(.83)} לשעה לפי גיל.`,
    h1: 'שכר מינימום 2026',
    lead: `מ־1 באפריל 2026 שכר המינימום הוא ₪${n(MIN_M, 2)} לחודש במשרה מלאה, ו־₪${n(MIN, 2)} לשעה.`,
    body: `
<h2>מבוגרים</h2>
<table><thead><tr><th>מתאריך</th><th>לחודש</th><th>לשעה</th></tr></thead><tbody>
<tr><td>1.4.2026</td><td>₪${n(MIN_M, 2)}</td><td>₪${n(MIN, 2)}</td></tr>
<tr><td>1.4.2025</td><td>₪6,247.67</td><td>₪34.32</td></tr>
</tbody></table>
<h2>נוער</h2>
<table><thead><tr><th>גיל</th><th>אחוז משכר המינימום</th><th>לשעה מ־1.4.2026</th></tr></thead><tbody>
<tr><td>עד 16</td><td>70%</td><td>₪${youth(.7)}</td></tr>
<tr><td>16 עד 17</td><td>75%</td><td>₪${youth(.75)}</td></tr>
<tr><td>17 עד 18</td><td>83%</td><td>₪${youth(.83)}</td></tr>
</tbody></table>
<p>בחודש שבו יש יום הולדת, השכר מתחלק לפי הגיל בכל חלק של החודש. <a href="../noar-oved/">עוד זכויות של נוער עובד</a>.</p>
<h2>מה נחשב בשכר המינימום</h2>
<p>הבדיקה היא על השכר הרגיל לשעה. תוספות כמו <a href="../shaot-nosafot/">שעות נוספות</a>, <a href="../shabbat/">שבת</a> ו<a href="../nesiot/">דמי נסיעות</a> לא נספרות כדי להגיע למינימום, הן באות מעליו. טיפים שהמעסיק מחשב כחלק מהשכר הם עניין אחר, וכדאי לבדוק מה כתוב בחוזה.</p>
<p>אצבע מזהירה כשהתעריף שהזנת נמוך משכר המינימום, לפי הגיל שלך אם הזנת תאריך לידה.</p>`,
    faq: [
      ['מה שכר המינימום לשעה ב־2026?', `₪${n(MIN, 2)} לשעה מ־1.4.2026. לפני כן ₪34.32.`],
      ['מה שכר המינימום לנוער בן 17?', `₪${youth(.83)} לשעה, 83% משכר המינימום.`],
      ['מעסיק משלם פחות משכר המינימום, מה עושים?', 'זו הפרה של החוק. כדאי לפנות קודם למעסיק עם החישוב, ואם זה לא נפתר, לאגף האכיפה במשרד העבודה או לארגון עובדים.'],
    ],
  },
  {
    slug: 'noar-oved',
    nav: 'נוער עובד',
    title: 'נוער עובד: שכר מינימום, שעות, ביטוח לאומי וחופשה',
    desc: 'הזכויות של בני נוער עובדים עד גיל 18: שכר מינימום לפי גיל, 8 שעות ביום ו־40 בשבוע, בלי שעות נוספות, בלי ניכוי ביטוח לאומי, 18 ימי חופשה ופנסיה מגיל 21.',
    h1: 'נוער עובד: מה מגיע לך',
    lead: 'עד גיל 18 יש כללים משלך: שכר מינימום לפי גיל, יום עבודה קצר יותר, בלי ניכוי ביטוח לאומי מהשכר, ויותר ימי חופשה.',
    body: `
<h2>שכר מינימום</h2>
<p>עד גיל 16: ₪${youth(.7)} לשעה. בגיל 16: ₪${youth(.75)}. בגיל 17: ₪${youth(.83)}. מגיל 18 שכר מינימום מלא, ₪${n(MIN, 2)}. <a href="../sachar-minimum/">הטבלה המלאה</a>.</p>
<h2>שעות עבודה</h2>
<ul>
<li>עד 8 שעות ביום ו־40 שעות בשבוע. במקום עבודה של 5 ימים בשבוע, מגיל 16 מותר עד 9 שעות ביום, כל עוד השבוע לא עובר 40.</li>
<li>שעות נוספות אסורות. אבל אם עבדת אותן, המעסיק חייב לשלם עליהן כמו לכל עובד.</li>
<li>עבודה בלילה מוגבלת: בדרך כלל אסור לעבוד בין 20:00 ל־08:00, ובני 16 עד 18 שלא חלה עליהם חובת לימוד יכולים לעבוד עד 22:00. בחופשות לימודים, בני 16 עד 18 יכולים לעבוד עד 01:00 אם אין למחרת יום לימודים.</li>
<li>הגיל המינימלי לעבודה הוא 15, ו־14 בחופשות.</li>
</ul>
<h2>ניכויים</h2>
<ul>
<li><b>ביטוח לאומי ובריאות:</b> לא יורדים מהשכר שלך עד גיל 18. המעסיק משלם בשבילך סכום קטן.</li>
<li><b>מס הכנסה:</b> בשנים שבהן מלאו לך 16 או 17 יש לך נקודת זיכוי נוספת, כך שברוב המקרים לא יורד מס. <a href="../neto/">איך מחשבים נטו</a>.</li>
<li><b>פנסיה:</b> חובה רק מגיל 21 לבנים ו־20 לבנות.</li>
</ul>
<h2>חופשה</h2>
<p>עד גיל 18 מגיעים 18 ימי חופשה בשנה כולל סופי שבוע, כלומר 14 ימי עבודה במקום של 5 ימים בשבוע ו־16 במקום של 6 ימים. מי שעבד רק חלק מהשנה מקבל חלק יחסי.</p>
<p>באצבע מזינים תאריך לידה (לא חובה, נשמר רק בטלפון), וכל הכללים האלה נכנסים לחישוב לבד.</p>`,
    faq: [
      ['בן 16 משלם ביטוח לאומי?', 'לא. עד גיל 18 לא מנכים ביטוח לאומי ובריאות מהשכר.'],
      ['כמה שעות מותר לעבוד בגיל 16?', 'עד 8 שעות ביום ו־40 בשבוע. במקום עבודה של 5 ימים, עד 9 ביום.'],
      ['מגיעה לנוער פנסיה?', 'הפנסיה חובה רק מגיל 21 לבנים ו־20 לבנות.'],
    ],
  },
  {
    slug: 'nesiot',
    nav: 'דמי נסיעות',
    title: `דמי נסיעות 2026: עד ₪${n(R.travelMaxDaily, 2)} ליום עבודה`,
    desc: `כמה מגיע על נסיעות לעבודה ב־2026: עד ₪${n(R.travelMaxDaily, 2)} ליום עבודה, רק על ימים שבהם עבדת. מתי מגיע, איך מחשבים בעבודה לפי שעה, ומה לבדוק בתלוש.`,
    h1: 'דמי נסיעות',
    lead: `המעסיק משלם את הוצאות הנסיעה לעבודה ובחזרה, עד ₪${n(R.travelMaxDaily, 2)} ליום עבודה.`,
    body: `
<h2>איך זה עובד</h2>
<ul>
<li>התשלום הוא לפי מחיר הנסיעה בתחבורה ציבורית, עד ₪${n(R.travelMaxDaily, 2)} ליום.</li>
<li>משלמים על ימים שבהם עבדת בפועל. על ימי חופשה ומחלה לא משלמים נסיעות.</li>
<li>אם המעסיק מסיע אותך, או שאתה גר קרוב מספיק כדי ללכת ברגל, ייתכן שלא מגיע.</li>
<li>אם חופשי חודשי זול יותר, המעסיק יכול לשלם אותו במקום תשלום לפי ימים.</li>
</ul>
<h2>בעבודה לפי שעה</h2>
<p>בתלוש תופיע שורה של נסיעות: מספר ימי העבודה כפול הסכום היומי. למשל 13 ימים × ₪16 = ₪208.</p>
<p>באצבע מזינים את הסכום היומי במקום העבודה, והנסיעות מתווספות לכל יום שבו עבדת, עם תקרה חודשית אם יש.</p>`,
    faq: [
      ['כמה מגיע על נסיעות ליום ב־2026?', `עד ₪${n(R.travelMaxDaily, 2)} ליום עבודה, לפי מחיר התחבורה הציבורית.`],
      ['משלמים נסיעות על יום חופשה?', 'לא. דמי נסיעות משולמים רק על ימים שבהם עבדת.'],
    ],
  },
];

const CSS = `@font-face{font-family:Heebo;src:url(/heebo.woff) format('woff');font-weight:100 900;font-display:swap}
:root{--bg:#141518;--surface:#1D1F23;--line:#2E3036;--ink:#ECE9E1;--ink2:#B9B4AA;--ink3:#8E8B85;--blue:#6C9BE8}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 Heebo,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--blue)}.wrap{max-width:760px;margin:0 auto;padding:0 22px}
header{border-bottom:1px solid var(--line)}header .wrap{display:flex;align-items:center;gap:14px;height:62px;max-width:1080px}
.brand{font-weight:900;font-size:23px;text-decoration:none;color:var(--ink)}
header nav{margin-inline-start:auto;font-size:15px}header nav a{color:var(--ink2);text-decoration:none}
.crumbs{font-size:14px;color:var(--ink3);margin:28px 0 0}.crumbs a{color:var(--ink3)}
h1{font-size:clamp(34px,6vw,52px);line-height:1.1;font-weight:900;letter-spacing:-.5px;margin:10px 0 14px}
.lead{font-size:20px;color:var(--ink);margin:0 0 28px}
h2{font-size:25px;font-weight:800;margin:40px 0 10px;line-height:1.25}
p,li{color:var(--ink2)}b{color:var(--ink)}ul{padding-inline-start:20px}li{margin:6px 0}
table{width:100%;border-collapse:collapse;margin:14px 0;font-variant-numeric:tabular-nums}
th,td{text-align:start;padding:11px 10px;border-bottom:1px solid var(--line)}th{color:var(--ink);font-weight:700}td{color:var(--ink2)}
.cta{margin:44px 0;padding:26px;border:1px solid var(--line);border-radius:18px;background:var(--surface)}
.cta p{margin:0 0 16px;color:var(--ink)}.btn{display:inline-block;padding:13px 22px;border-radius:13px;background:var(--ink);color:#141518;font-weight:700;text-decoration:none}
.faq details{border-bottom:1px solid var(--line);padding:14px 0}.faq summary{cursor:pointer;font-weight:700;color:var(--ink)}.faq p{margin:8px 0 0}
.more{display:flex;flex-wrap:wrap;gap:10px 18px;padding:0;list-style:none}.more li{margin:0}
footer{border-top:1px solid var(--line);margin-top:56px;padding:30px 0 46px;font-size:15px;color:var(--ink3)}footer a{color:var(--ink2);text-decoration:none;margin-inline-end:18px}
.note{font-size:14px;color:var(--ink3)}`;

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ld = o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

function page(p) {
  const url = `${SITE}/${p.slug}/`;
  const others = PAGES.filter(x => x !== p);
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
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
${ld({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.desc, inLanguage: 'he', mainEntityOfPage: url, dateModified: TODAY, image: `${SITE}/img/he/home.jpg`, author: { '@type': 'Person', name: 'Ilan Levy' }, publisher: { '@type': 'Organization', name: 'אצבע', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/app/icons/icon-512.png` } } })}
${ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'אצבע', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: p.h1, item: url }] })}
${ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })}
<link rel="preload" href="/heebo.woff" as="font" type="font/woff" crossorigin>
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">אצבע</a><nav><a href="/app/">לפתוח את האפליקציה</a></nav></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="מיקום"><a href="/">אצבע</a> › ${p.h1}</nav>
<article>
<h1>${p.h1}</h1>
<p class="lead">${p.lead}</p>
${p.body.trim()}
<div class="cta"><p>אצבע מחשבת את כל זה לבד: שמים אצבע בכניסה וביציאה, ורואים את השכר לפי החוק, עד הנטו. חינם, בלי חשבון ובלי פרסומות.</p><a class="btn" href="/app/">לפתוח את אצבע</a></div>
<h2>שאלות נפוצות</h2>
<div class="faq">${p.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
<p class="note">המידע כללי ונכון ל־${TODAY.split('-').reverse().join('.')}. הוא לא ייעוץ משפטי, ובמקום עבודה עם הסכם קיבוצי או חוזה מיטיב ייתכנו תנאים טובים יותר.</p>
</article>
<h2>עוד מדריכים</h2>
<ul class="more">${others.map(o => `<li><a href="/${o.slug}/">${o.nav}</a></li>`).join('')}</ul>
</main>
<footer><div class="wrap"><a href="/">אצבע</a><a href="/privacy">מדיניות פרטיות</a><a href="mailto:ilan@edvin.co.il">ilan@edvin.co.il</a></div></footer>
</body>
</html>
`;
}

for (const p of PAGES) {
  mkdirSync(new URL(`../site/${p.slug}/`, import.meta.url), { recursive: true });
  writeFileSync(new URL(`../site/${p.slug}/index.html`, import.meta.url), page(p));
}

const urls = [['/', '1.0', 'weekly'], ...PAGES.map(p => [`/${p.slug}/`, '0.8', 'monthly']), ['/app/', '0.6', 'weekly'], ['/privacy', '0.3', 'yearly']];
writeFileSync(new URL('../site/sitemap.xml', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr, f]) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);

// the home page's guide links, between the markers
const homeF = new URL('../site/index.html', import.meta.url);
let home = readFileSync(homeF, 'utf8');
const links = PAGES.map(p => `<a class="guide" dir="rtl" lang="he" href="${p.slug}/"><b>${p.nav}</b><span>${p.title}</span></a>`).join('\n    ');
home = home.replace(/(<!-- guides -->)[\s\S]*?(<!-- \/guides -->)/, `$1\n    ${links}\n    $2`);
writeFileSync(homeF, home);
console.log(`${PAGES.length} guide pages, sitemap with ${urls.length} URLs`);
