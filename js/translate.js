// אצבע — translation engine. The app is written in Hebrew; in another language every Hebrew text
// that reaches the screen is swapped through that language's pack (lang/<code>.js).
// The engine knows nothing about any one language: all wording lives in the packs.
const HEB = /[֐-׿]/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = s => s.replace(/\s+/g, ' ').trim();

let EXACT = new Map(), TPL = [], RULES = [], POLISH = [], PACK = null;

/** Make a pack the active one (null = Hebrew, nothing to translate). */
export function usePack(pack) {
  PACK = pack; CACHE.clear();
  EXACT = new Map(); TPL = []; RULES = []; POLISH = [];
  if (!pack) return;
  const words = pack.words || {}, phrases = pack.phrases || {};
  // 1. whole text: phrases first, then single words/terms
  for (const [he, t] of Object.entries(words)) EXACT.set(squash(he), t);
  for (const [he, t] of Object.entries(phrases)) EXACT.set(squash(he), t);
  // 2. sentences with numbers or names: "{}" matches anything; {1}, {2}… put them back
  TPL = (pack.templates || []).map(([he, t]) => [new RegExp('^' + squash(he).split('{}').map(esc).join('(.+?)') + '$'), t]);
  // 3. last resort: known words inside a longer text (capture group, not lookbehind: older phones reject it)
  RULES = Object.entries(words).sort((a, b) => b[0].length - a[0].length)
    .map(([he, t]) => [new RegExp('(^|[^\\u0590-\\u05FF])' + esc(he) + '(?=[^\\u0590-\\u05FF]|$)', 'g'), t]);
  // 4. language-specific clean-up after the swap
  POLISH = pack.polish || [];
}
export const activePack = () => PACK;
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
/** For tests: which path translated a string ('exact' | 'template' | 'words' | 'none'). */
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
    try { v = polish(trInner(s)); } catch { v = s; }   // a translation problem must never break the app
    const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
    v = lead + v + trail;
    if (CACHE.size > 4000) CACHE.clear();
    CACHE.set(s, v);
  }
  return v;
}

/* Originals are remembered so switching back to Hebrew restores the exact text. */
const ORIG = new WeakMap(), ORIG_ATTR = new WeakMap();
const ATTRS = ['aria-label', 'placeholder', 'title'];
function walk(node) {
  if (node.nodeType === 3) {
    const v = node.nodeValue; if (!HEB.test(v)) return;
    const t = tr(v); if (t !== v) { ORIG.set(node, v); node.nodeValue = t; } return;
  }
  if (node.nodeType !== 1 || node.hasAttribute('data-keep') || /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName)) return;
  for (const a of ATTRS) { const v = node.getAttribute(a); if (v && HEB.test(v)) { const m = ORIG_ATTR.get(node) || {}; m[a] = v; ORIG_ATTR.set(node, m); node.setAttribute(a, tr(v)); } }
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
        else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && HEB.test(v) && !m.target.closest('[data-keep]')) { const o = ORIG_ATTR.get(m.target) || {}; o[m.attributeName] = v; ORIG_ATTR.set(m.target, o); m.target.setAttribute(m.attributeName, tr(v)); } }
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
export const startEnglish = startTranslating, stopEnglish = stopTranslating;
