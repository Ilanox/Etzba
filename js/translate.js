// Translates the Hebrew on screen with a language pack (see languages/README.md).
const HEB = /[֐-׿]/;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = s => s.replace(/\s+/g, ' ').trim();
const literal = he => he.replace(/\{\}/g, '').length;

/**
 * Builds a translator for a pack. Order of trying: the whole text (phrases, then words),
 * then templates from the most specific (longest fixed text) down, then word by word.
 * The pieces a template captures are translated too. Polish rules run last.
 */
function compile(pack) {
  const exact = new Map();
  for (const [he, t] of Object.entries(pack.words || {})) exact.set(squash(he), t);
  for (const [he, t] of Object.entries(pack.phrases || {})) exact.set(squash(he), t);
  const templates = (pack.templates || []).map(([he, t]) => [squash(he), t])
    .sort((a, b) => literal(b[0]) - literal(a[0]))
    .map(([he, t]) => [new RegExp('^' + he.split('{}').map(reEsc).join('(.+?)') + '$'), t]);
  const words = Object.entries(pack.words || {}).sort((a, b) => b[0].length - a[0].length)
    .map(([he, t]) => [new RegExp('(^|[^\\u0590-\\u05FF])' + reEsc(he) + '(?=[^\\u0590-\\u05FF]|$)', 'g'), t]);
  const polish = pack.polish || [];

  // {1}, {2}… put back captured piece 1, 2…; a bare {} takes the next piece in order
  const fill = (t, m) => { let n = 0; return t.replace(/\{(\d*)\}/g, (_, d) => inner(m[d ? +d : ++n])); };
  function inner(s) {
    if (!s || !HEB.test(s)) return s;
    const k = squash(s);
    if (exact.has(k)) return exact.get(k);
    for (const [re, t] of templates) { const m = re.exec(k); if (m) return fill(t, m); }
    let out = k;
    for (const [re, t] of words) { out = out.replace(re, (_, pre) => pre + t); if (!HEB.test(out)) break; }
    return out;
  }
  const cache = new Map();
  const tr = s => {
    if (!s || !HEB.test(s)) return s;
    let v = cache.get(s);
    if (v === undefined) {
      try { v = inner(s); for (const [re, to] of polish) v = v.replace(re, to); } catch { v = s; }
      v = /^\s*/.exec(s)[0] + v + /\s*$/.exec(s)[0];
      if (cache.size > 4000) cache.clear();
      cache.set(s, v);
    }
    return v;
  };
  /** Which step would translate a text: 'exact', 'template', 'words' or 'none'. For the translation checker. */
  const how = s => {
    if (!s || !HEB.test(s)) return 'none';
    const k = squash(s);
    return exact.has(k) ? 'exact' : templates.some(([re]) => re.test(k)) ? 'template' : 'words';
  };
  return { tr, how };
}

/** A translator for one pack, separate from the one on screen (spoken text uses this). */
export const translator = pack => pack ? compile(pack).tr : s => s;

let active = null;
export function usePack(pack) { active = pack ? compile(pack) : null; }
export const tr = s => active ? active.tr(s) : s;
export const how = s => active ? active.how(s) : 'none';

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
