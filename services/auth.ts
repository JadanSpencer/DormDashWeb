// services/auth.ts
// All authentication actions in one place.
// Screens call these functions — they never touch Firebase directly.
// This separation means if Firebase ever changes, we update ONE file, not 20 screens.

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
  } from 'firebase/auth';
  import { Platform } from 'react-native';
  import { doc, setDoc, getDoc } from 'firebase/firestore';
  import { auth, db, clearLocalData } from './firebase';
  import { LEGAL } from '../constants/legal';
  import { clearPushToken } from './notifications';
  import { goOffline } from './dasher';
  import { User, UserRole } from '../types';
  
  // ─── INPUT SANITIZATION ────────────────────────────────────────────────────
  // Before ANY data touches Firebase, we clean it.
  // trim() removes accidental spaces at start/end.
  // toLowerCase() on email prevents "John@gmail.com" and "john@gmail.com"
  // being treated as different accounts.
  const sanitizeEmail = (email: string): string => email.trim().toLowerCase();
  const sanitizeName = (name: string): string => name.trim().replace(/[<>]/g, '');
  // The replace removes < and > — basic protection against HTML injection

  // ─── CLIENT-SIDE RATE LIMITING ─────────────────────────────────────────────
// This is NOT a replacement for server-side limits — it's a UX guard
// that prevents accidental spam and gives users friendly feedback.
// A determined attacker can bypass this. Server rules are the real protection.

const rateLimitStore: Record<string, { count: number; resetAt: number }> = {};

