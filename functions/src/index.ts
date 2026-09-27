// functions/src/index.ts
// DormDash Cloud Functions.
//
// TARGETING FIXES IN THIS VERSION — "only the people it's for":
//   1. New orders no longer blast every dasher account. Only dashers who are
//      currently ONLINE (dashers/{uid}.isOnline) are notified. Online is a
//      sticky switch in the app, so there is no heartbeat or staleness cutoff.
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
//   • channelId 'default' so Android styles it as ours.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
// FieldValue comes from the modular import: the namespace versions
// (admin.firestore.FieldValue) are undefined inside the local emulator.
import { FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  reserveTokensAndVerify, chargeTokensOnAccept, settleCancelledOrder,
  migrateLegacyStoreFloats,
} from './payments';
import {
  MAX_ACTIVE_ORDERS, MAX_ITEMS_PER_ORDER, PAY_WINDOW_MS, PENDING_TIMEOUT_MS, minutes,
  ACTIVE_STATUSES, IN_DELIVERY_STATUSES, CancelReason,
} from './shared';
export { createPayment, wipayReturn, adminAdjustTokens, adminAdjustFloat, payOrderWithTokens } from './payments';
import { alertStore } from './storeAlerts';
export { storeAlertsAdmin } from './storeAlerts';
 
const CHUNK = 400; // Firestore batches cap at 500 writes

if (!admin.apps.length) admin.initializeApp(); // payments.ts may have done it already

const db = admin.firestore();

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

// SPEED: pushes go out in batches. Before, every phone was its own request
// (1,000 online dashers = 1,000 requests for one new order). Now web pushes
// go 500 per request and native (Expo) pushes 100 per request, so a new
// order reaches every dasher in one or two round trips.
type Push = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  ttlSeconds?: number; // how long FCM keeps trying if the phone is offline
};

// Browser unsubscribed or token expired: detach it so we stop trying.
async function removeDeadWebToken(storedToken: string): Promise<void> {
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
    token: storedToken.slice(WEB_TOKEN_PREFIX.length, WEB_TOKEN_PREFIX.length + 16),
  }));
}

async function sendWebPushes(pushes: Push[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < pushes.length; i += 500) {
    const chunk = pushes.slice(i, i + 500);
    try {
      // Data-only message: public/sw.js builds the notification itself, so
      // it can show the in-app banner instead when DormDash is open.
      const res = await admin.messaging().sendEach(chunk.map(p => ({
        token: p.token.slice(WEB_TOKEN_PREFIX.length),
        data: { ...(p.data ?? {}), title: p.title, body: p.body },
        webpush: { headers: { Urgency: 'high', TTL: String(p.ttlSeconds ?? 3600) } },
      })));
      const dead: string[] = [];
      res.responses.forEach((r, k) => {
        if (r.success) return;
        failed++;
        const code = r.error?.code ?? '';
        logger.error('Web push failed', { code, message: r.error?.message });
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') dead.push(chunk[k].token);
      });
      await Promise.all(dead.map(removeDeadWebToken));
    } catch (err: any) {
      failed += chunk.length;
      logger.error('Web push batch failed', { code: err?.code, message: err?.message });
    }
  }
  return failed;
}

async function sendExpoPushes(pushes: Push[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < pushes.length; i += 100) {
    const chunk = pushes.slice(i, i + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk.map(p => ({
          to: p.token, sound: 'default', title: p.title, body: p.body,
          data: p.data ?? {}, channelId: 'default', priority: 'high',
          ttl: p.ttlSeconds ?? 3600,
        }))),
      });
      const result: any = await response.json();
      if (result.errors) {
        failed += chunk.length;
        logger.error('Expo push API error', { errors: result.errors });
        continue;
      }
      (Array.isArray(result.data) ? result.data : []).forEach((r: any, k: number) => {
        if (r?.status !== 'error') return;
        failed++;
        logger.error('Push notification failed', {
          token: chunk[k].token.slice(0, 24), error: r.message, errorType: r.details?.error,
        });
      });
    } catch (err: any) {
      failed += chunk.length;
      logger.error('Expo push batch failed', { message: err?.message });
    }
  }
  return failed;
}

