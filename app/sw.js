// Luqmân Campus — service worker : l'appli s'ouvre même sans réseau.
// Les fichiers de l'appli sont pris sur le réseau en priorité (mises à jour immédiates), sinon dans le cache.
// Les données (Supabase) ne passent jamais par ce cache : l'appli gère elle-même sa copie hors ligne.
const CACHE = 'lc-app-v8';
const FICHIERS = ['./', './index.html', './config.js', './vie-scolaire.js', './vie-scolaire-2.js', './notes.js', './manifest.webmanifest', './icon.svg', './icon-192.png',
  './vendor/supabase-2.119.2.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FICHIERS.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lc-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;
  const memoriser = url.origin === location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
  if (!memoriser) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const reseau = fetch(req).then(rep => { if (rep && rep.ok) cache.put(req, rep.clone()); return rep; });
    try {
      return await Promise.race([reseau, new Promise((_, ko) => setTimeout(() => ko(new Error('lent')), 4000))]);
    } catch {
      const enCache = await cache.match(req, { ignoreSearch: true });
      if (enCache) return enCache;
      try { return await reseau; } catch { /* vraiment hors ligne */ }
      if (req.mode === 'navigate') { const accueil = await cache.match('./index.html', { ignoreSearch: true }) || await cache.match('./', { ignoreSearch: true }); if (accueil) return accueil; }
      return new Response('Hors ligne', { status: 503 });
    }
  })());
});
