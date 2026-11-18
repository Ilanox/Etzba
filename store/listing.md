# Google Play listing · אצבע

Everything to paste into Play Console. Screenshots, the feature graphic and the 512×512 icon are in `store/screenshots/`.
To make them again: `node store/make-screenshots.mjs`.

## Main store listing: Hebrew (iw-IL), the default language

**App name** (30 max)
```
אצבע · משמרות ושכר
```

**Short description** (80 max)
```
שמים אצבע בכניסה וביציאה, ורואים כמה מגיע לך: שעות נוספות, שבת, חג ונטו.
```

**Full description** (4000 max)
```
אצבע היא אפליקציה פשוטה לעובדים לפי שעה: שמים אצבע כשנכנסים למשמרת, ושמים אצבע כשיוצאים. השכר מחושב תוך כדי, לפי החוק בישראל.

⏱ שעון משמרת
• כניסה ויציאה בנגיעה אחת, והסכום עולה לנגד העיניים
• שכחת לשים אצבע? משנים את שעת הכניסה או מוסיפים משמרת בדיעבד
• ווידג׳ט למסך הבית בשלושה גדלים: כניסה ויציאה בנגיעה, הזמן והשכר עד עכשיו

💰 כל דקה בתעריף הנכון
• שעות נוספות 125% ו־150%, ביום ובשבוע (המכסה השבועית ניתנת לשינוי)
• שבת וחג לפי זמני כניסת ויציאת השבת בעיר שלך
• יום מקוצר, משמרות לילה, הפסקות, נסיעות, טיפים ובונוסים
• יום הבחירות ב־200%
• הסבר ברור לכל משמרת: כמה שעות בכל תעריף, ולמה

📊 סיכום שבועי, חודשי ושנתי
• ברוטו ונטו משוער: מס הכנסה, נקודות זיכוי, ביטוח לאומי, בריאות ופנסיה
• גרף לפי ימים, ומעקב אחרי המכסה השבועית

📚 מה מגיע לי
• הזכויות של עובדים לפי שעה, בשפה פשוטה: שעות נוספות, שבת, חגים, הפסקות, נסיעות ועוד

🔔 התראות במשמרת (אפשר לכבות)
• "השעות הנוספות התחילו", "שבת שלום · התוספת התחילה", ותזכורת אם שכחת לצאת. בלי ספאם ובלי תזכורות אחרות.

📂 ייבוא וייצוא
• ייבוא משמרות מקובצי Excel ו־CSV, גם מאפליקציות אחרות, ישירות מתפריט השיתוף
• ייצוא ל־CSV לאקסל או לגוגל שיטס, וגיבוי מלא לקובץ

🔒 פרטי לגמרי
• הכל נשמר בטלפון שלך. בלי חשבון, בלי שרת, בלי פרסומות ובלי מעקב
• עובד גם בלי אינטרנט

כמה עבודות במקביל? אין בעיה. כל עבודה עם שכר, נסיעות וכללים משלה.
גם באנגלית.

החישובים הם הערכה לפי החוק והכללים המקובלים, ולא תחליף לתלוש השכר או לייעוץ משפטי.

An Edvin Studios Project
```

## Translation: English (en-US)

**App name**
```
Etzba · Shifts & Pay
```

**Short description**
```
Tap in, tap out, and see what you're owed: overtime, Shabbat, holidays and net.
```

**Full description**
```
Etzba is a simple shift tracker and pay calculator for hourly workers in Israel. Tap in when your shift starts, tap out when it ends, and see your pay add up, calculated by Israeli labour law.

⏱ Shift clock
• Clock in and out with one tap, and watch your earnings grow
• Forgot to tap? Change the start time, or add a shift later
• A home-screen widget in three sizes: clock in and out, time and pay so far

💰 Every minute at the right rate
• 125% and 150% overtime, daily and weekly (the weekly limit is adjustable)
• Shabbat and holidays by candle-lighting and havdalah times in your city
• Short days, night shifts, breaks, travel, tips and bonuses
• Election day at 200%
• A clear breakdown for every shift: how many hours at each rate, and why

📊 Weekly, monthly and yearly summary
• Gross and estimated net: income tax, credit points, National Insurance, health tax and pension
• A chart by day, and your progress towards the weekly limit

📚 Know your rights
• What hourly workers are owed, in plain words: overtime, Shabbat, holidays, breaks, travel and more

🔔 Shift notifications (optional)
• "Overtime has started", "Shabbat shalom · the premium has started", and a reminder if you forgot to clock out. No spam, no other reminders.

📂 Import and export
• Import shifts from Excel and CSV files, even from other apps, straight from the share menu
• Export to CSV for Excel or Google Sheets, and full backups to a file

🔒 Completely private
• Everything stays on your phone. No account, no server, no ads, no tracking
• Works offline

More than one job? Each gets its own pay, travel and rules.
In Hebrew and English.

Calculations are an estimate based on the law and common practice, not a substitute for your payslip or legal advice.

An Edvin Studios Project
```

