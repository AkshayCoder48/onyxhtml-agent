/* OnyxHTML Agent — Service Worker
 *
 * Provides offline app-shell caching:
 *   - On install, pre-caches the core shell (HTML, CSS, JS chunks).
 *   - On fetch, same-origin GET requests use a "stale-while-revalidate"
 *     strategy so the UI loads instantly even without a network.
 *   - Cross-origin requests (LLM providers, CDN assets) pass through
 *     untouched.
 *
 * This file lives in /public so Next.js serves it from the site root
 * (/sw.js), which is required for a service worker to control the whole
 * origin. It is plain ES5-ish JavaScript on purpose: service workers are
 * NOT processed by the bundler, so no TypeScript / import statements here.
 */

var CACHE = "onyxhtml-shell-v1";
var CORE = ["/", "/index.html"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(CORE).catch(function () {
          /* offline at install time — non-fatal */
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Only handle same-origin GETs. Let external API calls (LLM providers,
  // CDN images, etc.) go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Never cache the proxy route, Next.js data requests, or HMR sockets.
  if (
    url.pathname.indexOf("/api/") === 0 ||
    url.pathname.indexOf("/_next/webpack-hmr") === 0 ||
    url.pathname.indexOf("/_next/static/") !== 0 && url.searchParams.get("_rsc")
  ) {
    return;
  }

  // Stale-while-revalidate: respond with cache (if present), then update
  // the cache in the background.
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req)
          .then(function (res) {
            // Only cache basic, same-origin OK responses.
            if (res && res.status === 200 && res.type === "basic") {
              try {
                cache.put(req, res.clone());
              } catch (e) {
                /* quota — ignore */
              }
            }
            return res;
          })
          .catch(function () {
            return cached;
          });
        return cached || network;
      });
    })
  );
});

// Allow the page to ask the service worker to clear its cache.
self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "CLEAR_CACHE") {
    event.waitUntil(caches.delete(CACHE));
  }
});
