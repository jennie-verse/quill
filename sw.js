/* ==========================================================================
   sw.js — 앱 셸 오프라인 캐시

   이 파일을 고칠 때는 CACHE_NAME 의 버전도 반드시 함께 올립니다.
   (webapp-standard.md 8장 / 프로젝트 지시문)
   ========================================================================== */

// VERSION 은 src/version.js 의 APP_BUILD 와 항상 같아야 합니다.
// Service Worker 가 캐시를 먼저 돌려주므로, 배포해도 기기에서는 이전 빌드가
// 도는 시간이 있습니다. 설정 화면의 App version 이 그것을 눈으로 확인하는 수단입니다.
const VERSION = '2026.08.21-compact-toolbar';
const CACHE_NAME = `quill-shell-${VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/fonts/lexend-400.woff2',
  './assets/fonts/lexend-700.woff2',
  './src/app.js',
  './src/version.js',
  './src/settings.js',
  './src/sync.js',
  './src/journal.js',
  './src/journal-record.js',
  './src/recovery.js',
  './src/files.js',
  './src/find.js',
  './src/editor.js',
  './src/backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './licenses/Lexend-OFL.txt',
  // 공용 동기화 모듈. 다른 저장소에 있지만 같은 오리진이라 캐시할 수 있습니다.
  // 아래 install 은 파일 하나씩 담고 실패를 삼키므로, 이 파일이 잠깐 없어도
  // 설치가 실패하지 않습니다.
  '../shared/v1/sync.js',
  '../shared/v2/journal.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // 파일 하나가 없어도 설치가 통째로 실패하지 않도록 개별로 담습니다.
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        await cache.add(url);
      } catch (error) {
        // 선택 파일은 없어도 앱이 동작합니다.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (name.startsWith('quill-') && name !== CACHE_NAME ? caches.delete(name) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 같은 출처만 다룹니다. Quill 은 외부로 요청을 보내지 않습니다.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    // 문서 요청은 네트워크를 먼저 시도해 새 버전을 빨리 받습니다.
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', response.clone());
        return response;
      } catch (error) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        throw error;
      }
    }

    // 나머지는 캐시 우선 — 오프라인에서 즉시 뜨는 것이 중요합니다.
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
