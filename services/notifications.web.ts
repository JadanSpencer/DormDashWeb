// services/notifications.web.ts
// Web / PWA version of services/notifications.ts — same exports, so the rest
// of the app doesn't change. Metro picks this file automatically on web.
//
// Web push via Firebase Cloud Messaging (FCM):
//   • The FCM token is saved to users/{uid}.pushToken with a "web:" prefix.
//     The Cloud Function sendPushNotification() sees the prefix and sends via
//     FCM instead of the Expo push service. Using the same field means no
//     Firestore rules change. clearPushToken() runs on every sign-out.
//   • The token is re-checked every time the app comes back on screen, so a
//     token the server removed as dead is replaced automatically.
//     Trade-off: one device per account gets pushes (last one to sign in),
//     which is how the native app already behaves.
//   • Needs EXPO_PUBLIC_FIREBASE_VAPID_KEY in .env (Firebase Console →
//     Project settings → Cloud Messaging → Web Push certificates).
//     Without it, everything here quietly does nothing.
//   • Signed out = no alerts. Sign-out (or losing the session any other way)
//     turns off this browser's push subscription; see dropSubscription().
//   • Browsers — Safari especially — only allow the permission prompt from a
//     tap, so registerForPushNotifications() never prompts. The prompt comes
//     from the "Turn on order alerts" card (components/InstallPrompt.web.tsx),
//     which calls enableWebPush().
//   • iPhone: push only exists once DormDash is added to the home screen
//     (iOS 16.4+). In a Safari tab, isSupported() is false.
//   • Incoming pushes are handled in public/sw.js. If DormDash is open and
//     focused (non-iOS), sw.js posts the message to the page and the
//     cerulean in-app banner shows instead of a system notification.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { onAuthStateChanged } from 'firebase/auth';
import { app, auth, db } from './firebase';

export const CERULEAN = '#0E8FB5';
export const WEB_TOKEN_PREFIX = 'web:';

const VAPID_KEY = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;

const hasNotificationApi = () =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

/** Can this browser receive web push right now (ignoring permission)? */
export async function webPushAvailable(): Promise<boolean> {
  if (!VAPID_KEY || !hasNotificationApi()) return false;
  try { return await isSupported(); } catch { return false; }
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export async function webPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!(await webPushAvailable())) return 'unsupported';
  return Notification.permission;
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

// The token this browser last saved, e.g. "web:abc…". Lets sign-out detach
// ONLY this device, never another device the account moved to since.
let myToken: string | null = null;

async function currentToken(): Promise<string | null> {
  const registration = await swRegistration();
  if (!registration) return null;
  // getToken() also repairs things: if the browser dropped the push
  // subscription, it quietly makes a new one and returns a new token.
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  return token ? WEB_TOKEN_PREFIX + token : null;
}

async function saveToken(uid: string): Promise<string | null> {
  const ref = doc(db, 'users', uid);
  const data = (await getDoc(ref)).data();
  let stored = await currentToken();
  if (!stored) return null;

  // The server marks a token it found dead in pushTokenDead. The Firebase SDK
  // keeps handing back its cached copy of that dead token for as long as the
  // browser's push subscription is unchanged (deleteToken() can't help: it
  // gives up when Firebase says the token doesn't exist). So drop the push
  // subscription ourselves; the next getToken() then makes a brand-new
  // subscription and a brand-new token.
  if (data?.pushTokenDead && data.pushTokenDead === stored) {
    const registration = await swRegistration();
    const sub = await registration?.pushManager.getSubscription();
    await sub?.unsubscribe();
    stored = await currentToken();
    if (!stored) return null;
    console.log('Replaced a dead push token');
  }

  myToken = stored;
  // Only write when something changed. Each write wakes onUserWritten,
  // and this runs every time the app comes back on screen.
  if (data?.pushToken !== stored) {
    await updateDoc(ref, {
      pushToken: stored,
      pushTokenUpdatedAt: Date.now(),
    });
  }
  return stored;
}

// Self-healing. If the server finds this device's token dead it removes it
// from the account (functions/src/index.ts → sendWebPush). Before, nothing
// put a fresh one back until the next sign-in, so that account got no
// alerts for the rest of the order. Now every time DormDash comes back on
// screen, the token is checked and re-saved if missing or changed.
let stopWatching: (() => void) | null = null;

function watchToken(uid: string) {
  stopWatching?.();
  let busy = false;
  const refresh = () => {
    if (document.visibilityState !== 'visible' || busy) return;
    if (Notification.permission !== 'granted') return;
    busy = true;
    saveToken(uid).catch(() => {}).finally(() => { busy = false; });
  };
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  stopWatching = () => {
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
    stopWatching = null;
  };
}

