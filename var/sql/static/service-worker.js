const CACHE_NAME = 'flask-pwa-cache-v1';
const urlsToCache = [
  '/',
  '/static/manifest.json',
  '/static/dth.jpg',
  '/static/dth512.jpg',
  '/static/1024x500.jpg',
  '/static/400x800.jpg',
  '/static/home-logo.png',
  '/static/inventory.png',
  '/static/notification.png',
  '/static/request.png',
  '/static/order.png',
  '/static/receive.png',
  // Add other routes and assets as needed
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Return cached resource if available, else fetch from network
      return response || fetch(event.request);
    })
  );
});