function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitStore[key];

  if (!record || now > record.resetAt) {
    // First attempt or window expired — reset
    rateLimitStore[key] = { count: 1, resetAt: now + windowMs };
    return true; // Allowed
  }

  if (record.count >= maxAttempts) {
    return false; // Blocked
  }

  record.count++;
  return true; // Allowed
}
  
  // ─── VALIDATION ────────────────────────────────────────────────────────────
  // We validate BEFORE calling Firebase — saves a network round trip
  // and gives us control over the error message the user sees.
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  const validatePassword = (password: string): boolean => {
    // Minimum 8 chars, at least one number
    return password.length >= 8 && /\d/.test(password);
  };
  
  const validatePhone = (phone: string): boolean => {
    // Allows formats: +1876xxxxxxx, 876xxxxxxx, 07xxxxxxxx
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  // ─── PASSWORD RESET ──────────────────────────────────────────────────
export const resetPassword = async (
  email: string
): Promise<{ success: boolean; error?: string }> => {
  // Rate limit: max 3 reset emails per hour per address
  const rateLimitKey = `reset_${email.trim().toLowerCase()}`;
  if (!checkRateLimit(rateLimitKey, 3, 60 * 60 * 1000)) {
    return { success: false, error: 'Too many reset attempts. Please wait before trying again.' };
  }

  const cleanEmail = sanitizeEmail(email);
  if (!validateEmail(cleanEmail)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    // Deliberately the same response whether the account exists or not —
    // never confirm to a stranger which emails are registered.
    return { success: true };
  } catch (error: any) {
    if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network error. Check your connection.' };
    }
    // auth/user-not-found also lands here on purpose — same message
    return { success: true };
  }
};
  
  // ─── REGISTER ──────────────────────────────────────────────────────────────
  export const registerUser = async (
    email: string,
    password: string,
    name: string,
    phone: string,
    university: string,
    role: UserRole
  ): Promise<{ success: boolean; error?: string }> => {
    // Rate limit: max 3 registration attempts per hour
    const rateLimitKey = `register_${email.trim().toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 3, 60 * 60 * 1000)) {
      return {
        success: false,
        error: 'Too many registration attempts. Please wait before trying again.'
      };
    }
  
    // 1. Sanitize inputs first
    const cleanEmail = sanitizeEmail(email);
    const cleanName = sanitizeName(name);
    const cleanPhone = phone.trim();
  
    // 2. Validate before touching Firebase
    if (!validateEmail(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!validatePassword(password)) {
      return { success: false, error: 'Password must be at least 8 characters and include a number.' };
    }
    if (cleanName.length < 2) {
      return { success: false, error: 'Please enter your full name.' };
    }
    if (!validatePhone(cleanPhone)) {
      return { success: false, error: 'Please enter a valid phone number.' };
    }
    if (!university.trim()) {
      return { success: false, error: 'Please enter your university.' };
    }
  
    try {
      // 3. Create the Firebase Auth account (handles email uniqueness check)
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const uid = userCredential.user.uid;
  
      // 4. Update the display name in Firebase Auth
      await updateProfile(userCredential.user, { displayName: cleanName });
  
      // 5. Create the user document in Firestore
      // This is our extended profile — Auth only stores email + uid
      const userData: User = {
        uid,
        email: cleanEmail,
        name: cleanName,
        role,
        phone: cleanPhone,
        university: university.trim(),
        createdAt: Date.now(),
        isActive: true,
        // The sign-up screen won't submit without the 18+/terms tick box.
        termsAcceptedAt: Date.now(),
        termsVersion: LEGAL.termsUpdated,
      };
  
      // doc(db, 'users', uid) → the document at /users/{uid} in Firestore.
      // If this fails the sign-in exists without a profile: sign-in would
      // say "register", and register would say "email already in use". So
      // remove the half-made sign-in and let them try again cleanly.
      try {
        await setDoc(doc(db, 'users', uid), userData);
      } catch (profileError) {
        await userCredential.user.delete().catch(() => {});
        throw profileError;
      }
  
      // 6. If registering as a dasher, create their dasher profile too
      if (role === 'dasher') {
        await setDoc(doc(db, 'dashers', uid), {
          uid,
          isOnline: false,
          rating: 5.0,
          totalDeliveries: 0,
          totalEarnings: 0,
          vehicleType: 'walking',
        });
      }
  
      return { success: true };
  
    } catch (error: any) {
      // Firebase error codes are strings like 'auth/email-already-in-use'
      // We translate them into friendly messages
      switch (error.code) {
        case 'auth/email-already-in-use':
          return { success: false, error: 'An account with this email already exists.' };
        case 'auth/weak-password':
          return { success: false, error: 'Password is too weak.' };
        case 'auth/network-request-failed':
          return { success: false, error: 'Network error. Check your connection.' };
        default:
          return { success: false, error: `Registration failed: Please try again.` };
      }
    }
  };
  
  // ─── GOOGLE (web / PWA) ────────────────────────────────────────────────────
  // "Continue with Google" on sign-in and sign-up. A Google account that
  // already has a DormDash profile is simply signed in. A new one has no
  // users/{uid} yet: useAuth reports it as `pendingProfile` and the route
  // guard sends it to the sign-up form, which then asks only for what Google
  // doesn't give us (student or dasher, phone, university, the terms box)
  // and calls completeGoogleProfile.
  //
  // Phones and the installed app use a full-page redirect (popups open a
  // separate window there that can't hand the result back); computers use a
  // popup. This works because authDomain is DormDash's own domain, so the
  // browser treats the sign-in handler (/__/auth/handler) as first-party.
  // Native apps: not offered yet (needs a native Google sign-in module).

  export const googleSignInAvailable = Platform.OS === 'web';

  const googleErrorMessage = (code?: string): string | null => {
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case 'auth/user-cancelled':
        return null; // they changed their mind: say nothing
      case 'auth/account-exists-with-different-credential':
        return 'This email already has a DormDash password. Sign in with your email and password instead.';
      case 'auth/operation-not-allowed':
        return 'Google sign-in isn\'t switched on yet. Use your email and password for now.';
      case 'auth/unauthorized-domain':
        return 'Google sign-in isn\'t set up for this address yet. Use your email and password.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection.';
      case 'auth/user-disabled':
        return 'Your account has been deactivated. Contact support.';
      default:
        return 'Google sign-in failed. Please try again.';
    }
  };

  function preferRedirect(): boolean {
    if (typeof window === 'undefined') return false;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    return standalone || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /** Starts Google sign-in. With a redirect the page leaves and comes back. */
  export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    if (!googleSignInAvailable) return { success: false, error: 'Google sign-in is only on the web app for now.' };
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      if (preferRedirect()) {
        await signInWithRedirect(auth, provider);
        return { success: true };
      }
      await signInWithPopup(auth, provider);
      return { success: true };
    } catch (e: any) {
      if (e?.code === 'auth/popup-blocked') {
        try { await signInWithRedirect(auth, provider); return { success: true }; }
        catch (e2: any) { const m = googleErrorMessage(e2?.code); return m ? { success: false, error: m } : { success: true }; }
      }
      const m = googleErrorMessage(e?.code);
      return m ? { success: false, error: m } : { success: true };
    }
  };

  /**
   * After a redirect: the result (or error) of the Google sign-in, if the
   * page just came back from one. Call once when the sign-in screen opens.
   */
  export const takeGoogleRedirectError = async (): Promise<string | null> => {
    if (!googleSignInAvailable) return null;
    try {
      await getRedirectResult(auth);
      return null;
    } catch (e: any) {
      return googleErrorMessage(e?.code);
    }
  };

  /** Creates the DormDash profile for a Google account signing up. */
  export const completeGoogleProfile = async (
    name: string, phone: string, university: string, role: UserRole,
  ): Promise<{ success: boolean; error?: string }> => {
    const u = auth.currentUser;
    if (!u || !u.email) return { success: false, error: 'Your Google sign-in expired. Please continue with Google again.' };
    if (role !== 'student' && role !== 'dasher') return { success: false, error: 'Please select a role.' };
    const cleanName = sanitizeName(name);
    const cleanPhone = phone.trim();
    if (cleanName.length < 2) return { success: false, error: 'Please enter your full name.' };
    if (!validatePhone(cleanPhone)) return { success: false, error: 'Please enter a valid phone number.' };
    if (!university.trim()) return { success: false, error: 'Please enter your university.' };
    try {
      if (cleanName !== u.displayName) await updateProfile(u, { displayName: cleanName }).catch(() => {});
      const userData: User = {
        uid: u.uid,
        email: sanitizeEmail(u.email),
        name: cleanName,
        role,
        phone: cleanPhone,
        university: university.trim(),
        createdAt: Date.now(),
        isActive: true,
        termsAcceptedAt: Date.now(),
        termsVersion: LEGAL.termsUpdated,
      };
      await setDoc(doc(db, 'users', u.uid), userData);
      if (role === 'dasher') {
        await setDoc(doc(db, 'dashers', u.uid), {
          uid: u.uid, isOnline: false, rating: 5.0, totalDeliveries: 0, totalEarnings: 0, vehicleType: 'walking',
        });
      }
      return { success: true };
    } catch (e: any) {
      if (e?.code === 'unavailable' || e?.code === 'auth/network-request-failed') {
        return { success: false, error: 'Network error. Check your connection.' };
      }
      return { success: false, error: 'Could not finish signing up. Please try again.' };
    }
  };

  // ─── LOGIN ─────────────────────────────────────────────────────────────────
  export const loginUser = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: User; error?: string }> => {
    // Rate limit: max 5 login attempts per 15 minutes per email
    const rateLimitKey = `login_${email.trim().toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return {
        success: false,
        error: 'Too many login attempts. Please wait 15 minutes before trying again.'
      };
    }
  
    const cleanEmail = sanitizeEmail(email);
  
    if (!validateEmail(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }
  
    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const uid = userCredential.user.uid;
  
      // Fetch the full user profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', uid));
  
      if (!userDoc.exists()) {
        return { success: false, error: 'Account not found. Please register.' };
      }
  
      const userData = userDoc.data() as User;
  
      // Check if admin has deactivated this account
      if (!userData.isActive) {
        await signOut(auth); // Force logout immediately
        return { success: false, error: 'Your account has been deactivated. Contact support.' };
      }
  
      return { success: true, user: userData };
  
    } catch (error: any) {
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          // We deliberately give the SAME message for both wrong email AND wrong password
          // Why? Telling attackers "email not found" helps them enumerate valid accounts
          return { success: false, error: 'Invalid email or password.' };
        case 'auth/too-many-requests':
          return { success: false, error: 'Too many attempts. Please wait before trying again.' };
        default:
          return { success: false, error: 'Login failed. Please try again.' };
      }
    }
  };
  
  // ─── LOGOUT ────────────────────────────────────────────────────────────────
  // Detach this device's push token first (needs the user still signed in to
  // write their doc). Before, a normal sign-out left the token attached, so a
  // signed-out device kept getting that account's order alerts.
  //
  // Each cleanup step gets at most a few seconds. On a slow connection, or
  // when the browser's push service doesn't answer, these calls used to hang
  // forever, so the button stayed on "Signing out…" and signOut never ran.
  // Now sign-out always finishes; a skipped cleanup is harmless (the server
  // drops dead push tokens, and the dasher can't take orders once signed out).
  const CLEANUP_LIMIT_MS = 4000;
  const within = (p: Promise<unknown>, ms: number) =>
    Promise.race([
      p.catch(() => {}),
      new Promise<void>(resolve => setTimeout(resolve, ms)),
    ]);

  let signingOut: Promise<void> | null = null;

  export const logoutUser = (): Promise<void> => {
    // A second tap while one sign-out is running joins the first one.
    if (signingOut) return signingOut;
    signingOut = (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await within(Promise.allSettled([
            clearPushToken(uid),
            // Signing out takes a dasher offline, so orders aren't offered to
            // someone who has left. (Fails harmlessly for students and admins.)
            goOffline(uid),
          ]), CLEANUP_LIMIT_MS);
        }
      } finally {
        try {
          await signOut(auth);
          // Web: forget this account's cached data (reloads the page).
          await clearLocalData();
        } finally {
          signingOut = null;
        }
      }
    })();
    return signingOut;
  };