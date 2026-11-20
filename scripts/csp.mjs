import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FILES = ['index.html', 'site/index.html'];
export const inlineHashes = html => [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
export const policyHashes = html => (/script-src ([^;"]*)/.exec(html)?.[1] || '').split(' ').filter(x => x.startsWith("'sha256-"));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const f of FILES) {
    const p = join(root, f), html = readFileSync(p, 'utf8'), h = inlineHashes(html);
    const out = html.replace(/script-src 'self'[^;]*;/, `script-src 'self' ${h.join(' ')};`);
    writeFileSync(p, out); console.log(`${f}: ${h.length} inline script${h.length === 1 ? '' : 's'}`);
  }
}
