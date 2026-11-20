
const EPOCH = -1373427;
const RD_UNIX = 719163;

function elapsedDays(y) {
  const months = Math.floor((235 * y - 234) / 19);
  const parts = 12084 + 13753 * months;
  let days = 29 * months + Math.floor(parts / 25920);
  if ((3 * (days + 1)) % 7 < 3) days++;
  return days;
}
function yearDelay(y) {
  const a = elapsedDays(y - 1), b = elapsedDays(y), c = elapsedDays(y + 1);
  return c - b === 356 ? 2 : b - a === 382 ? 1 : 0;
}
export function roshHashana(y) { return EPOCH + elapsedDays(y) + yearDelay(y); }

const rdToYMD = rd => { const d = new Date((rd - RD_UNIX) * 864e5); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
const dow = rd => ((rd % 7) + 7) % 7;

export const CITIES = {
  'ירושלים':     [31.778, 35.235, 40],
  'תל אביב':     [32.085, 34.781, 20],
  'חיפה':        [32.794, 34.990, 30],
  'באר שבע':     [31.252, 34.791, 20],
  'ראשון לציון': [31.964, 34.804, 20],
  'פתח תקווה':   [32.087, 34.887, 20],
  'אשדוד':       [31.804, 34.655, 20],
  'נתניה':       [32.321, 34.853, 20],
  'בני ברק':     [32.084, 34.834, 20],
  'חולון':       [32.011, 34.773, 20],
  'רמת גן':      [32.068, 34.824, 20],
  'רחובות':      [31.894, 34.811, 20],
  'הרצליה':      [32.166, 34.843, 20],
  'כפר סבא':     [32.175, 34.907, 20],
  'מודיעין':     [31.898, 35.010, 20],
  'אשקלון':      [31.669, 34.571, 20],
  'טבריה':       [32.795, 35.531, 20],
  'צפת':         [32.965, 35.496, 20],
  'נצרת':        [32.702, 35.297, 20],
  'עפולה':       [32.608, 35.289, 20],
  'קריית שמונה': [33.207, 35.571, 20],
  'אילת':        [29.558, 34.952, 20],
};

export function holidaysOfHebrewYear(y) {
  const rh = roshHashana(y), pesach = roshHashana(y + 1) - 163;
  let atz = pesach + 20;
  const d = dow(atz);
  if (d === 5) atz -= 1; else if (d === 6) atz -= 2; else if (d === 1) atz += 1;
  return [
    [rh, 'ראש השנה א׳'], [rh + 1, 'ראש השנה ב׳'], [rh + 9, 'יום כיפור'],
    [rh + 14, 'סוכות'], [rh + 21, 'שמיני עצרת / שמחת תורה'],
    [pesach, 'פסח'], [pesach + 6, 'שביעי של פסח'], [pesach + 50, 'חג השבועות'],
    [atz, 'יום העצמאות'],
  ];
}

const HOL_CACHE = new Map();
export function holidaysOfGregorianYear(g) {
  if (HOL_CACHE.has(g)) return HOL_CACHE.get(g);
  const out = [];
  for (const y of [g + 3760, g + 3761]) for (const [rd, name] of holidaysOfHebrewYear(y)) {
    const [yy, mm, dd] = rdToYMD(rd);
    if (yy === g) out.push({ rd, name, date: new Date(yy, mm, dd), dow: dow(rd) });
  }
  out.sort((a, b) => a.rd - b.rd);
  HOL_CACHE.set(g, out);
  return out;
}

const rad = Math.PI / 180;
const SUN_CACHE = new Map();
export function sunset(y, m, d, lat, lng) {
  const key = y * 400 + m * 32 + d + '|' + lat + '|' + lng;
  let v = SUN_CACHE.get(key);
  if (v === undefined) { v = +sunsetCalc(y, m, d, lat, lng); if (SUN_CACHE.size > 20000) SUN_CACHE.clear(); SUN_CACHE.set(key, v); }
  return new Date(v);
}
function sunsetCalc(y, m, d, lat, lng) {
  const N = Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 864e5);
  const lngHour = lng / 15, t = N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634) % 360; if (L < 0) L += 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = (RA + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  const H = Math.acos(cosH) / rad / 15;
  let UT = (H + RA - 0.06571 * t - 6.622 - lngHour) % 24; if (UT < 0) UT += 24;
  return new Date(Date.UTC(y, m, d) + UT * 3.6e6);
}

