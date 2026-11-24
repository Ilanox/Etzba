const HEB = /[֐-׿]/;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = s => s.replace(/\s+/g, ' ').trim();

let EXACT = new Map(), TPL = [], RULES = [], POLISH = [], PACK = null;

export function usePack(pack) {
  PACK = pack; CACHE.clear();
  EXACT = new Map(); TPL = []; RULES = []; POLISH = [];
  if (!pack) return;
  const words = pack.words || {}, phrases = pack.phrases || {};
  // 1. whole text: phrases first, then single words/terms
  for (const [he, t] of Object.entries(words)) EXACT.set(squash(he), t);
  for (const [he, t] of Object.entries(phrases)) EXACT.set(squash(he), t);
  TPL = (pack.templates || []).map(([he, t]) => [new RegExp('^' + squash(he).split('{}').map(reEsc).join('(.+?)') + '$'), t]);
  RULES = Object.entries(words).sort((a, b) => b[0].length - a[0].length)
    .map(([he, t]) => [new RegExp('(^|[^\\u0590-\\u05FF])' + reEsc(he) + '(?=[^\\u0590-\\u05FF]|$)', 'g'), t]);
  // 4. language-specific clean-up after the swap
  POLISH = pack.polish || [];
}

export function translator(pack) {
  if (!pack) return s => s;
  const words = pack.words || {}, phrases = pack.phrases || {}, ex = new Map(), cache = new Map();
  for (const [he, t] of Object.entries(words)) ex.set(squash(he), t);
  for (const [he, t] of Object.entries(phrases)) ex.set(squash(he), t);
  const tpl = (pack.templates || []).map(([he, t]) => [new RegExp('^' + squash(he).split('{}').map(reEsc).join('(.+?)') + '$'), t]);
  const rules = Object.entries(words).sort((a, b) => b[0].length - a[0].length)
    .map(([he, t]) => [new RegExp('(^|[^\\u0590-\\u05FF])' + reEsc(he) + '(?=[^\\u0590-\\u05FF]|$)', 'g'), t]);
  const pol = pack.polish || [];
  const inner = s => {
    if (!s || !HEB.test(s)) return s;
    const k = squash(s);
    if (ex.has(k)) return ex.get(k);
    for (const [re, t] of tpl) { const m = re.exec(k); if (m) return t.replace(/\{(\d)\}/g, (_, i) => inner(m[+i])); }
    let out = k; for (const [re, t] of rules) { out = out.replace(re, (_, pre) => pre + t); if (!HEB.test(out)) break; }
    return out;
  };
  return s => {
    if (!s || !HEB.test(s)) return s;
    let v = cache.get(s);
    if (v === undefined) { try { v = inner(s); for (const [re, to] of pol) v = v.replace(re, to); } catch { v = s; } if (cache.size > 3000) cache.clear(); cache.set(s, v); }
    return v;
  };
}
const fill = (t, m) => t.replace(/\{(\d)\}/g, (_, k) => trInner(m[+k]));
function polish(t) { for (const [re, to] of POLISH) t = t.replace(re, to); return t; }

const CACHE = new Map();
function trInner(s) {
  if (!PACK || !s || !HEB.test(s)) return s;
  const k = squash(s);
  if (EXACT.has(k)) return EXACT.get(k);
  for (const [re, t] of TPL) { const m = re.exec(k); if (m) return fill(t, m); }
  let out = k;
  for (const [re, t] of RULES) { out = out.replace(re, (_, pre) => pre + t); if (!HEB.test(out)) break; }
  return out;
}
export function how(s) {
  if (!s || !HEB.test(s)) return 'none';
  const k = squash(s); if (EXACT.has(k)) return 'exact';
  for (const [re] of TPL) if (re.test(k)) return 'template';
  return 'words';
}
export function tr(s) {
  if (!PACK || !s || !HEB.test(s)) return s;
  let v = CACHE.get(s);
  if (v === undefined) {
    try { v = polish(trInner(s)); } catch { v = s; }
    const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
    v = lead + v + trail;
    if (CACHE.size > 4000) CACHE.clear();
    CACHE.set(s, v);
  }
  return v;
}

const ORIG = new WeakMap(), ORIG_ATTR = new WeakMap();
const MINE = new WeakMap(), MINE_ATTR = new WeakMap();
function setAttr(el, a, v) {
  const mine = MINE_ATTR.get(el) || {};
  if (mine[a] === v) return;
  const t = tr(v); if (t === v) return;
  const o = ORIG_ATTR.get(el) || {}; o[a] = v; ORIG_ATTR.set(el, o);
  mine[a] = t; MINE_ATTR.set(el, mine);
  el.setAttribute(a, t);
}
const ATTRS = ['aria-label', 'placeholder', 'title'];
function walk(node) {
  if (node.nodeType === 3) {
    const v = node.nodeValue; if (!HEB.test(v) || MINE.get(node) === v) return;
    const t = tr(v); if (t !== v) { ORIG.set(node, v); MINE.set(node, t); node.nodeValue = t; } return;
  }
  if (node.nodeType !== 1 || node.hasAttribute('data-keep') || /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName)) return;
  for (const a of ATTRS) { const v = node.getAttribute(a); if (v && HEB.test(v)) setAttr(node, a, v); }
  for (const c of node.childNodes) walk(c);
}
let observer = null;
export function startTranslating() {
  try { walk(document.body); } catch {}
  if (observer) return;
  observer = new MutationObserver(list => {
    try {
      for (const m of list) {
        if (m.type === 'characterData') walk(m.target);
        else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && HEB.test(v) && !m.target.closest('[data-keep]')) setAttr(m.target, m.attributeName, v); }
        else for (const n of m.addedNodes) if (!(n.parentElement && n.parentElement.closest('[data-keep]'))) walk(n);
      }
    } catch {}
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
export function stopTranslating() {
  if (observer) { observer.disconnect(); observer = null; }
  const back = node => {
    if (node.nodeType === 3) { const o = ORIG.get(node); if (o !== undefined) node.nodeValue = o; return; }
    if (node.nodeType !== 1) return;
    const a = ORIG_ATTR.get(node); if (a) for (const k in a) node.setAttribute(k, a[k]);
    for (const c of node.childNodes) back(c);
  };
  try { back(document.body); } catch {}
}

// older names
