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
// FieldValue/FieldPath come from the modular import: the namespace versions
// (admin.firestore.FieldValue) are undefined inside the local emulator.
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  reserveTokensAndVerify, chargeTokensOnAccept, settleCancelledOrder, PAY_WINDOW_MS,
} from './payments';
export { createPayment, wipayReturn, adminAdjustTokens, adminAdjustFloat, payOrderWithTokens } from './payments';
 
const CHUNK = 400; // Firestore batches cap at 500 writes

if (!admin.apps.length) admin.initializeApp(); // payments.ts may have done it already

const db = admin.firestore();

// A dasher's heartbeat only writes while the app is foregrounded. 45 minutes
// keeps a dasher reachable while their phone is pocketed, without spamming
// someone who closed the app hours ago.

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
// Two kinds of token live in users/{uid}.pushToken:
//   • "ExponentPushToken[...]"  → native app → Expo push service
//   • "web:<fcm token>"         → PWA        → Firebase Cloud Messaging
// The PWA writes the "web:" prefix (services/notifications.web.ts). Callers
// don't need to know which kind they have.
const WEB_TOKEN_PREFIX = 'web:';

async function sendWebPush(
  storedToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const token = storedToken.slice(WEB_TOKEN_PREFIX.length);
  try {
    // Data-only message: public/sw.js builds the notification itself, so it
    // can show the in-app banner instead when DormDash is open.
    await admin.messaging().send({
      token,
      data: { ...(data ?? {}), title, body },
      webpush: {
        headers: { Urgency: 'high', TTL: '3600' },
      },
    });
    logger.info('Web push sent', { token: token.slice(0, 16) });
  } catch (err: any) {
    const code: string = err?.code ?? '';
    logger.error('Web push failed', { code, message: err?.message });
    // Browser unsubscribed or token expired — detach it so we stop trying.
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token') {
      const stale = await db.collection('users').where('pushToken', '==', storedToken).get();
      // pushTokenDead tells the app "this exact token is dead, make a new
      // one" — otherwise the browser keeps re-saving its cached dead copy.
      await Promise.all(stale.docs.map(d => d.ref.update({
        pushToken: null,
        pushTokenDead: storedToken,
        pushTokenUpdatedAt: Date.now(),
      })));
      // Say whose alerts just stopped, so the logs are readable. The app puts
      // a fresh token back next time that person opens DormDash.
      stale.docs.forEach(d => logger.warn('Dead web push token removed', {
        uid: d.id,
        role: d.data()?.role ?? 'unknown',
        token: token.slice(0, 16),
      }));
    }
  }
}

