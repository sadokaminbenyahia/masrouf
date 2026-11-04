/* Masrouf — service worker (PWA).
 * - précache : page /offline + icônes
 * - cache-first : /_next/static/* et /icons/* (fichiers versionnés / immuables)
 * - network-first : navigations GET, repli sur /offline (les pages, personnelles, ne sont pas
 *   mises en cache : rien ne subsiste sur l'appareil après déconnexion)
 * - JAMAIS de cache pour : requêtes non-GET, /api/*, server actions (en-tête Next-Action),
 *   requêtes RSC, autres origines.
 */
const VERSION = 'v1';
const STATIC_CACHE = `masrouf-static-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('masrouf-') && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableResponse(response) {
  return response && response.ok && response.type === 'basic';
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    // Les pages authentifiées ne sont pas mises en cache (données personnelles) :
    // seul /offline (précaché) sert de repli.
    return response;
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ||
      new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // Server actions et requêtes RSC (navigation client de Next.js) : jamais en cache.
  if (request.headers.has('Next-Action') || request.headers.has('RSC') || url.searchParams.has('_rsc')) {
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  }
});
