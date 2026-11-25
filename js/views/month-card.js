// "Share the month as a picture": a tall image of one month's hours, shifts and pay, for a story or a chat.
import { ridges } from '../svg-icons.js';
import { money, hm } from '../util.js';
import { tr } from '../translate.js';
import { MONTHS, EN } from '../lang.js';
import { deliver } from '../files.js';

/** Draws the month M (from monthCalc) and hands the PNG to the share sheet. net: the estimated net instead of gross. */
export async function shareMonth(M, { net = false } = {}) {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#141518'; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W * .22, H * .8); x.scale(12, 12); x.translate(-50, -54);
  x.strokeStyle = 'rgba(108,155,232,.28)'; x.lineWidth = 1.1; x.lineCap = 'round';
  for (const d of ridges(50, 54, 9, 5.6, 4)) x.stroke(new Path2D(d));
  x.restore();
  try { await document.fonts.load('800 80px Heebo'); } catch {}
  x.direction = EN ? 'ltr' : 'rtl'; x.textAlign = EN ? 'left' : 'right';
  const T = t => tr(t), F = (w, s) => `${w} ${s}px Heebo, sans-serif`, X0 = EN ? 90 : W - 90;
  const longest = M.shifts.reduce((a, s) => Math.max(a, (new Date(s.end) - new Date(s.start)) / 36e5), 0);
  x.fillStyle = '#6C9BE8'; x.font = F(700, 46); x.fillText(T('החודש שלי באצבע'), X0, 300);
  x.fillStyle = '#ECE9E1'; x.font = F(900, 190); x.fillText(T(MONTHS[M.m]), X0, 500);
  x.fillStyle = 'rgba(236,233,225,.55)'; x.font = F(700, 70); x.fillText(String(M.y), X0, 600);
  const rows = [[Math.round(M.hours).toLocaleString('he-IL'), T('שעות')], [String(M.shifts.length), T('משמרות')],
    [money(net ? M.net.net : M.gross), T(net ? 'נטו משוער' : 'ברוטו')], [`${hm(longest)} ${T('ש׳')}`, T('המשמרת הכי ארוכה')]];
  rows.forEach(([v, l], k) => {
    const y0 = 860 + k * 190;
    x.fillStyle = 'rgba(236,233,225,.14)'; x.fillRect(90, y0 - 120, W - 180, 2);
    x.fillStyle = '#ECE9E1'; x.font = F(800, 92); x.fillText(v, X0, y0);
    x.fillStyle = 'rgba(236,233,225,.66)'; x.font = F(500, 38); x.textAlign = EN ? 'right' : 'left'; x.fillText(l, EN ? W - 90 : 90, y0 - 10); x.textAlign = EN ? 'left' : 'right';
  });
  x.fillStyle = 'rgba(236,233,225,.6)'; x.font = F(500, 34); x.textAlign = 'center'; x.fillText('Etzba · etzba.co.il', W / 2, H - 110);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return deliver(`etzba-${M.y}-${String(M.m + 1).padStart(2, '0')}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png');
}
