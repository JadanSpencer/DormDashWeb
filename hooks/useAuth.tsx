// hooks/useAuth.tsx
// This file does two things:
// 1. Creates an AuthContext — the "radio station" that broadcasts user state
// 2. Creates a useAuth hook — the "radio receiver" any screen uses to tune in

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserProfile, getCachedUserProfile } from '../services/users';
import { User } from '../types';

// ─── CONTEXT SHAPE ─────────────────────────────────────────────────────────
// This defines exactly what data the context broadcasts.
// Every screen that calls useAuth() gets these fields.
// Signed in with Google but no DormDash profile yet (a new Google sign-up):
// the route guard sends them to the sign-up form to finish.
export type PendingProfile = { uid: string; email: string; name: string };

interface AuthContextType {
  user: User | null;        // null = not logged in
  loading: boolean;         // true while we're checking auth state on startup
  refreshUser: () => Promise<void>; // call this to re-fetch user from Firestore
  pendingProfile: PendingProfile | null;
}

// Create the context with a default value of null
// The 'as AuthContextType' tells TypeScript to trust us on the shape
const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// ─── PROVIDER ──────────────────────────────────────────────────────────────
// The Provider is a wrapper component. We'll wrap our ENTIRE app in this.
// Any component inside the wrapper can call useAuth() to get the data.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start true — we don't know yet
  const [pendingProfile, setPendingProfile] = useState<PendingProfile | null>(null);

  // Loads the profile. A Google account whose profile document definitely
  // doesn't exist (not a network error) is a sign-up still to finish.
  // Email sign-ups never count: their account exists a moment before their
  // profile, and registerUser writes it straight away.
  const load = async (fu: FirebaseUser, fallback: User | null = null) => {
    let profile: User | null = null;
    let missing = false;
    try {
      profile = await getUserProfile(fu.uid);
      missing = profile === null;
    } catch {
      // Offline or blocked: keep the device's copy if there is one,
      // otherwise treat as signed out, as before.
      profile = fallback;
    }
    const google = (fu.providerData ?? []).some(p => p?.providerId === 'google.com');
    setUser(profile);
    setPendingProfile(missing && google
      ? { uid: fu.uid, email: fu.email ?? '', name: fu.displayName ?? '' }
      : null);
  };

  // refreshUser lets a screen manually re-fetch the user profile.
  // Useful after a user updates their profile — you want the UI to reflect it.
  const refreshUser = async () => {
    if (auth.currentUser) await load(auth.currentUser);
  };

  useEffect(() => {
    // onAuthStateChanged is a Firebase LISTENER.
    // It fires immediately when the app starts (telling us the current state),
    // then fires again every time auth state changes (login, logout, token refresh).
    // This is how the app knows to keep you logged in between sessions.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // SPEED: show the app at once from this device's copy of the
        // profile, then refresh it from the server (role or account changes
        // still land a moment later).
        const cached = await getCachedUserProfile(firebaseUser.uid);
        if (cached) {
          setUser(cached);
          setPendingProfile(null);
          setLoading(false);
        }
        await load(firebaseUser, cached);
      } else {
        // No user logged in
        setUser(null);
        setPendingProfile(null);
      }
      // Either way, we now know the auth state — stop showing loading screen
      setLoading(false);
    });

    // IMPORTANT: this return is a cleanup function.
    // When the component unmounts, we call unsubscribe() to stop listening.
    // Without this, you'd have memory leaks — ghost listeners piling up.
    return unsubscribe;
  }, []); // Empty array = run this effect only once, when the app first mounts

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, pendingProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── HOOK ──────────────────────────────────────────────────────────────────
// This is the "radio receiver". Any screen imports and calls this one line:
// const { user, loading } = useAuth();
// The error below protects against using it outside the Provider wrapper.
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};