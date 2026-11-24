// Who's looking (regular, supporter, developer) and the colour theme that follows from it.
import { S } from './state.js';
import { tr } from './translate.js';
import * as native from './native-bridge.js';

/** The owner can preview the app as a regular user, a supporter or the developer. */
export const viewAs = () => S.settings.owner ? (S.settings.viewAs || 'dev') : null;
export const isSup = () => { const v = viewAs(); return v ? v !== 'regular' : !!S.settings.supported; };
export const isOwner = () => viewAs() === 'dev';

export const FREE_THEMES = ['auto', 'light', 'dark', 'blurple'];
const LIGHT = ['light', 'sunset', 'sand', 'dawn', 'rosegold'];
const BG = { light: '#F1EEE6', dark: '#141518', blurple: '#1E1F22', gold: '#15130E', night: '#0C1322', sunset: '#F7EEE8', forest: '#0F1712', ocean: '#0B1A1E', plum: '#171021', ember: '#1A100C', sand: '#F2EDDF', dev: '#07090B', aurora: '#101531', dawn: '#FBEFE8', neon: '#0A0712', rosegold: '#F6EAE4' };

const darkMQ = matchMedia('(prefers-color-scheme: dark)');
let onApplied = () => {};

/** Applies the chosen theme; a locked theme falls back to automatic. */
export function applyTheme() {
  let t = S.settings.theme || 'auto';
  if ((!isSup() && !FREE_THEMES.includes(t)) || (t === 'dev' && !isOwner())) t = 'auto';
  const r = t === 'auto' ? (darkMQ.matches ? 'dark' : 'light') : t;
  const root = document.documentElement;
  root.dataset.theme = r;
  root.classList.toggle('supporter', isSup());
  document.querySelectorAll('meta[name=theme-color]').forEach(m => { m.removeAttribute('media'); m.content = BG[r]; });
  const tag = document.getElementById('devTag');
  if (tag) { tag.hidden = !isSup(); tag.textContent = tr(isOwner() ? 'מצב מפתח' : 'תומך'); }
  native.setBars(!LIGHT.includes(r));
  try { onApplied(); } catch {}
}
/** Runs after every theme change (the widget follows the theme). */
export function startTheme(after) {
  onApplied = after;
  applyTheme();
  darkMQ.addEventListener?.('change', applyTheme);
}