/** Sends every push at once (web and native in parallel) and logs how long it took. */
async function sendPushes(pushes: Push[], label: string): Promise<void> {
  const list = pushes.filter(p => !!p.token);
  if (!list.length) return;
  const started = Date.now();
  const web = list.filter(p => p.token.startsWith(WEB_TOKEN_PREFIX));
  const expo = list.filter(p => !p.token.startsWith(WEB_TOKEN_PREFIX));
  const [webFailed, expoFailed] = await Promise.all([sendWebPushes(web), sendExpoPushes(expo)]);
  logger.info('Push sent', {
    label, sent: list.length - webFailed - expoFailed,
    failed: webFailed + expoFailed, sendMs: Date.now() - started,
  });
}

async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  label = 'push'
): Promise<void> {
  await sendPushes([{ token, title, body, data }], label);
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
// SPEED: this used to read every active order on campus, then look up
// dashers 30 at a time, one after another. With 1,000 dashers that was 34
// round trips in a row plus a read that grew with every order. Now:
//   1. one query for online dashers (only the activeOrderId field), and
//   2. one parallel batch read of their user docs (only 3 small fields).
// "Busy" comes from dashers/{uid}.activeOrderId, which this file keeps up to
// date when an order is accepted and when it finishes (see setDasherBusy).
async function getEligibleDasherTokens(excludeUid?: string): Promise<string[]> {
  // No "last seen" cutoff: a dasher stays online until they switch off or
  // sign out, and gets new orders as push notifications with the app closed.
  const dasherSnap = await db.collection('dashers')
    .where('isOnline', '==', true)
    .select('activeOrderId')
    .get();

  const freeRefs = dasherSnap.docs
    .filter(d => d.id !== excludeUid)          // don't ping the customer
    .filter(d => !d.get('activeOrderId'))      // mid-delivery: can't accept
    .map(d => db.collection('users').doc(d.id));
  if (freeRefs.length === 0) return [];

  const chunks: admin.firestore.DocumentReference[][] = [];
  for (let i = 0; i < freeRefs.length; i += 300) chunks.push(freeRefs.slice(i, i + 300));
  const results = await Promise.all(chunks.map(c =>
    db.getAll(...c, { fieldMask: ['pushToken', 'isActive', 'role'] })));

  const tokens: string[] = [];
  results.flat().forEach(doc => {
    const u = doc.data();
    if (!u || u.isActive === false) return;
    if (u.role !== 'dasher') return;          // belt and braces
    if (u.pushToken) tokens.push(u.pushToken);
  });
  return [...new Set(tokens)]; // never alert the same device twice
}

// Marks a dasher busy (orderId) or free (null). Free only clears the order
// it was told about, so a late "cancelled" can't free a dasher who has
// since taken another order. A missing dasher doc is ignored.
async function setDasherBusy(dasherId: string, orderId: string, busy: boolean): Promise<void> {
  const ref = db.collection('dashers').doc(dasherId);
  try {
    if (busy) {
      await ref.update({ activeOrderId: orderId });
      return;
    }
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.get('activeOrderId') === orderId) {
        tx.update(ref, { activeOrderId: null });
      }
    });
  } catch (e: any) {
    if (e?.code !== 5) logger.warn('Could not update dasher busy flag', { dasherId, orderId, message: e?.message });
  }
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
// MAX_ITEMS_PER_ORDER and MAX_ACTIVE_ORDERS come from ./shared (the app uses
// the same values). The rest are server-only.
const MAX_ORDERS_PER_WINDOW = 5;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const ORDER_WINDOW_MS = 10 * 60 * 1000;

