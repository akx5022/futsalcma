// Service worker mínimo: só permite instalar o app. Não guarda cache,
// então o app sempre abre a versão mais nova publicada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
