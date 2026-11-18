// אצבע — icon set (stroke icons, 24×24) + the fingerprint-clock mark.
const s = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const I = {
  home: s('<path d="M7.5 20.5c-1.5-2-2.2-4.4-2.2-7a6.7 6.7 0 0 1 13.4 0c0 1.2-.1 2.4-.4 3.5"/><path d="M9.5 21c-.8-1.7-1.2-3.5-1.2-5.5v-2a3.7 3.7 0 0 1 7.4 0v1"/><path d="M12 13.5v2.5c0 1.8.4 3.5 1.2 5"/><path d="M4 9.5A8.7 8.7 0 0 1 19.6 7"/>'),
  list: s('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'),
  coins: s('<ellipse cx="12" cy="7" rx="6.5" ry="2.8"/><path d="M5.5 7v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V7"/><path d="M5.5 12v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5"/>'),
  book: s('<path d="M12 6.5C10 5 7.5 4.5 4.5 4.8v13.4c3-.3 5.5.2 7.5 1.7 2-1.5 4.5-2 7.5-1.7V4.8C16.5 4.5 14 5 12 6.5Z"/><path d="M12 6.5v13.4"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  morning: s('<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 4v3M5.6 8.6l1.6 1.6M18.4 8.6l-1.6 1.6M2.5 14h2M19.5 14h2"/>'),
  noon: s('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  evening: s('<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 9V4M9.5 6.5 12 9l2.5-2.5"/><path d="M5 21h14"/>'),
  night: s('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z"/><path d="M17 4.5v2M16 5.5h2"/>'),
  shabbat: s('<path d="M8 21V11M16 21V11"/><path d="M6 21h12"/><path d="M8 8.5c-1-1-1-2.4 0-3.8 1 1.4 1 2.8 0 3.8ZM16 8.5c-1-1-1-2.4 0-3.8 1 1.4 1 2.8 0 3.8Z"/>'),
  chag: s('<path d="M12 3.5l2.3 4.6 5 .7-3.6 3.6.9 5.1L12 15.1l-4.6 2.4.9-5.1-3.6-3.6 5-.7Z"/><path d="M5 21h14"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.2"'),
  sort: s('<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/>'),
  download: s('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  share: s('<path d="M12 15V4M8 7.5 12 3.5l4 4"/><path d="M6 11H5v9h14v-9h-1"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  chevL: s('<path d="M15 6l-6 6 6 6"/>'),
  chevR: s('<path d="M9 6l6 6-6 6"/>'),
  chevDown: s('<path d="M6 9l6 6 6-6"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  warn: s('<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/>'),
  briefcase: s('<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17"/>'),
  pin: s('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.3"/>'),
  receipt: s('<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>'),
  file: s('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z"/><path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5"/>'),
  trash: s('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  lock: s('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  clockEdit: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  bell: s('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  bellOff: s('<path d="M6 16.5V11a6 6 0 0 1 9.6-4.8M18 11v5.5l1.5 1.5H8"/><path d="M10 20.5a2 2 0 0 0 4 0M4 4l16 16"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.2"'),
  x: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  coffee: s('<path d="M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z"/><path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.5M8 3.5v2.5M12 3.5v2.5"/>'),
  ot: s('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>'),
  heart: s('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>'),
  pct: s('<path d="M18.5 5.5l-13 13"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>'),
  sick: s('<path d="M14 4.5a2 2 0 0 0-4 0v9.2a4 4 0 1 0 4 0Z"/><path d="M12 11v5"/>'),
  vac: s('<path d="M12 3.5c-4.7 0-8.5 3.3-8.5 7.5h17c0-4.2-3.8-7.5-8.5-7.5Z"/><path d="M12 11v8.5M12 19.5a2.2 2.2 0 0 0 4.4 0"/>'),
  cal: s('<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
};

// ---------- fingerprint clock ----------
const rad = Math.PI / 180;
function arc(cx, cy, rx, ry, a0, a1) {
  const p = a => [cx + rx * Math.cos(a * rad), cy + ry * Math.sin(a * rad)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${rx} ${ry} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
/** Ridge paths: nested ovals open at the bottom with a few natural breaks. */
export function ridges(cx = 50, cy = 52, n = 7, step = 6.2, start = 6.5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rx = start + i * step, ry = rx * 1.17;
    const g = 28 + i * 2.5;                       // bottom gap half-angle
    const a0 = 90 + g, a1 = 450 - g;
    if (i % 2 === 1) {                             // one small break on odd ridges
      const b = 200 + ((i * 47) % 130), bw = 9;
      out.push(arc(cx, cy, rx, ry, a0, b), arc(cx, cy, rx, ry, b + bw, a1));
    } else out.push(arc(cx, cy, rx, ry, a0, a1));
  }
  return out;
}
export function handAngles(t = new Date()) {
  const m = t.getMinutes() + t.getSeconds() / 60, h = (t.getHours() % 12) + m / 60;
  return { h: h * 30, m: m * 6 };
}
/** Static mark (header / icon). */
/**
 * The אצבע mark: a fingertip print (whorl around a core, lower ridges running across), slightly tilted,
 * with clock hands at the core. Used for the app icon, splash and the top bar.
 * t sets the hands (default 3:00 for icons, which reads as a clock even when tiny).
 */
let markId = 0;
export function mark({ ink = 'currentColor', accent = 'var(--accent)', t = null, sw = 4.8 } = {}) {
  const id = 'fp' + (markId++), cx = 60, cy = 52, step = 7.4, n = 6, r0 = 11;
  const whorl = [];
  for (let i = 0; i < n; i++) {
    const rx = r0 + i * step, ry = rx * 1.26, c = cy + i * 0.9, gap = 34 - i * 3, mid = 96 + i * 3;
    const a0 = mid + gap, a1 = mid - gap + 360, br = { 1: [250, 16], 3: [330, 12], 4: [205, 10] }[i];
    if (br) whorl.push(arc(cx, c, rx, ry, a0, br[0]), arc(cx, c, rx, ry, br[0] + br[1], a1));
    else whorl.push(arc(cx, c, rx, ry, a0, a1));
  }
  // lower ridges run across the fingertip; the whorl stops just above the first one
  const lower = [0, 1, 2].map(j => { const y = cy + 40 + j * step * 0.95; return `M0 ${y + 10} Q${cx} ${y - 12 - j * 1.5} 120 ${y + 6}`; });
  const yTop = cy + 40 - step * 0.95;
  const { h, m } = t ? handAngles(t) : { h: 90, m: 0 };
  const hand = (a, l) => `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - l}" transform="rotate(${a} ${cx} ${cy})"/>`;
  const path = d => `<path d="${d}"/>`;
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><defs>
    <clipPath id="${id}t"><ellipse cx="60" cy="60" rx="43" ry="53"/></clipPath>
    <clipPath id="${id}w"><path d="M0 0H120V${yTop + 6}Q${cx} ${yTop - 12} 0 ${yTop + 10}Z"/></clipPath></defs>
    <g transform="translate(60 60) scale(0.93) translate(-60 -60) translate(0 3) rotate(-6 60 60)"><g clip-path="url(#${id}t)" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round">
      <g clip-path="url(#${id}w)">${whorl.map(path).join('')}</g>${lower.map(path).join('')}</g>
    <g stroke="${accent}" stroke-width="${sw + 0.6}" stroke-linecap="round">${hand(m, 9)}${hand(h, 6.2)}</g></g></svg>`;
}
