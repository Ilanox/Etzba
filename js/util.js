// Small shared helpers: DOM, text, numbers and dates. No app state here.

export const $ = (q, el = document) => el.querySelector(q);
export const $$ = (q, el = document) => [...el.querySelectorAll(q)];

const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => HTML[c]);
export const nm = t => `<bdi>${esc(t)}</bdi>`;
export const uid = () => crypto.randomUUID?.() ?? Date.now() + '' + Math.random();

export const pad = n => String(n).padStart(2, '0');
export const money = n => '₪' + Math.round(n).toLocaleString('he-IL');
export const money2 = n => '₪' + (+n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Hours as h:mm. */
export const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
/** Percent change, or null when there's nothing to compare with. */
export const pctChange = (cur, prev) => prev > 0.5 && isFinite(cur) ? Math.round((cur - prev) / prev * 100) : null;
/** A round axis maximum: 1, 2 or 5 times a power of ten. */
export const niceMax = v => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export const tm = d => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dShort = d => { d = new Date(d); return `${d.getDate()}.${d.getMonth() + 1}`; };
export const dFull = d => { d = new Date(d); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
/** Local date as YYYY-MM-DD. */
export const dateKey = d => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
