// services/dasher.ts
// The dasher's online switch: the only thing the app writes to dashers/*.
// Online is sticky: it stays on until the dasher switches it off or signs
// out, with no periodic heartbeat. onDasherOnlineChanged (functions) keeps
// the public online count current. Earnings, rating and floats are
// server-written and read through hooks/useUsers.ts.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { serverNow } from './serverClock';

/** Whether the dasher left their switch on (so the app can resume it). */
export async function isDasherOnline(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'dashers', uid));
  return snap.data()?.isOnline === true;
}

/** Throws if the write fails, so the caller can say "could not go online". */
export async function goOnline(uid: string): Promise<void> {
  await updateDoc(doc(db, 'dashers', uid), { isOnline: true, lastSeenAt: serverNow() });
}

/**
 * Takes the dasher offline and clears any position stored by older app
 * versions. Throws on failure; callers that are leaving anyway ignore it.
 */
export async function goOffline(uid: string): Promise<void> {
  await updateDoc(doc(db, 'dashers', uid), {
    isOnline: false,
    currentLocation: null,
    lastSeenAt: serverNow(),
  });
}
