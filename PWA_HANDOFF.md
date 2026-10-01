# DormDash PWA — Build Record & Handoff

Read this before changing anything related to the web / PWA build.
Written for the next person or AI agent (Claude, Copilot, Base44, Codex, etc.).

Last updated: 24 Sep 2026 (round 3: design clean-up, legal pages, security hardening, speed)
Expo SDK: 54 · Expo Router 6 · React Native 0.81 · Firebase JS SDK 11

---

## 1. Why this exists

DormDash is an Expo (React Native) app. Publishing to the App Store and Google
Play is blocked until the Apple and Google developer accounts are approved.
Until then, the **same codebase** ships as a Progressive Web App (PWA): a
website students open once and "install" to their home screen, where it opens
full screen like a normal app.

Key decision: **we did not fork or rewrite the app.** Expo already compiles
to web through react-native-web. The PWA work is a thin layer of web-only
files (`*.web.ts` / `*.web.tsx`) that Metro swaps in automatically on web,
plus the files that make a website installable. The iOS/Android builds are
unaffected and can still be submitted to the stores later from this repo.

## 2. Commands

| Task | Command |
|---|---|
| Dev server in the browser | `npm run web` |
| Production build → `dist/` | `npm run build:web` |
| Preview the build locally | `npm run serve:web` then open http://localhost:3000 |
| Build + deploy to Firebase Hosting | `npm run deploy:web` |
| Deploy website + functions + storage rules | `npm run deploy:all` |
| Design QA with sample data (no login needed) | `npm run preview:web`, then add `?as=student`, `?as=dasher`, `?as=admin` or `?as=none` to the URL |
| Type-check | `npm run typecheck` |
| Audit production dependencies | `npm run audit:prod` |

The build reads `EXPO_PUBLIC_*` values from `.env` at build time. On Vercel or
any CI, set the same variables in the host's environment settings.

## 3. What was built — files

### Added

| File | Purpose |
|---|---|
| `public/index.html` | HTML template Expo uses for the web build. Links the manifest and icons, adds iOS home-screen meta tags, registers the service worker, sets the cream background (no white flash), centres the app in a phone-width column on desktop. |
| `public/manifest.webmanifest` | Web app manifest: name, colours, `standalone` display, icons. This is what makes the site installable. |
| `public/sw.js` | Service worker. Network-first for page loads (new deploys show up immediately), cache-first for hashed bundles/assets/icons, **never caches cross-origin** (Firestore, Auth, Functions, Maps). Receives web push: if DormDash is open and focused (not iOS) it posts the message to the page for the in-app banner, otherwise it shows a system notification. Handles notification taps (strips `/(group)` segments for web URLs). |
| `public/icons/*` | 192/512 "any" icons, 192/512 maskable icons (full-bleed, glyph inside the safe zone), 180px apple-touch-icon, 32px favicon. Generated from `assets/icon.png`. |
| `components/MapView.tsx` | Native: re-exports `react-native-maps`. |
| `components/MapView.web.tsx` | Web: same API (`default`, `Marker`, `PROVIDER_GOOGLE`). Renders a keyless Google Maps embed centred on the first `<Marker>` plus a "Get directions" button (uses the 2nd marker, the dasher, as origin). |
| `services/notifications.web.ts` | Web version of `services/notifications.ts`, same exports plus `enableWebPush(uid)` and `webPushPermission()`. Gets an FCM token (needs `EXPO_PUBLIC_FIREBASE_VAPID_KEY`) and saves it to `users/{uid}.pushToken` as `web:<token>`. Never prompts on its own — browsers require a tap. Listens for messages from `sw.js` and feeds them to the same banner code native uses. |
| `services/webAlert.ts` / `services/webAlert.web.ts` | react-native-web's `Alert.alert` is an empty function, so every confirm dialog silently did nothing in the browser. `installWebAlert()` maps it to `window.alert` / `window.confirm` (OK runs the first non-cancel button). No-op on native. |
| `components/InstallPrompt.tsx` / `.web.tsx` | Setup cards for signed-in users, in order: (1) "Put DormDash on your home screen" — Android/Chrome real Install button, iOS Safari Share → Add to Home Screen steps; (2) "Turn on order alerts" — the tap that triggers the browser permission prompt and saves the push token. Each hides for 14 days after "Not now". |
| `hooks/useWakeLock.ts` / `.web.ts` | Web: keeps the screen on while a dasher is online (Screen Wake Lock API), re-acquired when the app becomes visible again. Native: no-op. |
| `vercel.json` | Optional alternative host: build command, SPA rewrites, cache headers. |
| `PWA_HANDOFF.md` | This file. |

### Changed

| File | Change |
|---|---|
| `app/(dasher)/home.tsx` | Import map from `../../components/MapView` instead of `react-native-maps`. Nothing else. |
| `app/(student)/order/[id].tsx` | Same, `../../../components/MapView`. |
| `services/firebase.ts` | On web uses `getAuth()` (browser SDK, session persisted in IndexedDB). Native path unchanged (`initializeAuth` + AsyncStorage). Typed `auth` as `Auth` (fixed ~20 implicit-any TS errors). Now also exports `app` (needed by `firebase/messaging`). |
| `services/notifications.ts` | Added inert `webPushPermission()` / `enableWebPush()` so shared code imports the same names on every platform. Native behaviour unchanged. |
| `functions/src/index.ts` | `sendPushNotification()` now checks the token: `web:` tokens go through `admin.messaging().send()` as data-only FCM messages; Expo tokens go to the Expo push service as before. Dead web tokens are cleared from the user doc. Order-status pushes now include `orderId` so repeated updates replace each other instead of stacking. **Must be redeployed** (`firebase deploy --only functions`). |
| `app/(dasher)/home.tsx` (round 2) | Calls `useWakeLock(isOnline)`; on web the online subtitle says "keep DormDash open on screen". |
| `app/_layout.tsx` | Calls `installWebAlert()` at module load; renders `<InstallPrompt uid={user?.uid ?? null} />` after the Stack. Fixed the TS2367 on the splash check with `(segments as string[])`. |
| `app.json` → `expo.web` | `output: "single"` (single-page app; static rendering would run Firebase at build time), `bundler: "metro"`, name, description, theme/background colours. |
| `package.json` | Added scripts `build:web`, `serve:web`, `deploy:web`. |
| `firebase.json` | Added a `hosting` block: serves `dist/`, rewrites all routes to `index.html`, no-cache on `sw.js`/`index.html`/manifest, 1-year immutable cache on `/_expo/**`. |

## 3b. Round 3 changes (design, legal, security, speed)

### Routes renamed (web URLs must be unique across role groups)
Expo Router groups like `(student)` don't appear in URLs, so `/home`,
`/profile` and `/store/:id` were shared by two roles, and refreshing a store
page sent students home. Now:

| Old file | New file | URL |
|---|---|---|
| `app/(dasher)/home.tsx` | `app/(dasher)/dash.tsx` | `/dash` |
| `app/(dasher)/profile.tsx` | `app/(dasher)/account.tsx` | `/account` |
| `app/(admin)/store/[id].tsx` | `app/(admin)/manage-store/[id].tsx` | `/manage-store/:id` |

Push notification `screen` values in `functions/src/index.ts` were updated
to `/(dasher)/dash`. **Rule: any new route must have a URL no other role
group uses.**

### Design system changes (constants/theme*.ts + screens)
- Tokens: radii tightened (sm 8, md 12, lg 14, xl 18; pills stay 999);
  `type.label` is sentence case with 0.1 tracking (was 11px tracked caps);
  card shadows reduced to a 1px contact edge; `T.color.card` is `#FFFDF9`
  (never pure white).
- Contrast fixed to WCAG AA (4.5:1): `T.inkFaint #5C7379`, `T.cerulean
  #0A7A9C`, `T.teal #0A7D6E`, `S.creamFaint #A3B5B6`, `D.creamFaint #90A8A4`.
- Removed from all screens: decorative background orbs, colored left-stripe
  alert boxes, forced uppercase labels, eyebrows above page titles,
  01/02/03 numbering on admin cards, emojis and em dashes in UI copy, the
  dasher "online" glow orb (now a small pulsing dot), the login screen's
  non-interactive role chips (now Privacy/Terms links).
- Stat rows of three boxes (student Orders, dasher Profile) are one strip
  with dividers.
- `components/GlassTabBar.tsx`: one tab bar for all three roles, liquid
  glass on web (backdrop blur), accessible tab roles/labels.
- Store page credit ("created by Jcommerce") is inline at the end of the list,
  no longer floating over prices.
- **Do not reintroduce:** gradient text, orbs/blobs, left stripes, tracked
  all-caps eyebrows, heavy/colored glow shadows, emoji in headings, numbered
  markers on non-sequences, 3-box rows.

### Preview mode (design QA)
`metro.config.js` swaps every `firebase/*` import for in-memory fakes in
`preview/` when `DD_PREVIEW=1`. Sample data: `preview/fixtures.ts`. Never
active in real builds. Use it to screenshot every screen on any device size.

