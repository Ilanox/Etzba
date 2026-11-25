# Developing אצבע

## Tech

Vanilla JavaScript ES modules, no framework and no bundler. Android through [Capacitor 8](https://capacitorjs.com) with a few native Java plugins (share-to-app, widget, app actions). Tested with Node's test runner and Playwright.

| Path | Contents |
|---|---|
| `index.html` | the app shell |
| `css/` | styling, one file per screen (`base`, `components`, `home`, `shift-form`, `shifts`, `summary`, `rights`, `settings`, `onboarding`, `recap`), then `themes` and `adapt` (English, large text, light mode, reduced motion), loaded in that order |
| `js/app.js` | start-up: wires the parts together and runs each start step |
| `js/views/` | one file per screen or sheet: `home`, `shift-form`, `shifts`, `summary`, `rights`, `settings`, `job`, `data`, `onboarding`, `recap`, … |
| `js/state.js`, `js/nav.js` | the saved data and saving it; which screen and month is shown, redrawing |
| `js/pay.js` | the glue between the saved shifts and the pay engine: month totals, live pay, age rules |
| `js/ui.js`, `js/util.js`, `js/theme.js`, `js/lang.js` | sheets, popups and toasts; small helpers; themes; the current language |
| `js/notifications.js`, `js/widget.js`, `js/outside.js` | shift notifications, the home screen widget, location and actions from outside the app |
| `js/problems.js`, `js/diagnostics.js` | the problem bar and diagnostic report; the log and timings |
| `js/pay-engine.js` | pay rules: overtime, Shabbat, holidays, election day, weekly limit, breaks |
| `js/hebrew-calendar.js` | Jewish holidays and Shabbat times per city |
| `js/net-pay.js` | gross to net: income tax, National Insurance, health tax, pension |
| `js/rules.js`, `data/rules.json` | yearly figures, built in and updated online |
| `js/translate.js`, `js/remote-packs.js`, `languages/` | translation engine, online pack updates, language packs |
| `js/native-bridge.js` | everything that talks to Android |
| `js/file-reader.js`, `js/shift-import.js` | reading .xls/.xlsx/.csv and turning rows into shifts |
| `native/android/` | Java plugins, the widget (`EtzbaWidget`, `WidgetState`, `WidgetViews`, `WidgetArt`), Android resources |
| `site/` | the website at etzba.co.il; the guide pages are generated from `scripts/site/` by `npm run site` |
| `store/` | Google Play listing, screenshots and the generator for them |
| `tests/` | `unit/` (one file per part: pay engine, net pay, translations, project checks…) and `e2e/` (one file per area of the app, sharing `helpers.mjs`) |
| `scripts/` | build, Android setup, release, install, logs, data; `lib.mjs` has what they share |
| `features.json` | build switches: `widget`, `arrivalDetection`, `devTools` |


## What stops a broken version

Every push to `main` goes through `.github/workflows/pages.yml`:

1. **Tests**: unit tests, browser tests, and the translation check (`--strict`: no text may stay in Hebrew). If anything fails, nothing is published and the site stays on the last version that passed. GitHub emails you.
2. **Deploy**: the website, the web app and `/data/`. The app's offline cache and `js/build-info.js` are stamped with the commit; `data/status.json` records the test results for the dashboard.
3. **Live check**: `scripts/live-check.mjs` opens the live site like a visitor (every page; the app must start and be stamped with this commit; the files the phones download must pass the app's own checks) and fails if anything is wrong. Run it yourself any time: `npm run live-check`.
4. **Rollback**: if the live check fails, the workflow publishes again the last pushed commit that passed everything (a `workflow_dispatch` run named "Rollback to …"). The broken commit is still on `main`: fix it and push.

`npm run release` runs the unit tests and the translation check before building for Play (skip with `-- --skip-tests`).

On the phones: downloaded yearly figures, language packs and early-access dates are checked before use (a bad file is ignored, the last good one stays); saved data and backups are checked and upgraded on load.

### The developer dashboard

In developer mode: Settings → **לוח בקרה** (also from the developer tools). It shows whether the last deploy passed and where it failed, which commit is live, the test counts, whether the live check passed, and whether this phone (app build, yearly figures, language pack, web cache) is behind the website. A red dot on the Settings tab means the last deploy failed. It reads GitHub's public API and `data/status.json`, no sign-in, and tells apart: the phone offline, the website not answering, GitHub not answering, and an automatic rollback.

### Tests on the phone

Dashboard → **בדיקות במכשיר** runs `js/device-tests.js` on the phone itself: every Android plugin loads, version and build number, the data copy on disk, writing a file, notification permission, scheduling and removing a notification (the real ones are put back), the widget update, the Google Play support products (shows which are missing from Play Console), past purchases, downloading the yearly figures and the English pack, and pay, holiday, Shabbat and number-format results compared with answers worked out on the computer (`js/device-fixtures.js`, from `node scripts/device-fixtures.mjs`; a unit test keeps it current). **בדיקה אחרי הפעלה מחדש** restarts the app and checks no data was lost. **לשלוח את הדוח** shares a text file with every result, the phone's details and the end of the app's log, ready to send for diagnosis. In a browser the Android-only tests are skipped; a browser test runs them all against the pretend Android bridge.

## Getting started

Requires [Node.js 22+](https://nodejs.org). For Android also [Android Studio](https://developer.android.com/studio) and JDK 21.

```bash
npm install
npm start            # the web app at http://localhost:5173 (also prints an address for a phone on the same Wi-Fi)
```

### Android

```bash
npm run android:init     # first time: creates android/, plugins, icons, splash
npm run apk              # test build → etzba.apk
npm run install-apk      # install it on a phone over USB
npm run android          # rebuild and open Android Studio
```

### Commands

| Command | What it does |
|---|---|
| `npm start` | run the web app locally |
| `npm test` | unit tests (no packages needed) |
| `npm run test:e2e` | the app in a phone-sized browser, with a simulated Android bridge (`npx playwright install chromium` once) |
| `npm run apk` / `install-apk` | test build, and install it over USB |
| `npm run release` / `install-release` | signed Google Play build (`.aab` + `.apk`), and install it over USB |
| `npm run logs` | live log from the phone over USB (`-- --start` restarts the app first, `-- --verbose` shows everything) |
| `npm run data` | rebuild the downloadable language packs in `data/lang/` |
| `npm run check:translations` | list texts that aren't translated yet |

## Releasing

1. Set `"version"` in `package.json`; the Android version code is derived from it.
2. `npm run release`. The first run creates the upload key (`etzba-upload.jks`, `keystore.properties`), which is never committed. **Back it up**: updates can't be published without it.
3. Upload `etzba-<version>.aab` in Play Console. Listing texts, data-safety answers and the test checklist are in [`store/listing.md`](store/listing.md).

## Updates without a store release

| What | Source | How to publish |
|---|---|---|
| Yearly figures (minimum wage, tax tables, election days) | `data/rules.json` | edit, raise `version`, push; keep `BUILT_IN` in `js/rules.js` in step (`npm test` checks) |
| Translations | `languages/<code>.js` → `data/lang/<code>.json` | edit the pack, `npm run data`, push; the version rises by itself |

Phones check once a day when online. Anything else (screens, pay logic, the widget) needs a new release.

## Website

`.github/workflows/pages.yml` publishes **etzba.co.il** on every push to `main`:

- `/`: the home page (`site/`)
- `/app/`: the web app
- `/data/`: the downloadable data
- `/privacy`: the privacy policy

One-time setup: Settings → Pages → Source **GitHub Actions**, custom domain `etzba.co.il`.

## Translations

Every language is one file in `languages/`. See [`languages/README.md`](languages/README.md) for the format; `npm run check:translations` lists what's missing.

## Build switches

`features.json` decides what goes into the Android app:

- `widget`: the home-screen widget.
- `arrivalDetection`: workplace arrival notifications. It needs background location, which Google Play reviews separately, so it's off.
- `devTools`: the diagnostics and developer screens in Settings. Off for release.

## iOS (later)

Needs a Mac, Xcode and the Apple Developer Program.

```bash
npm i @capacitor/ios && npx cap add ios && node scripts/native-setup.mjs && npx cap sync ios
```
