// Brings the city pages' times up to date in the browser. Only on a device set to Israel's time zone:
// the calendar works in local time, so elsewhere the times written into the page stay as they are.
import * as cal from '/app/js/hebrew-calendar.js';
import { upcoming, tableRows, nextLine, hm, dm, dayName } from '/shabbat-render.js';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (tz === 'Asia/Jerusalem' || tz === 'Asia/Tel_Aviv') {
  const now = new Date();
  for (const t of document.querySelectorAll('[data-city]')) {
    const list = upcoming(cal, t.dataset.city, now, +t.dataset.n || 10);
    t.querySelector('tbody').innerHTML = tableRows(list);
    const line = document.querySelector(`[data-next="${t.dataset.city}"]`);
    if (line) line.textContent = nextLine(list[0], t.dataset.city);
  }
  // the all-cities table: one row per city, this week's Shabbat
  for (const t of document.querySelectorAll('[data-cities]')) {
    for (const row of t.querySelectorAll('tr[data-c]')) {
      const w = upcoming(cal, row.dataset.c, now, 12).find(x => x.name.includes('שבת'));
      if (!w) continue;
      row.cells[1].textContent = hm(w.start); row.cells[2].textContent = hm(w.end);
    }
    const w = upcoming(cal, 'תל אביב', now, 12).find(x => x.name.includes('שבת'));
    const cap = t.querySelector('caption');
    if (w && cap) cap.textContent = `שבת ${dm(w.end)}: כניסה ביום ${dayName(w.start)}, יציאה במוצאי שבת`;
  }
}
