# אצבע — משמרות ושכר

Shift tracker and pay calculator for hourly workers in Israel. One codebase runs as:

- **Android app** (Google Play), built with Capacitor 8
- **Website / installable web app** (GitHub Pages)

It works **fully offline**: everything, including the Heebo font, is inside the app, and data stays on the phone. iOS can be added later from the same code without changes; see the end of this file.

An Edvin Studios Project

---

## Run it on your computer (VS Code)
Open the folder in VS Code, then either:
- press **F5** (it starts and opens the browser), or
- in the terminal: `npm start`

Then open **http://localhost:5173**. To try it on your phone, open the "Phone" address it prints (same Wi-Fi). This needs nothing installed except Node.js.

## What you need
- [Node.js 22+](https://nodejs.org)
- [Android Studio](https://developer.android.com/studio)
- To publish: a Google Play Console account (one-time $25)

## First time
```bash
npm install
npm run android:init     # builds www/, creates android/, adds share-to-app, icons and splash
npm run apk              # → etzba.apk (copy to the phone, or: npm run install-apk)
```

## After changing code
```bash
npm run android
```
This rebuilds and opens Android Studio.

**Version:** set `"version"` in `package.json` (e.g. `1.19.0`); the build turns it into Android's version numbers.

## Publishing on Google Play
1. Android Studio → **Build → Generate Signed App Bundle** → create a keystore.
   **Back it up with its password.** Every future update needs it, and it's kept out of git.
2. In [Play Console](https://play.google.com/console), create the app (name **אצבע**, default language Hebrew) and upload the `.aab`.
3. Store listing:
   - Screenshots from the phone.
   - Icon: `resources/icon-only.png`.
   - Privacy policy: host `privacy.html` on GitHub Pages and use that link. Add your email first.
4. **Data safety:** "No data collected or shared".
5. New personal accounts first run a closed test with 12 testers for 14 days.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `style.css` | the page and all styling |
| `js/app.js` | the app: screens, settings, import/export |
| `js/pay-engine.js` | pay rules: overtime, Shabbat, holidays, election day, weekly limit |
| `js/hebrew-calendar.js` | Jewish holidays and Shabbat times per city (offline) |
| `js/net-pay.js` | gross to net: income tax, National Insurance, pension |
| `js/rules.js`, `data/rules.json` | yearly figures (minimum wage, election days, tax tables): built in, updated online |
| `js/file-reader.js` | reads .xls / .xlsx / .csv files |
| `js/shift-import.js` | turns spreadsheet rows into shifts |
| `js/translate.js` | translation engine (see `languages/`) |
| `js/native-bridge.js` | phone features: share sheet, files shared in, haptics, back button |
| `js/diagnostics.js` | crash log, timings, self-test (Settings → אבחון ותקלות) |
| `js/svg-icons.js` | all icons and the fingerprint-clock mark |
| `languages/` | translations: one file per language, plus how to edit them |
| `service-worker.js` | offline cache for the website version |
| `native/android/` | Android extras: files shared in, home-screen widget, workplace arrival |
| `features.json` | build switches: `widget`, `arrivalDetection` |
| `tests/` | `unit/` (pay, holidays 2026–2035, tax, import, rules) and `e2e/` (the app in a browser) |
| `scripts/` | build, native setup, translation check |
| `resources/` | source icon and splash artwork; ready-made Android sizes are in `native/android/res/` |
| `privacy.html` | privacy policy for the store |

## Release (Google Play)
```
npm run release
```
Makes `etzba-<version>.aab` (upload to Play) and a signed `etzba-<version>.apk` to try first. The first run creates your upload key (`etzba-upload.jks` + `keystore.properties`, never committed): back them up. Store texts, answers and screenshots: [`store/`](store/listing.md).

## Tests
```
npm test                 # unit tests, no packages needed
npx playwright install chromium   # once
npm run test:e2e         # the app in a phone-sized browser, with a pretend Android bridge
```

## Yearly figures (works offline)
Holidays and Shabbat times are calculated, so every year works with no internet. Minimum wage, election days and tax tables are built in (`js/rules.js`), and the app checks `data/rules.json` on GitHub Pages at most once a day when online. To update everyone: edit `data/rules.json`, raise `version`, push. Keep `BUILT_IN` in `js/rules.js` the same for new installs (`npm test` checks they match).

## Build switches
`features.json` decides what goes into the app: `widget`, `arrivalDetection`, and `devTools` (diagnostics and developer tools in Settings). `arrivalDetection` (workplace arrival notifications) needs "location all the time", which Google Play reviews separately, so it's off for now. Change it, then `npm run android` or `npm run apk`.

## Translations
See [`languages/README.md`](languages/README.md). In short: edit `languages/en.js`, and run `npm run check:translations` to list anything untranslated.

## Sharing files into the app
Share an `.xls`, `.xlsx` or `.csv` from any app (your old shift app, WhatsApp, Files, Gmail) and choose **אצבע**, or use "Open with". The import preview opens with the file loaded.

## Website (GitHub Pages)
Upload the repo, then **Settings → Pages → `main` / root**.

## Later: iOS
Needs a Mac, Xcode and the Apple Developer Program ($99/year).
```bash
npm i @capacitor/ios && npx cap add ios && node scripts/native-setup.mjs && npx cap sync ios
```
The setup script already handles iOS ("Open in אצבע").
