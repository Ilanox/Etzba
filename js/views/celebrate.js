// A short celebration after someone supports the app.
import * as native from '../native-bridge.js';
import { $ } from '../util.js';

export function celebrate(kind) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  native.haptic(kind === 'goal' ? 'success' : 'heavy') || (() => { try { navigator.vibrate?.([30, 40, 60]); } catch {} })();
  if (reduce) return;
  if (kind === 'in') {
    const b = $('#punchBtn'); if (!b) return;
    for (let k = 0; k < 3; k++) { const r = document.createElement('i'); r.className = 'ripple'; r.style.animationDelay = k * 140 + 'ms'; b.appendChild(r); setTimeout(() => r.remove(), 1400); }
    return;
  }
  // confetti in the theme's colors
  const c = document.createElement('canvas'), x = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.className = 'confetti'; c.width = innerWidth * dpr; c.height = innerHeight * dpr; document.body.appendChild(c); x.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement), cols = ['--g-acc-a', '--g-acc-b', '--gold', '--accent', '--pen'].map(v => cs.getPropertyValue(v).trim() || '#f5b');
  const P = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight * .45, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  const step = t => {
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); x.restore(); }
    if (t - t0 < 2200) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
