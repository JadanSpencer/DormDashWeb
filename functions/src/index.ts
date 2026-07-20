// functions/src/index.ts
// DormDash Cloud Functions.
//
// TARGETING FIXES IN THIS VERSION — "only the people it's for":
//   1. New orders no longer blast every dasher account. Only dashers who are
//      currently ONLINE (dashers/{uid}.isOnline) and whose heartbeat is fresh
//      are notified.
//   2. A dasher who already has an active delivery is skipped — they can't
//      accept anyway, so the buzz is noise.
//   3. The customer is excluded from the dasher broadcast. A student who is
//      also a registered dasher was previously notified about their own order.
//   4. Every status update goes to exactly one recipient by UID, with the
//      dasher-side cancellation going only to the assigned dasher.
//   5. Tokens are validated before send, and null tokens (signed-out devices)
//      are skipped.
//
// PRESENTATION FIXES:
//   • No emoji in titles.
//   • Currency rendered as J$ with thousands separators, no decimals.
//   • channelId 'default' + cerulean accent so Android styles it as ours.

import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
 
const CHUNK = 400; // Firestore batches cap at 500 writes

admin.initializeApp();

const db = admin.firestore();

// A dasher's heartbeat only writes while the app is foregrounded. 45 minutes
// keeps a dasher reachable while their phone is pocketed, without spamming
// someone who closed the app hours ago.
const STALE_MS = 45 * 60 * 1000;

const CERULEAN = '#0E8FB5';

// ─── Notification marks ────────────────────────────────────────────────────
// These are the SAME geometric glyphs the app uses in its UI (◇ delivery fee,
// ◷ ETA, ★ rating, ✓ done, ✕ cancelled, → motion), so a notification reads as
// DormDash rather than as generic emoji. They render monochrome and crisp in
// the Android tray at any size.
//
// To swap the whole set, change this one object:
//   Route motif (current):  ◇ ◆ ◷ → ✓ ✕ ＋
//   Minimal dots:           ○ ● ◐ ◑ ● ○ ＋
//   No marks at all:        set every value to ''
const MARK = {
  newOrder:  '◇',   // an open stop on the route — something to pick up
  assigned:  '◆',   // stop filled — a dasher has claimed it
  pickingUp: '◷',   // the clock glyph used for ETA in-app
  onTheWay:  '→',   // motion, matches the route rail direction
  delivered: '✓',
  cancelled: '✕',
  newUser:   '＋',
};



// ─── Currency ──────────────────────────────────────────────────────────────
function jmd(value: unknown): string {
  const n = Math.round(Number(value) || 0);
  return `J$${n.toLocaleString('en-US')}`;
}

// ─── Push helper ───────────────────────────────────────────────────────────
async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (!token || typeof token !== 'string' || !token.startsWith('ExponentPushToken')) return;

  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    channelId: 'default',
    priority: 'high',
    color: CERULEAN,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (e) {
    logger.warn('Push send failed', e);
  }
}

// ─── Token lookup for one user ─────────────────────────────────────────────
async function getUserToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;
  const data = userDoc.data();
  if (data?.isActive === false) return null;   // deactivated accounts get nothing
  return data?.pushToken ?? null;
}

// ─── Which dashers should actually hear about a new order ──────────────────
async function getEligibleDasherTokens(excludeUid?: string): Promise<string[]> {
  const now = Date.now();

  // 1. Dashers currently toggled online with a fresh heartbeat
  const dasherSnap = await db.collection('dashers').where('isOnline', '==', true).get();

  const candidateUids: string[] = [];
  dasherSnap.forEach(doc => {
    const d = doc.data();
    const lastSeen = Number(d.lastSeenAt) || 0;
    if (now - lastSeen > STALE_MS) return;      // app closed too long ago
    if (excludeUid && doc.id === excludeUid) return; // don't ping the customer
    candidateUids.push(doc.id);
  });

  if (candidateUids.length === 0) return [];

  // 2. Drop anyone already mid-delivery — they cannot accept another order
  const busy = new Set<string>();
  const activeSnap = await db.collection('orders')
    .where('status', 'in', ['accepted', 'picking_up', 'on_the_way'])
    .get();
  activeSnap.forEach(doc => {
    const dasherId = doc.data().dasherId;
    if (dasherId) busy.add(dasherId);
  });

  const freeUids = candidateUids.filter(uid => !busy.has(uid));
  if (freeUids.length === 0) return [];

  // 3. Resolve tokens (chunked — Firestore 'in' queries cap at 30)
  const tokens: string[] = [];
  for (let i = 0; i < freeUids.length; i += 30) {
    const chunk = freeUids.slice(i, i + 30);
    const usersSnap = await db.collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    usersSnap.forEach(doc => {
      const u = doc.data();
      if (u.isActive === false) return;
      if (u.role !== 'dasher') return;          // belt and braces
      if (u.pushToken) tokens.push(u.pushToken);
    });
  }

  return tokens;
}

