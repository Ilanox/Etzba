// The rights page: Israeli labour law in plain words, in Hebrew and in English.
import { $, esc, tm, dShort, $$, nm } from '../util.js';
import { S, place, jobById } from '../state.js';
import { minWage, ageAt, electionDate } from '../pay.js';
import { nextRest, holidaysOfGregorianYear } from '../hebrew-calendar.js';
import { EN, DAYS } from '../lang.js';
import { I } from '../svg-icons.js';
import { speechLang } from '../a11y.js';

export function renderRights() {
  const el = $('#v-rights'), y = new Date().getFullYear();
  const low = S.jobs.filter(j => j.rate < minWage());
  const w = nextRest(new Date(), place());
  const job = jobById(S.settings.lastJob);
  if (EN) { el.innerHTML = rightsEN(y, low, w, qaEN); return; }
  /* translations: skip-start (Hebrew-only page; other languages get the English page above) */
  const qa = (ic, q, a, open) => `<details class="qa"${open ? ' open' : ''}><summary><span class="cell-ic">${I[ic]}</span>${q}<span class="cv">${I.chevDown}</span></summary><div class="ans">${a}</div></details>`;
  el.innerHTML = `<h1 class="title">מה מגיע לי</h1>
    ${low.map(j => `<div class="note">${I.warn}<span>השכר ב"${esc(j.name)}" (₪${j.rate}) נמוך משכר המינימום${(ageAt(new Date()) ?? 99) < 18 ? ' לגילך' : ''}, ₪${minWage()} לשעה מ־1.4.2026.</span></div>`).join('')}
    <div class="note info">${I.info}<span>אצבע מחשבת לפי החוק הכללי. אם במקום העבודה שלך יש הסכם קיבוצי או תנאים טובים יותר, אפשר לשנות את האחוזים בהגדרות העבודה.</span></div>
    ${qa('ot', 'מתי מתחילות שעות נוספות?', `
      <p>בשבוע של <b>5 ימים</b>: אחרי <b>8:36 שעות</b> ביום (ביום המקוצר אחרי 7:36).</p>
      <p>בשבוע של <b>6 ימים</b>: אחרי <b>8 שעות</b> ביום (ביום שישי אחרי 7).</p>
      <p>וגם כל שעה מעבר ל־<b>42 שעות רגילות בשבוע</b>, גם אם בכל יום בנפרד לא עברת את המכסה.</p>
      <p>שעתיים נוספות ראשונות: <b>125%</b>. מהשעה השלישית: <b>150%</b>.</p>`, true)}
    ${qa('info', 'עבדתי יותר מהמתוכנן. למה זה לא שעות נוספות?', `
      <p>זה מבלבל הרבה עובדים שעתיים: שעות נוספות נספרות לפי <b>יום העבודה המלא בחוק</b>, לא לפי המשמרת שתכננו לך.</p>
      <p>אם קבעו לך 5 שעות ונשארת 7, השעתיים הנוספות משולמות ב־100%. התוספת מתחילה רק אחרי 8:36 שעות ביום או 42 שעות בשבוע.</p>
      <p>מה שכן חשוב: <b>כל דקה שעבדת משולמת.</b> תרשמו כל משמרת, כי התיעוד שלכם הוא ההוכחה.</p>`)}
    ${qa('shabbat', 'כמה משלמים על שבת וחג?', `
      <div class="rate-grid"><span>כל שעה בשבת או בחג</span><span>150%</span><span>שעתיים נוספות ראשונות</span><span>175%</span><span>מהשעה הנוספת השלישית</span><span>200%</span></div>
      <p style="margin-top:10px">מי שעבד במנוחה השבועית זכאי גם ליום מנוחה חלופי של 36 שעות במהלך השבוע.</p>
      <p>ערב חג: 100% עד כניסת החג, ו־150% מהכניסה.</p>`)}
    ${qa('pin', 'מתי בדיוק מתחילה ונגמרת שבת?', `
      <p>אצבע מחשבת לפי <b>הדלקת נרות</b> ועד <b>צאת השבת</b> בעיר שבחרת (${esc(S.settings.city)}).</p>
      ${w ? `<p>הקרוב: <b>${esc(w.names.join(' · '))}</b>, מ${DAYS[w.start.getDay()]} ${tm(w.start)} עד ${DAYS[w.end.getDay()]} ${tm(w.end)}.</p>` : ''}
      <p>יש מקומות עבודה שמגדירים שעות קבועות בחוזה (למשל שישי 16:00 עד ראשון 04:00 בשמירה). את זה משנים בהגדרות העבודה.</p>`)}
    ${qa('chag', `חגים ודמי חגים ${y}`, `
      <div class="rate-grid">${holidaysOfGregorianYear(y).map(h => `<span>${h.name}</span><span style="font-weight:600">${DAYS[h.dow]} ${dShort(h.date)}</span>`).join('')}</div>
      <p style="margin-top:10px">עובד שעתי עם <b>3 חודשי ותק</b> מקבל בדרך כלל תשלום על חג שלא חל בשבת, גם בלי לעבוד, אם לא נעדר ביום שלפני החג וביום שאחריו בלי הסכמת המעסיק.</p>
      <p>ומי שעבד בחג מקבל את דמי החג <b>וגם</b> 150% על השעות שעבד.</p>`)}
    ${qa('check', 'עבדתי ביום הבחירות. כמה מגיע לי?', `
      <p>יום הבחירות לכנסת${electionDate() ? ` (<b>${electionDate()}</b>)` : ''} הוא יום שבתון. מי שעובד אצל אותו מעסיק לפחות 14 ימים ברציפות מקבל עליו שכר מלא גם בלי לעבוד.</p>
      <p>מי שכן עבד מקבל לפי <b>נוהג מקובל</b>, שלא כתוב בחוק, <b>200%</b>, ובשעות נוספות 250% ו־300%. יש מעסיקים שמשלמים במקום זה שכר רגיל ונותנים יום חופש אחר.</p>
      <p>אצבע מחשבת 200% על כל שעה שעבדת באותו יום. אפשר לשנות או לכבות בהגדרות העבודה.</p>`)}
    ${qa('coffee', 'הפסקות: מתי משלמים עליהן?', `
      <p>ביום עבודה ארוך מגיעות <b>45 דקות הפסקה</b>, ומתוכן חצי שעה רצופה. בעבודת כפיים זה מ־6 שעות, ובעבודה אחרת מיום של 9 שעות (בשבוע של 5 ימים).</p>
      <p>אם <b>מותר לך לצאת</b> בהפסקה, המעסיק לא חייב לשלם עליה. אם <b>דורשים ממך להישאר</b> במקום העבודה, ההפסקה בתשלום.</p>`)}
    ${qa('night', 'משמרת לילה', `
      <p>משמרת עם לפחות שעתיים בין 22:00 ל־06:00 נחשבת משמרת לילה, ושם יום העבודה הרגיל קצר יותר: <b>7 שעות</b>. מעבר לזה יש שעות נוספות.</p>
      <p>בין יום עבודה ליום הבא מגיעות לפחות <b>8 שעות מנוחה</b>.</p>`)}
    ${qa('receipt', 'סכומים חשובים ל־2026', `
      <div class="rate-grid"><span>שכר מינימום לשעה (מ־1.4.2026)</span><span>₪35.40</span><span>שכר מינימום חודשי</span><span>₪6,443.85</span>
      <span>דמי הבראה ליום (מגזר פרטי)</span><span>₪451.5</span><span>נקודת זיכוי ממס</span><span>₪242</span></div>`)}
    <p class="fine">מידע כללי בלבד, לא ייעוץ משפטי. מבוסס על חוק שעות עבודה ומנוחה וצווי ההרחבה. מקורות: כל זכות, משרד העבודה, ביטוח לאומי.</p>`;
  if (speechLang() === 'en') {
    const tmp = document.createElement('div'); tmp.innerHTML = rightsEN(y, low, w, qaEN);
    const en = [...tmp.querySelectorAll('summary')].map(x => x.textContent.trim()), he = $$('summary', el);
    if (en.length === he.length) he.forEach((x, i) => x.setAttribute('aria-label', en[i]));
  }
}
/* translations: skip-end */

