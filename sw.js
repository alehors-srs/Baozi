// Общий SW. При публикации prepare_site.py подставляет хеш комплекта файлов.
const BUILD_VERSION = '__SITE_BUILD__';
const CACHE_PREFIX = 'chinese-trainer:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + BUILD_VERSION;
const FILES = [
  './', 'index.html',
  ...['site-config.js', 'app.css', 'app.js', 'sentences.js', 'words.js', 'names.js', 'manifest.json']
    .map(file => file + '?v=' + BUILD_VERSION),
  'fonts/ReggaeOne-Regular.woff2', 'images/background.jpg',
  'images/favicon_16.png', 'images/favicon_32.png', 'images/favicon_48.ico',
  'images/favicon_512.png', 'images/apple-touch-icon.png'
];
const CORE_URLS = FILES.map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  // Не активируем неполный офлайн-комплект, если хотя бы один ресурс не загрузился.
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    await cache.addAll(CORE_URLS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const isBaozi = new URL(self.registration.scope).pathname === '/Baozi/';
    await Promise.all(names.filter(name =>
      (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) ||
      // Единственный известный старый кеш Baozi. Кеш Chinese-quiz не затрагивается.
      (isBaozi && name === 'baozi-v2-reggae')
    ).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    // HTML привязан к установленному комплекту. Новый SW активируется только
    // после загрузки ВСЕХ новых ресурсов, затем app.js обновляет страницу.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(new URL('index.html', self.registration.scope)) || fetch(event.request);
    })());
    return;
  }
  // Только собственные статические файлы. Google Sheets и внешние API не кешируем.
  if (!CORE_URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});


