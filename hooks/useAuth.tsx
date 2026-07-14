// hooks/useAuth.tsx
// This file does two things:
// 1. Creates an AuthContext — the "radio station" that broadcasts user state
// 2. Creates a useAuth hook — the "radio receiver" any screen uses to tune in

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User } from '../types';

// ─── CONTEXT SHAPE ─────────────────────────────────────────────────────────
// This defines exactly what data the context broadcasts.
// Every screen that calls useAuth() gets these fields.
interface AuthContextType {
  user: User | null;        // null = not logged in
  loading: boolean;         // true while we're checking auth state on startup
  refreshUser: () => Promise<void>; // call this to re-fetch user from Firestore
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

  // fetchUserProfile takes a Firebase uid and loads the full profile from Firestore
  const fetchUserProfile = async (uid: string): Promise<User | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return userDoc.data() as User;
      }
      return null;
    } catch {
      return null;
    }
  };

  // refreshUser lets a screen manually re-fetch the user profile.
  // Useful after a user updates their profile — you want the UI to reflect it.
  const refreshUser = async () => {
    if (auth.currentUser) {
      const profile = await fetchUserProfile(auth.currentUser.uid);
      setUser(profile);
    }
  };

  useEffect(() => {
    // onAuthStateChanged is a Firebase LISTENER.
    // It fires immediately when the app starts (telling us the current state),
    // then fires again every time auth state changes (login, logout, token refresh).
    // This is how the app knows to keep you logged in between sessions.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is logged in — fetch their full Firestore profile
        const profile = await fetchUserProfile(firebaseUser.uid);
        setUser(profile);
      } else {
        // No user logged in
        setUser(null);
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
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
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