// services/users.ts
// User profile reads and writes, admin account switches, and the account
// deactivate/delete Cloud Functions. Screens call these and never touch
// users/* directly. Sign-in, sign-up and sign-out are in services/auth.ts.
//
// firestore.rules limits what each of these may change: a user can edit
// only EDITABLE_PROFILE_FIELDS on their own doc; an admin can only switch
// isActive on someone else's.

import { doc, getDoc, getDocFromCache, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { User } from '../types';

/** The profile fields a user may change themselves (same list as firestore.rules). */
export type EditableProfileField = 'name' | 'phone' | 'university' | 'major' | 'graduationYear';

/**
 * users/{uid} from this device's offline cache, or null if it isn't cached.
 * Lets a returning user see the app at once while the server copy loads.
 */
export async function getCachedUserProfile(uid: string): Promise<(User & Record<string, any>) | null> {
  try {
    const snap = await getDocFromCache(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as User & Record<string, any>) : null;
  } catch {
    return null; // not cached (or no persistent cache, e.g. native)
  }
}

/** users/{uid}, or null if it doesn't exist. Throws on network/rules errors. */
export async function getUserProfile(uid: string): Promise<(User & Record<string, any>) | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as User & Record<string, any>) : null;
}

export async function updateMyProfileField(uid: string, field: EditableProfileField, value: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { [field]: value });
}

/** Admin: switch someone's account on or off (onUserWritten mirrors it into Auth). */
export async function setUserActive(uid: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { isActive });
}

/** Signed-in user pauses their own account (Cloud Function deactivateMyAccount). */
export async function deactivateMyAccount(): Promise<void> {
  await httpsCallable(functions, 'deactivateMyAccount')();
}

/** Signed-in user permanently deletes their account (Cloud Function deleteMyAccount). */
export async function deleteMyAccount(): Promise<void> {
  await httpsCallable(functions, 'deleteMyAccount')();
}
