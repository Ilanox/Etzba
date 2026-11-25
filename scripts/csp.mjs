import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { root, isMain } from './lib.mjs';

export const FILES = ['index.html', 'site/index.html'];
export const inlineHashes = html => [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
export const policyHashes = html => (/script-src ([^;"]*)/.exec(html)?.[1] || '').split(' ').filter(x => x.startsWith("'sha256-"));

if (isMain(import.meta.url)) {
  for (const f of FILES) {
    const p = join(root, f), html = readFileSync(p, 'utf8'), h = inlineHashes(html);
    const out = html.replace(/script-src 'self'[^;]*;/, `script-src 'self' ${h.join(' ')};`);
    writeFileSync(p, out); console.log(`${f}: ${h.length} inline script${h.length === 1 ? '' : 's'}`);
  }
}
