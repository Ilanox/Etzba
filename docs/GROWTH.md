# Getting the word out

What the website does to bring people to the app, the switches that turn parts of it on, and material for
outside the site. The lines that don't move: no invented reviews or quotes, no countdowns or "last chance",
and no "your employer is stealing from you". A payslip that doesn't match is a reason to check, not to accuse.

## The switches (scripts/site/config.mjs)

Each one is empty until it is real, and its part of the site stays hidden until then. After changing one:
`npm run site`, commit, push.

| Switch | When to fill it | What appears |
|---|---|---|
| `PLAY` | the day the app is live on Google Play | every "open the app" button and the QR codes point to Play; the home page's Play button becomes a link |
| `WHATSAPP` | when the channel exists | a link in every page's footer |
| `QUOTES` | when a tester agrees, in writing, to be quoted | one quote in each page's card, all of them on the home page |
| `RATING` | when Play shows a rating from real reviews | the stars line on the home page and the rating in Google's results |

For a quote, keep the tester's words as they wrote them (fix typos only), and their name the way they agreed
(first name, initials, or "מלצרית מחיפה"). Keep the message where they agreed, in case they ask to be removed.
For the rating, copy the number and count from the Play Console by hand; update it every month or two.

## What the site does by itself

- **Shabbat times per city** (`/zmanei-shabbat/`, 22 cities): written into the pages for the next ten weeks, rebuilt
  every Thursday by the deploy, and recomputed in the visitor's browser when it is set to Israel's time zone.
  The times come from the app's own calendar, checked against a printed calendar in the tests.
- **Guides** (16) and **pages per kind of work** (7): figures come from `data/rules.json`, so they change with the app.
- **The line of the season** at the top of the home page (`scripts/site/seasons.mjs`): the minimum wage in April,
  summer jobs and recuperation pay in the summer, holiday pay before the holidays, the year's recap in December.
- **Get the app**: a bar at the bottom on phones, a QR code on computers, and "send to a friend" in every card.
- **Calculator → app**: the overtime and Shabbat calculators end with a link that opens the app's new-shift form
  with the same hours (`/app/?add=2026-11-27,08:00,17:30`).
- **Calculators for other sites** (`/embed/`): one line of code each. Worth sending to workers' organisations,
  youth movements, student unions and job boards.

In the app: **the month as a picture** (Summary → ייצוא) and **send Etzba to a friend** (Settings).

## WhatsApp channel

One message a week at most, on what changed or what is coming, each with one link to the site:
the minimum wage in April, recuperation pay in June, the summer-jobs page in June, holiday pay before Rosh Hashana,
a reminder to back up, a new version of the app. No chain messages, no "share with 10 friends".

## Short videos (vertical, 15 to 30 seconds)

Each one: a question on screen in the first second, the answer on a phone screen, the site or the app at the end.
Film the real app with sample shifts, never anyone's real pay.

1. **שבת** — On screen: "כמה מגיע על משמרת שבת?" A Friday shift starting at 14:00 in Tel Aviv. The app splits it at
   16:16, candles. "עד כניסת שבת: רגיל. מכאן: 150%." End: the city's times page.
2. **השעה התשיעית** — "משמרת של 11 שעות. כמה מהן שעות נוספות?" The overtime calculator: 8.6 regular, 2 at 125%,
   0.4 at 150%. "ההפרש: ₪28 על משמרת אחת." End: "לרשום את המשמרת באצבע".
3. **שכחתי להחתים** — A notification after 12 hours: "שכחת לצאת?" Fix the time in one tap. "אצבע זוכרת בשבילך."
4. **בן 16 בחופש** (June) — "כמה מקבל בן 16 לשעה?" The minimum by age, no National Insurance under 18.
   End: the summer-jobs page.
5. **דמי חגים** (September) — "חג באמצע השבוע, ולא עבדת. מגיע תשלום?" Three conditions on screen. End: the guide.
6. **החודש שלי** (December) — the month picture filling the screen, one figure at a time. "גם לך יש חודש כזה."

## Every season

| When | What |
|---|---|
| January | update `data/rules.json` (tax, National Insurance, travel) and `AVG_WAGE` in `scripts/site/guides.mjs` |
| March | when the April minimum wage is published: add it to `minWage` in `data/rules.json` |
| June | recuperation rate for the year in `havraa` |
| Weekly, by itself | Shabbat times and the line of the season |