## Store settings

| Field | Value |
|---|---|
| App or game | App |
| Free or paid | Free |
| Category | Productivity (Finance also fits, but asks for more declarations) |
| Tags | Time tracking, Productivity, Calculator |
| Email | ilan@edvin.co.il |
| Website | https://etzba.ilanox.dev/ |
| Privacy policy | https://etzba.ilanox.dev/privacy.html |
| Ads | No |
| Target audience | 18 and over (simplest: avoids the Families policy) |
| Countries | Israel (add more later if you like) |

## App content answers

**Data safety:** the app collects no data and shares no data.
- "Does your app collect or share any of the required user data types?" → **No**
- Data is encrypted in transit → not applicable (nothing is sent)
- The only network request is a public, anonymous download of `data/rules.json` (minimum wage and tax tables). It sends no user data.

**Content rating questionnaire:** category "Utility, Productivity, Communication, or Other"; answer **No** to everything (no violence, user content, sharing location, purchases, gambling) → rated Everyone / 3+.

**Permissions you may be asked about:**
- Notifications: shift notifications, can be turned off in Settings
- No exact-alarm permission: notifications use normal scheduling and arrive on time or within a minute or two.
- No location (arrival detection is switched off in `features.json`)

**Financial features declaration:** "My app doesn't provide any financial features" (it's a calculator: no payments, loans or accounts).

**Government apps:** No. **News app:** No. **Health app:** No.

## Release notes for 1.0.0

Hebrew:
```
הגרסה הראשונה של אצבע 🎉
שעון משמרת, חישוב שכר לפי החוק (שעות נוספות, שבת, חג, לילה), סיכום ברוטו ונטו, ווידג׳ט למסך הבית, ייבוא מאקסל, והכל נשמר רק בטלפון שלך.
```
English:
```
The first release of Etzba 🎉
Shift clock, pay calculated by Israeli law (overtime, Shabbat, holidays, nights), gross and net summary, a home-screen widget, Excel import, and everything stays on your phone.
```

## Before production: test checklist

- Internal testing track first: upload the .aab, read the **pre-launch report** (crashes, accessibility, screenshots on Google's devices).
- Phones: your Samsung (One UI) plus at least one Pixel or other brand, one older Android (10–12), one small screen.
- Each phone: Hebrew and English · largest system font · dark and light · airplane mode on first launch.
- Notifications: start a shift, close the app, reboot the phone, battery saver on, and check the overtime notification still arrives. Then turn notifications off in the phone's settings and check the app says so.
- Samsung: Settings → Battery → Background usage limits: make sure אצבע isn't in "Sleeping apps" during the test.
- Widget: all three sizes, in Hebrew and English, clocking in and out from it.
- Data: update over the previous build (data kept), uninstall/reinstall with Google backup on (data restored), restore from a backup file.

## Publishing steps

1. `npm run release` (the first time it makes your signing key and asks for a password)
   → `etzba-1.0.0.aab` to upload, and `etzba-1.0.0.apk` to try on your phone first.
2. **Back up `etzba-upload.jks` and `keystore.properties`.** Without them you can't update the app.
3. Play Console → Create app → fill in the listing above, upload the screenshots and feature graphic.
4. Testing → **Closed testing** (new personal accounts must run a closed test with 12 testers for 14 days before going to production) → upload the .aab.
5. Accept **Play App Signing** when asked (Google keeps the final key, yours is the upload key).
6. After the test period: Production → Create release → the same .aab → Review.
