/* Cross-Origin Isolation service worker for GitHub Pages.
   Adds COOP + COEP headers so SharedArrayBuffer (required by MindAR WASM) works. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  // Skip opaque cross-origin cached requests to avoid errors
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;

  e.respondWith(
    fetch(e.request).then((res) => {
      const h = new Headers(res.headers);
      h.set('Cross-Origin-Opener-Policy',   'same-origin');
      h.set('Cross-Origin-Embedder-Policy', 'credentialless');
      h.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(res.body, {
        status:     res.status,
        statusText: res.statusText,
        headers:    h,
      });
    })
  );
});