// The only orders verifyNewOrder needs to look at: the student's orders that
// are still in progress, plus ones the server verified in the last
// ORDER_WINDOW_MS. SPEED: this used to read the student's whole order history,
// which gets slower every week they use DormDash. Two small queries run in
// parallel instead. The second needs the index in firestore.indexes.json; if
// that index is still building, fall back to the old full read so nothing
// breaks while it finishes.
const ORDER_FIELDS = ['createdAt', 'verifiedAt', 'status', 'cancelReason', 'storeId', 'items'];
async function getRecentOrdersForStudent(studentId: string): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const orders = db.collection('orders');
  try {
    const [activeSnap, recentSnap] = await Promise.all([
      orders.where('studentId', '==', studentId)
        .where('status', 'in', ACTIVE_STATUSES)
        .select(...ORDER_FIELDS).get(),
      orders.where('studentId', '==', studentId)
        .where('verifiedAt', '>', Date.now() - ORDER_WINDOW_MS)
        .select(...ORDER_FIELDS).get(),
    ]);
    const byId = new Map<string, admin.firestore.QueryDocumentSnapshot>();
    [...activeSnap.docs, ...recentSnap.docs].forEach(d => byId.set(d.id, d));
    return [...byId.values()];
  } catch (e: any) {
    if (e?.code !== 9) throw e; // 9 = index missing or still building
    logger.warn('Order index not ready, using full history read', { studentId });
    const all = await orders.where('studentId', '==', studentId).select(...ORDER_FIELDS).get();
    return all.docs;
  }
}

async function verifyNewOrder(
  ref: admin.firestore.DocumentReference,
  order: admin.firestore.DocumentData
): Promise<admin.firestore.DocumentData | null> {
  const cancel = async (reason: CancelReason) => {
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

  const mine = { docs: await getRecentOrdersForStudent(String(order.studentId ?? '')) };

  // Up to MAX_ACTIVE_ORDERS in progress per student, plus duplicate
  // protection (a burst of taps once created 9 identical orders in half a
  // second). Every copy of this function sees the same set of orders and
  // uses the same ordering (createdAt, then id), so they all agree.
  const myCreated = Number(order.createdAt) || 0;
  const isEarlier = (d: admin.firestore.QueryDocumentSnapshot) => {
    const c = Number(d.get('createdAt')) || 0;
    return c < myCreated || (c === myCreated && d.id < ref.id);
  };
  const isActive = (d: admin.firestore.QueryDocumentSnapshot) =>
    ACTIVE_STATUSES.includes(d.get('status'));
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

  for (const line of items) {
    const qty = Number(line?.quantity);
    const itemId = String(line?.menuItem?.id ?? '');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEMS_PER_ORDER || !itemId) {
      return cancel('invalid_item');
    }
  }
  // SPEED: every menu item in one batch read instead of one read per line.
  const itemIds = [...new Set(items.map(l => String(l.menuItem.id)))];
  const itemSnaps = await db.getAll(...itemIds.map(id => storeSnap.ref.collection('menuItems').doc(id)));
  const itemById = new Map(itemSnaps.map(snap => [snap.id, snap]));

  let count = 0;
  let subtotal = 0;
  const cleanItems = [];
  for (const line of items) {
    const qty = Number(line.quantity);
    const itemId = String(line.menuItem.id);
    const itemSnap = itemById.get(itemId);
    if (!itemSnap || !itemSnap.exists || itemSnap.data()?.isAvailable === false) return cancel('item_unavailable');
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
    // Only publish if the order is still pending: the student may have
    // cancelled while it was being checked, and dashers must not be alerted
    // about an order that no longer exists.
    const published = await db.runTransaction(async tx => {
      const fresh = (await tx.get(ref)).data();
      if (!fresh || fresh.status !== 'pending') return false;
      tx.update(ref, verified);
      return true;
    });
    if (!published) return null;
  }
  return { ...order, ...verified };
}