### Legal
- `app/legal/privacy.tsx` and `app/legal/terms.tsx`, rendered by
  `components/LegalDocument.tsx`. Public routes (RouteGuard skips `legal`).
- Linked from login, register (consent line) and both profiles
  (`components/AccountActions.tsx`).
- Facts live in `constants/legal.ts`: **contact email and payment wording
  must be confirmed by the owner.** Documents were written from the code;
  if data collection changes, update `privacy.tsx` in the same commit.
- Data map used for the policy: account (name, email, phone, university,
  role, optional major/grad year), orders (items, prices, address label,
  optional GPS, note), dasher live location every 5 s while online only,
  push token, no analytics, no AI on user data, no uploads.

### Security (server side: functions/src/index.ts)
- `verifyNewOrder()`: every new order is re-priced from Firestore (items,
  names, delivery fee, total, store name, student name). Closed store,
  missing/unavailable item, bad quantity, >20 items, inactive account →
  order cancelled with `cancelReason`, shown to the student in
  `app/(student)/order/[id].tsx`. Runs before dashers are notified.
- Rate limit: more than 5 orders in 10 minutes per student → cancelled
  (`rate_limited`). Filtered in memory so no Firestore index is needed.
- `onUserActiveChanged` (now part of `onUserWritten`): mirrors `users/{uid}.isActive` into Firebase Auth
  (disables sign-in, revokes refresh tokens). Deactivated users are signed
  out everywhere within an hour (ID tokens live max 1 h).
- `deleteMyAccount` also deletes Storage files under `users/{uid}/`.

### Security (web + config)
- `firebase.json` / `vercel.json` send: Content-Security-Policy (scripts only
  from own origin, no inline scripts; Firebase and Google Maps hosts
  allowed), HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy,
  Permissions-Policy (geolocation self only), COOP. Verified: 0 CSP
  violations on the real build. **If you add a new external service, add its
  host to `connect-src`/`frame-src` or it will be blocked.**
- Service worker registration moved to `public/register-sw.js` (no inline JS).
- `storage.rules`: deny all (app uses no Storage). Deploys with `deploy:all`.
- Native Google Maps keys removed from `app.json`; `app.config.js` reads
  `GOOGLE_MAPS_IOS_API_KEY` / `GOOGLE_MAPS_ANDROID_API_KEY` from `.env` (or
  EAS env vars). The old keys are still in git history: **restrict them** in
  Google Cloud Console.
- `npm audit fix` (non-breaking) applied: app 31 → 22 findings; the rest are
  inside Expo's build tooling and clear with an Expo SDK upgrade. Never run
  `npm audit fix --force` (it breaks Expo).
- `.github/dependabot.yml` (weekly dependency/security PRs; Expo/React
  minor+major excluded) and `.github/workflows/ci.yml` (web build + typecheck
  for app and functions on every push/PR).

### Speed
- Launch intro: full 4.4 s sequence on the first visit only; returning web
  visitors get 0.8 s (`app/index.tsx`, localStorage `dd_seen_intro`).
- `index.html` preconnects to Firestore and Auth hosts.
- Bundle: 2.7 MB raw, ~0.7 MB gzipped (Firebase Hosting compresses
  automatically), cached as immutable, served by the service worker after the
  first visit. The site is static: built once per deploy, not per visitor.

### Round 4: notifications when the app is closed
- `requestPushPermissionFromGesture()` (services/notifications.web.ts) is
  the first line of the Sign in and Create account handlers. Browsers only
  allow the permission prompt during a tap, before any `await`. Once
  granted, the FCM token is saved as soon as the user is signed in.
- Existing signed-in users still get the "Turn on order alerts" card.
- `onPushTokenChanged` (now part of `onUserWritten`): a device's token belongs to one account
  only. Saving a token removes it from every other user, so a shared phone
  never receives the previous account's alerts.
- Verified in Chromium: Sign in tap triggers the prompt; a push delivered
  with no DormDash window open shows a system notification (tag
  `order-<id>`, tap opens the order).
- Delivery limits (browser rules, not ours): iPhone needs DormDash added to
  the Home Screen (iOS 16.4+); desktop needs the browser running in the
  background; a user who taps "Block" must re-allow in browser site settings.
- Storage was never set up on the Firebase project, so `deploy:all` deploys
  hosting + functions only. `storage.rules` is ready if uploads are added.

### Notification sound and banners (round 5)
- `public/sw.js` (VERSION dd-v3) shows every push with `silent: false`,
  a vibration pattern, `renotify: true` (each order update alerts again
  while replacing the previous one via `tag`), `requireInteraction` for
  dasher job alerts, and a monochrome status-bar badge
  (`public/icons/badge-96.png`).
- Heads-up banners and sound level are controlled by the phone, not the
  website. Android: long-press the notification → settings, or
  Settings → Apps → DormDash (installed) or Chrome → Notifications →
  dormdash-71035.web.app → turn on "Sound" and "Pop on screen". Also
  check Do Not Disturb. iPhone: Settings → Notifications → DormDash →
  Banners + Sounds. The native app sets this itself (AndroidImportance.MAX
  channel in services/notifications.ts); a website cannot.

## 4. How native features behave on web

| Feature | Native app | PWA | Notes |
|---|---|---|---|
| Sign in / register / reset password | ✅ | ✅ | Same Firebase Auth. Web domain must be in Firebase → Auth → Authorized domains. |
| Stores, menus, cart, checkout, orders | ✅ | ✅ | Same Firestore code, real-time listeners work. |
| Live order status | ✅ | ✅ | Firestore `onSnapshot` — works while the app is open. |
| Checkout GPS pin | ✅ | ✅ | `expo-location` uses the browser geolocation API. Requires HTTPS. |
| Dasher online + location heartbeat | ✅ | ⚠️ | Works while the PWA is open. The screen is kept awake while online (wake lock), but switching to another app still pauses it — the dasher screen tells them to keep DormDash open. |
| Maps | ✅ interactive, 2 pins | ⚠️ | Embedded map with the drop-off pin + "Get directions" opening Google Maps. |
| Confirm dialogs (sign out, cancel order, delete store, deactivate user) | ✅ | ✅ | Via `webAlert` shim — browser's native confirm box. |
| Push notifications (order accepted, on the way, delivered…) | ✅ | ✅ after setup | Via FCM web push once the VAPID key is set and functions are redeployed (§5 step 3). Android/desktop: works in the browser or installed. iPhone: **only after Add to Home Screen** (iOS 16.4+). One device per account receives pushes (last to sign in), same as native. |
| Account deactivate / delete (callable functions) | ✅ | ✅ | `httpsCallable` works on web. |
| Launch animation | ✅ | ✅ | Runs with JS animation (the `useNativeDriver` console warning on web is expected and harmless). |
| Offline | Partial | Partial | App shell opens offline; data needs a connection. |

## 5. Launch checklist (manual steps — cannot be done by code)

1. **Firebase Hosting** (recommended; the project `dormdash-71035` already exists):
   `npm i -g firebase-tools` → `firebase login` → `npm run deploy:web`.
   The app goes live at `https://dormdash-71035.web.app`. That domain is
   already an authorized Auth domain.
2. **If using another host or a custom domain** (e.g. dormdash.app): add it in
   Firebase Console → Authentication → Settings → Authorized domains, or
   sign-in will fail with `auth/unauthorized-domain`.
3. **Turn on web push** (code is done; these are account steps):
   a. Firebase Console → Project settings → Cloud Messaging → Web
      configuration → Web Push certificates → **Generate key pair**.
   b. Add the public key to `.env` (and to Vercel env vars if used):
      `EXPO_PUBLIC_FIREBASE_VAPID_KEY=<key>` then rebuild (`npm run build:web`).
   c. Make sure the Firebase Cloud Messaging API is enabled in Google Cloud
      Console for project `dormdash-71035`.
   d. Redeploy functions: `firebase deploy --only functions`.
   e. Test: sign in on the PWA → tap "Turn on alerts" → place an order from
      another account → the dasher/student should get a notification.