async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (token.startsWith(WEB_TOKEN_PREFIX)) {
    await sendWebPush(token, title, body, data);
    return;
  }

  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    channelId: 'default',
  };

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const result = await response.json();

  if (result.data?.status === 'error') {
    logger.error('Push notification failed', {
      token,
      error: result.data.message,
      errorType: result.data.details?.error,
    });
  } else if (result.errors) {
    logger.error('Expo push API error', { errors: result.errors });
  } else {
    logger.info('Push sent successfully', { token: token.slice(0, 20) });
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
  // 1. Dashers currently switched online
  const dasherSnap = await db.collection('dashers').where('isOnline', '==', true).get();

  const candidateUids: string[] = [];
  dasherSnap.forEach(doc => {
    const d = doc.data();
    // No "last seen" cutoff: a dasher stays online until they switch off or
    // sign out, and gets new orders as push notifications with the app closed.
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
      .where(FieldPath.documentId(), 'in', chunk)
      .get();
    usersSnap.forEach(doc => {
      const u = doc.data();
      if (u.isActive === false) return;
      if (u.role !== 'dasher') return;          // belt and braces
      if (u.pushToken) tokens.push(u.pushToken);
    });
  }

  return [...new Set(tokens)]; // never alert the same device twice
}

// ─── NEW ORDER VERIFICATION ────────────────────────────────────────────────
// The app builds the order on the phone, including prices. Anything on the
// phone can be edited by a determined user, so the server re-checks every
// new order against the real store and menu before any dasher sees it:
//   • store exists and is open
//   • every item exists, is available, quantity is a whole number 1–20
//   • prices, names, delivery fee and total come from Firestore, not the app
//   • the student's name comes from their profile (can't be spoofed)
//   • rate limit: at most MAX_ORDERS_PER_WINDOW new orders per student per
//     ORDER_WINDOW_MS, which stops scripted spam
// Invalid orders are cancelled with a cancelReason. Returns the corrected
// order data, or null if the order was cancelled.
const MAX_ITEMS_PER_ORDER = 20;
const MAX_ORDERS_PER_WINDOW = 5;
// Keep in sync with MAX_ACTIVE_ORDERS in constants/index.ts (the app).
const MAX_ACTIVE_ORDERS = 3;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const ORDER_WINDOW_MS = 10 * 60 * 1000;

async function verifyNewOrder(
  ref: admin.firestore.DocumentReference,
  order: admin.firestore.DocumentData
): Promise<admin.firestore.DocumentData | null> {
  const cancel = async (reason: string) => {
    logger.warn(`Order ${ref.id} rejected: ${reason}`, { studentId: order.studentId });
    await ref.update({ status: 'cancelled', cancelReason: reason, cancelledAt: Date.now() });
    return null;
  };

  const [storeSnap, userSnap] = await Promise.all([
    db.collection('stores').doc(String(order.storeId ?? '')).get(),
    db.collection('users').doc(String(order.studentId ?? '')).get(),
  ]);
  if (!userSnap.exists || userSnap.data()?.isActive === false) return cancel('account_inactive');
  if (!storeSnap.exists) return cancel('store_not_found');
  const store = storeSnap.data()!;
  if (store.isOpen === false) return cancel('store_closed');

  // Filtered in memory so no composite Firestore index is needed.
  const mine = await db.collection('orders')
    .where('studentId', '==', order.studentId)
    .select('createdAt', 'verifiedAt', 'status', 'cancelReason', 'storeId', 'items')
    .get();

  // Up to MAX_ACTIVE_ORDERS in progress per student, plus duplicate
  // protection (a burst of taps once created 9 identical orders in half a
  // second). Every copy of this function sees the same set of orders and
  // uses the same ordering (createdAt, then id), so they all agree.
  const ACTIVE = ['pending', 'accepted', 'picking_up', 'on_the_way'];
  const myCreated = Number(order.createdAt) || 0;
  const isEarlier = (d: admin.firestore.QueryDocumentSnapshot) => {
    const c = Number(d.get('createdAt')) || 0;
    return c < myCreated || (c === myCreated && d.id < ref.id);
  };
  const isActive = (d: admin.firestore.QueryDocumentSnapshot) =>
    ACTIVE.includes(String(d.get('status')));
  // Same store + same items (ids and quantities) = same order.
  const signature = (storeId: unknown, items: unknown) =>
    String(storeId ?? '') + '|' + (Array.isArray(items) ? items : [])
      .map((l: any) => `${l?.menuItem?.id ?? ''}x${Number(l?.quantity) || 0}`)
      .sort().join(',');
  const mySig = signature(order.storeId, order.items);
  const others = mine.docs.filter(d => d.id !== ref.id);
  const earlierActive = others.filter(d => isActive(d) && isEarlier(d));

  // Identical to an earlier active order placed within DUPLICATE_WINDOW_MS:
  // that's a double tap, not a second order.
  if (earlierActive.some(d =>
    myCreated - (Number(d.get('createdAt')) || 0) < DUPLICATE_WINDOW_MS &&
    signature(d.get('storeId'), d.get('items')) === mySig
  )) return cancel('duplicate_order');

  // Count earlier orders that are real, not accidental repeats that are
  // about to be cancelled themselves.
  const realEarlier = earlierActive.filter(d => {
    const c = Number(d.get('createdAt')) || 0;
    const sig = signature(d.get('storeId'), d.get('items'));
    return !earlierActive.some(e =>
      e.id !== d.id &&
      ((Number(e.get('createdAt')) || 0) < c || ((Number(e.get('createdAt')) || 0) === c && e.id < d.id)) &&
      c - (Number(e.get('createdAt')) || 0) < DUPLICATE_WINDOW_MS &&
      signature(e.get('storeId'), e.get('items')) === sig
    );
  });
  if (realEarlier.length >= MAX_ACTIVE_ORDERS) return cancel('too_many_active');

  // Rate limit. Doesn't count orders the server itself rejected (duplicates,
  // earlier rate-limit hits), or later duplicates of this order that are
  // about to be rejected, so one tap-burst can't lock a student out.
  const since = Date.now() - ORDER_WINDOW_MS;
  // verifiedAt is the server's clock; createdAt comes from the phone and
  // could be set in the past to dodge the limit.
  const recentCount = 1 + others.filter(d =>
    Number(d.get('verifiedAt') ?? d.get('createdAt')) > since &&
    !d.get('cancelReason') &&
    !(isActive(d) && !isEarlier(d))
  ).length;
  if (recentCount > MAX_ORDERS_PER_WINDOW) return cancel('rate_limited');

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) return cancel('empty_order');

  let count = 0;
  let subtotal = 0;
  const cleanItems = [];
  for (const line of items) {
    const qty = Number(line?.quantity);
    const itemId = String(line?.menuItem?.id ?? '');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEMS_PER_ORDER || !itemId) {
      return cancel('invalid_item');
    }
    const itemSnap = await storeSnap.ref.collection('menuItems').doc(itemId).get();
    if (!itemSnap.exists || itemSnap.data()?.isAvailable === false) return cancel('item_unavailable');
    const real = itemSnap.data()!;
    const price = Number(real.price) || 0;
    count += qty;
    subtotal += price * qty;
    cleanItems.push({
      quantity: qty,
      menuItem: {
        id: itemId, storeId: storeSnap.id, name: String(real.name ?? ''),
        description: String(real.description ?? ''), price,
        category: String(real.category ?? ''), isAvailable: true,
        ...(Array.isArray(real.allergens) ? { allergens: real.allergens } : {}),
      },
    });
  }
  if (count > MAX_ITEMS_PER_ORDER) return cancel('too_many_items');

  const deliveryFee = Number(store.deliveryFee) || 0;
  const totalAmount = subtotal + deliveryFee;

  // Payment. Orders from app versions before payments have no method: they
  // are treated as card orders (paid when a dasher accepts).
  const paymentMethod = order.paymentMethod === 'tokens' ? 'tokens' : 'card';

  const verified = {
    items: cleanItems,
    deliveryFee,
    totalAmount,
    storeName: String(store.name ?? ''),
    studentName: String(userSnap.data()?.name ?? 'Student'),
    paymentMethod,
    paymentStatus: paymentMethod === 'tokens' ? 'reserved' : 'unpaid',
    verifiedAt: Date.now(),
  };
  if (Number(order.totalAmount) !== verified.totalAmount) {
    logger.warn(`Order ${ref.id}: total corrected ${order.totalAmount} -> ${verified.totalAmount}`);
  }
  if (paymentMethod === 'tokens') {
    // Reserve the tokens and publish the order to dashers in one step.
    const result = await reserveTokensAndVerify(ref, String(order.studentId), totalAmount, verified);
    if (result === 'insufficient') return cancel('insufficient_tokens');
    if (result === 'gone') return null;
  } else {
    await ref.update(verified);
  }
  return { ...order, ...verified };
}