// ─── TRIGGER: ORDER WRITTEN ────────────────────────────────────────────────
export const onOrderStatusChanged = onDocumentWritten(
  'orders/{orderId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const orderId = event.params.orderId;

    if (!after) return;

    const statusChanged = !before || before.status !== after.status;
    const isNewOrder = !before && after.status === 'pending';

    const studentId: string = after.studentId;
    const dasherId: string | undefined = after.dasherId;

    // ── NEW ORDER: only eligible dashers ──────────────────────────────────
    if (isNewOrder) {
      const tokens = await getEligibleDasherTokens(studentId);
      await Promise.all(tokens.map(token =>
        sendPushNotification(
          token,
          `${MARK.newOrder} New order available`,
          `${after.storeName} — ${jmd(after.deliveryFee)} to deliver`,
          { screen: '/(dasher)/home', orderId }
        )
      ));
      logger.info(`New order ${orderId}: notified ${tokens.length} eligible dashers`);
      return;
    }

    if (!statusChanged) return;

    // ── STATUS UPDATES: the customer only ─────────────────────────────────
    if (after.status === 'accepted') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.assigned} Dasher assigned`,
        `${after.dasherName} accepted your order and is heading to ${after.storeName}.`,
        { screen: `/(student)/order/${orderId}` }
      );
      return;
    }

    if (after.status === 'picking_up') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.pickingUp} Picking up your order`,
        `${after.dasherName} is at ${after.storeName} collecting your items.`,
        { screen: `/(student)/order/${orderId}` }
      );
      return;
    }

    if (after.status === 'on_the_way') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.onTheWay} On the way`,
        `${after.dasherName} is heading to you now.`,
        { screen: `/(student)/order/${orderId}` }
      );
      return;
    }

    if (after.status === 'delivered') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.delivered} Delivered`,
        `Your order from ${after.storeName} has arrived. Enjoy.`,
        { screen: `/(student)/order/${orderId}` }
      );
      return;
    }

    // ── CANCELLED: customer, plus the assigned dasher only ────────────────
    if (after.status === 'cancelled') {
      const studentToken = await getUserToken(studentId);
      if (studentToken) await sendPushNotification(
        studentToken,
        `${MARK.cancelled} Order cancelled`,
        `Your order from ${after.storeName} was cancelled.`,
        { screen: '/(student)/(tabs)/home' }
      );

      if (dasherId) {
        const dasherToken = await getUserToken(dasherId);
        if (dasherToken) await sendPushNotification(
          dasherToken,
          `${MARK.cancelled} Order cancelled`,
          `The ${after.storeName} order was cancelled by the customer.`,
          { screen: '/(dasher)/home' }
        );
      }
      return;
    }
  }
);

// ─── TRIGGER: DELIVERY COMPLETED → credit the dasher ───────────────────────
// (Kept from the existing deployment: server-written stats are tamper-proof.)
export const onDeliveryCompleted = onDocumentWritten(
  'orders/{orderId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after || !before) return;
    if (before.status === 'delivered' || after.status !== 'delivered') return;
    if (!after.dasherId) return;

    await db.collection('dashers').doc(after.dasherId).set({
      totalDeliveries: admin.firestore.FieldValue.increment(1),
      totalEarnings: admin.firestore.FieldValue.increment(Number(after.deliveryFee) || 0),
    }, { merge: true });

    logger.info(`Credited dasher ${after.dasherId} for order ${event.params.orderId}`);
  }
);

