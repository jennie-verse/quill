const CACHE_PREFIX = "text-editor-";
const CACHE_VERSION = "text-editor-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

function extractHtmlAssets(html, baseUrl) {
  return Array.from(html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi), (match) => {
    return new URL(match[1], baseUrl);
  }).filter((url) => url.origin === self.location.origin);
}

function extractCssAssets(css, baseUrl) {
  return Array.from(css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi), (match) => {
    return new URL(match[1], baseUrl);
  }).filter((url) => url.origin === self.location.origin && !url.protocol.startsWith("data"));
}

async function cacheResponse(cache, url) {
  const response = await fetch(url, { cache: "reload" });
  if (!response.ok) throw new Error(`Could not precache ${url.pathname}`);
  await cache.put(url, response.clone());
  return response;
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  const scopeUrl = new URL("./", self.registration.scope);
  await cache.addAll(CORE_ASSETS.map((path) => new URL(path, scopeUrl)));

  const indexUrl = new URL("./index.html", scopeUrl);
  const indexResponse = await cacheResponse(cache, indexUrl);
  const htmlAssets = extractHtmlAssets(await indexResponse.text(), indexUrl);

  await Promise.all(htmlAssets.map(async (assetUrl) => {
    const response = await cacheResponse(cache, assetUrl);
    if ((response.headers.get("content-type") || "").includes("text/css")) {
      const cssAssets = extractCssAssets(await response.text(), assetUrl);
      await Promise.all(cssAssets.map((cssAssetUrl) => cacheResponse(cache, cssAssetUrl)));
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put("./index.html", response.clone());
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
