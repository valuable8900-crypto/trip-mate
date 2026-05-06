/**
 * 旅行伴侣 - Service Worker v1.0
 * 提供离线缓存支持，让应用在无网络时也能使用
 */

const CACHE_NAME = 'trip-mate-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安装 Service Worker - 预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 缓存核心资源中...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] 核心资源缓存完成');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.warn('[SW] 部分资源缓存失败（首次安装时正常）:', err.message);
      })
  );
});

// 激活 Service Worker - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 清理旧缓存:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] 已激活，接管所有客户端');
      return self.clients.claim();
    })
  );
});

// 拦截请求 - 缓存优先策略
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // 不缓存 data: URI 和 chrome-extension: 请求
  const url = new URL(event.request.url);
  if (url.protocol === 'data:' || url.protocol === 'chrome-extension:') return;

  // localStorage 数据在运行时已保存，SW 不做特殊处理
  // 图片等资源使用缓存优先策略
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // 有缓存直接返回，否则请求网络
        return cachedResponse || fetch(event.request)
          .then((networkResponse) => {
            // 只缓存成功响应的合法请求（图片/样式/脚本）
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              // 只缓存同源资源
              if (url.origin === self.location.origin) {
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseToCache))
                  .catch(() => {});
              }
            }
            return networkResponse;
          })
          .catch(() => {
            // 网络不可用时，返回缓存的降级页面
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            // 对于图片等资源，尝试返回占位图（如果有）
            return new Response('离线', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

// 监听消息 - 用于手动更新缓存
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] 缓存已清除');
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      }
    });
  }
});