// ─── TRIGGER: ORDER WRITTEN ────────────────────────────────────────────────
// SPEED: this is the hottest function in DormDash (it runs on every order
// change), so it gets its own settings:
//   • cpu 1 + concurrency 40: one warm copy handles 40 orders at the same
//     time instead of starting a new copy (a "cold start", 2–5 s) for each.
//   • minInstances 1: one copy is always awake, so the first order of the
//     morning is as fast as the rest. Costs roughly US$10–20 a month.
//   • maxInstances 20: a ceiling so a runaway loop can't run up a big bill.
// Every step below that doesn't depend on the one before runs in parallel.
export const onOrderStatusChanged = onDocumentWritten(
  {
    document: 'orders/{orderId}',
    cpu: 1,
    memory: '512MiB',
    concurrency: 40,
    minInstances: 1,
    maxInstances: 20,
  },
  async (event) => {
    const before = event.data?.before?.data();
    let after = event.data?.after?.data();
    const orderId = event.params.orderId;

    if (!after) return;

    const statusChanged = !before || before.status !== after.status;
    const isNewOrder = !before && after.status === 'pending';

    const studentId: string = after.studentId;
    const dasherId: string | undefined = after.dasherId;
    const ref = event.data!.after!.ref;

    // How long Firebase took to hand us this change. If this number climbs,
    // the function is falling behind (see "Trigger lag" in the logs).
    const lagMs = event.time ? Date.now() - Date.parse(event.time) : undefined;
    if (statusChanged) {
      logger.info('Trigger lag', { orderId, status: after.status, lagMs });
    }

    // ── NEW ORDER: only eligible dashers ──────────────────────────────────
    if (isNewOrder) {
      const started = Date.now();
      // Start finding dashers while the order is being checked: both only
      // read, so neither slows the other down.
      const tokensPromise = getEligibleDasherTokens(studentId);
      tokensPromise.catch(() => {}); // avoid an unhandled rejection if we bail early
      const checked = await verifyNewOrder(ref, after);
      if (!checked) return; // cancelled; the cancel write re-triggers and notifies the student
      after = checked;
      const tokens = await tokensPromise;
      await sendPushes(tokens.map(token => ({
        token,
        title: `${MARK.newOrder} New order available`,
        body: `${after!.storeName} — ${jmd(after!.deliveryFee)} to deliver`,
        data: { screen: '/(dasher)/dash', orderId },
        ttlSeconds: 600, // an order alert older than 10 minutes is useless
      })), 'new_order');
      logger.info(`New order ${orderId}: notified ${tokens.length} eligible dashers`, {
        orderId, dashers: tokens.length, handleMs: Date.now() - started, lagMs,
      });
      return;
    }

    // ── PAYMENT RECEIVED (card or tokens, chosen after accept): tell the
    //    dasher to go ahead ─────────────────────────────────────────────────
    if (!statusChanged && before?.paymentStatus === 'awaiting_payment' && after.paymentStatus === 'paid' &&
        dasherId) {
      // The order is now confirmed: the store starts making it.
      const storeAlert = alertStore(after, orderId, 'confirmed');
      const token = await getUserToken(dasherId);
      if (token) await sendPushNotification(
        token,
        `${MARK.assigned} Payment received`,
        `The customer paid for the ${after.storeName} order. Go ahead and pick it up.`,
        { screen: '/(dasher)/dash', orderId },
        'payment_received'
      );
      await storeAlert;
      return;
    }

    if (!statusChanged) return;

    // ── STATUS UPDATES: the customer only ─────────────────────────────────
    if (after.status === 'accepted') {
      // The dasher is now busy: stop sending them new-order alerts.
      const busy = dasherId ? setDasherBusy(dasherId, orderId, true) : Promise.resolve();
      const tokenPromise = getUserToken(studentId);

      if (after.paymentMethod === 'tokens') {
        const [token, charged] = await Promise.all([tokenPromise, chargeTokensOnAccept(ref), busy]);
        // Paid with tokens the moment the dasher accepted: tell the store.
        const storeAlert = charged ? alertStore(after, orderId, 'confirmed') : Promise.resolve();
        if (token) await sendPushNotification(
          token,
          `${MARK.assigned} Dasher assigned`,
          `${after.dasherName} accepted your order and is heading to ${after.storeName}. Paid with tokens.`,
          { screen: `/(student)/order/${orderId}`, orderId },
          'accepted'
        );
        await storeAlert;
        return;
      }

      if (after.paymentMethod === 'card' && after.paymentStatus === 'unpaid') {
        const [token] = await Promise.all([
          tokenPromise,
          ref.update({ paymentStatus: 'awaiting_payment', payDeadline: Date.now() + PAY_WINDOW_MS }),
          busy,
        ]);
        if (token) await sendPushNotification(
          token,
          `${MARK.assigned} Pay now to confirm`,
          `${after.dasherName} accepted your order. Pay ${jmd(after.totalAmount)} with your tokens or card within ${minutes(PAY_WINDOW_MS)} minutes, or it will be cancelled.`,
          { screen: `/(student)/order/${orderId}`, orderId },
          'accepted_pay_now'
        );
        return;
      }

      const [token] = await Promise.all([tokenPromise, busy]);
      if (token) await sendPushNotification(
        token,
        `${MARK.assigned} Dasher assigned`,
        `${after.dasherName} accepted your order and is heading to ${after.storeName}.`,
        { screen: `/(student)/order/${orderId}`, orderId },
        'accepted'
      );
      return;
    }

    if (after.status === 'picking_up') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.pickingUp} Picking up your order`,
        `${after.dasherName} is at ${after.storeName} collecting your items.`,
        { screen: `/(student)/order/${orderId}`, orderId },
        'picking_up'
      );
      return;
    }

    if (after.status === 'on_the_way') {
      const token = await getUserToken(studentId);
      if (token) await sendPushNotification(
        token,
        `${MARK.onTheWay} On the way`,
        `${after.dasherName} is heading to you now.`,
        { screen: `/(student)/order/${orderId}`, orderId },
        'on_the_way'
      );
      return;
    }

    if (after.status === 'delivered') {
      // The dasher is free again (new-order alerts resume) and is credited
      // for the delivery (once, see creditDasherForDelivery).
      const [token] = await Promise.all([
        getUserToken(studentId),
        dasherId ? setDasherBusy(dasherId, orderId, false) : Promise.resolve(),
        dasherId ? creditDasherForDelivery(ref, dasherId) : Promise.resolve(),
      ]);
      if (token) await sendPushNotification(
        token,
        `${MARK.delivered} Delivered`,
        `Your order from ${after.storeName} has arrived. Enjoy.`,
        { screen: `/(student)/order/${orderId}`, orderId },
        'delivered'
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
      // The store only heard about orders that were paid and had a dasher,
      // so only those get a "don't make it" alert.
      const storeWasTold = before?.paymentStatus === 'paid' &&
        IN_DELIVERY_STATUSES.includes(before?.status);
      const [, studentToken, dasherToken] = await Promise.all([
        storeWasTold ? alertStore(after, orderId, 'cancelled') : Promise.resolve(),
        after.cancelReason === 'duplicate_order' ? Promise.resolve(null) : getUserToken(studentId),
        dasherId ? getUserToken(dasherId) : Promise.resolve(null),
        settleCancelledOrder(ref),
        dasherId ? setDasherBusy(dasherId, orderId, false) : Promise.resolve(),
      ]);
      if (after.cancelReason === 'duplicate_order') return;

      const reasonText: Record<string, string> = {
        rate_limited: 'Too many orders in a short time. Try again in a few minutes.',
        store_closed: `${after.storeName} closed before your order went through. You were not charged.`,
        item_unavailable: 'An item in your order is no longer available. You were not charged.',
        account_inactive: 'Your account is paused. Contact support to restore it.',
        too_many_active: `You already have ${MAX_ACTIVE_ORDERS} orders in progress. Wait for one to arrive, then order again.`,
        no_dasher: 'No dasher was free to take it in time. You were not charged. Please try again later.',
        admin: `Your order from ${after.storeName} was cancelled by DormDash support.`,
        insufficient_tokens: 'You don\'t have enough tokens for this order. You were not charged.',
        payment_timeout: `Your order from ${after.storeName} wasn't paid within ${minutes(PAY_WINDOW_MS)} minutes, so it was cancelled. You were not charged.`,
      };
      const refundNote = wasPaid ? ' Your payment was returned to you as DormDash tokens.' : '';

      // Both alerts go out in the same round trip.
      const pushes: Push[] = [];
      if (studentToken) pushes.push({
        token: studentToken,
        title: `${MARK.cancelled} Order cancelled`,
        body: (reasonText[after.cancelReason] ?? `Your order from ${after.storeName} was cancelled.`) + refundNote,
        data: { screen: `/(student)/order/${orderId}`, orderId },
      });
      if (dasherId && dasherToken) pushes.push({
        token: dasherToken,
        title: `${MARK.cancelled} Order cancelled`,
        body: after.cancelReason === 'payment_timeout'
          ? `The customer didn't pay for the ${after.storeName} order in time, so it was cancelled. Don't buy it.`
          : after.cancelReason === 'admin'
            ? `The ${after.storeName} order was cancelled by DormDash support.`
            : `The ${after.storeName} order was cancelled by the customer.`,
        data: { screen: '/(dasher)/dash' },
      });
      await sendPushes(pushes, 'cancelled');
      return;
    }
  }
);

