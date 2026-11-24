// The language the app is shown in, and the day and month names that go with it.
import { S } from './state.js';
import { langInfo } from '../languages/index.js';

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HE_DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export let LANG = langInfo(S.settings.lang || 'he').code;
/** True for any language other than Hebrew. */
export let EN = LANG !== 'he';
/** The loaded language pack, or null for Hebrew. */
export let PACK = null;
export let DAYS = HE_DAYS;
export let MONTHS = HE_MONTHS;
export let DAY_SHORT = HE_DAY_SHORT;

/** Switches the names and page direction to a language and its pack. */
export function useLanguage(info, pack) {
  LANG = info.code; EN = LANG !== 'he'; PACK = pack;
  document.documentElement.lang = LANG; document.documentElement.dir = info.dir;
  DAYS = pack?.days || HE_DAYS; MONTHS = pack?.months || HE_MONTHS; DAY_SHORT = pack?.daysShort || HE_DAY_SHORT;
}