// ─── TRIGGER: ORDER WRITTEN ────────────────────────────────────────────────
export const onOrderStatusChanged = onDocumentWritten(
  'orders/{orderId}',
  async (event) => {
    const before = event.data?.before?.data();
    let after = event.data?.after?.data();
    const orderId = event.params.orderId;

    if (!after) return;

    const statusChanged = !before || before.status !== after.status;
    const isNewOrder = !before && after.status === 'pending';

    const studentId: string = after.studentId;
    const dasherId: string | undefined = after.dasherId;

    // ── NEW ORDER: only eligible dashers ──────────────────────────────────
    if (isNewOrder) {
      const checked = await verifyNewOrder(event.data!.after!.ref, after);
      if (!checked) return; // cancelled; the cancel write re-triggers and notifies the student
      after = checked;
      const tokens = await getEligibleDasherTokens(studentId);
      await Promise.all(tokens.map(token =>
        sendPushNotification(
          token,
          `${MARK.newOrder} New order available`,
          `${after.storeName} — ${jmd(after.deliveryFee)} to deliver`,
          { screen: '/(dasher)/dash', orderId }
        )
      ));
      logger.info(`New order ${orderId}: notified ${tokens.length} eligible dashers`);
      return;
    }

    // ── PAYMENT RECEIVED (card or tokens, chosen after accept): tell the
    //    dasher to go ahead ─────────────────────────────────────────────────
    if (!statusChanged && before?.paymentStatus === 'awaiting_payment' && after.paymentStatus === 'paid' &&
        dasherId) {
      const token = await getUserToken(dasherId);
      if (token) await sendPushNotification(
        token,
        `${MARK.assigned} Payment received`,
        `The customer paid for the ${after.storeName} order. Go ahead and pick it up.`,
        { screen: '/(dasher)/dash', orderId }
      );
      return;
    }

    if (!statusChanged) return;

    // ── STATUS UPDATES: the customer only ─────────────────────────────────
    if (after.status === 'accepted') {
      const ref = event.data!.after!.ref;
      const token = await getUserToken(studentId);

      if (after.paymentMethod === 'tokens') {
        await chargeTokensOnAccept(ref);
        if (token) await sendPushNotification(
          token,
          `${MARK.assigned} Dasher assigned`,
          `${after.dasherName} accepted your order and is heading to ${after.storeName}. Paid with tokens.`,
          { screen: `/(student)/order/${orderId}`, orderId }
        );
        return;
      }

      if (after.paymentMethod === 'card' && after.paymentStatus === 'unpaid') {
        await ref.update({ paymentStatus: 'awaiting_payment', payDeadline: Date.now() + PAY_WINDOW_MS });
        if (token) await sendPushNotification(
          token,
          `${MARK.assigned} Pay now to confirm`,
          `${after.dasherName} accepted your order. Pay ${jmd(after.totalAmount)} with your tokens or card within 10 minutes, or it will be cancelled.`,
          { screen: `/(student)/order/${orderId}`, orderId }
        );
        return;
      }

      if (token) await sendPushNotification(
        token,
        `${MARK.assigned} Dasher assigned`,
        `${after.dasherName} accepted your order and is heading to ${after.storeName}.`,
        { screen: `/(student)/order/${orderId}`, orderId }
      );
      return;
    }

    if (after.status === 'picking_up') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.pickingUp} Picking up your order`,
        `${after.dasherName} is at ${after.storeName} collecting your items.`,
        { screen: `/(student)/order/${orderId}`, orderId }
      );
      return;
    }

    if (after.status === 'on_the_way') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.onTheWay} On the way`,
        `${after.dasherName} is heading to you now.`,
        { screen: `/(student)/order/${orderId}`, orderId }
      );
      return;
    }

    if (after.status === 'delivered') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.delivered} Delivered`,
        `Your order from ${after.storeName} has arrived. Enjoy.`,
        { screen: `/(student)/order/${orderId}`, orderId }
      );
      return;
    }

    // ── CANCELLED: customer, plus the assigned dasher only ────────────────
    if (after.status === 'cancelled') {
      // A duplicate's original is still going ahead: no alert, or the student
      // gets a stack of "cancelled" pushes for an order that's fine.
      // Give back anything the student put in (reserved tokens are released;
      // a paid order is refunded as tokens). Runs for every cancellation.
      const wasPaid = after.paymentStatus === 'paid';
      await settleCancelledOrder(event.data!.after!.ref);
      if (after.cancelReason === 'duplicate_order') return;

      const reasonText: Record<string, string> = {
        rate_limited: 'Too many orders in a short time. Try again in a few minutes.',
        store_closed: `${after.storeName} closed before your order went through. You were not charged.`,
        item_unavailable: 'An item in your order is no longer available. You were not charged.',
        account_inactive: 'Your account is paused. Contact support to restore it.',
        too_many_active: 'You already have 3 orders in progress. Wait for one to arrive, then order again.',
        no_dasher: 'No dasher was free to take it in time. You were not charged. Please try again later.',
        admin: `Your order from ${after.storeName} was cancelled by DormDash support.`,
        insufficient_tokens: 'You don\'t have enough tokens for this order. You were not charged.',
        payment_timeout: `Your order from ${after.storeName} wasn't paid within 10 minutes, so it was cancelled. You were not charged.`,
      };
      const refundNote = wasPaid ? ' Your payment was returned to you as DormDash tokens.' : '';
      const studentToken = await getUserToken(studentId);
      if (studentToken) await sendPushNotification(
        studentToken,
        `${MARK.cancelled} Order cancelled`,
        (reasonText[after.cancelReason] ?? `Your order from ${after.storeName} was cancelled.`) + refundNote,
        { screen: `/(student)/order/${orderId}`, orderId }
      );

      if (dasherId) {
        const dasherToken = await getUserToken(dasherId);
        if (dasherToken) await sendPushNotification(
          dasherToken,
          `${MARK.cancelled} Order cancelled`,
          after.cancelReason === 'payment_timeout'
            ? `The customer didn't pay for the ${after.storeName} order in time, so it was cancelled. Don't buy it.`
            : after.cancelReason === 'admin'
              ? `The ${after.storeName} order was cancelled by DormDash support.`
              : `The ${after.storeName} order was cancelled by the customer.`,
          { screen: '/(dasher)/dash' }
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
      totalDeliveries: FieldValue.increment(1),
      totalEarnings: FieldValue.increment(Number(after.deliveryFee) || 0),
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

// ─── SESSION ENFORCEMENT ────────────────────────────────────────────────────
// isActive in Firestore is what admins toggle. This mirrors it into Firebase
// Auth: deactivated accounts are disabled (can't sign in or refresh a
// session) and their existing sessions are revoked, so a deactivated user is
// signed out within the hour on every device, not just on the next login.
export const onUserActiveChanged = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;
  const wasActive = before ? before.isActive !== false : true;
  const isActive = after.isActive !== false;
  if (wasActive === isActive) return;
  const uid = event.params.uid;
  try {
    await admin.auth().updateUser(uid, { disabled: !isActive });
    if (!isActive) await admin.auth().revokeRefreshTokens(uid);
    logger.info(`Auth ${isActive ? 'enabled' : 'disabled'} for ${uid}`);
  } catch (e) {
    logger.error(`Could not sync auth state for ${uid}`, e);
  }
});