// ─── TRIGGER: NEW USER → admins only ───────────────────────────────────────
export const onNewUserRegistered = onDocumentCreated(
  'users/{userId}',
  async (event) => {
    const user = event.data?.data();
    if (!user) return;

    const adminSnapshot = await db.collection('users').where('role', '==', 'admin').get();

    const sends: Promise<void>[] = [];
    adminSnapshot.forEach(doc => {
      if (doc.id === event.params.userId) return;   // don't notify yourself
      const token = doc.data().pushToken;
      if (token) sends.push(
        sendPushNotification(
          token,
          `${MARK.newUser} New user joined`,
          `${user.name} registered as a ${user.role}.`,
          { screen: '/(admin)/(tabs)/users' }
        )
      );
    });

    await Promise.all(sends);
  }
);

export const deactivateMyAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
 
  await db.collection('users').doc(uid).update({
    isActive: false,
    deactivatedAt: Date.now(),
    pushToken: null,
  });
 
  // If they are a dasher, take them offline so no orders are routed to them.
  const dasherRef = db.collection('dashers').doc(uid);
  if ((await dasherRef.get()).exists) {
    await dasherRef.update({ isOnline: false, currentLocation: null, lastSeenAt: Date.now() });
  }
 
  logger.info(`Account deactivated by user: ${uid}`);
  return { ok: true };
});
 
// Permanent deletion.
export const deleteMyAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
 
  // Refuse while an order is in flight — money and food are mid-transit.
  const liveAsStudent = await db.collection('orders')
    .where('studentId', '==', uid)
    .where('status', 'in', ['pending', 'accepted', 'picking_up', 'on_the_way'])
    .limit(1).get();
 
  const liveAsDasher = await db.collection('orders')
    .where('dasherId', '==', uid)
    .where('status', 'in', ['accepted', 'picking_up', 'on_the_way'])
    .limit(1).get();
 
  if (!liveAsStudent.empty || !liveAsDasher.empty) {
    throw new HttpsError(
      'failed-precondition',
      'You have an order in progress. Wait for it to finish, then delete your account.'
    );
  }
 
  // ── 1. Strip personal data from past orders (keep the financial record) ──
  const anonymise = async (field: 'studentId' | 'dasherId') => {
    const snap = await db.collection('orders').where(field, '==', uid).get();
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
      const batch = db.batch();
      snap.docs.slice(i, i + CHUNK).forEach(docSnap => {
        const update: Record<string, unknown> = {};
        if (field === 'studentId') {
          update.studentId = 'deleted_user';
          update.studentName = 'Deleted user';
          update.studentNote = admin.firestore.FieldValue.delete();
          update.deliveryAddress = {
            label: 'Address removed',
            latitude: 0,
            longitude: 0,
            hasGpsFix: false,
          };
        } else {
          update.dasherId = 'deleted_user';
          update.dasherName = 'Deleted dasher';
        }
        update.anonymisedAt = Date.now();
        batch.update(docSnap.ref, update);
      });
      await batch.commit();
    }
    return snap.size;
  };
 
  const studentOrders = await anonymise('studentId');
  const dasherOrders = await anonymise('dasherId');
 
  // ── 2. Delete the personal documents ────────────────────────────────────
  const dasherRef = db.collection('dashers').doc(uid);
  if ((await dasherRef.get()).exists) await dasherRef.delete();
  await db.collection('users').doc(uid).delete();
 
  // ── 3. Delete the authentication account itself ─────────────────────────
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    logger.error(`Auth deletion failed for ${uid}`, e);
    throw new HttpsError('internal', 'Could not fully delete the account. Contact support.');
  }
 
  logger.info(`Account deleted: ${uid} (anonymised ${studentOrders} student / ${dasherOrders} dasher orders)`);
  return { ok: true, anonymisedOrders: studentOrders + dasherOrders };
});