// Minutes from order to doorstep, stored on the order so the admin dashboard
// can average it with an aggregation query instead of reading every order.
function deliveryMinsOf(order: admin.firestore.DocumentData): { deliveryMins?: number } {
  const ms = Number(order.deliveredAt) - Number(order.createdAt);
  return Number.isFinite(ms) && ms >= 0 ? { deliveryMins: Math.round(ms / 60000) } : {};
}

// ─── DELIVERY COMPLETED → credit the dasher ────────────────────────────────
// Called from onOrderStatusChanged's delivered branch (server-written stats
// are tamper-proof). Triggers are delivered at least once, so a retry could
// run this twice for the same delivery: the credit and a dasherCreditedAt
// mark on the order are written in one transaction, and a second run sees
// the mark and stops. The mark's write re-triggers onOrderStatusChanged,
// which ignores it (status unchanged).
async function creditDasherForDelivery(orderRef: admin.firestore.DocumentReference, dasherId: string): Promise<void> {
  const credited = await db.runTransaction(async tx => {
    const fresh = (await tx.get(orderRef)).data();
    if (!fresh || fresh.status !== 'delivered' || fresh.dasherCreditedAt) return false;
    tx.set(db.collection('dashers').doc(dasherId), {
      totalDeliveries: FieldValue.increment(1),
      totalEarnings: FieldValue.increment(Number(fresh.deliveryFee) || 0),
    }, { merge: true });
    tx.update(orderRef, { dasherCreditedAt: Date.now(), ...deliveryMinsOf(fresh) });
    return true;
  });
  if (credited) logger.info(`Credited dasher ${dasherId} for order ${orderRef.id}`);
  else logger.info(`Dasher already credited for order ${orderRef.id}, skipped`);
}

