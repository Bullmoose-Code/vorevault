// VoreVault service worker.
// Zero caching by design — files are large and private; this SW exists only to
// satisfy the PWA install criterion on Chromium and iOS.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch. Required so the browser treats this as a "real" SW.
self.addEventListener("fetch", () => {});
