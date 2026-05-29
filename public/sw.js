/**
 * Apoint Service Worker — 字型持久快取
 *
 * 目的：把 PDF 匯出所需的 TTF（NotoSansTC ~12MB + Montserrat ~0.7MB）
 *      快取在 CacheStorage，跨 session、跨 HTTP cache eviction 都保留。
 *      使用者第一次造訪即時下載一次，之後永久從本地快取讀，匯出 PDF 零延遲。
 *
 * Cache 失效：CACHE_NAME 由 Vite plugin (sw-version-inject) 在 production
 * build 時自動帶入 public/fonts/*.ttf + 本檔 source 的 SHA-256 hash
 * 前綴。任何字型 / SW 邏輯更動 → hash 改變 → 舊 cache 自動失效，不必手動
 * bump 版本號。
 *
 * 開發模式（vite dev）下 sw.js 原樣 serve，CACHE_NAME 會是字面值
 * "apoint-fonts-__APOINT_SW_VERSION__" — 是合法字串，功能正常。
 */
const CACHE_NAME = 'apoint-fonts-__APOINT_SW_VERSION__';
const FONT_URLS = [
  '/fonts/NotoSansTC-Regular.ttf',
  '/fonts/NotoSansTC-Bold.ttf',
  '/fonts/Montserrat-Regular.ttf',
  '/fonts/Montserrat-Bold.ttf',
];

self.addEventListener('install', (event) => {
  // 安裝時預先下載並快取所有字型，避免使用者第一次匯出 PDF 時還要等下載
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FONT_URLS)),
  );
  // 跳過 waiting 階段，立即進入 activate
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // 清掉舊版 cache（CACHE_NAME bump 後生效）
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      ),
      // 立即接管所有已開啟的 client（不必等下次 navigation）
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 僅攔截字型路徑，其他請求一律放行
  if (!url.pathname.startsWith('/fonts/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        // Cache miss（例如使用者在 install 完成前就點匯出）→ 走網路並回填快取
        return fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
      }),
    ),
  );
});