// ─── TRIGGER: USER WRITTEN ─────────────────────────────────────────────────
// One trigger for users/{uid} (it used to be three functions, each started
// on every user write). Each job checks whether its field changed and
// returns at once if not; one failing doesn't stop the others.

// New user → admins only.
async function notifyAdminsOfNewUser(uid: string, user: admin.firestore.DocumentData): Promise<void> {
  const adminSnapshot = await db.collection('users').where('role', '==', 'admin').get();
  const pushes: Push[] = [];
  adminSnapshot.forEach(doc => {
    if (doc.id === uid) return;   // don't notify yourself
    const token = doc.data().pushToken;
    if (token) pushes.push({
      token,
      title: `${MARK.newUser} New user joined`,
      body: `${user.name} registered as a ${user.role}.`,
      data: { screen: '/(admin)/(tabs)/users' },
    });
  });
  await sendPushes(pushes, 'new_user');
}

// Session enforcement. isActive in Firestore is what admins toggle. This
// mirrors it into Firebase Auth: deactivated accounts are disabled (can't
// sign in or refresh a session) and their existing sessions are revoked, so
// a deactivated user is signed out within the hour on every device.
async function syncAuthActive(uid: string, isActive: boolean): Promise<void> {
  await admin.auth().updateUser(uid, { disabled: !isActive });
  if (!isActive) await admin.auth().revokeRefreshTokens(uid);
  logger.info(`Auth ${isActive ? 'enabled' : 'disabled'} for ${uid}`);
}

