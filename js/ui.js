// Feedback and overlays: toasts, screen-reader announcements, bottom sheets, popups, confirm buttons, haptics.
import { $, esc } from './util.js';
import { I } from './svg-icons.js';
import { tr } from './translate.js';
import { say, speechLang } from './a11y.js';
import * as native from './native-bridge.js';
import * as dbg from './diagnostics.js';

/** A short vibration: native haptics when there are any. */
export function buzz(ms) {
  if (native.haptic(+ms >= 30 || Array.isArray(ms) ? 'medium' : 'light')) return;
  try { navigator.vibrate?.(ms); } catch {}
}

/* ---- toast ---- */
let toastTimer;
const hideToastIn = ms => { clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('on'), ms); };
export const hideToast = () => $('#toast').classList.remove('on');

/** A message at the bottom. kind: '', 'ok' or 'err'. An action adds a button and keeps it up longer. */
export function toast(msg, kind = '', action = null) {
  const t = $('#toast');
  t.className = 'toast ' + kind + (action ? ' act' : '');
  const spoken = say(tr(msg)), alt = spoken !== tr(msg);   // TalkBack may read another language than the screen
  t.innerHTML = (kind === 'ok' ? I.check : kind === 'err' ? I.warn : '')
    + `<span${alt ? ' aria-hidden="true"' : ''}>${esc(msg)}</span>`
    + (alt ? `<span class="sr" lang="en">${esc(spoken)}</span>` : '')
    + (action ? `<button type="button" class="t-act">${esc(action.label)}</button>` : '');
  if (action) {
    $('.t-act', t).onclick = () => { t.classList.remove('on'); clearTimeout(toastTimer); action.fn(); };
    // holding or focusing the toast keeps it up
    t.onpointerdown = t.onfocusin = () => clearTimeout(toastTimer);
    t.onpointerup = t.onpointercancel = t.onfocusout = () => hideToastIn(4000);
  } else t.onpointerdown = t.onfocusin = t.onpointerup = t.onpointercancel = t.onfocusout = null;
  void t.offsetWidth; t.classList.add('on');
  hideToastIn(action ? 8000 : 2400);
}

/* ---- screen reader ---- */
export const spokenDate = d => new Date(d).toLocaleDateString(speechLang() === 'en' ? 'en-GB' : 'he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
export function announce(msg) {
  const el = $('#sr'); el.textContent = '';
  setTimeout(() => { el.textContent = say(tr(msg)); el.lang = /[֐-׿]/.test(el.textContent) ? 'he' : 'en'; }, 60);
}

/* ---- bottom sheet ---- */
const sheet = $('#sheet'), scrim = $('#scrim'), pop = $('#pop');
export const sheetOpen = () => sheet.classList.contains('on');
export const popOpen = () => pop.classList.contains('on');

/** Opens the bottom sheet with html; mount(root) wires it up. */
export function openSheet(html, mount) {
  dbg.log('tap', 'sheet: ' + (/<h2[^>]*>([^<]*)/.exec(html)?.[1] || '?'));
  hideToast();
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.scrollTop = 0; sheet.style.transform = '';
  scrim.classList.add('on'); sheet.classList.add('on');
  mount?.(sheet);
}
export function closeSheet() { scrim.classList.remove('on'); sheet.classList.remove('on'); sheet.style.transform = ''; }

// drag the top of the sheet down to close it
{
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', e => {
    const top = sheet.getBoundingClientRect().top, y = e.touches[0].clientY;
    if (y - top < 56 && !e.target.closest('button,input,select,.wheel,.qchips,.chips,.daystrip')) { y0 = y; dy = 0; sheet.style.transition = 'none'; }
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  const end = () => { sheet.style.transition = ''; if (y0 != null && dy > 90) closeSheet(); else sheet.style.transform = ''; y0 = null; };
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
}

/* ---- popup in the middle ---- */
let onPopClose = null;
/** Opens the centre popup with html; onClose runs when it closes, unless cleared with keepPopQuiet(). */
export function openPop(html, onClose = null) {
  hideToast();
  pop.innerHTML = html; onPopClose = onClose;
  scrim.classList.add('on'); void pop.offsetWidth; pop.classList.add('on');
  return pop;
}
export const keepPopQuiet = () => { onPopClose = null; };
export function closePop() {
  if (!popOpen()) return;
  pop.classList.remove('on');
  if (!sheetOpen()) scrim.classList.remove('on');
  const fn = onPopClose; onPopClose = null; fn?.();
}
scrim.onclick = () => popOpen() ? closePop() : closeSheet();

/** First tap turns the button into a warning; a second tap within 3 seconds runs fn. */
export function confirmBtn(btn, msg, fn) {
  if (btn.dataset.armed) return fn();
  btn.dataset.armed = '1'; btn.classList.add('armed');
  const old = btn.innerHTML; btn.innerHTML = msg; buzz(20);
  setTimeout(() => { btn.dataset.armed = ''; btn.classList.remove('armed'); btn.innerHTML = old; }, 3000);
}
