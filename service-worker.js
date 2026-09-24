/*
 * Service worker for K Muhammad Jusair's Digital ID.
 *
 * Strategy:
 *  - The app shell (this page's own HTML/CSS/JS + icons + manifest) is
 *    precached on install and served cache-first, so the Digital ID opens
 *    even with no network once it has been visited at least once.
 *  - Google Fonts requests are cached opportunistically at runtime
 *    (cache-first, falling back to network) purely as a nice-to-have —
 *    the page's own CSS already falls back to system fonts if these are
 *    unavailable, so nothing breaks if this cache is empty.
 *  - Everything else (tel:, mailto:, wa.me, instagram.com, github.com,
 *    linkedin.com, and any other third-party destination) is left
 *    completely alone: this service worker never intercepts, caches, or
 *    stores anything for those. They still require an internet
 *    connection, exactly as before.
 *  - Updates are safe by default: a new service worker installs and
 *    precaches its own versioned cache, but only takes over once every
 *    open tab of this site has been closed and it is opened again — so a
 *    tab already open never ends up with a mix of old and new assets.
 */

var CACHE_VERSION = "juzair-digital-id-v1";
var FONT_CACHE = "juzair-digital-id-fonts-v1";

var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  // Intentionally no self.skipWaiting() here — see the update note above.
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_VERSION && key !== FONT_CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
  // Intentionally no self.clients.claim() here — see the update note above.
});

function isAppShellRequest(url) {
  return url.origin === self.location.origin;
}

function isGoogleFontRequest(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Only ever handle simple same-origin/font GETs. Everything else (POSTs,
  // browser extension requests, and — importantly — any request to a
  // different origin such as wa.me, instagram.com, github.com or
  // linkedin.com) is left untouched and goes straight to the network.
  if (request.method !== "GET") return;

  var url = new URL(request.url);

  if (isAppShellRequest(url)) {
    // Cache-first for the app shell, with a safe network fallback and a
    // dedicated offline fallback for full-page navigations.
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request)
          .then(function (response) {
            if (response && response.status === 200) {
              var copy = response.clone();
              caches.open(CACHE_VERSION).then(function (cache) {
                cache.put(request, copy);
              });
            }
            return response;
          })
          .catch(function () {
            if (request.mode === "navigate") {
              return caches.match("./index.html");
            }
          });
      })
    );
    return;
  }

  if (isGoogleFontRequest(url)) {
    // Best-effort runtime cache for the Google Font — never required for
    // the page to work, since the CSS already has a system-font fallback.
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request)
          .then(function (response) {
            if (response && response.status === 200) {
              var copy = response.clone();
              caches.open(FONT_CACHE).then(function (cache) {
                cache.put(request, copy);
              });
            }
            return response;
          })
          .catch(function () {
            // No cached font and no network — the page's own CSS fallback
            // stack (system-ui, -apple-system, sans-serif) takes over.
          });
      })
    );
  }

  // Any other origin (contact links, social profiles, etc.) is left
  // completely unhandled here, so the browser fetches it normally and it
  // correctly still requires an internet connection.
});
