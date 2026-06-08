const CACHE_NAME = 'checklist-pwa-cache-v1';
const urlsToCache = [
    '/',
    '/manifest.json',
    '/index.html',
    '/icon-192x192.webp',
    '/icon-512x512.webp'
];


/**
 * In contexts like Web Workers or Service Workers, window does not exist.
 * You can only use window.addEventListener in the main browser thread.
 * In the browser's main thread, self is equivalent to window, so self.addEventListener behaves the same as window.addEventListener in most cases.
 * In a Web Worker or a Service Worker, self refers to the worker's global context (not the window), and window is not available in this context.
 */


self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse; // Return from cache if available
            }

            return fetch(event.request).then(networkResponse => {
                return caches.open('dynamic-cache').then(cache => {
                    cache.put(event.request, networkResponse.clone()); // Store in cache
                    return networkResponse; // Return response
                });
            });
        })
    );
});



