/* Runner service worker
 *
 * Goals: make the PWA installable, open instantly, and show the app shell
 * when the network drops. It deliberately does NOT cache anything
 * cross-origin — Firestore, Firebase Auth, Cloud Functions and Google Maps
 * must always hit the network so orders are never stale.
 *
 * Bump VERSION whenever this file changes. App code updates don't need a
 * bump: JS bundles are content-hashed and navigations are network-first.
 */
const VERSION = 'dd-v10';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/badge-96.png',
  // Launch intro images (components/BrandIntro.tsx), so it plays offline too
  '/brand/jc-logo.png',
  '/brand/dormdash-tile.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, Maps, etc.
  // Server endpoints (e.g. /api/wipay-return, the card payment result) must
  // always go straight to the server and never be cached.
  if (url.pathname.startsWith('/api/')) return;
  // Firebase's own pages (Google sign-in handler, /__/auth/*, /__/firebase/*):
  // straight to the server, never cached as the app shell.
  if (url.pathname.startsWith('/__/')) return;

  // Page loads (any route — it's a single-page app): network first, so a new
  // deploy is picked up immediately; fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache a real page, never a redirect or an error.
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Hashed bundles, fonts and images never change at the same URL: cache first.
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Anything else same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// ─── Push notifications (FCM web push) ─────────────────────────────────────
// Cloud Functions send data-only FCM messages: { title, body, screen, ... }.
// If DormDash is open and focused, hand the message to the page so it shows
// the in-app cerulean banner. Otherwise show a system notification.
// Safari/Firefox rule: every push MUST show a notification (see below).

// Safari (iPhone AND Mac, including "Add to Dock" web apps) and Firefox
// punish a push that doesn't show a notification: Safari revokes the push
// subscription, Firefox burns through a quota and then does the same. The
// server then gets "registration-token-not-registered" and the account stops
// getting alerts. So on those browsers we ALWAYS show a system notification,
// even when DormDash is open. Only Chrome-family browsers (Chrome, Edge,
// Samsung Internet, Android) get the in-app banner instead.
const UA = self.navigator.userAgent;
const MUST_SHOW_NOTIFICATION =
  /iPad|iPhone|iPod/.test(UA) ||
  /Firefox\//.test(UA) ||
  (/Safari\//.test(UA) && !/Chrome|Chromium|CriOS|Edg|Android|SamsungBrowser/.test(UA));

// Expo Router groups like /(student)/ don't appear in web URLs.
function toWebPath(screen) {
  if (!screen || typeof screen !== 'string') return '/';
  const path = screen.replace(/\/\([^)]+\)/g, '');
  return path.startsWith('/') ? path : '/' + path;
}

function parsePush(event) {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {
    payload = { data: { body: event.data ? event.data.text() : '' } };
  }
  const data = Object.assign({}, payload.data || {});
  const n = payload.notification || {};
  return {
    title: data.title || n.title || 'Runner',
    body: data.body || n.body || '',
    data,
  };
}

self.addEventListener('push', (event) => {
  const msg = parsePush(event);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focused = wins.find((w) => w.focused && w.visibilityState === 'visible');
    if (focused && !MUST_SHOW_NOTIFICATION) {
      focused.postMessage({ type: 'dd-push', title: msg.title, body: msg.body, data: msg.data });
      return;
    }
    // Tell every open DormDash page that something changed, even when a
    // system notification is shown instead of the banner (always on iPhone
    // and Safari). The page reconnects its live data (services/liveSync.ts),
    // so a dasher's order list can't miss the order this push is about.
    wins.forEach((w) => w.postMessage({ type: 'dd-sync', data: msg.data }));
    // Loud by default: sound + vibration, and every update alerts again
    // (renotify) even though updates for the same order replace each other
    // (tag). Whether it also drops down as a banner ("heads-up") is decided
    // by the phone's notification settings for DormDash; a website cannot
    // set that itself. See PWA_HANDOFF.md "Notification sound and banners".
    const forDasher = typeof msg.data.screen === 'string' && msg.data.screen.includes('(dasher)');
    await self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',          // monochrome, for the status bar
      tag: msg.data.orderId ? 'order-' + msg.data.orderId : 'dormdash-' + Date.now(),
      renotify: true,
      silent: false,
      vibrate: [250, 120, 250, 120, 400],
      requireInteraction: forDasher,         // new jobs stay until the dasher acts
      timestamp: Date.now(),
      data: msg.data,
    });
  })());
});

// Tapping a DormDash notification focuses the open app (or opens it) on the
// screen the notification is about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = toWebPath(data.screen);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        // Let the router navigate in-app (keeps state); fall back to a load.
        w.postMessage({ type: 'dd-push-click', title: event.notification.title, body: event.notification.body, data });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