// One device, one account. A phone or browser has one push token. If
// someone signs in on a device where another account was used and never
// signed out, both user docs would hold the same token and the new person
// would receive the old account's order alerts. Whenever a token is saved,
// remove it from every other user.
async function detachTokenFromOtherUsers(uid: string, token: string): Promise<void> {
  const others = await db.collection('users').where('pushToken', '==', token).get();
  const stale = others.docs.filter(d => d.id !== uid);
  await Promise.all(stale.map(d => d.ref.update({ pushToken: null, pushTokenUpdatedAt: Date.now() })));
  if (stale.length) logger.info(`Push token moved to ${uid}; detached from ${stale.length} other account(s)`);
}

export const onUserWritten = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return; // deleted
  const uid = event.params.uid;

  const jobs: Promise<void>[] = [];
  if (!before) jobs.push(notifyAdminsOfNewUser(uid, after));

  const wasActive = before ? before.isActive !== false : true;
  const isActive = after.isActive !== false;
  if (wasActive !== isActive) jobs.push(syncAuthActive(uid, isActive));

  if (after.pushToken && after.pushToken !== before?.pushToken) {
    jobs.push(detachTokenFromOtherUsers(uid, after.pushToken));
  }

  const results = await Promise.allSettled(jobs);
  results.forEach(r => {
    if (r.status === 'rejected') logger.error(`User trigger job failed for ${uid}`, { message: r.reason?.message });
  });
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
    .where('status', 'in', ACTIVE_STATUSES)
    .limit(1).get();
 
  const liveAsDasher = await db.collection('orders')
    .where('dasherId', '==', uid)
    .where('status', 'in', IN_DELIVERY_STATUSES)
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


// ─── ONLINE DASHER COUNT ───────────────────────────────────────────────────
// dashers/* is private (earnings, floats), so checkout can't count online
// dashers itself. It reads publicStats/app instead, which this keeps current.
// Recounting (rather than +1/-1) means the number can never drift.
async function refreshOnlineDasherCount(): Promise<void> {
  const agg = await db.collection('dashers').where('isOnline', '==', true).count().get();
  await db.collection('publicStats').doc('app').set(
    { onlineDashers: agg.data().count, updatedAt: Date.now() }, { merge: true });
}

export const onDasherOnlineChanged = onDocumentWritten('dashers/{uid}', async (event) => {
  const wasOnline = event.data?.before?.data()?.isOnline === true;
  const isOnline = event.data?.after?.data()?.isOnline === true;
  if (wasOnline === isOnline) return; // stat updates, old-app heartbeats
  await refreshOnlineDasherCount();
});

// ─── ONE-TIME MIGRATIONS ───────────────────────────────────────────────────
// Runs by itself after deploy; each step records itself in meta/migrations
// and never runs again. Once the logs show every step done, this function
// can be deleted.
export const runMigrations = onSchedule('every 10 minutes', async () => {
  const ref = db.collection('meta').doc('migrations');
  const done = (await ref.get()).data() ?? {};
  if (!done.storeFloatsV1) {
    const moved = await migrateLegacyStoreFloats();
    await ref.set({ storeFloatsV1: Date.now() }, { merge: true });
    logger.info(`Migration storeFloatsV1: moved ${moved} store float(s) off public store docs`);
  }
  if (!done.deliveryMinsV1) {
    // Delivered orders from before deliveryMins existed.
    const delivered = await db.collection('orders').where('status', '==', 'delivered').get();
    const missing = delivered.docs.filter(d => d.get('deliveryMins') === undefined && deliveryMinsOf(d.data()).deliveryMins !== undefined);
    for (let i = 0; i < missing.length; i += CHUNK) {
      const batch = db.batch();
      missing.slice(i, i + CHUNK).forEach(d => batch.update(d.ref, deliveryMinsOf(d.data())));
      await batch.commit();
    }
    await ref.set({ deliveryMinsV1: Date.now() }, { merge: true });
    logger.info(`Migration deliveryMinsV1: backfilled ${missing.length} delivered order(s)`);
  }
  if (!done.onlineDasherCountV1) {
    await refreshOnlineDasherCount();
    await ref.set({ onlineDasherCountV1: Date.now() }, { merge: true });
    logger.info('Migration onlineDasherCountV1: seeded publicStats/app');
  }
});

