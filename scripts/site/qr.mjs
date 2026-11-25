// A small QR code maker for the website: byte mode, error correction level M, versions 1 to 6 (up to 106 characters).
// Used at build time to draw "scan to open on your phone" as an inline SVG, so the page needs no library and no request.

// error correction codewords per block, number of blocks, data codewords per block (level M)
const M = { 1: [10, 1, 16], 2: [16, 1, 28], 3: [26, 1, 44], 4: [18, 2, 32], 5: [24, 2, 43], 6: [16, 4, 27] };
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

// arithmetic in GF(256) with the QR polynomial
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;

/** Reed-Solomon error correction codewords for one block. */
function rs(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((g, j) => { next[j] ^= g; next[j + 1] ^= mul(g, EXP[i]); });
    gen = next;
  }
  const out = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ out.shift(); out.push(0);
    for (let j = 0; j < n; j++) out[j] ^= mul(gen[j + 1], f);
  }
  return out;
}

/** The codewords for `text`, interleaved and ready to place. */
function codewords(bytes, v) {
  const [ec, blocks, per] = M[v], cap = blocks * per, bits = [];
  const put = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
  const dataBlocks = [], ecBlocks = [];
  for (let b = 0; b < blocks; b++) { const d = data.slice(b * per, b * per + per); dataBlocks.push(d); ecBlocks.push(rs(d, ec)); }
  const out = [];
  for (let i = 0; i < per; i++) for (const d of dataBlocks) out.push(d[i]);
  for (let i = 0; i < ec; i++) for (const e of ecBlocks) out.push(e[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

function build(v, words, mask) {
  const n = v * 4 + 17, dark = Array.from({ length: n }, () => new Array(n).fill(false)), fixed = dark.map(r => r.map(() => false));
  const set = (x, y, d) => { dark[y][x] = d; fixed[y][x] = true; };
  // finders and their white borders
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && y >= 0 && x < n && y < n) set(x, y, d !== 2 && d !== 4);
    }
  // timing lines
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // alignment patterns
  const a = ALIGN[v];
  for (const ay of a) for (const ax of a) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === a.at(-1)) || (ax === a.at(-1) && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // format information (level M = 0), with the always-dark module
  const fmt = mask, rem = (() => { let r = fmt; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >> 9) * 0x537); return r; })();
  const f = ((fmt << 10) | rem) ^ 0x5412, bit = i => ((f >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
  set(8, n - 8, true);
  // data, in two-column zigzags from the bottom right
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (fixed[y][x]) continue;
      const b = k < words.length * 8 ? ((words[k >> 3] >> (7 - (k & 7))) & 1) === 1 : false; k++;
      dark[y][x] = b !== MASKS[mask](x, y);
    }
  }
  return dark;
}

/** How hard a pattern is to scan (the standard's four penalty rules); lower is better. */
function penalty(m) {
  const n = m.length; let p = 0;
  const lines = [...m, ...m[0].map((_, x) => m.map(r => r[x]))];
  for (const l of lines) {
    for (let i = 0, run = 1; i < n; i++) {
      if (i + 1 < n && l[i + 1] === l[i]) run++; else { if (run >= 5) p += run - 2; run = 1; }
    }
    const s = '0000' + l.map(d => d ? 1 : 0).join('') + '0000';   // the quiet zone counts as light
    for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const d = m[y][x]; if (m[y][x + 1] === d && m[y + 1][x] === d && m[y + 1][x + 1] === d) p += 3; }
  const darkShare = m.flat().filter(Boolean).length / (n * n);
  return p + Math.floor(Math.abs(darkShare * 100 - 50) / 5) * 10;
}

/** The module grid for `text` (true = dark). */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const v = +Object.keys(M).find(k => bytes.length + 2 <= M[k][1] * M[k][2]);
  if (!v) throw new Error(`QR: ${bytes.length} bytes is more than version 6 holds`);
  const words = codewords(bytes, v);
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) { const m = build(v, words, mask), p = penalty(m); if (p < bestP) { best = m; bestP = p; } }
  return best;
}

/** An SVG of the code with a quiet zone of 4 modules, drawn as one path. */
export function qrSvg(text, { label = '' } = {}) {
  const m = qrMatrix(text), n = m.length, q = 4;
  let d = '';
  m.forEach((row, y) => { for (let x = 0; x < n; x++) if (row[x]) { let w = 1; while (x + w < n && row[x + w]) w++; d += `M${x + q} ${y + q}h${w}v1h-${w}z`; x += w - 1; } });
  return `<svg class="qr" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#141518"/></svg>`;
}
