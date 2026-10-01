// services/firebase.ts
// Firebase app, App Check (web), Auth, Firestore and Functions. (No Storage:
// the app has no uploads; leaving it out keeps it out of the download.)

import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore — getReactNativePersistence has a typing gap in the SDK; works at runtime
import { initializeAuth, getReactNativePersistence, getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  terminate, clearIndexedDbPersistence, type Firestore,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  throw new Error('Firebase config missing. Check your environment variables.');
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ─── App Check ─────────────────────────────────────────────────────────────
// Proves requests come from the real DormDash web app, not a script using a
// stolen login. reCAPTCHA Enterprise runs invisibly in the background (no
// puzzles). Must start before Firestore/Functions make their first request.
// Off until EXPO_PUBLIC_RECAPTCHA_SITE_KEY is set (see PWA_HANDOFF.md
// "App Check"), so builds without a key behave exactly as before. Web only
// for now: the native apps need device attestation (App Attest / Play
// Integrity), which the Firebase JS SDK doesn't provide.
const appCheckSiteKey = process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY;
if (Platform.OS === 'web' && typeof window !== 'undefined' && appCheckSiteKey) {
  // Local development: prints a debug token to the console once; register
  // it in Firebase console → App Check → Manage debug tokens.
  if (__DEV__) (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e: any) {
    // Already initialised (hot reload). Anything else must not stop the app.
    if (!String(e?.message).includes('already')) console.log('App Check not started:', e?.message);
  }
}

// Persist auth sessions across app restarts. initializeAuth may only be called
// once per app instance — on hot reload it throws, so fall back to getAuth.
// On web (PWA) the browser SDK is used: getAuth() persists the session in
// IndexedDB, so students stay signed in after closing the installed app.
let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    auth = getAuth(app);
  }
}

// ─── Firestore, with an offline cache on web ───────────────────────────────
// The browser keeps a copy of what this user has loaded (stores, menus, their
// orders, wallet) in IndexedDB. On reopen, screens show it at once and then
// update live, with fewer reads and working lists on a weak signal. Shared
// by every open DormDash tab. Where IndexedDB isn't available (some private
// windows) the SDK quietly uses memory, as before. Native keeps the memory
// cache. Signing out clears it (clearLocalData), so a shared laptop doesn't
// keep the last person's data.
function startFirestore(): Firestore {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    try {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      // Already initialised (hot reload).
    }
  }
  return getFirestore(app);
}
const db = startFirestore();

/**
 * Web: wipes this browser's Firestore cache after sign-out, then reloads to
 * the start page (a cleared Firestore can't be used again in this page).
 * If another DormDash tab is still open the cache can't be cleared; the
 * reload still happens and that tab's data stays cached until it closes.
 */
export async function clearLocalData(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const clearing = (async () => {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  })().catch((e: any) => console.log('Offline cache not cleared:', e?.code ?? e?.message));
  // Never leave the page stuck on a terminated Firestore: reload regardless.
  await Promise.race([clearing, new Promise(r => setTimeout(r, 3000))]);
  window.location.replace('/');
}

// Region must match where the functions are deployed (default us-central1).
const functions = getFunctions(app);

export { app, auth, db, functions };
