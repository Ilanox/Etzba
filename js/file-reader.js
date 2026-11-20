
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
const f64 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true);

export async function readSheets(buf, fileName = '') {
  const b = new Uint8Array(buf);
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return readXLS(b);
  if (b[0] === 0x50 && b[1] === 0x4B) return readXLSX(b);
  // some "xls" exports are really HTML tables
  const text = decodeText(b);
  if (/<table/i.test(text)) return readHTML(text);
  return [{ name: fileName.replace(/\.[^.]+$/, ''), rows: readCSV(text) }];
}

/* ---------------- text / CSV ---------------- */
function decodeText(b) {
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  const utf8 = new TextDecoder('utf-8').decode(b);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('windows-1255').decode(b); } catch { return utf8; }
}
export function readCSV(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [',', ';', '\t'].sort((x, y) => first.split(y).length - first.split(x).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function readHTML(text) {
  const out = [];
  for (const [, t] of text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, r]) => [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, c]) => xmlText(c.replace(/<[^>]+>/g, ''))));
    out.push({ name: 'גיליון ' + (out.length + 1), rows });
  }
  return out;
}

/* ---------------- Compound File (OLE2) ---------------- */
function cfbStream(b, wanted) {
  const ss = 1 << u16(b, 0x1E), mss = 1 << u16(b, 0x20);
  const sec = n => 512 + n * ss;
  const difat = [];
  for (let i = 0; i < 109; i++) { const v = u32(b, 0x4C + i * 4); if (v < 0xFFFFFFFA) difat.push(v); }
  for (let d = u32(b, 0x44), n = u32(b, 0x48); n-- > 0 && d < 0xFFFFFFFA;) {
    for (let i = 0; i < ss / 4 - 1; i++) { const v = u32(b, sec(d) + i * 4); if (v < 0xFFFFFFFA) difat.push(v); }
    d = u32(b, sec(d) + ss - 4);
  }
  const fat = [];
  for (const s of difat) for (let i = 0; i < ss / 4; i++) fat.push(u32(b, sec(s) + i * 4));
  const chain = (start, map) => { const out = []; for (let s = start, g = 0; s < 0xFFFFFFFA && g < 1e6; s = map[s], g++) out.push(s); return out; };
  const readChain = (start, size) => { const out = new Uint8Array(size); let o = 0; for (const s of chain(start, fat)) { const n = Math.min(ss, size - o); if (n <= 0) break; out.set(b.subarray(sec(s), sec(s) + n), o); o += n; } return out; };
  const dirSecs = chain(u32(b, 0x30), fat);
  const entries = [];
  for (const s of dirSecs) for (let o = sec(s); o < sec(s) + ss; o += 128) {
    const nl = u16(b, o + 0x40); if (!nl) { entries.push(null); continue; }
    let name = ''; for (let i = 0; i < nl / 2 - 1; i++) name += String.fromCharCode(u16(b, o + i * 2));
    entries.push({ name, type: b[o + 0x42], start: u32(b, o + 0x74), size: u32(b, o + 0x78) });
  }
  const root = entries[0], cutoff = u32(b, 0x38);
  const e = entries.find(x => x && x.type === 2 && wanted.includes(x.name));
  if (!e) throw new Error('no workbook stream');
  if (e.size >= cutoff) return readChain(e.start, e.size);
  const mini = readChain(root.start, root.size);
  const miniFat = []; for (const s of chain(u32(b, 0x3C), fat)) for (let i = 0; i < ss / 4; i++) miniFat.push(u32(b, sec(s) + i * 4));
  const out = new Uint8Array(e.size); let o = 0;
  for (const s of chain(e.start, miniFat)) { const n = Math.min(mss, e.size - o); if (n <= 0) break; out.set(mini.subarray(s * mss, s * mss + n), o); o += n; }
  return out;
}

