// אצבע — offline cache. Bump VERSION when files change.
const VERSION = 'etzba-v79';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'languages/index.js', 'languages/en.js', 'js/app.js', 'js/pay-engine.js', 'js/hebrew-calendar.js', 'js/net-pay.js', 'js/svg-icons.js', 'js/file-reader.js', 'js/shift-import.js', 'js/diagnostics.js', 'js/native-bridge.js', 'js/translate.js', 'js/a11y.js', 'js/rules.js', 'js/features.js', 'js/remote-packs.js', 'js/leave.js', 'js/report.js', 'js/dev-key.js', 'languages/pack-versions.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'etzba-share').map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // a file shared from another app (Android share menu): keep it, then open the app to import it
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), f = fd.getAll('file').find(x => x && x.size);
        const c = await caches.open('etzba-share');
        if (f) await c.put('shared-file', new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || 'shared.xls'), 'content-type': f.type || 'application/octet-stream' } }));
      } catch (err) {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (url.host.includes('fonts.g')) { // fonts: cache on first use
    e.respondWith(caches.open(VERSION).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))));
    return;
  }
  // network first, so an update is never half old files and half new; the cache is for offline
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && url.origin === location.origin) { const c = res.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
