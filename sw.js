// BAOZI Service Worker — офлайн-кеширование
const CACHE_NAME = 'baozi-v1';
const CACHE_URLS = [
  'index.html',
  'manifest.json',
  'words.js',
  'names.js',
  'images/background.jpg',
  'images/favicon_16.png',
  'images/favicon_32.png',
  'images/favicon_48.ico',
  'images/favicon_512.png',
  'images/apple-touch-icon.png',
  'https://code.responsivevoice.org/responsivevoice.js'
];

// Установка: закешируем все ресурсы
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // externalURL может зафейлиться — кешируем что можем
      return Promise.allSettled(
        CACHE_URLS.map(function(url) {
          return cache.add(url);
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Активация: удаляем старый кеш
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Перехват запросов: cache-first, fallback к сети
self.addEventListener('fetch', function(event) {
  // Игнорируем не-GET (например, POST)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Есть в кеше — отдаём, и параллельно обновляем в фоне
        fetch(event.request).then(function(resp) {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, resp.clone());
            });
          }
        }).catch(function() {});
        return cached;
      }
      // Нет в кеше — идём в сеть
      return fetch(event.request).then(function(resp) {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') {
          return resp;
        }
        // Кешируем копию успешного ответа
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, respClone);
        });
        return resp;
      }).catch(function() {
        // Офлайн и нет в кеше — отдаём index.html как fallback для навигации
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
