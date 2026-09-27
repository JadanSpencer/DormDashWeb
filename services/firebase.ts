// services/firebase.ts
// Firebase app, App Check (web), Auth, Firestore, Storage and Functions.

import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore — getReactNativePersistence has a typing gap in the SDK; works at runtime
import { initializeAuth, getReactNativePersistence, getAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
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

const db = getFirestore(app);
const storage = getStorage(app);

// Region must match where the functions are deployed (default us-central1).
const functions = getFunctions(app);

export { app, auth, db, storage, functions };
