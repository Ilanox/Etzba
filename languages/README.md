# Translations

The app is written in Hebrew. Each other language is one file in this folder that maps the Hebrew on screen to that language. Nothing in the code needs to change to fix wording or add a language.

| File | What it is |
|---|---|
| `index.js` | the list of languages shown in Settings |
| `en.js` | English |

## Fix or change a translation
1. Open `en.js` and search for the Hebrew text, or for the current English.
2. Change the English, save, and reload the app.

## Find what's missing
```bash
npm run check:translations
```
This scans the app for every Hebrew text and writes `languages/missing-<code>.txt`. That file has two lists:
- **missing:** still shows Hebrew.
- **word-by-word:** translated, but worth proper wording.

Each line is already in the right format to paste into the pack.

## Add a language (e.g. Russian)
1. Copy `en.js` to `ru.js`. Set `code: 'ru'`, `name: 'Русский'` and `dir: 'ltr'` (`'rtl'` for Arabic). Translate `days`, `months`, and the right-hand side of every entry.
2. In `index.js`, uncomment or add: `{ code: 'ru', name: 'Русский', dir: 'ltr', load: () => import('./ru.js') }`.
3. Run `npm run check:translations -- ru` to see what's left.

Notes:
- The "What am I owed" page has its own full English text in `js/app.js` (`rightsEN`). Other languages show that English page until it gets its own version.
- CSV exports stay in Hebrew on purpose, so they open the same way for everyone.

## The four kinds of entries

```js
phrases:   { 'שמירה': 'Save' }                          // whole text on screen, exact match (best)
templates: [ ['נוספו {} משמרות', 'Added {1} shifts'] ]  // {} = a number or name; {1}, {2}… put them back
words:     { 'שבת': 'Shabbat' }                          // short terms; also used to patch unknown text word by word
polish:    [ [/\b1 shifts\b/g, '1 shift'] ]             // regex fixes after translating (plurals, word order)
```

In templates the pieces can come back in any order: `['{} ש׳ מתוך {}', '{1} h of {2}']`.
