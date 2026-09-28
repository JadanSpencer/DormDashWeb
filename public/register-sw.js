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

// Screens load as separate files (Expo Router async routes). A tab left open
// across a deploy can ask for a screen file the new release no longer has
// (Hosting answers with index.html, or the load fails). Reload once to pick
// up the new release; at most once a minute so a real outage can't loop.
(function () {
  function stale(msg, file) {
    return /\/_expo\/static\/js\//.test(file || '') ||
      /AsyncRequireError|Requiring unknown module|Loading module .* failed/.test(msg || '');
  }
  function reloadOnce() {
    try {
      var last = Number(sessionStorage.getItem('dd-chunk-reload') || 0);
      if (Date.now() - last < 60000) return;
      sessionStorage.setItem('dd-chunk-reload', String(Date.now()));
    } catch (e) { /* storage blocked: still reload */ }
    location.reload();
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && stale('', t.src)) return reloadOnce();
    if (e.message && stale(e.message, e.filename) && /SyntaxError|AsyncRequire|unknown module/.test(e.message)) reloadOnce();
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    if (r && stale(String(r.name) + ' ' + String(r.message), '')) reloadOnce();
  });
})();
