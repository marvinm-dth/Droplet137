const CACHE_NAME = 'checklist-pwa-cache-v1';
const urlsToCache = [
    '/dashboard/',
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
        caches.match(event.request)
            .then(response => response || fetch(event.request))// if response is truthy meaning have value return it, otherwise, request the resource.

            // used to cache the response.
            // return fetch(event.request).then(networkResponse => {
            //     // Open the cache and store the network response
            //     return caches.open('dynamic-cache').then(cache => {
            //         cache.put(event.request, networkResponse.clone());
            //         return networkResponse; // Return the original network response
            //     });
            // });
    );
});