// ─── ONE DEVICE, ONE ACCOUNT ───────────────────────────────────────────────
// A phone or browser has one push token. If someone signs in on a device
// where another account was used and never signed out, both user docs would
// hold the same token and the new person would receive the old account's
// order alerts. Whenever a token is saved, remove it from every other user.
export const onPushTokenChanged = onDocumentWritten('users/{uid}', async (event) => {
  const token = event.data?.after?.data()?.pushToken;
  const previous = event.data?.before?.data()?.pushToken;
  if (!token || token === previous) return;
  const uid = event.params.uid;
  const others = await db.collection('users').where('pushToken', '==', token).get();
  const stale = others.docs.filter(d => d.id !== uid);
  await Promise.all(stale.map(d => d.ref.update({ pushToken: null, pushTokenUpdatedAt: Date.now() })));
  if (stale.length) logger.info(`Push token moved to ${uid}; detached from ${stale.length} other account(s)`);
});

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
          update.studentNote = FieldValue.delete();
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
 
  // ── 3. Delete any files the user uploaded (Storage path users/{uid}/) ──
  // The app has no uploads yet; this keeps deletion complete if they're added.
  try {
    await admin.storage().bucket().deleteFiles({ prefix: `users/${uid}/` });
  } catch (e) {
    logger.warn(`Storage cleanup skipped for ${uid}`, e);
  }

  // ── 4. Delete the authentication account itself ─────────────────────────
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    logger.error(`Auth deletion failed for ${uid}`, e);
    throw new HttpsError('internal', 'Could not fully delete the account. Contact support.');
  }
 
  logger.info(`Account deleted: ${uid} (anonymised ${studentOrders} student / ${dasherOrders} dasher orders)`);
  return { ok: true, anonymisedOrders: studentOrders + dasherOrders };
});


