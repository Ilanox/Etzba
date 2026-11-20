import { translator } from './translate.js';

const HEB = /[֐-׿]/;
const squash = s => (s || '').replace(/\s+/g, ' ').trim();
const SEL = 'button, a[href], [role=button], [role=tab], input, select, textarea, summary, h1, h2, h3, .sec > span:first-child';
let mode = 'en', en = s => s, obs = null, timer = 0;

export function setSpeech(m, pack) {
  mode = m === 'he' ? 'he' : 'en';
  if (pack) en = translator(pack);
  label(document.body, true);
}
export const speechLang = () => mode;
export const say = s => mode === 'en' && HEB.test(s || '') ? en(s) : s;

function partsOf(el) {
  const out = [];
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { const t = squash(c.nodeValue); if (t) out.push(t); }
      else if (c.nodeType === 1 && c.getAttribute('aria-hidden') !== 'true' && !/^(svg|SVG|STYLE|SELECT|INPUT|TEXTAREA|OPTION)$/.test(c.tagName)) walk(c);
    }
  };
  const t = el.tagName;
  if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') {
    const lab = el.closest('label');
    if (lab) walk(lab); else { const cap = el.closest('.field')?.querySelector(':scope > span'); if (cap) walk(cap); }
    if (!out.length && el.getAttribute('placeholder')) out.push(el.getAttribute('placeholder'));
    return out;
  }
  walk(el);
  return out;
}

function one(el) {
  if (el.getAttribute('aria-hidden') === 'true') return;
  const cur = el.getAttribute('aria-label');
  if (cur && cur !== el.dataset.a11y) el.dataset.a11yOwn = cur;
  const own = el.dataset.a11yOwn, parts = own ? [own] : partsOf(el);
  if (!parts.length) return;
  const out = parts.map(p => mode === 'en' && HEB.test(p) ? en(p) : p).join(', ');
  if (out !== cur) { el.setAttribute('aria-label', out); el.dataset.a11y = out; }
  if (mode === 'en' && !HEB.test(out)) { if (el.getAttribute('lang') !== 'en') el.setAttribute('lang', 'en'); }
  else if (el.getAttribute('lang') === 'en') el.removeAttribute('lang');
  if (el.matches('.sec > span:first-child') && !el.getAttribute('role')) { el.setAttribute('role', 'heading'); el.setAttribute('aria-level', '2'); }
}
function label(root, all) {
  try {
    if (all) document.querySelectorAll('[data-a11y]').forEach(e => { if (mode === 'he' && e.getAttribute('lang') === 'en') e.removeAttribute('lang'); });
    (root.matches?.(SEL) ? [root] : []).concat([...root.querySelectorAll(SEL)]).forEach(one);
  } catch {  }
}

export function startA11y() {
  if (obs) return;
  label(document.body);
  const dirty = new Set();
  obs = new MutationObserver(list => {
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!t) continue;
      if (m.type === 'childList') for (const n of m.addedNodes) if (n.nodeType === 1) dirty.add(n);
      const host = t.closest(SEL); dirty.add(host || t);
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      const roots = [...dirty]; dirty.clear();
      for (const r of roots) if (r.isConnected && !roots.some(o => o !== r && o.contains(r))) label(r);
    }, 300);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
}
