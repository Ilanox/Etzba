// The Shabbat and holiday times on the city pages, drawn the same way by the site generator (into the HTML)
// and by the browser (so a page cached for a week still shows this week). `cal` is the app's js/hebrew-calendar.js.

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const p2 = n => String(n).padStart(2, '0');
export const hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const dm = d => `${d.getDate()}.${d.getMonth() + 1}`;
export const dayName = d => DAYS[d.getDay()];
const NOT_LIT = ['יום העצמאות'];   // a paid holiday with no candles; its times are for pay

/** The coming rest days in a city, from `now`: [{ start, end, name, pay }], at most `n`. */
export function upcoming(cal, city, now, n = 10) {
  const to = new Date(now); to.setDate(to.getDate() + 7 * 12);
  return cal.restWindows(now, to, { city }, { restMode: 'city', chag: true })
    .filter(w => w.end > now).slice(0, n)
    .map(w => ({ start: w.start, end: w.end, name: w.names.join(' ו'), pay: w.names.every(x => NOT_LIT.includes(x)) }));
}

export const tableRows = list => list.map(w =>
  `<tr><td>${w.name}${w.pay ? ' *' : ''}</td><td>${dayName(w.start)} ${dm(w.start)}<b>${hm(w.start)}</b></td><td>${dayName(w.end)} ${dm(w.end)}<b>${hm(w.end)}</b></td></tr>`).join('');

/** One sentence about the next rest day. */
export function nextLine(w, city) {
  if (!w) return '';
  const now = w.start <= Date.now() && Date.now() < w.end;
  return now ? `${w.name} ב${city} עכשיו. היציאה ב${dayName(w.end) === 'שבת' ? 'מוצאי שבת' : `יום ${dayName(w.end)}`}, ${dm(w.end)}, בשעה ${hm(w.end)}.`
    : `${w.name === 'שבת' ? 'השבת הקרובה' : w.name} ב${city}: כניסה ביום ${dayName(w.start)}, ${dm(w.start)}, בשעה ${hm(w.start)}, ויציאה ${dayName(w.end) === 'שבת' ? 'במוצאי שבת' : `ביום ${dayName(w.end)}`} בשעה ${hm(w.end)}.`;
}
