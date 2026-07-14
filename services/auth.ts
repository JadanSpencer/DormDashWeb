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
  } from 'firebase/auth';
  import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
  import { auth, db } from './firebase';
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
      };
  
      // doc(db, 'users', uid) → the document at /users/{uid} in Firestore
      await setDoc(doc(db, 'users', uid), userData);
  
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
  export const logoutUser = async (): Promise<void> => {
    await signOut(auth);
  };