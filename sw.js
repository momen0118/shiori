// オフラインで開けるようにする service worker。
// ★ ファイルを変えたら、必ず VERSION を上げること（上げないと iPhone に古い画面が残る）
const VERSION = 'shiori-v7';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/util.js',
  './js/ui.js',
  './js/forms.js',
  './js/jsonparse.js',
  './js/format.js',
  './js/store.js',
  './js/itin.js',
  './js/share.js',
  './js/io.js',
  './js/editors.js',
  './js/pages.js',
  './js/book.js',
  './js/shelf.js',
  './vendor/lz-string.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      // GitHub Pages は配信元で数分ファイルを覚えているので、?v=版 を付けて必ず新しいものを取る
      .then(c => Promise.all(FILES.map(f =>
        fetch(new Request(f + (f.includes('?') ? '&' : '?') + 'v=' + VERSION, { cache: 'reload' })).then(res => {
          if (!res.ok) throw new Error(f + ' ' + res.status);
          return c.put(f, res);
        }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('shiori-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外への通信には手を出さない

  // ページを開くとき：いつも保存しておいた index.html を返す（電波がなくても開ける）
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then(r => r || fetch(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
