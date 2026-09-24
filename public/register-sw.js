// Registers the service worker (public/sw.js). Kept in its own file, not
// inline in index.html, so the Content-Security-Policy can forbid all inline
// scripts, which blocks most script-injection (XSS) attacks.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      console.warn('Service worker registration failed', err);
    });
  });
}