// ─── STALE ORDER CLEANUP ────────────────────────────────────────────────────
// An order nobody accepts would otherwise sit on "Finding a dasher" forever.
// Every 5 minutes, cancel pending orders older than PENDING_TIMEOUT_MS. The
// cancel write triggers onOrderStatusChanged, which tells the student why.
const PENDING_TIMEOUT_MS = 30 * 60 * 1000;

export const cancelStalePendingOrders = onSchedule('every 5 minutes', async () => {
  const cutoff = Date.now() - PENDING_TIMEOUT_MS;
  const snap = await db.collection('orders').where('status', '==', 'pending').get();
  const stale = snap.docs.filter(d => Number(d.get('verifiedAt') ?? d.get('createdAt')) < cutoff);
  for (const d of stale) {
    // Transaction: skip it if a dasher accepted it in the meantime.
    await db.runTransaction(async tx => {
      const fresh = await tx.get(d.ref);
      if (fresh.get('status') !== 'pending') return;
      tx.update(d.ref, { status: 'cancelled', cancelReason: 'no_dasher', cancelledAt: Date.now() });
    });
  }
  if (stale.length) logger.info(`Auto-cancelled ${stale.length} order(s) nobody accepted in 30 min`);

  // Card orders a dasher accepted but the student never paid for.
  const now = Date.now();
  const accepted = await db.collection('orders').where('status', '==', 'accepted').get();
  const unpaid = accepted.docs.filter(d =>
    d.get('paymentMethod') === 'card' && d.get('paymentStatus') === 'awaiting_payment' &&
    Number(d.get('payDeadline')) > 0 && Number(d.get('payDeadline')) < now);
  for (const d of unpaid) {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(d.ref);
      if (fresh.get('status') !== 'accepted' || fresh.get('paymentStatus') !== 'awaiting_payment') return;
      tx.update(d.ref, { status: 'cancelled', cancelReason: 'payment_timeout', cancelledAt: Date.now() });
    });
  }
  if (unpaid.length) logger.info(`Cancelled ${unpaid.length} accepted order(s) not paid in time`);
});

