// אצבע — the monthly report as a PDF. Pages are drawn on a canvas (so Hebrew, right-to-left and
// the app's font come out exactly as on screen), saved as JPEG and wrapped in a minimal PDF.
// No library and no server: everything happens on the phone.

const W = 1240, H = 1754, M = 84;   // A4 at 150 dpi, margins
const INK = '#1A1814', INK2 = '#5E574C', INK3 = '#948B7D', LINE = '#E6E0D5', BAND = '#F3EFE7';

/**
 * data: {
 *   dir: 'rtl'|'ltr', font, title, subtitle, brand,
 *   tiles: [[label, value]],                       // the big numbers at the top
 *   lines: [{ label, sub?, value, strong?, neg? }],  // how the pay adds up
 *   cols: [{ title, w, align? }], rows: [[...cells]], total: [...cells],
 *   footer, pageLabel: (n, of) => string,
 * }
 * Returns canvases, one per page.
 */
export function drawReport(data) {
  const rtl = data.dir === 'rtl', F = (w, s) => `${w} ${s}px ${data.font}`;
  const pages = [];
  let c, x, y;
  const page = () => {
    c = document.createElement('canvas'); c.width = W; c.height = H;
    x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.direction = rtl ? 'rtl' : 'ltr'; x.textBaseline = 'alphabetic';
    pages.push(c); y = M;
  };
  // text at a logical position: `at` is measured from the start side (right in Hebrew)
  const text = (t, at, yy, { font = F(400, 26), color = INK, align = 'start' } = {}) => {
    x.font = font; x.fillStyle = color;
    const px = rtl ? W - at : at;
    x.textAlign = align === 'end' ? (rtl ? 'left' : 'right') : align === 'center' ? 'center' : (rtl ? 'right' : 'left');
    x.fillText(String(t ?? ''), px, yy);
  };
  const rule = (yy, col = LINE, wdt = 2) => { x.fillStyle = col; x.fillRect(M, yy, W - 2 * M, wdt); };
  const fit = (t, max, font) => { x.font = font; t = String(t ?? ''); if (x.measureText(t).width <= max) return t; while (t && x.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };

  page();
  // header
  text(data.brand, M, y + 26, { font: F(700, 26), color: INK3 });
  text(data.title, M, y + 92, { font: F(800, 56) });
  text(data.subtitle, M, y + 140, { font: F(400, 28), color: INK2 });
  y += 186;

  // big numbers
  const tw = (W - 2 * M - 24 * (data.tiles.length - 1)) / data.tiles.length;
  data.tiles.forEach(([label, value], i) => {
    const at = M + i * (tw + 24);
    x.fillStyle = BAND; x.beginPath(); x.roundRect(rtl ? W - at - tw : at, y, tw, 124, 18); x.fill();
    text(label, at + 24, y + 44, { font: F(500, 24), color: INK2 });
    text(value, at + 24, y + 98, { font: F(800, 40) });
  });
  y += 124 + 48;

  // how it adds up
  for (const l of data.lines) {
    if (l.strong) { rule(y - 6, INK, 2); y += 8; }
    text(l.label, M, y + 30, { font: F(l.strong ? 700 : 400, 26), color: INK });
    if (l.sub) text(l.sub, M, y + 62, { font: F(400, 21), color: INK3 });
    text(l.value, W - M, y + 30, { font: F(l.strong ? 800 : 500, 26), color: l.neg ? INK2 : INK, align: 'end' });
    y += l.sub ? 82 : 52;
    if (!l.strong) rule(y - 10);
  }
  y += 30;

  // the shifts, as a table that carries on over pages
  const colX = []; let acc = M;
  for (const cl of data.cols) { colX.push(acc); acc += cl.w * (W - 2 * M); }
  const head = () => {
    x.fillStyle = BAND; x.fillRect(M, y, W - 2 * M, 54);
    data.cols.forEach((cl, i) => text(fit(cl.title, cl.w * (W - 2 * M) - 16, F(700, 22)), colX[i] + 10, y + 36, { font: F(700, 22), color: INK2 }));
    y += 54;
  };
  const row = (cells, bold) => {
    data.cols.forEach((cl, i) => {
      const font = F(bold ? 700 : 400, 23);
      text(fit(cells[i], cl.w * (W - 2 * M) - 16, font), colX[i] + 10, y + 34, { font, color: INK });
    });
    y += 50; rule(y - 2, LINE, 1);
  };
  if (data.rows.length) {
    head();
    for (const r of data.rows) {
      if (y > H - M - 120) { page(); head(); }
      row(r);
    }
    if (data.total) { if (y > H - M - 120) { page(); head(); } rule(y - 2, INK, 2); row(data.total, true); }
  }

  // footer on every page
  pages.forEach((p, i) => {
    c = p; x = p.getContext('2d'); x.direction = rtl ? 'rtl' : 'ltr';
    rule(H - M + 6, LINE, 2);
    text(data.footer, M, H - M + 44, { font: F(400, 20), color: INK3 });
    text(data.pageLabel(i + 1, pages.length), W - M, H - M + 44, { font: F(400, 20), color: INK3, align: 'end' });
  });
  return pages;
}

/** JPEG pages → PDF bytes (A4 portrait). */
export async function pagesToPDF(canvases) {
  const jpgs = [];
  for (const cv of canvases) {
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
    jpgs.push(new Uint8Array(await blob.arrayBuffer()));
  }
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const put = d => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
  const n = jpgs.length, pageNo = i => 3 + i * 3, PW = 595.28, PH = 841.89;
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Count ${n} /Kids [${jpgs.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`));
  jpgs.forEach((j, i) => {
    const p = pageNo(i), cv = canvases[i], draw = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(p, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`));
    obj(p + 1, () => { put(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`); put(j); put('\nendstream'); });
    obj(p + 2, () => put(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });
  const total = 3 + n * 3, xref = len;
  put(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let k = 1; k < total; k++) put(String(offs[k]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}
