// A shift handed over from the website's calculators, as /app/?add=2026-11-27,08:00,17:30 (date, start, end).
// The end may be earlier than the start: the shift then ends the next day.
const KEY = 'etzba.addLink';

/** { start, end } from the link's value, or null when it doesn't describe a sensible shift. */
export function parseAddLink(v, now = new Date()) {
  const m = /^(\d{4})-(\d\d)-(\d\d),(\d\d):(\d\d),(\d\d):(\d\d)$/.exec(v || '');
  if (!m) return null;
  const [, y, mo, d, sh, sm, eh, em] = m.map(Number);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const start = new Date(y, mo - 1, d, sh, sm), end = new Date(y, mo - 1, d, eh, em);
  if (start.getMonth() !== mo - 1 || start.getDate() !== d) return null;   // 31.2 and the like
  if (end <= start) end.setDate(end.getDate() + 1);
  if (Math.abs(start - now) > 400 * 864e5) return null;
  return { start, end };
}

/** Reads the link once, takes it off the address bar, and keeps it until a shift sheet can open. */
export function takeAddLink() {
  const p = new URLSearchParams(location.search), v = p.get('add');
  if (v != null) {
    p.delete('add');
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p : '') + location.hash);
    try { sessionStorage.setItem(KEY, v); } catch {}
  }
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch {}
  return saved ? parseAddLink(saved) : null;
}

export function doneAddLink() { try { sessionStorage.removeItem(KEY); } catch {} }
