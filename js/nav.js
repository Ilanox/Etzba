// Which screen and month are shown, switching screens, and saving after a change.
import { $, $$ } from './util.js';
import { save, invalidate } from './state.js';
import { recompute } from './pay.js';
import * as dbg from './diagnostics.js';

export let view = 'home';
export let viewY = new Date().getFullYear(), viewM = new Date().getMonth();
/** Sets the month the summary and lists show. */
export function showMonth(y, m) { const d = new Date(y, m, 1); viewY = d.getFullYear(); viewM = d.getMonth(); }
export const stepMonth = n => showMonth(viewY, viewM + n);
export const setView = v => { view = v; };

/** Each screen's draw function, by name: home, shifts, sum, rights, set. */
export const VIEWS = {};
let afterRender = () => {}, onFail = () => {};
/** after: runs after every draw (header figures); fail(el, error): shows a screen that failed to draw. */
export function setRenderHooks(after, fail) { afterRender = after; onFail = fail; }

export function go(v) {
  dbg.log('tap', 'tab ' + v);
  view = v;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $$('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  $('#fab').classList.toggle('hidden', v !== 'shifts');
  scrollTo(0, 0);
  render();
}
export function render() {
  const v = view;
  try { dbg.timed('draw ' + v, VIEWS[v]); } catch (e) { onFail($('#v-' + v), e); }
  dbg.log('begin', 'paint ' + v);
  requestAnimationFrame(() => requestAnimationFrame(() => dbg.log('end', 'paint ' + v)));
  afterRender();
}

const saveHooks = [];
let onSaveFailed = () => {}, warned = false;
/** fn runs on every save, before writing (reminders, widget, location). */
export const onSave = fn => saveHooks.push(fn);
export const setSaveFailed = fn => { onSaveFailed = fn; };
/** Saves the data; the first failure is reported once. */
export function persist() {
  invalidate();
  for (const fn of saveHooks) fn();
  if (!save() && !warned) { warned = true; onSaveFailed(); }
  return true;
}
/** Saves, recalculates pay and redraws: call after any change to the data. */
export function commit() { persist(); recompute(); render(); }
