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