4. **Google Maps key**: if `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is restricted to
   Android/iOS apps, add an HTTP-referrer restriction for the web domain if you
   later switch to the API-key map (the current embed needs no key).
5. **Test installs on real phones**: Android Chrome (Install button) and
   iPhone Safari (Share → Add to Home Screen). Check sign-in persists after
   closing and reopening the installed app.
6. **Lighthouse**: Chrome DevTools → Lighthouse → "Progressive Web App" on the
   deployed URL to confirm installability.

## 6. Next tasks (priority order)

1. **Owner decisions:** confirm `contactEmail` and `paymentMethod` in
   `constants/legal.ts`; have a Jamaican lawyer review both documents.
2. **Deploy round 3:** `npm run deploy:all` (website, functions with order
   verification + session enforcement, storage lock).
3. **Rotate/restrict keys:** delete service-account key `c00317df…`;
   restrict both native Maps keys (see §3b). Consider turning off
   "Gemini in Firebase" if you don't use it (the privacy policy mentions it).
4. ~~Firestore security rules~~ Done: `firestore.rules` is in the repo with
   tests (`npm run test:rules`); see "Launch hardening" below.
5. **App Check** (blocks requests that don't come from the real app):
   enable in Firebase console with reCAPTCHA Enterprise for web; requires
   adding `firebase/app-check` init in `services/firebase.ts` and the
   reCAPTCHA hosts to the CSP.
6. **Wider layouts:** tablet/desktop currently show the phone column
   centred (480 px). A two-column store/menu layout would use the space.
7. Web push rollout test on real devices (see §5 step 3).
8. Interactive two-pin web map (`components/MapView.web.tsx`).
9. Lower dasher location write frequency (every 5 s is a lot of Firestore
   writes; 15–20 s is usually enough) in `constants/index.ts`.
10. Upgrade Expo SDK when ready (`npx expo install expo@latest --fix`) to clear
    the remaining build-tool audit findings.

## 7. Rules for AI agents working on this repo

- Read `AGENTS.md` and the Expo **v54** docs (https://docs.expo.dev/versions/v54.0.0/)
  before writing code. Expo APIs change between versions.
- **Never import `react-native-maps` in a screen.** Import from
  `components/MapView`. A direct import breaks the entire web build
  ("Importing native-only module … on web").
- For any other native-only module, follow the same pattern: `thing.ts`
  (native) + `thing.web.ts` (web) with identical exports. Metro chooses
  automatically. Don't scatter `Platform.OS === 'web'` checks through screens.
- `Alert.alert` is fine to use; the web shim covers it. Keep "cancel" buttons
  marked `style: 'cancel'` so the shim can tell them apart.
- Do not make `public/sw.js` cache cross-origin requests or Firestore data.
  If you change `sw.js`, bump `VERSION` (see the top of `public/sw.js`).
- Every push handled in `sw.js` on iOS must call `showNotification`, or
  Safari revokes the permission. Keep the `IS_IOS` branch.
- Push tokens: `web:` prefix = FCM (PWA), `ExponentPushToken[` = Expo
  (native). Keep that contract between `notifications.web.ts` and
  `functions/src/index.ts`.
- Keep `expo.web.output` as `"single"`. `"static"` pre-renders pages in Node,
  where the Firebase/AsyncStorage setup will throw.
- After any change, run `npm run build:web` — a successful export is the
  quickest check that nothing native-only leaked into the web bundle.

## 8. Verification done for this build

- `npx expo export --platform web` completes (single 2.7 MB JS bundle).
  Before the changes it failed on `react-native-maps`.
- Served `dist/` and loaded it in headless Chromium at phone size: launch
  animation plays, routes to `/login`, no page errors, service worker
  registers, deep links (e.g. `/student/home`) return the app shell.
- Verified with a temporary test route (since removed): `Alert.alert` with two
  buttons opens a browser confirm and runs the correct callback; web MapView
  renders the embed for the first marker.
- iPhone user agent: install hint appears; desktop: app shows as a centred
  phone-width column.
- `tsc --noEmit`: clean for the app and for `functions/`.
- Round 2: delivered a simulated push to the service worker via Chrome
  DevTools Protocol while the app was open — the cerulean in-app banner
  appeared with the right title and body, no page errors.
- **Not tested** (needs real accounts/devices/keys): signing in against live
  Firebase, placing an order end-to-end, geolocation on real phones,
  installing on physical Android/iPhone, real FCM delivery (needs the VAPID
  key and deployed functions), wake lock on a physical phone.

## Push fix: dead web tokens (2026-09-23)

Symptom: dasher alerts worked, but the student got nothing after the first status change. The logs showed `messaging/registration-token-not-registered`.

Causes and fixes:
1. **Safari (Mac "Add to Dock" and iPhone) revokes a push subscription when a push doesn't show a notification.** `public/sw.js` only forced notifications on iOS, so a push that arrived while the Mac app was open became an in-app banner only, and Safari killed the token. Now Safari and Firefox always get a system notification. Only Chrome-family browsers get the in-app banner. SW is now `dd-v4`.
2. **No self-healing.** After the server removed a dead token, nothing saved a new one until the next sign-in. `notifications.web.ts` now re-checks the token each time the app comes back on screen, and writes only if it changed.
3. **Normal sign-out never detached the token.** `logoutUser()` now calls `clearPushToken()` first. That function only clears the account if the account still points at this device. `deleteToken()` was removed because it could leave the next account on the same device holding a dead token.
4. Logs now include `Dead web push token removed {uid, role}`, so you can see whose alerts stopped.

Rule for AIs: every web push MUST call `showNotification` on Safari and Firefox. Never suppress it there.

### Follow-up: dead token kept coming back (2026-09-23)
The logs showed the S23 re-saving the **same** dead token after the server removed it. The Firebase SDK returns its cached token for as long as the browser's push subscription is unchanged, and `deleteToken()` gives up when Firebase says the token doesn't exist. Fix: when the server finds a dead token, it now also writes `users/{uid}.pushTokenDead = <that token>`. When the app saves its token and sees a match, it unsubscribes the browser push subscription itself, then calls `getToken()` again, which creates a brand-new token.

### Fix: 9 orders from one tap-burst (2026-09-23)
Logs at 21:13:53 UTC showed 9 orders from one student within 0.6s. 8 were rejected as `rate_limited` and the student got a stack of "Order cancelled" pushes. After that, their real retries stayed blocked for 10 minutes.
- Cause: in `app/(student)/checkout.tsx`, the button only disabled after the "active order?" check finished, so every tap during that wait placed an order. Fix: a synchronous `placingRef` lock is set before any `await`.
- Server backstop in `verifyNewOrder`: one active order per student. When several arrive at once, the oldest survives and the rest are cancelled as `duplicate_order`, with no push sent. The rate limit no longer counts orders the server rejected, or duplicates about to be rejected.
- A rejection push now says why (e.g. rate limited) and opens that order. Dasher alert tokens are de-duplicated.

### Fix: rejected orders stuck on the dasher screen (2026-09-23)
Symptom: orders the server rejected stayed in the dasher's list with a strange "mins ago", and accepting one said another dasher had taken it (only one dasher was online).
- The pending list now shows only orders the server has verified (`verifiedAt` is set), so orders that are about to be rejected never appear.
- The listener now has an error handler that re-subscribes, and it also re-subscribes whenever the PWA comes back on screen. Before, a dead or frozen listener left the list stale without any warning.
- Accept now runs in a transaction and reports what really happened: cancelled, duplicate, or taken. It then removes the order from the list.
- "mins ago" uses the server's `verifiedAt` instead of `createdAt`, which comes from the student's phone clock. It also shows hours past 60 min.

## Launch hardening (2026-09-23, for 24 Sep launch)
(LAUNCH_CHECKLIST.md was never committed; the deploy steps live in §5 and in PAYMENTS_SETUP.md.)
- **Firestore rules are now in the repo** (`firestore.rules`, wired in `firebase.json`). They cover: users can't set their own role or isActive, and nobody can sign up as admin; students can only read their own orders and profile; dashers can read open orders plus their own, accept only server-verified orders, and advance status one step at a time; stores and menus are admin-only writes; everything else is closed. Tests are in `firestore-tests/rules.test.mjs` (`npm run test:rules`, needs Java). They could not run in the build sandbox, so smoke-test after deploying and use console Rules → History to roll back if needed.
- **Dasher GPS no longer leaves the phone.** Nothing used it, and every online dasher's live position was readable by any student. The server gets only a heartbeat (`isOnline`, `lastSeenAt`) every 60 s, and GPS failures no longer stop it. The map pin refreshes locally every 15 s. The Privacy Policy and Terms are updated to match.
- **Sign-up clickwrap:** an "I am 18 or older and agree…" tick box is required. `termsAcceptedAt` and `termsVersion` are saved on the user doc, and the rules require them.
- **`cancelStalePendingOrders`** (scheduled, every 5 min) cancels orders nobody accepted within 30 min, with `cancelReason: 'no_dasher'`, and the student is notified. The admin cancel reason is `admin`.
- The rate limit now uses the server's `verifiedAt` time, not the phone clock.
- Rules for AIs: any new Firestore field the client writes must be added to `firestore.rules` (the rules use `hasOnly` key lists) with a test. Otherwise the write is silently denied in production.

### Up to 3 orders, tab icons, paging (2026-09-23)
- Students can have **3 orders in progress** at once (`MAX_ACTIVE_ORDERS`, now defined once in `functions/src/shared.ts`). `verifyNewOrder` cancels a 4th as `too_many_active`. An identical order (same store and items) placed within 2 minutes of an earlier active one is cancelled silently as `duplicate_order`, which is the tap-burst protection. The Orders tab lists every active order, each with its own Cancel button.
- **Tab bar icons are SVG** (`components/TabIcon.tsx`, Ionicons 7 paths, MIT). On some devices the inactive tabs rendered the icon font as a crossed-out box. `GlassTabBar` falls back to the Ionicons font only for names not in `TabIcon`. If you add a tab icon, add its paths there.
- **Past orders page on the phone**: the first 10 show, then a "Show N more" button adds 10 more each tap. The listener is unchanged, so no new Firestore index is needed.
- Preview mode: the fake Firestore now has `runTransaction`, and the fixtures include a second active order and 12 extra past orders.

### Icons, university picker, install card (2026-09-24)
- **No icon fonts on screen anymore.** Every icon the app shows is drawn as SVG by `components/TabIcon.tsx` (import it as `Icon`); the register page showed crossed-out boxes where the Ionicons/MaterialIcons font glyphs failed. To add an icon, add its SVG paths to `ICONS` there. Don't reintroduce `<Ionicons>` or `<MaterialIcons>`.
- **Register:** students choose their university from a dropdown (`STUDENT_UNIVERSITIES` in `app/(auth)/register.tsx`: UWI Mona, Other). Dashers still type theirs.
- **Install card** (`components/InstallPrompt.web.tsx`): asks "Install DormDash?". Yes opens the browser's own install dialog where one exists; otherwise the same card shows the steps for the detected device, with "Other devices" listing every platform. Then it offers order alerts, in a browser tab or the installed app (iPhone/iPad: Home Screen app only).

### Device clocks and staying online (2026-09-24)
- `services/serverClock.ts`: on web, `syncServerClock()` (run once in `app/_layout.tsx`) measures the device clock's error from the hosting server's `Date` header; `serverNow()` returns corrected time. Use it instead of `Date.now()` for anything written to Firestore or compared with server times. It was needed because a Mac set a day ahead showed a brand-new order as "26 hr ago".
- **Dasher online is a sticky switch.** It stays on until the dasher switches it off or signs out (`logoutUser` sets `isOnline:false`). Reopening the app resumes it; closing the app no longer matters. The server no longer drops dashers after 45 minutes without a heartbeat (`STALE_MS` removed), so new-order alerts arrive as push notifications with the app closed. The wake lock now applies only during an active delivery.

### Payments (2026-09-25): see PAYMENTS_SETUP.md
- Server: `functions/src/payments.ts` (all money logic, in transactions) plus hooks into `verifyNewOrder`, the accepted and cancelled branches, and the scheduler in `functions/src/index.ts`. WiPay returns to `/api/wipay-return` (Hosting rewrite → `wipayReturn`). `public/sw.js` skips `/api/` and never caches redirects (SW `dd-v5`).
- Order fields: `paymentMethod` card|tokens; `paymentStatus` unpaid → awaiting_payment → paid (card) or reserved → paid (tokens), and released / refunded_tokens on cancel; `payDeadline`. Orders without `paymentMethod` predate payments and are exempt.
- Rules: `wallets`, `walletTx`, `payments` and `floatTx` are read-only from the app; a dasher can't move an order past `accepted` until `paymentStatus == 'paid'`; admins can't edit `floatJmd` directly.
- App: `services/payments.ts`, `hooks/useWallet.ts`, `hooks/usePriceUnit.ts` (J$/tokens switch), `components/WalletCard.tsx`, `components/PriceUnitToggle.tsx`, `components/AmountPrompt.tsx`, and `app/(student)/payment-result.tsx` (confetti).
- Money logic tests (in-memory, no emulator): 20 scenarios, including forged or replayed returns, late payments and double-charge attempts. They pass against the compiled functions.

### Private dasher and float data (2026-09-26)
- `dashers/*` is readable only by that dasher and admins (it holds earnings, float and the current order). Checkout's "no dashers online" warning reads `publicStats/app.onlineDashers`, kept current by `onDasherOnlineChanged` (recounts with `count()` whenever someone goes on/offline).
- Store floats moved from `stores/{id}.floatJmd` (readable by every student) to `storeFloats/{storeId}` (admin read, server write). `readFloatTarget` / `adminAdjustFloat` move an old value across on first touch; the scheduled `runMigrations` sweeps all stores once and seeds the online count, recording each step in `meta/migrations`. Delete `runMigrations` once the logs show all its steps done (`storeFloatsV1`, `deliveryMinsV1`, `onlineDasherCountV1`).
- Rules: store docs can't be created with `floatJmd`. Tests cover all of this (`npm run test:rules`, `cd functions && npm run test:payments`).

### Decision: no Auth custom claims for roles (2026-09-26)
`firestore.rules` checks role and `isActive` by reading `users/{uid}` (`me()`), which costs one extra read per request. Moving these into custom claims was considered and **rejected**: claims live in the ID token for up to an hour, so a deactivated dasher could keep accepting orders until it expired (revoking refresh tokens doesn't end the current ID token). Instant deactivation is worth more than the read. Don't reintroduce claims for `isActive`; to cut rule reads, reduce request volume instead (e.g. the dasher heartbeat).

### Admin dashboard uses aggregation queries (2026-09-26)
`app/(admin)/(tabs)/dashboard.tsx` no longer listens to all of `users` and `orders`. It runs `count()`/`sum()`/`average()` aggregation queries (one read per 1,000 matching docs) on focus, every minute while open (paused while the browser tab is hidden), on pull-to-refresh, and when the "Updated …" bar is tapped. Average delivery time averages `orders.deliveryMins`, which `onDeliveryCompleted` writes; `runMigrations` backfills older delivered orders. Stores are still a live listener (few docs). The preview fake supports these aggregations.

### Bounded order history (2026-09-26)
No screen listens to a user's whole order history any more:
- Student Orders tab: past orders are a live `studentId + createdAt desc` query with `limit(visible + MAX_ACTIVE_ORDERS + 1)`; "Show more" widens the limit. Delivered / Total spent / "N older" come from aggregation queries, recounted when an order finishes. Uses the existing index.
- Dasher `/dash` Today strip and `/account` 30-day history: `hooks/useDasherOrders.ts` (`dasherId + acceptedAt >= since`). **New index** in `firestore.indexes.json`: deploy with `firebase deploy --only firestore:indexes` *before* the web build. Until it finishes building, the hook falls back to the old unbounded query, so nothing breaks in between.

### Scheduler reads only overdue orders (2026-09-26)
`cancelStalePendingOrders` (every 5 min) no longer reads every pending and accepted order. It queries pending orders with `createdAt < cutoff` or `verifiedAt < cutoff` (both, so a wrong phone clock can't hide an order), and `paymentStatus == 'awaiting_payment'` with `payDeadline < now`, then re-checks each inside its transaction as before. **Two new indexes** in `firestore.indexes.json` (`status + verifiedAt`, `paymentStatus + payDeadline`); while they build, it falls back to the old full reads and logs `Index for … not ready`.

### Data access lives in hooks/ and services/ (2026-09-26)
Screens and components no longer import `firebase/firestore` or `firebase/functions`. All data access goes through:

| Area | Live reads (hooks) | Writes / one-off calls (services) |
|---|---|---|
| Orders | `hooks/useOrders.ts`: `useOrder`, `useStudentActiveOrders`, `useStudentOrderHistory`, `usePendingOrders`, `useActiveDelivery`, `useDasherOrders`, `useOnlineDasherCount` | `services/orders.ts`: `placeOrder`, `cancelOrder`, `acceptOrder`, `advanceOrder`, `NEXT_STATUS`, `canStudentCancel` |
| Stores & menus | `hooks/useStores.ts`: `useStores`, `useStore`, `useMenu`, `useStoreFloats` | `services/stores.ts`: `saveStore`, `deleteStore`, `setStoreOpen`, `saveMenuItem`, `deleteMenuItem`, `setMenuItemAvailable` |
| People | `hooks/useUsers.ts`: `useDasherStats`, `useAllUsers`, `useAllWallets`, `useDasherFloats` | `services/users.ts` (profile, `setUserActive`, account deactivate/delete), `services/dasher.ts` (online switch) |
| Money | `hooks/useWallet.ts`: `useWallet`, `useWalletHistory`, `usePayment` | `services/payments.ts` (callables) |
| Admin stats | — | `services/adminStats.ts`: `loadAdminStats` (aggregations) |

**Rule for AIs:** don't add Firestore calls to screens. Add or extend a hook/service here, and keep queries bounded (a doc, a page, a date window, or an aggregation).

### Shared business rules (2026-09-26)
`functions/src/shared.ts` is the single copy of the rules the app and server must agree on: `MAX_ACTIVE_ORDERS`, `MAX_ITEMS_PER_ORDER`, `TOKEN_JMD`, `TOKEN_PACKS`, `PAY_WINDOW_MS`, `PENDING_TIMEOUT_MS`, the status lists (`ACTIVE_STATUSES`, `IN_DELIVERY_STATUSES`, `STATUS_STEPS`) and the types `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `CancelReason`. The server imports it directly; the app gets it through `constants/index.ts` and `types/index.ts`. User-facing text (push messages, cancel reasons, "pay within N minutes", the Terms' token value and pay window) is built from these values.
- It lives inside `functions/` because `firebase deploy` uploads only that folder. Keep it free of imports (no firebase-admin, no React Native).
- Changing a limit or price there changes both sides; redeploy functions **and** the web app together, and bump `termsUpdated` in `constants/legal.ts` if the Terms wording changes.

### Fewer triggers, dead code removed (2026-09-26)
- One trigger per document path: `onOrderStatusChanged` (orders; now also credits the dasher on delivery, idempotent via `dasherCreditedAt`), `onUserWritten` (users; new-user admin alert, Auth enable/disable, one-device-one-account token detach), `onDasherOnlineChanged` (dashers). Replaced `onDeliveryCompleted`, `onNewUserRegistered`, `onUserActiveChanged`, `onPushTokenChanged`. Every order write now starts 1 function instead of 2, and every user write 1 instead of 3.
- Removed: stale `functions/index.ts` (an old copy that broke the app type-check), unused `components/ui.tsx` and its legacy `COLORS`/`SPACING`/`RADIUS` palette, unused `services/config.ts`, unused types and constants. `tsconfig.json` now has `noUnusedLocals`, so dead imports fail the type-check.


### Live data can't freeze silently (2026-09-27)
Symptom: a dasher got the new-order notification but the order didn't appear until they toggled online. Server logs showed orders verified and pushed within ~1–2 s; the dasher's Firestore connection had died silently (phone sleep, network switch, backgrounded PWA), so the live list stopped updating without an error. Toggling online "fixed" it only because a write woke the connection.
- `services/liveSync.ts`: `resyncLiveData()` reconnects Firestore (`disableNetwork` + `enableNetwork`), which re-opens every listener with fresh server data. Triggers (`installLiveSync()` in `app/_layout.tsx`): any push received or tapped, app back to foreground, device back online. Single-flight, max one reconnect per 5 s, and it waits for order writes wrapped in `trackWrite()` (all of `services/orders.ts`) so an accept transaction is never cut off.
- `public/sw.js` (**dd-v7**) now posts `dd-sync` to every open page for every push, including iPhone/Safari where the push must be shown as a system notification (before, the page was never told).
- `usePendingOrders({ watchdog })`: while a dasher is online with no active delivery, every 30 s it counts pending orders on the server (1 read, outside the live connection); a mismatch with the list triggers a reconnect. Worst case for a missed order is now ~30 s instead of "never".
- Tested: preview fake can simulate a dead connection (`window.__ddPreview.freezeListeners()`); in headless Chrome the order stays hidden without the fix and appears via push (ms), foreground (ms), and watchdog (≤30 s); accept still works. The real Firestore SDK was checked against the emulator: a reconnect delivers the missed update (~50 ms). Rules test covers the watchdog count (dashers yes, students no).

### Topographic background (2026-09-27) — superseded by "Japanese print style" below
`components/TopoBackground.tsx` draws thin contour lines (like a campus map) behind every screen: student, sign-in and legal (`tone="cream"`), dasher (`"dark"`), admin (`"mid"`). It is the first child of each screen's root view (absolute fill, ignores touches, fixed while content scrolls), static SVG computed once, deterministic.
- This is **line work only**: it doesn't conflict with "no orbs/blobs". Don't turn it into filled shapes, gradients or animation, and don't raise the opacities (cream 0.09, dark 0.11, mid 0.06) without checking contrast on real screens.
- Screens keep their own opaque background colour. Don't make screens transparent to share one background: the native stack keeps the previous screen mounted underneath.
- New screens: add `<TopoBackground tone="…" />` as the first child of the root view.

### Cloud Functions tests in CI (2026-09-27)
`firestore-tests/triggers.test.mjs` runs the real compiled functions in the emulators (functions + firestore + auth): re-pricing, closed store, unavailable item, tap-burst duplicates, the 3-active-order limit, the rate limit, delivery credited once, push-token detach, deactivation disabling sign-in, and the scheduler (including wrong phone clocks). Run with `cd firestore-tests && npm run test:triggers`; CI job `triggers` runs it on every push.
- `functions/.env.demo-dormdash` (committed, public sandbox values only) is loaded only for the `demo-dormdash` test project. Without it the emulator stops and asks for `WIPAY_ACCOUNT_NUMBER`, which hangs CI. Production still uses the untracked `functions/.env`.
- Mutation-checked: raising `MAX_ACTIVE_ORDERS` makes the limit test fail.

### App Check (2026-09-27): stage 1 shipped, owner steps needed
Proves requests come from the real web app, not a script using someone's login. reCAPTCHA Enterprise runs invisibly (no puzzles).
- **App:** `services/firebase.ts` starts App Check on web only when `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` is set. No key = exactly the old behaviour. Native apps will need App Attest / Play Integrity (not in the JS SDK).
- **Functions:** every callable has `...APP_CHECK` (`functions/src/appCheck.ts`). Off by default; `APP_CHECK_ENFORCE=true` in `functions/.env` + functions deploy turns enforcement on. Verified in the emulator: with it on, a call without a token is rejected before our code runs.
- **CSP:** reCAPTCHA hosts added to `firebase.json` and `vercel.json`. **Privacy policy:** reCAPTCHA listed (27 Sep 2026).

**Owner steps:**
1. Google Cloud console (project dormdash-71035) → reCAPTCHA Enterprise → enable the API → create a **website** key (score-based, no checkbox) for `dormdash-71035.web.app` (+ any custom domain, + `localhost` for development).
2. Firebase console → App Check → Apps → the web app → **reCAPTCHA Enterprise** → paste the site key → Save. Do **not** click "Enforce" yet.
3. Add `EXPO_PUBLIC_RECAPTCHA_SITE_KEY=<site key>` to `.env` (and Vercel env if used), then `npm run deploy:web`.
4. Watch Firebase console → App Check → metrics, and function logs (`"verifications":{"app":"VALID"}`) for a few days after launch.
5. Stage 2, when ~100% of requests are verified: set `APP_CHECK_ENFORCE=true` in `functions/.env`, `firebase deploy --only functions`, and click **Enforce** for Cloud Firestore in the App Check console. Roll back by reversing either step.

### Japanese print style (2026-09-27)
The app is styled like an ukiyo-e woodblock print, using **original** vector art only (no copied images: the reference pictures were modern artworks under copyright, and only Hokusai's Great Wave is public domain).
- **Palette** (token names kept, values changed): `cerulean` now holds **indigo** (ai-iro) `#1F4E79` (8.0:1 on cream); new `shu` **vermilion** `#B7412E` (5.1:1) for the seal; dark and mid themes use light indigo `#8DB8E3`. Contrast checked to WCAG AA. Manifest `theme_color`, notification colour, the in-app banner and the web map button follow.
- **Type:** headings (`display` and `title` in all three themes, legal-page headings) use **Shippori Mincho B1 ExtraBold**; body text stays in the system font. `FONT` in `constants/theme.ts`; loaded in `app/_layout.tsx` behind the splash (falls back to system fonts if loading fails). Heading styles must not set `fontWeight` (the file has one weight; a forced bold is synthesised and looks smeared).
- **Fonts** in `assets/fonts/` (OFL, commercial use allowed), subset to Latin: 132 KB + a 4 KB seal font containing only 寮 配 走. See `assets/fonts/README.md` to add characters.
- **`components/Backdrop.tsx`** (replaces TopoBackground; first child of every screen root, and of the full-screen loading / not-found views): seigaiha pattern in bands at the top and bottom that fade out behind content. **Pattern only**: an etched wave and sakura petals were tried and removed at the owner's request (27 Sep).
- **`components/Seal.tsx`:** vermilion hanko with 寮 ("dormitory") beside the wordmark on sign-in and register.
- **Logo:** the generated SVG logo (`components/Logo.tsx`) was removed on 28 Sep; screens use the real app icon image (see "Login, order drawers, header D" below).
- **Money section** (`components/WalletCard.tsx`, `components/Coin.tsx`): gold DormDash coins (original SVG, the D struck in the centre), a banknote-style balance band (`goldTint`), coin-stack token packs (1–4 coins by size) with indigo price pills, and a ledger for recent activity. Gold tokens in `T.color`: `gold` / `goldLight` are for graphics only; `goldDeep` passes AA as text.
- **Rules:** the pattern stays at the edges and faint; the middle of the screen stays clear for content. No large filled shapes, glows, gradients on text, or a filled red sun (that is an "orb"). New screens and full-screen states add `<Backdrop tone="…" />`. Check changes with `npm run preview:web` screenshots before shipping.


### Payment buttons can't get stuck (2026-09-27)
Logs showed card payments started (`createPayment`) with no WiPay return, and taps that did nothing. Cause: the buy-token packs and "Pay by card" disable themselves while leaving for WiPay and only re-enabled on error. Phones restore the page from memory when the student comes back from WiPay (spinner showing, buttons disabled), so every payment button stayed dead until a full reload.
- `whenBackFromCheckout(reset)` (`services/payments.ts`) re-enables them when the page is restored (`pageshow` from the back/forward cache) or the app returns to the foreground, and after 15 s as a fallback if WiPay never opened. Used by `WalletCard` and the order page.
- `openCheckout` refuses anything but an `https` link: navigating to a missing URL reloaded the app, which looked like a dead button.
- Audit of every other busy/disabled button: all reset on every path (`finally`, calls that never throw, or navigation away on success). `AmountPrompt` resets itself each time it opens.
- Rule: a button that disables itself must re-enable on **every** path, including success paths that leave the app.

### Card payments can't be lost (2026-09-27)
WiPay's API ([Payments API Documentation](https://wipaycaribbean.com/WiPay-API-Documentation.pdf)) has only the payment request and a browser redirect: no webhook, no status lookup. So:
- `wipayReturn` verifies the signature, **saves** the result (`status: 'verified'` + `return*` fields), then applies it via `applyVerifiedPayment` (exactly once, all money logic in one place). If applying fails, `retryVerifiedPayments` (in the 5-minute scheduler) applies it.
- A valid signature with a transaction ID different from the one WiPay gave at the start (e.g. a retry on WiPay's page) is saved as `review`, never applied automatically.
- Returns that never arrive: admin dashboard **Card payments to check** (`components/PaymentsToCheck.tsx`, `usePaymentsToCheck`) + callable `adminResolvePayment` (Paid needs WiPay's transaction ID; both need a note; audit fields `resolvedBy/resolvedNote/resolvedAt`). Daily routine in PAYMENTS_SETUP.md.
- Payment statuses: `pending` → `verified` → `paid` | `credited`; plus `review` and `failed`. Index: `payments (status, createdAt desc)`.
- Tests: payments 28/28 (apply failure + retry once, review hold, admin resolve paid/not paid/credited, never twice), rules 37/37 (admin list only).


### Half-finished work is repaired (2026-09-27)
Triggers run with `RETRY_POLICY_DO_NOT_RETRY`, and retrying a whole trigger would re-send notifications. Instead `repairHalfFinishedWork()` runs first in the 5-minute scheduler and completes each state a failed trigger can leave, with the same code the trigger runs (all safe to run twice). It only touches documents unchanged for 60 s (`REPAIR_MIN_AGE_MS`), so it never races a live trigger:
1. pending order never checked → `publishNewOrder` (check, publish, notify dashers)
2. cancelled with tokens reserved/paid → `settleCancelledOrder`
3. accepted card order still `unpaid` → `openPayWindow` (transactional; fresh 10-min window + "Pay now" push); old tokens-at-checkout order still `reserved` → `chargeTokensOnAccept`
4. delivered in the last day, dasher not credited → `creditDasherForDelivery`
5. dasher `activeOrderId` pointing at a finished order → `setDasherBusy(false)`
- Each repair logs `Repaired half-finished work: <kind>`; a spike means triggers are failing.
- `publishNewOrder` and `openPayWindow` were extracted from `onOrderStatusChanged` so both paths share one implementation.
- New indexes: `orders (status, paymentStatus)`, `orders (status, deliveredAt)`.
- Test: `firestore-tests/triggers.test.mjs` builds each broken state the way a failed trigger leaves it, runs the sweep, checks each is fixed, a mid-delivery dasher is untouched, and a second sweep changes nothing (10/10).

### Idle dashers are switched off (2026-09-27)
"Online" used to be a sticky switch, so dashers who walked away kept getting orders and counted as available. Now:
- The app records activity (`dashers/{uid}.lastSeenAt`) when DormDash opens or returns to the foreground, and every `DASHER_ACTIVITY_MS` (30 min) while it's open. At most ~48 tiny writes per dasher per day.
- `retireIdleDashers()` (5-minute scheduler): online, not mid-delivery, no activity for `DASHER_IDLE_NUDGE_MS` (2 h) → "Still dashing?" push (`idleNudgedAt`); still none `DASHER_IDLE_GRACE_MS` (30 min) later → switched off in a transaction that re-checks nothing changed (`offlineReason: 'idle'`) + "You're offline now" push. Opening the app at any point resets it.
- The dasher screen explains the rule while online, and explains an idle switch-off when they next open the app. Going online clears `offlineReason`.
- Times live in `functions/src/shared.ts`. Rules: the dasher may write `lastSeenAt` (number) and clear `offlineReason` (to null) only. Privacy policy updated (27 Sep 2026).
- Tests: rules 38/38; emulator 11/11 (nudge, switch-off, grace period, came back, mid-delivery, fresh).

### Orders are offered in waves (2026-09-27)
Every new order used to go to every free online dasher at once: at 50+ dashers that meant a notification storm and constant "Too slow!" races. Now (`publishNewOrder` / `offerNextWave` in functions/src/index.ts, numbers in `functions/src/shared.ts`):
- The order goes to `OFFER_WAVE_SIZE` (3) free dashers, least recently offered first (`dashers/{uid}.lastOfferedAt`, random among equals). Nobody takes it → 3 more every `OFFER_WAVE_MS` (45 s); from wave `OFFER_OPEN_WAVE` (4th, ~2¼ min) it's open to everyone, including dashers who came online since.
- **3 or fewer free dashers: everyone at once, exactly as before.** So at launch size nothing changes.
- The schedule is on the order, written in the same write as `verifiedAt`: `offerAt` (uid → time) and `openToAllAt`. The dasher list shows an order only from that dasher's time (`offeredFrom` in hooks/useOrders.ts, updates itself), and the Firestore accept rule checks `request.time` against the same fields. Orders without them (older ones) are open to all.
- Later waves are sent by `offerNextWave`, a Cloud Tasks queue function (one task per wave, id `<orderId>-<time>`). It stops once the order is taken or cancelled. A wave that arrives early is failed so the queue retries it.
- **Fail-open:** if a wave can't be scheduled, the order opens to everyone at once and the rest are alerted ("Could not schedule the next offer wave" in the logs). Waves never delay an order.
- **After deploying:** the first deploy enables the Cloud Tasks API and creates the `offerNextWave` queue. Place a test order with 4+ dashers online, or just check the logs: no "Could not schedule" errors. If they appear, give the default compute service account the "Cloud Tasks Enqueuer" and "Service Account User" roles (IAM console).
- Tests: rules 39/39 (not before your wave, after openToAllAt anyone, can't write offer times); emulator 13/13 (wave order and timing through the Cloud Tasks emulator, busy dashers skipped, taken order stops waves, ≤3 dashers all at once). Privacy policy: "when you were last offered an order".

### Payment rate limit, online count, alerts, offline cache, split bundle (2026-09-28)
- **Card payment rate limit (3.7):** `createPayment` allows `MAX_PAYMENT_STARTS` (5) starts per student per `PAYMENT_START_WINDOW_MS` (10 min), counted in `paymentStarts/{uid}` (server only, in a transaction, so parallel taps can't slip past). Refused: "Too many payment attempts. Try again in N minutes." No payment record or WiPay request is made. Privacy policy updated.
- **Online count (3.8):** `refreshOnlineDasherCount` skips the write when the number hasn't changed, logs (doesn't throw) a write lost to a shift-change burst, and `onDasherOnlineChanged` runs on at most 5 instances. The 5-minute scheduler recounts, so `publicStats/app` is right again within 5 minutes whatever happens.
- **Monitoring alerts (3.9):** created in Cloud Monitoring by `node scripts/setup-alerts.mjs <email>` (safe to re-run; uses your `firebase login`). Emails the owner on: any Cloud Function error (max 1 per 30 min); card payments to check (the scheduler logs "Card payments need checking" when a payment is held for review or pending over 30 min; max 1 per 3 h); more than 20 dead push tokens in an hour. Google may send a confirmation email first. Edit or mute them in Google Cloud console → Monitoring → Alerting.
- **Offline cache (§4):** web Firestore uses `persistentLocalCache` with the multi-tab manager (services/firebase.ts): screens open instantly from the browser's copy, then update. The dasher's open-orders list ignores cached answers (it could show orders already taken) and waits for the server. Signing out wipes the cache (`clearLocalData`) and reloads to `/`. Native keeps the memory cache.
- **Split bundle (§4):** Expo Router async routes on web (`asyncRoutes: { web: true }` in app.json). First load is now a shared file + the start file + the one screen (about 669 KB gzipped, down from 732 KB), and students never download dasher/admin screens. Each screen is a separate file cached by the service worker when first opened. `public/register-sw.js` reloads a tab once if a screen file from an older release can't load (tab left open across a deploy). Service worker VERSION → `dd-v8`.
- **Later (owner's call), 3.6 warm payment functions:** set `minInstances: 1` on `wipayReturn` (and `createPayment` if wanted) in functions/src/payments.ts to remove the 2–5 s cold start on the first card payment after a quiet spell. About US$10–20 a month each. Not done yet.


### One delivery fee: J$250 (2026-09-28)
- `DELIVERY_FEE_JMD` (250) in functions/src/shared.ts is the delivery fee on every order. `verifyNewOrder` always charges it, whatever the store doc or the app sends; the dasher earns it on delivery as before.
- Checkout, the store page, home and the admin stores list all show the constant. The admin store form no longer has a fee field; saving a store writes `deliveryFee: DELIVERY_FEE_JMD` so the stored value stays in step (the rules still require a valid number there).
- Terms updated (28 Sep 2026): "DormDash charges one delivery fee on every order".
- To change the fee: edit `DELIVERY_FEE_JMD`, deploy functions and web, and update the live store docs' `deliveryFee` to match.

### "Tide Print": the student look, teal and cerulean (2026-09-28)
Students (and sign-in) only; dasher (`themeDark`) and admin (`themeMid`) are unchanged. Tokens in `constants/theme.ts`, pieces in `components/Tide.tsx`:
- **Tide band** (`TideBand`, `TideHeader`): every student screen opens under a deep cerulean "sea" (`T.color.sea`) with the seigaiha pattern etched in. Its last 110px dissolve into the page on an ease curve (no edge line; the header and page waves are the same size and line up, so the fade reads as one pattern changing colour), and the page pattern (`Backdrop tone="cream"`) runs the whole height: cerulean at the top, quieter through the middle, turning teal towards the bottom. (The scalloped edge and the teal stats strip on Orders were removed 28 Sep.) Headings sit on it in cream (`T.color.card`), secondary text in `seaSoft`, highlights in `seaFoam`.
- **Print plates** (`T.plate.card | teal | cerulean | sea`): cards and buttons sit on a solid offset layer, like a second ink plate. No blur, no glow. `pressPlate(pressed)` makes a surface sink onto its plate when tapped.
- **Store marks** (`StoreMark`, `StoreArt`): each store gets its own sea colour (picked from its id) with the wave pattern and its initial, on home, featured cards and the store page.
- Colour roles: cerulean = actions; teal = the second ink (active chips, the order button, live orders, stats); vermilion (`shu`) = the rare warning; gold = money only. Page is sea-foam (`#EEF5F3`), cards `#FAFCFB` (never pure white). All text pairs checked for WCAG AA (ratios noted next to the tokens).
- Screens: home, store, checkout, orders, order tracking, profile, payment result, student tab bar (sea glass, teal active tab), wallet card (gold plates).

### iPhone: full-screen "Add to Home Screen" warning (2026-09-28)
On iOS, notifications only work in the Home Screen app, and websites can't show an install button. So `IOSInstallGate` (components/InstallPrompt.web.tsx) covers the screen whenever DormDash is open in an iPhone/iPad browser tab, before or after sign-in (the Home Screen app has its own sign-in, so installing first saves signing in twice). Not for admins, not on /payment-result or /legal.
- Copy (rewritten 30 Sep as an invitation, not a warning):
  - **Header:** the real app icon, then "3 taps, 10 seconds" and "Put DormDash on your Home Screen".
  - **What they get:** order alerts, never missing "Pay now", and one-tap full-screen opening.
  - **Steps:** ⋯ (three dots, bottom of Safari) → **Share** → **Add to Home Screen** → Add, each with a small drawing of the button. Then open DormDash from the Home Screen.
  - **Footnote:** older iPhones show the Share button directly.
- Instagram, TikTok, Snapchat, Facebook etc. in-app browsers (and Chrome/Edge on iOS) get a first step "Open dormdash-71035.web.app in Safari" and a "Copy the link" button.
- "Done, it's on my Home Screen" hides it for good in that browser. "Maybe later (no order alerts)" appears after 6 seconds and only lasts for this visit, so it comes back next time.
- The small install card no longer asks iPhone browser tabs to install (the gate does); alerts cards are unchanged.

### Tide Print details (2026-09-28)
- **Seal stamps** (`components/Seal.tsx`, `stamp` prop presses it in once on the native driver; still for reduce-motion): 寮 on a just-placed order (tracking), 走 when the dasher is on the way (tracking + live order card), 配 on delivered orders (tracking hero, past orders).
- **Low tide:** a closed store's mark turns grey-blue (`StoreMark muted`) and its row sits flat without a plate (home, store page).
- **Loading placeholders** (`components/Skeleton.tsx`): plate-shaped blanks in the shape of what's coming, one gentle opacity loop per group, replace the spinners on home, store menu, orders and order tracking. Screen readers hear one "Loading…".
- **Money** (`components/Money.tsx`): "J$" set smaller than the digits, tabular figures, on menu prices, cart/checkout lines and totals, order amounts.
- "LIVE" badge is now "Live" (no all-caps).
- Design QA: `?slow=3000` on any preview URL delays the fake data so loading states can be seen.
- **Token coin** (`components/Coin.tsx`, 28 Sep): a struck coin with a milled edge, a domed gold face (radial light from the top left, `goldShade` bottom right), a bevelled inner ring, and the full DormDash mark (three speed stripes beside the D) struck in with a light lower edge. Under 22px the milling and ring are dropped so it stays crisp. Balance coin is 60px.

### Sign in with Google (2026-09-28, web / PWA)
"Continue with Google" on sign-in and sign-up, for students and dashers (`signInWithGoogle` in services/auth.ts, `components/GoogleButton.tsx`).
- A Google account that already has a DormDash profile just signs in. A new one has no `users/{uid}`: `useAuth` reports `pendingProfile`, the route guard sends it to the sign-up form, which hides email/password, pre-fills the name and asks for role, phone, university and the 18+/terms box; `completeGoogleProfile` writes the same profile documents as an email sign-up (same Firestore rules). "Use a different account" signs out.
- Phones and the installed app use a full-page redirect; computers a popup (falls back to redirect if blocked). Redirect errors show on the sign-in screen (`takeGoogleRedirectError`).
- An email that already has a DormDash password: Firebase either links the Google sign-in to the same account (plain Gmail) or refuses with a message to use the password (other Google accounts).
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` is now `dormdash-71035.web.app` (our own domain), so Safari and the installed iPhone app keep the sign-in (a firebaseapp.com auth domain is third-party there and redirects silently fail). Consequences: the service worker skips `/__/`, frames are allowed from the same origin (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`), and the CSP allows apis.google.com / accounts.google.com (firebase.json and vercel.json).
- Native apps: not offered yet (needs a native Google sign-in module).
- Preview: `?as=google` is a new Google user with no profile, to see the finish-sign-up flow.
- **Owner setup, before deploying:**
  1. Firebase console → Authentication → Sign-in method → Add new provider → Google → Enable, choose the support email, Save.
  2. Google Cloud console (project dormdash-71035) → APIs & Services → Credentials → OAuth 2.0 Client IDs → "Web client (auto created by Google Service)" → Authorized redirect URIs → add `https://dormdash-71035.web.app/__/auth/handler` → Save. (Authorized JavaScript origins: add `https://dormdash-71035.web.app` if it isn't there.)
  3. Firebase console → Authentication → Settings → Authorized domains: `dormdash-71035.web.app` should already be listed.

### Launch-flyer style for students (2026-09-28) — replaces "Tide Print"
The student screens, sign-in and sign-up now match the UWI Mona launch flyer (DormDash-UWI-Launch-Flyer). Dasher/admin palettes are unchanged but share the headline font.
- **Header** (`TideBand`/`TideHeader`, components/Tide.tsx): deep blue (`T.color.sea`) sweeping to teal (`seaTeal`), the flyer's contour loops and big faint italic D (components/Flow.tsx), fading into the cream page on an ease curve.
- **Type:** headings in Fraunces Black Italic (`FONT.heading`), one hand-written line in Caveat (`FONT.script`). Fonts in assets/fonts (OFL, subset; README there).
- **Colour:** cream page and cards, ink text, cerulean actions, teal support, **mustard gold** (`T.color.mustard`) for big headline words on the header ("Don't move.", the student's name), the active chip and tab, and stamps. Ink on mustard is 6.7:1; mustard on the blue header is only for large text (4.0:1).
- **Page background:** the contour loops, faint teal on cream (`Backdrop tone="cream"`). The seigaiha pattern remains only on dasher/admin backdrops.
- **Stamps** (components/Seal.tsx): gold circles with a dashed ring, like the flyer's "Launching Oct 1": "Order in!", "On di way", "Enjoy!" (a single mark under 46px). Replaces the vermilion hanko.
- **Sign-in:** the flyer headline ("Hungry? Don't move." with the swoosh, components/Swoosh.tsx, and "sign in & yuh food a come!"), then the form card with "Welcome back" centred.
- **Store marks:** a brand colour per store (blue, teal, mustard, cerulean, deep teal) with the italic initial; closed stores muted.

### Group orders and hardening (2026-09-28)
**Group orders (dashers).** A dasher can take several open orders in one trip.
- `/dash` → "Group orders" card (`components/GroupFinder.tsx`): choose 2 or 3 orders, which stores (or any), and how far apart the stores may be (same store, 250 m, 500 m, 1 km). Numbers in `functions/src/shared.ts` (`GROUP_*`).
- Server (`functions/src/groups.ts`, pure picker in `functions/src/grouping.ts`): `setGroupSearch` saves `groupSearches/{uid}`; `matchGroups` runs after every new order, each offer wave, a dasher coming online or finishing a delivery, saving a search, and every 5 minutes. It uses only orders that dasher may take right now (same wave rules as a single accept), oldest first, with every pair of stores within the distance (straight line between the stores' `location` set in the admin store form; a store without a position only groups with itself). A group gets a number (`meta/orderGroups.nextNo`), is written to `orderGroups/{id}` for that dasher, lasts `GROUP_OFFER_MS` (2 min), and sends a "Group #N found" push. One live group per dasher; the same orders aren't re-offered within 10 min.
- Groups are **not reserved**. `acceptOrderGroup` takes all orders in one transaction or none; if anyone took one first it answers "no longer available" and searches again.
- Each order then runs exactly like a single one (each student pays, each is advanced and credited separately). `/dash` now shows every order in delivery (`useActiveDeliveries`). The busy flag is `dashers/{uid}.activeOrderIds` (list) plus `activeOrderId` (first one, what everything else checks); `setDasherBusy` removes one order at a time.
- Rules: `groupSearches` and `orderGroups` are read-only to their dasher (admins read groups). Tests: rules 42/42, emulator 19/19 (group found and accepted, group gone when an order is taken), picker unit tests (`cd functions && npm run test:grouping`).
- **After deploying functions**, check the logs for `Group #… offered` once a dasher saves a search.

**Hardening in the same change:**
- `verifyNewOrder` orders a student's orders by the document's server create time, not the phone's `createdAt`, so a backdated order can't skip the 3-order limit, the duplicate check or the rate limit.
- One delivery at a time: the accept rule refuses a dasher whose `activeOrderId` is set, and `claimDasherForOrder` (accepted trigger) undoes a second accept that slipped through at the same moment. Groups go through `acceptOrderGroup` instead.
- Marking delivered needs a numeric `deliveredAt`; `deliveryMins` uses the server's `verifiedAt` and only trusts `deliveredAt` between that and now.
- `deleteMyAccount` refuses while the student has tokens, the dasher has a float, or a card payment is unsettled (message tells them to use tokens or contact support). The app now detaches push only after the server agrees.
- `adminAdjustTokens` / `adminAdjustFloat` require a note on the server too.
- Email sign-up: the app reloads the profile after writing it (new accounts could stay on the form), and a failed profile write deletes the half-made sign-in so the email can be reused.
- `vercel.json` proxies `/api/wipay-return` and `/__/*` to Firebase Hosting (card payments and Google sign-in broke on Vercel).
- WiPay: checked the API document (p. 35): the return `hash` is sent for successful transactions only, so a declined return can't be edited into a success. No change needed.
- Privacy policy: says open orders are visible to online dashers (not just "your dasher"), lists group search data, and the new deletion conditions.

### Login, order drawers, header D (2026-09-28)
- **Sign-in:** the real app icon (`/brand/dormdash-tile.png` on web, `assets/icon.png` on native, the same tile as the launch intro) and "DormDash", centred; the "Hungry? Don't move." headline stays left. The generated SVG logo component was deleted.
- **Orders tab:** with more than one order in progress, each is a drawer (one row: store, status, code, amount; "Payment needed" stays visible while closed). One open at a time; tap the chevron to collapse. One order looks as before.
- **Header D and loops** (`TideBand`, components/Tide.tsx): drawn inside the band's SVG under its fade mask, so they dissolve into the page instead of stopping at a hard edge. The D is sized to fit the band (never cropped at the top or right). Applies to every student header, sign-in and sign-up.

### Proximity pricing (2026-09-29, branch `proximity-pricing`, not deployed)
Replaces the flat J$400 fee and fixed 70/30 split. Full write-up, fee table and cost maths: **PRICING.md**.
- **Places:** `functions/src/campus.ts` lists UWI Mona delivery places (12 halls, 7 faculties, 22 other places) and 14 food spots, with OpenStreetMap positions. The app imports it via `constants/campus.ts`. Walking distances are in `functions/src/campusDistances.ts`, generated by `scripts/campus-distances.mjs` from the public OSRM foot router.
- **Fee:** J$300 up to 400 m, +J$50 per 200 m. **Split:** DormDash J$50 + 20% above J$300 (`splitDeliveryFee`). Both are in `shared.ts`. `quoteDelivery(pickupPointId, dropPointId)` gives the same answer in the app and on the server.
- **Server:** `verifyNewOrder` prices from `stores/{id}.pickupPointId` and `deliveryAddress.pointId`, rewrites the address from the list, and stores `deliveryDistanceM` and `feeBasis`. Places or stores without a position pay `FALLBACK_DELIVERY_FEE_JMD` (400). Group matching uses food-spot positions.
- **App:**
  - Checkout uses `components/CampusPicker.tsx` (Halls / Faculties / Other places, each place showing its fee). It no longer uses GPS or typed addresses, and it remembers the last place chosen.
  - Home and store pages say "from J$300".
  - The admin store form has a "Food spot on campus" picker.
  - Terms and Privacy are updated.
- **Tests:** pricing 4/4 (`npm run test:pricing`, in CI), emulator 20/20 (real pairs), rules 42/42.
- **Before deploying:**
  - Link each store to its food spot in the admin form.
  - Add positions for ABC, Leslie Robinson and WJC halls, Social Sciences and Boardwalk Café.
  - Confirm the card fee is paid by the student.

### Rebrand: DormDash → Runner (2026-09-30, branch `rebrand-runner`)
- **Name:** the app is **Runner**, and couriers are **runners** in everything students and runners see: screens, pushes, store alerts, Terms, Privacy, manifest, page title and home-screen label (`app.json` and `public/manifest.webmanifest`).
- **Internal names are unchanged** so nothing breaks: the `dasher` role, the `dashers` collection, `dasherId` fields, the `(dasher)` routes, `/dash` URLs, `dormdash-71035` project and web address, and `com.dormdash.app` identifiers. Rename those only with a data migration.
- **Icon:** an italic **R** (Fraunces Black Italic, the app's heading face) with the same speed stripes on the blue-teal tile. All sizes were regenerated: `assets/icon.png`, `splash-icon`, `adaptive-icon` (foreground), `favicon`, `notification-icon` (white), `public/icons/*` (tile, maskable full-bleed, apple-touch, favicon, white badge) and `public/brand/dormdash-tile.png` (file name kept).
- **Drawn marks:** the coin's struck mark and the big faint header letter are now R. Service worker `dd-v10`, so installed apps fetch the new icons.
- **Voice:** a wink at the slang without saying it. Runners run food and nothing else:
  - Sign-in line: "sign in & di runner run it come!"
  - Launch tagline: "Strictly food runnings."
  - Stamps: "Order in!", "Runner a run!", "Food land!"
  - Runner role: "Run food between classes. Clean money, every run."
  - Runner screen: "Ready fi run?", "No runnings right now", tab "Runs".
  - Pushes: "New run available", "Food land!"
  - Legal pages stay plain.
- **Owner steps:**
  - Firebase Auth email templates (sender name).
  - Google OAuth consent screen app name.
  - WiPay merchant display name, if set.
  - ntfy topic names: unchanged, no action needed.

### Red and gold (2026-10-01, branch `red-gold`)
The whole brand moved from blue-teal to **red and gold**. Token names are kept, so screens didn't change: `sea` = crimson header (#9B1B22 → wine #5C0D16), `cerulean` = red actions (#A91F1D), `teal` = deep gold text (#845F0E), `mustard` = bright gold (#F2BE45).
- **Students:**
  - Crimson-to-wine header with **gold contour lines**, ivory page and cards, red buttons.
  - Main actions in bright gold with ink text: Place order, cart, Pay with tokens, install "Done".
  - Gold active tab and chips.
- **Runners:** a deep wine canvas with **gold waves**, gold payouts and online state, and rose-red actions.
- **Admins:** a burgundy canvas with gold waves and ivory cards.
- **Every text pair is checked to WCAG AA.** The ratios sit beside the tokens in `constants/theme.ts`.
- **Icon:**
  - Crimson-to-wine tile with a fine gold keyline.
  - Solid gold R and speed stripes, with a dark-red print-plate edge under them.
  - Full-bleed icons drop the keyline, since Android crops to a circle.
- **Browser:**
  - Theme colour crimson, splash wine, notification accents red.
  - On wide screens the area around the app column is deep wine.
  - Service worker `dd-v11`.
- **Web switches:** react-native-web ignores `thumbColor` when on, so switches also pass `activeThumbColor`.