/**
 * Call as the FIRST line of a button handler (Sign in, Create account).
 * Browsers, Safari especially, only show the permission prompt during a tap,
 * and "during" ends at the first `await`. So this does its checks
 * synchronously, calls Notification.requestPermission() immediately, and
 * saves the push token later, as soon as someone is signed in.
 * Safe to call every time: it does nothing unless the answer is still "ask".
 */
export function requestPushPermissionFromGesture(): void {
  try {
    if (!VAPID_KEY || !hasNotificationApi() || !('PushManager' in window)) return;
    if (Notification.permission !== 'default') return;
    Notification.requestPermission().then((result) => {
      if (result !== 'granted') return;
      const stop = onAuthStateChanged(auth, (u) => {
        if (!u) return;
        stop();
        saveToken(u.uid).catch(() => {});
      });
    }).catch(() => {});
  } catch {
    // Never block sign-in over notifications.
  }
}

/**
 * Called on sign-in (app/_layout.tsx). Never shows a prompt: if the user
 * already allowed notifications, it refreshes and saves the token.
 */
export async function registerForPushNotifications(uid: string): Promise<string | null> {
  try {
    if (!(await webPushAvailable())) return null;
    watchToken(uid); // also picks up "Allow" given later from the alerts card
    if (Notification.permission !== 'granted') return null;
    return await saveToken(uid);
  } catch (err: any) {
    console.log('Web push registration failed:', err?.message);
    return null;
  }
}

/**
 * Call from a button tap. Shows the browser permission prompt, then saves
 * the token. Returns true when push is on.
 */
export async function enableWebPush(uid: string): Promise<boolean> {
  try {
    if (!(await webPushAvailable())) return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    return !!(await saveToken(uid));
  } catch (err: any) {
    console.log('Enabling web push failed:', err?.message);
    return false;
  }
}

// NO ALERTS WHEN SIGNED OUT. Turning off this browser's push subscription
// means push services have nowhere to deliver to, so nothing can arrive here
// even if the server still has an old token on file (for example, sign-out
// happened offline). The next sign-in makes a brand-new subscription and
// token automatically (saveToken → getToken), the same repair used for dead
// tokens above.
async function dropSubscription(): Promise<void> {
  try {
    if (!hasNotificationApi()) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const sub = await registration?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    // Nothing to turn off.
  }
}

// Also covers sign-outs that don't go through logoutUser: an expired
// session, an account disabled by support, or a sign-out that ran out of
// time. Whenever nobody is signed in, this browser stops receiving alerts.
if (typeof window !== 'undefined' && hasNotificationApi()) {
  onAuthStateChanged(auth, (user) => {
    if (user) return;
    stopWatching?.();
    myToken = null;
    dropSubscription();
  });
}

/**
 * Call BEFORE signing out (services/auth.ts → logoutUser does this). Turns
 * off alerts on this browser, then detaches it from the account, but only
 * if the account still points at this browser. If the person has since
 * signed in on their phone, the phone keeps its alerts.
 *
 * It doesn't call deleteToken(). Deleting killed the token on Firebase's
 * side while a sign-in on the same device could still pick up the cached
 * copy, which left the next account holding a dead token.
 */
export async function clearPushToken(uid: string): Promise<void> {
  stopWatching?.();
  try {
    let mine = myToken;
    if (!mine && (await webPushAvailable()) && Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.getRegistration('/');
      // Only look up the token if a subscription exists; getToken() would
      // otherwise make a new one just to throw it away.
      if (await registration?.pushManager.getSubscription()) mine = await currentToken();
    }
    myToken = null;
    // Local and instant, so it happens even if the database write below is slow.
    await dropSubscription();
    if (!mine) return;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.data()?.pushToken === mine) {
      await updateDoc(ref, { pushToken: null, pushTokenUpdatedAt: Date.now() });
    }
  } catch {
    // Non-fatal: sign-out proceeds regardless.
  }
}

export async function sendLocalNotification(title: string, body: string) {
  try {
    if (!hasNotificationApi() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const opts: any = { body, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', silent: false, vibrate: [250, 120, 250] };
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    // Ignore — notification is a nice-to-have
  }
}

// Shapes a message from sw.js like an expo-notifications Notification, so
// app/_layout.tsx can read notification.request.content unchanged.
function asNotification(msg: any) {
  return {
    request: {
      content: {
        title: msg.title ?? 'Runner',
        body: msg.body ?? '',
        data: msg.data ?? {},
      },
    },
  };
}

export function setupNotificationListeners(
  onNotification?: (notification: any) => void,
  onNotificationResponse?: (response: any) => void
) {
  if (!hasNotificationApi()) return () => {};

  const handler = (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'dd-push') onNotification?.(asNotification(msg));
    if (msg.type === 'dd-push-click') {
      onNotificationResponse?.({ notification: asNotification(msg) });
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}
