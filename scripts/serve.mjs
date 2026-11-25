// Serves the app (or another folder: node scripts/serve.mjs <folder>) on this computer and the Wi-Fi, without caching.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fromRoot } from './lib.mjs';
import { networkInterfaces } from 'node:os';

const root = resolve(fromRoot(), process.argv[2] || '');   // a folder to serve, from the project or absolute
const PORT = +process.env.PORT || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    // like GitHub Pages: /privacy serves privacy.html, /neto serves neto/index.html
    const isFile = f => stat(f).then(x => x.isFile(), () => false);
    if (!(await isFile(file))) file = (await isFile(file + '.html')) ? file + '.html' : join(file, 'index.html');
    if (!(await isFile(file))) throw 0;
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, () => {
  const lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`\n  אצבע is running\n\n  Computer:  http://localhost:${PORT}\n${lan ? `  Phone:     http://${lan}:${PORT}  (same Wi-Fi)\n` : ''}\n  Stop with Ctrl+C\n`);
});