const qaEN = (ic, q, a, open) => `<details class="qa"${open ? ' open' : ''}><summary><span class="cell-ic">${I[ic]}</span>${q}<span class="cv">${I.chevDown}</span></summary><div class="ans">${a}</div></details>`;

function rightsEN(y, low, w, qa) {
  return `<h1 class="title">My rights</h1>
    ${low.map(j => `<div class="note">${I.warn}<span>The wage at "${nm(j.name)}" (₪${j.rate}) is below the minimum wage${(ageAt(new Date()) ?? 99) < 18 ? ' for your age' : ''}, ₪${minWage()} an hour since 1.4.2026.</span></div>`).join('')}
    <div class="note info">${I.info}<span>Etzba follows the general law. If your workplace has a collective agreement or better terms, change the percentages in the job settings.</span></div>
    ${qa('ot', 'When does overtime start?', `
      <p>On a <b>5-day week</b>: after <b>8:36 hours</b> a day (7:36 on the short day).</p>
      <p>On a <b>6-day week</b>: after <b>8 hours</b> a day (7 on Friday).</p>
      <p>Also every hour past <b>42 regular hours a week</b>, even if no single day went over.</p>
      <p>First two overtime hours: <b>125%</b>. From the third: <b>150%</b>.</p>`, true)}
    ${qa('info', 'I worked longer than planned. Why isn’t it overtime?', `
      <p>This confuses many hourly workers: overtime is counted against the <b>full legal work day</b>, not the shift you were scheduled for.</p>
      <p>If you were booked for 5 hours and stayed 7, the extra two are paid at 100%. The premium starts only after 8:36 hours a day or 42 hours a week.</p>
      <p>What matters: <b>every minute you worked is paid.</b> Log every shift; your record is your proof.</p>`)}
    ${qa('shabbat', 'What do Shabbat and holidays pay?', `
      <div class="rate-grid"><span>Every hour on Shabbat or a holiday</span><span>150%</span><span>First two overtime hours</span><span>175%</span><span>From the third overtime hour</span><span>200%</span></div>
      <p style="margin-top:10px">If you worked during the weekly rest you also get a substitute rest of 36 hours that week.</p>
      <p>Holiday eve: 100% until the holiday starts, 150% from then.</p>`)}
    ${qa('pin', 'When exactly does Shabbat start and end?', `
      <p>Etzba counts from <b>candle lighting</b> to <b>the end of Shabbat</b> in your city (${esc(S.settings.city)}).</p>
      ${w ? `<p>Next: <b>${esc(w.names.join(' · '))}</b>, ${DAYS[w.start.getDay()]} ${tm(w.start)} to ${DAYS[w.end.getDay()]} ${tm(w.end)}.</p>` : ''}
      <p>Some workplaces set fixed hours in the contract (security: Friday 16:00 to Sunday 04:00). Change that in the job settings.</p>`)}
    ${qa('chag', `Holidays and holiday pay ${y}`, `
      <div class="rate-grid">${holidaysOfGregorianYear(y).map(h => `<span>${h.name}</span><span style="font-weight:600">${DAYS[h.dow]} ${dShort(h.date)}</span>`).join('')}</div>
      <p style="margin-top:10px">An hourly worker with <b>3 months</b> at the job usually gets paid for a holiday that isn’t on Shabbat, without working it, if they weren’t absent the day before and after without the employer’s consent.</p>
      <p>If you did work the holiday you get the holiday pay <b>and</b> 150% for the hours worked.</p>`)}
    ${qa('check', 'I worked on election day. What am I owed?', `
      <p>Knesset election day${electionDate() ? ` (<b>${electionDate()}</b>)` : ''} is a day off by law. If you’ve worked for the same employer for at least 14 days in a row, you’re paid for it even without working.</p>
      <p>If you did work, <b>accepted practice</b> (not written in the law) is <b>200%</b>, with overtime at 250% and 300%. Some employers pay a regular wage plus another day off instead.</p>
      <p>Etzba pays 200% for every hour you worked that day. You can change or turn this off in the job settings.</p>`)}
    ${qa('coffee', 'Breaks: when are they paid?', `
      <p>A long work day comes with a <b>45-minute break</b>, half an hour of it continuous. For manual work that’s from 6 hours; otherwise from a 9-hour day (5-day week).</p>
      <p>If you’re <b>free to leave</b> during the break, it doesn’t have to be paid. If you’re <b>required to stay</b>, it is paid.</p>`)}
    ${qa('night', 'Night shifts', `
      <p>A shift with at least two hours between 22:00 and 06:00 is a night shift, and the regular day is shorter: <b>7 hours</b>. Past that is overtime.</p>
      <p>Between one work day and the next you’re owed at least <b>8 hours of rest</b>.</p>`)}
    ${qa('receipt', 'Key amounts for 2026', `
      <div class="rate-grid"><span>Minimum hourly wage (from 1.4.2026)</span><span>₪35.40</span><span>Minimum monthly wage</span><span>₪6,443.85</span>
      <span>Convalescence pay per day (private sector)</span><span>₪451.5</span><span>Tax credit point</span><span>₪242</span></div>`)}
    <p class="fine">General information only, not legal advice. Based on the Hours of Work and Rest Law and extension orders. Sources: Kol Zchut, Ministry of Labor, National Insurance.</p>`;
}
