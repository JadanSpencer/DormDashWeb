// services/dasher.ts
// The dasher's online switch: the only thing the app writes to dashers/*.
// Online stays on until the dasher switches it off or signs out, or until
// they haven't opened DormDash for a couple of hours (the server nudges,
// then takes them offline; see retireIdleDashers in functions).
// onDasherOnlineChanged (functions) keeps the public online count current.
// Earnings, rating and floats are server-written and read through
// hooks/useUsers.ts.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { serverNow } from './serverClock';

/**
 * Whether the dasher left their switch on (so the app can resume it), and
 * if the server switched them off, why ('idle': no activity for too long).
 */
export async function getDasherStatus(uid: string): Promise<{ online: boolean; offlineReason: string | null }> {
  const d = (await getDoc(doc(db, 'dashers', uid))).data();
  return { online: d?.isOnline === true, offlineReason: d?.offlineReason ?? null };
}

/** Throws if the write fails, so the caller can say "could not go online". */
export async function goOnline(uid: string): Promise<void> {
  await updateDoc(doc(db, 'dashers', uid), { isOnline: true, lastSeenAt: serverNow(), offlineReason: null });
}

/**
 * Records that an online dasher is around (the app is open). The server
 * takes dashers offline after DASHER_IDLE_NUDGE_MS + DASHER_IDLE_GRACE_MS
 * without this. Failures are ignored: the next one catches up.
 */
export async function recordDasherActivity(uid: string): Promise<void> {
  await updateDoc(doc(db, 'dashers', uid), { lastSeenAt: serverNow() }).catch(() => {});
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
