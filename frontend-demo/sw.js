// ErgoGuard-AI Offline Service Worker
// Pre-caches application shell, safety engine modules, vendor WebAssembly runtimes, and local vision models.

const CACHE_NAME = 'ergoguard-ai-v4';

const PRECACHE_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './adapter.js',
  './fixtures.js',
  './poseDetector.js',
  './ppeDetector.js',
  './storage.js',
  './visionPipeline.js',
  './manifest.json',

  // Core Risk Engine Modules (No DOM access)
  '../engine/config.js',
  '../engine/geometry.js',
  '../engine/riskEngine.js',
  '../engine/riskScorer.js',
  '../engine/severity.js',
  '../engine/violationTracker.js',
  '../engine/rules/fall.js',
  '../engine/rules/posture.js',
  '../engine/rules/ppe.js',

  // Vendor Dependencies (Offline Local Copies)
  './vendor/bootstrap/bootstrap.min.css',
  './vendor/bootstrap/bootstrap.bundle.min.js',
  './vendor/dexie/dist/dexie.mjs',
  './vendor/tasks-vision/vision_bundle.mjs',
  './vendor/tasks-vision/wasm/vision_wasm_internal.js',
  './vendor/tasks-vision/wasm/vision_wasm_internal.wasm',
  './vendor/tasks-vision/wasm/vision_wasm_module_internal.js',
  './vendor/tasks-vision/wasm/vision_wasm_module_internal.wasm',
  './vendor/tasks-vision/wasm/vision_wasm_nosimd_internal.js',
  './vendor/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm',
  './vendor/ort/ort.min.js',
  './vendor/ort/ort-wasm-simd-threaded.wasm',
  './vendor/ort/ort-wasm-simd-threaded.mjs',
  './vendor/ort/ort-wasm-simd-threaded.jsep.wasm',

  // Pre-packaged Local MediaPipe Pose Lite Model
  './models/pose_landmarker_lite.task',
];

// Installs service worker and pre-caches essential offline runtime assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching local application assets and vision models...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some non-critical assets could not be pre-cached:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Cleans up stale caches without modifying IndexedDB application records.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing outdated cache:', key);
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Serves cached assets for offline-first resilience with network-first for local code scripts.
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const isAppScript = url.includes('/engine/') || 
                      (url.includes('/frontend-demo/') && !url.includes('/vendor/') && !url.includes('/models/'));

  if (isAppScript) {
    // Network-first for application scripts so live changes apply immediately, with cache fallback when offline
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
  } else {
    // Cache-first for large static vendor assets and models
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch((err) => {
          console.warn('[ServiceWorker] Fetch failed and asset not in cache:', event.request.url);
          throw err;
        });
      })
    );
  }
});