const WIN_CACHE = new Map();
export function restWindows(from, to, place, job) {
  const da = new Date(from); da.setHours(0, 0, 0, 0); da.setDate(da.getDate() - da.getDay());
  const db = new Date(to); db.setHours(0, 0, 0, 0); db.setDate(db.getDate() - db.getDay() + 6);
  const key = +da + '|' + +db + '|' + place.city + '|' + place.candleMin + '|' + place.havdalahMin + '|' + (job.shabbatOn !== false) + '|' + (job.chag !== false) + '|' + job.restMode
    + (job.restMode === 'fixed' ? '|' + JSON.stringify(job.fixedStart) + JSON.stringify(job.fixedEnd) : '');
  let all = WIN_CACHE.get(key);
  if (!all) {
    const dEnd = new Date(db); dEnd.setDate(dEnd.getDate() + 1);
    all = restWindowsCalc(da, dEnd, place, job);
    if (WIN_CACHE.size > 5000) WIN_CACHE.clear();
    WIN_CACHE.set(key, all);
  }
  const f = +new Date(from), t = +new Date(to);
  return all.filter(w => +w.end > f && +w.start < t).map(w => ({ start: new Date(+w.start), end: new Date(+w.end), names: [...w.names] }));
}
function restWindowsCalc(from, to, place, job) {
  const [lat, lng, defCandle] = CITIES[place.city] || CITIES['תל אביב'];
  const candle = place.candleMin ?? defCandle, havdalah = place.havdalahMin ?? 40;
  const win = [];
  const a = new Date(from); a.setDate(a.getDate() - 2); a.setHours(0, 0, 0, 0);
  const b = new Date(to); b.setDate(b.getDate() + 2);

  const chagByDay = new Map();
  for (let g = a.getFullYear(); g <= b.getFullYear(); g++)
    for (const h of holidaysOfGregorianYear(g)) chagByDay.set(h.date.toDateString(), h.name);

  for (let day = new Date(a); day <= b; day.setDate(day.getDate() + 1)) {
    const prev = new Date(day); prev.setDate(prev.getDate() - 1);
    const sStart = new Date(sunset(prev.getFullYear(), prev.getMonth(), prev.getDate(), lat, lng) - candle * 6e4);
    const sEnd = new Date(+sunset(day.getFullYear(), day.getMonth(), day.getDate(), lat, lng) + havdalah * 6e4);

    if (day.getDay() === 6 && job.shabbatOn !== false) {
      if (job.restMode === 'fixed') {
        const st = new Date(day); st.setDate(st.getDate() - ((6 - job.fixedStart.day + 7) % 7));
        const [sh, sm] = job.fixedStart.time.split(':').map(Number); st.setHours(sh, sm, 0, 0);
        const en = new Date(day); en.setDate(en.getDate() + ((job.fixedEnd.day - 6 + 7) % 7));
        const [eh, em] = job.fixedEnd.time.split(':').map(Number); en.setHours(eh, em, 0, 0);
        win.push({ start: st, end: en, names: ['שבת'] });
      } else win.push({ start: sStart, end: sEnd, names: ['שבת'] });
    }
    const chag = chagByDay.get(day.toDateString());
    if (chag && job.chag !== false) win.push({ start: sStart, end: sEnd, names: [chag] });
  }
  win.sort((x, y) => x.start - y.start);
  const merged = [];
  for (const w of win) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) { if (w.end > last.end) last.end = w.end; for (const n of w.names) if (!last.names.includes(n)) last.names.push(n); }
    else merged.push({ start: w.start, end: w.end, names: [...w.names] });
  }
  return merged.filter(w => w.end > from && w.start < to);
}

export function nextRest(now, place) {
  const end = new Date(now); end.setDate(end.getDate() + 10);
  return restWindows(now, end, place, { restMode: 'city', chag: true }).find(w => w.end > now);
}
