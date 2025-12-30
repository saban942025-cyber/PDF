const CACHE_NAME = 'pdf-signer-v3'; // עדכון גרסה כדי לנקות מטמון ישן
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './sing.jpeg',
  './NotoSansHebrew-Regular.ttf', // <--- הוספנו את הפונט לרשימת המטמון
  // ספריות חיצוניות (הן נשמרות במטמון אחרי הטעינה הראשונה)
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/@pdf-lib/fontkit/dist/fontkit.umd.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // אם נמצא במטמון - תחזיר אותו
      if (cachedResponse) {
        return cachedResponse;
      }
      // אחרת - נסה להוריד מהרשת
      return fetch(event.request).catch(() => {
          // אפשר להחזיר כאן דף אופליין אם רוצים
          console.log('Offline fetch failed:', event.request.url);
      });
    })
  );
});