/* ---------------- BIFF8 ---------------- */
function rk(v) {
  let n = v & 2 ? (v >> 2) : (() => { const a = new ArrayBuffer(8), d = new DataView(a); d.setUint32(4, v & 0xFFFFFFFC, true); d.setUint32(0, 0, true); return d.getFloat64(0, true); })();
  return v & 1 ? n / 100 : n;
}
function readXLS(b) {
  const w = cfbStream(b, ['Workbook', 'Book']);
  // records
  const recs = [];
  for (let o = 0; o + 4 <= w.length;) { const t = u16(w, o), l = u16(w, o + 2); recs.push({ t, o, d: w.subarray(o + 4, o + 4 + l) }); o += 4 + l; }
  const sheetsAt = new Map(), sst = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.t === 0x0085) {
      const pos = u32(r.d, 0), cch = r.d[6], hi = r.d[7] & 1;
      let name = ''; for (let k = 0; k < cch; k++) name += String.fromCharCode(hi ? u16(r.d, 8 + k * 2) : r.d[8 + k]);
      sheetsAt.set(pos, name);
    } else if (r.t === 0x00FC) {
      const segs = [r.d]; while (recs[i + 1] && recs[i + 1].t === 0x003C) segs.push(recs[++i].d);
      readSST(segs, sst);
    }
  }
  const out = []; let cur = null, pendingFormula = null;
  const put = (row, col, v) => { if (!cur) return; (cur.rows[row] ||= [])[col] = v; };
  const xlStr = (d, o, cchSize) => { const cch = cchSize === 2 ? u16(d, o) : d[o]; o += cchSize; const hi = d[o] & 1; o++; let s = ''; for (let k = 0; k < cch; k++) s += String.fromCharCode(hi ? u16(d, o + k * 2) : d[o + k]); return s; };
  for (const r of recs) {
    const d = r.d;
    switch (r.t) {
      case 0x0809: if (u16(d, 2) === 0x0010) { cur = { name: sheetsAt.get(r.o) || 'גיליון ' + (out.length + 1), rows: [] }; out.push(cur); } else if (u16(d, 2) !== 0x0005) cur = null; break;
      case 0x000A: cur = null; break;
      case 0x00FD: put(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? ''); break;
      case 0x0204: put(u16(d, 0), u16(d, 2), xlStr(d, 6, 2)); break;
      case 0x0203: put(u16(d, 0), u16(d, 2), f64(d, 6)); break;
      case 0x027E: put(u16(d, 0), u16(d, 2), rk(i32(d, 6) >>> 0)); break;
      case 0x00BD: { const row = u16(d, 0), c0 = u16(d, 2), n = (d.length - 6) / 6; for (let k = 0; k < n; k++) put(row, c0 + k, rk(u32(d, 4 + k * 6 + 2))); break; }
      case 0x0006: { const row = u16(d, 0), col = u16(d, 2);
        if (d[12] === 0xFF && d[13] === 0xFF) { if (d[6] === 0) pendingFormula = { row, col }; else if (d[6] === 1) put(row, col, d[8] ? 'TRUE' : 'FALSE'); }
        else put(row, col, f64(d, 6)); break; }
      case 0x0207: if (pendingFormula) { put(pendingFormula.row, pendingFormula.col, xlStr(d, 0, 2)); pendingFormula = null; } break;
    }
  }
  for (const s of out) s.rows = Array.from(s.rows, r => Array.from(r || [], c => c ?? ''));
  return out;
}
function readSST(segs, out) {
  let si = 0, o = 8; const n = u32(segs[0], 4);
  const need = k => { if (o + k > segs[si].length && o >= segs[si].length) { si++; o = 0; } };
  const byte = () => { need(1); return segs[si][o++]; };
  const word = () => byte() | (byte() << 8);
  const dword = () => word() + word() * 65536;
  const skip = k => { while (k > 0) { if (o >= segs[si].length) { si++; o = 0; } const t = Math.min(k, segs[si].length - o); o += t; k -= t; } };
  for (let i = 0; i < n && si < segs.length; i++) {
    const cch = word(), fl = byte(); let hi = fl & 1;
    const runs = fl & 8 ? word() : 0, ext = fl & 4 ? dword() : 0;
    let s = '';
    for (let k = 0; k < cch; k++) {
      if (o >= segs[si].length) { si++; o = 0; hi = segs[si][o++] & 1; }
      if (hi) { s += String.fromCharCode(segs[si][o] | (segs[si][o + 1] << 8)); o += 2; } else s += String.fromCharCode(segs[si][o++]);
    }
    skip(runs * 4); skip(ext);
    out.push(s);
  }
}

/* ---------------- XLSX ---------------- */
async function unzip(b) {
  let e = b.length - 22; while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const files = new Map(); let p = u32(b, e + 16);
  for (let n = u16(b, e + 10); n-- > 0;) {
    const method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    const data0 = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28), raw = b.subarray(data0, data0 + csize);
    files.set(name, { method, raw });
    p += 46 + nl + xl + cl;
  }
  const get = async name => {
    const f = files.get(name); if (!f) return null;
    if (f.method === 0) return new TextDecoder().decode(f.raw);
    const ds = new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(await new Response(ds).arrayBuffer());
  };
  return get;
}
const xmlText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
const colNum = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function readXLSX(b) {
  const get = await unzip(b);
  const wb = await get('xl/workbook.xml') || '', rels = await get('xl/_rels/workbook.xml.rels') || '';
  const ss = (await get('xl/sharedStrings.xml') || '').split(/<si>/).slice(1).map(si => xmlText([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('')));
  const target = Object.fromEntries([...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const out = [];
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const path = 'xl/' + target[m[2]].replace(/^\/?xl\//, ''), xml = await get(path) || '';
    const rows = [];
    for (const [, cAttr, body] of xml.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)(\d+)"/.exec(cAttr); if (!ref) continue;
      const t = /t="([^"]+)"/.exec(cAttr)?.[1], v = /<v>([\s\S]*?)<\/v>/.exec(body || '')?.[1];
      let val = '';
      if (t === 's') val = ss[+v] ?? ''; else if (t === 'inlineStr') val = xmlText([...(body || '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
      else if (t === 'str' || t === 'b' || t === 'e') val = xmlText(v || ''); else if (v != null) val = +v;
      (rows[+ref[2] - 1] ||= [])[colNum(ref[1])] = val;
    }
    out.push({ name: xmlText(m[1]), rows: Array.from(rows, r => Array.from(r || [], c => c ?? '')) });
  }
  return out;
}