// ─── STALE ORDER CLEANUP ────────────────────────────────────────────────────
// An order nobody accepts would otherwise sit on "Finding a dasher" forever.
// Every 5 minutes, cancel pending orders older than PENDING_TIMEOUT_MS. The
// cancel write triggers onOrderStatusChanged, which tells the student why.

// SPEED: only overdue orders are read. This used to read every pending and
// every accepted order every 5 minutes and filter them here. Each query
// needs an index (firestore.indexes.json); while one is still building, it
// falls back to the old full read so nothing is missed.
type Snap = admin.firestore.QueryDocumentSnapshot;
async function overdue(fast: () => Promise<Snap[]>, full: () => Promise<Snap[]>, label: string): Promise<Snap[]> {
  try {
    return await fast();
  } catch (e: any) {
    if (e?.code !== 9) throw e; // 9 = index missing or still building
    logger.warn(`Index for ${label} not ready, using full read`);
    return full();
  }
}

async function cancelOverdueOrders(now = Date.now()): Promise<{ noDasher: number; unpaid: number }> {
  const orders = db.collection('orders');
  const pending = orders.where('status', '==', 'pending');
  const cutoff = now - PENDING_TIMEOUT_MS;
  const isStale = (d: Snap) => Number(d.get('verifiedAt') ?? d.get('createdAt')) < cutoff;

  // verifiedAt is the server's clock; createdAt comes from the phone. Both
  // queries together find exactly the orders the old full read did.
  const staleDocs = await overdue(async () => {
    const [byCreated, byVerified] = await Promise.all([
      pending.where('createdAt', '<', cutoff).get(),
      pending.where('verifiedAt', '<', cutoff).get(),
    ]);
    const byId = new Map<string, Snap>();
    [...byCreated.docs, ...byVerified.docs].forEach(d => byId.set(d.id, d));
    return [...byId.values()];
  }, async () => (await pending.get()).docs, 'stale pending orders');
  const stale = staleDocs.filter(isStale);

  // All at once rather than one after another (each is its own transaction:
  // skipped if a dasher accepted it in the meantime).
  await Promise.all(stale.map(d => db.runTransaction(async tx => {
    const fresh = await tx.get(d.ref);
    if (fresh.get('status') !== 'pending') return;
    tx.update(d.ref, { status: 'cancelled', cancelReason: 'no_dasher', cancelledAt: Date.now() });
  }).catch(e => logger.warn('Auto-cancel failed', { orderId: d.id, message: e?.message }))));
  if (stale.length) logger.info(`Auto-cancelled ${stale.length} order(s) nobody accepted in ${minutes(PENDING_TIMEOUT_MS)} min`);

  // Card orders a dasher accepted but the student never paid for.
  const isUnpaid = (d: Snap) =>
    d.get('status') === 'accepted' && d.get('paymentMethod') === 'card' &&
    d.get('paymentStatus') === 'awaiting_payment' &&
    Number(d.get('payDeadline')) > 0 && Number(d.get('payDeadline')) < now;
  const unpaidDocs = await overdue(
    async () => (await orders.where('paymentStatus', '==', 'awaiting_payment').where('payDeadline', '<', now).get()).docs,
    async () => (await orders.where('status', '==', 'accepted').get()).docs,
    'unpaid orders');
  const unpaid = unpaidDocs.filter(isUnpaid);
  await Promise.all(unpaid.map(d => db.runTransaction(async tx => {
    const fresh = await tx.get(d.ref);
    if (fresh.get('status') !== 'accepted' || fresh.get('paymentStatus') !== 'awaiting_payment') return;
    tx.update(d.ref, { status: 'cancelled', cancelReason: 'payment_timeout', cancelledAt: Date.now() });
  }).catch(e => logger.warn('Payment-timeout cancel failed', { orderId: d.id, message: e?.message }))));
  if (unpaid.length) logger.info(`Cancelled ${unpaid.length} accepted order(s) not paid in time`);

  return { noDasher: stale.length, unpaid: unpaid.length };
}

export const cancelStalePendingOrders = onSchedule('every 5 minutes', async () => {
  await cancelOverdueOrders();
});
