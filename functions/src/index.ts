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
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import {
  reserveTokensAndVerify, chargeTokensOnAccept, settleCancelledOrder,
  migrateLegacyStoreFloats, retryVerifiedPayments,
} from './payments';
import {
  MAX_ACTIVE_ORDERS, MAX_ITEMS_PER_ORDER, PAY_WINDOW_MS, PENDING_TIMEOUT_MS, minutes,
  DASHER_IDLE_NUDGE_MS, DASHER_IDLE_GRACE_MS,
  OFFER_WAVE_SIZE, OFFER_WAVE_MS, OFFER_OPEN_WAVE, orderPayoutJmd,
  ACTIVE_STATUSES, IN_DELIVERY_STATUSES, CancelReason,
} from './shared';
export { createPayment, wipayReturn, adminAdjustTokens, adminAdjustFloat, payOrderWithTokens, adminResolvePayment } from './payments';
import { alertStore } from './storeAlerts';
import { APP_CHECK } from './appCheck';
import { Push, sendPushes, sendPushNotification, getUserToken, jmd } from './push';
import { matchGroups, expireOldGroups } from './groups';
import { dropPoint, quoteDelivery } from './campus';
export { storeAlertsAdmin } from './storeAlerts';
export { setGroupSearch, acceptOrderGroup } from './groups';
 
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



// ─── Which dashers can take a new order ────────────────────────────────────
// SPEED: this used to read every active order on campus, then look up
// dashers 30 at a time, one after another. With 1,000 dashers that was 34
// round trips in a row plus a read that grew with every order. Now:
//   1. one query for online dashers (two small fields), and
//   2. one parallel batch read of their user docs (only 3 small fields).
// "Busy" comes from dashers/{uid}.activeOrderId, which this file keeps up to
// date when an order is accepted and when it finishes (see setDasherBusy).
type FreeDasher = { uid: string; token: string | null; lastOfferedAt: number };

async function getFreeDashers(excludeUid?: string): Promise<FreeDasher[]> {
  // No "last seen" cutoff here: a dasher stays online until they switch off
  // (or retireIdleDashers does), and gets new orders as push notifications
  // with the app closed.
  const dasherSnap = await db.collection('dashers')
    .where('isOnline', '==', true)
    .select('activeOrderId', 'lastOfferedAt')
    .get();

  const free = dasherSnap.docs
    .filter(d => d.id !== excludeUid)          // don't ping the customer
    .filter(d => !d.get('activeOrderId'));     // mid-delivery: can't accept
  if (free.length === 0) return [];
  const lastOffered = new Map(free.map(d => [d.id, Number(d.get('lastOfferedAt')) || 0]));
  const refs = free.map(d => db.collection('users').doc(d.id));

  const chunks: admin.firestore.DocumentReference[][] = [];
  for (let i = 0; i < refs.length; i += 300) chunks.push(refs.slice(i, i + 300));
  const results = await Promise.all(chunks.map(c =>
    db.getAll(...c, { fieldMask: ['pushToken', 'isActive', 'role'] })));

  const seenTokens = new Set<string>();
  const out: FreeDasher[] = [];
  results.flat().forEach(doc => {
    const u = doc.data();
    if (!u || u.isActive === false) return;
    if (u.role !== 'dasher') return;          // belt and braces
    // Never alert the same device twice (a phone shared by two accounts).
    const token = u.pushToken && !seenTokens.has(u.pushToken) ? String(u.pushToken) : null;
    if (token) seenTokens.add(token);
    out.push({ uid: doc.id, token, lastOfferedAt: lastOffered.get(doc.id) ?? 0 });
  });
  return out;
}

// The dasher's busy flag. activeOrderId is set while they have any order in
// delivery (getFreeDashers, the accept rule and the idle check test it);
// activeOrderIds lists every one of them, since a group (groups.ts) is
// several orders at once. Docs from before groups have only activeOrderId.
const busyIds = (d: admin.firestore.DocumentData | undefined): string[] =>
  Array.isArray(d?.activeOrderIds) ? d!.activeOrderIds.map(String)
    : d?.activeOrderId ? [String(d.activeOrderId)] : [];

// Frees one order from the dasher's busy list. Only that order is removed,
// so a late "cancelled" can't free a dasher who has since taken another
// order, and the rest of a group keeps them busy. A missing dasher doc is
// ignored.
async function setDasherBusy(dasherId: string, orderId: string, busy: boolean): Promise<void> {
  const ref = db.collection('dashers').doc(dasherId);
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const ids = busyIds(snap.data());
      const next = busy
        ? (ids.includes(orderId) ? ids : [...ids, orderId])
        : ids.filter(id => id !== orderId);
      if (next.length === ids.length && next.every((id, i) => id === ids[i]) && snap.get('activeOrderId') === (next[0] ?? null)) return;
      tx.update(ref, { activeOrderId: next[0] ?? null, activeOrderIds: next });
    });
  } catch (e: any) {
    if (e?.code !== 5) logger.warn('Could not update runner busy flag', { dasherId, orderId, message: e?.message });
  }
}

/**
 * A dasher accepted this order: mark them busy, unless they are already
 * delivering a different order that isn't part of the same group. Then the
 * accept is undone (the order goes back to pending for other dashers) and
 * this returns false. The app and the Firestore rules already stop a second
 * accept; this catches two accepts sent at the same moment by a script.
 */
async function claimDasherForOrder(
  dasherId: string, orderRef: admin.firestore.DocumentReference,
): Promise<boolean> {
  const dRef = db.collection('dashers').doc(dasherId);
  return db.runTransaction(async tx => {
    const [dSnap, oSnap] = await Promise.all([tx.get(dRef), tx.get(orderRef)]);
    const order = oSnap.data();
    if (!order || order.status !== 'accepted' || order.dasherId !== dasherId) return true; // moved on
    const ids = busyIds(dSnap.data()).filter(id => id !== orderRef.id);
    const others = ids.length
      ? (await tx.getAll(...ids.map(id => db.collection('orders').doc(id)))).filter(s =>
        s.get('dasherId') === dasherId && IN_DELIVERY_STATUSES.includes(s.get('status')))
      : [];
    const clash = others.some(s => !order.groupId || s.get('groupId') !== order.groupId);
    if (clash) {
      tx.update(orderRef, {
        status: 'pending', dasherId: FieldValue.delete(), dasherName: FieldValue.delete(),
        acceptedAt: FieldValue.delete(),
      });
      return false;
    }
    if (!dSnap.exists) return true;
    const next = [...others.map(s => s.id), orderRef.id];
    tx.update(dRef, { activeOrderId: next[0], activeOrderIds: next });
    return true;
  });
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

// When Firestore created the document (server clock). createdAt comes from
// the phone and can be set to anything: an order backdated to 1970 used to
// count as "earliest" and skip the active-order, duplicate and rate limits.
// Order docs from the trigger and from queries both carry createTime.
const createdMsOf = (d: { createTime?: admin.firestore.Timestamp; get(k: string): any }) =>
  d.createTime ? d.createTime.toMillis() : (Number(d.get('createdAt')) || 0);

async function verifyNewOrder(
  ref: admin.firestore.DocumentReference,
  order: admin.firestore.DocumentData,
  dispatch: Record<string, unknown> = {},
  createdMs: number = Number(order.createdAt) || 0,
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
  // uses the same ordering (server create time, then id), so they all agree.
  const myCreated = createdMs;
  const isEarlier = (d: admin.firestore.QueryDocumentSnapshot) => {
    const c = createdMsOf(d);
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
    myCreated - createdMsOf(d) < DUPLICATE_WINDOW_MS &&
    signature(d.get('storeId'), d.get('items')) === mySig
  )) return cancel('duplicate_order');

  // Count earlier orders that are real, not accidental repeats that are
  // about to be cancelled themselves.
  const realEarlier = earlierActive.filter(d => {
    const c = createdMsOf(d);
    const sig = signature(d.get('storeId'), d.get('items'));
    return !earlierActive.some(e =>
      e.id !== d.id &&
      (createdMsOf(e) < c || (createdMsOf(e) === c && e.id < d.id)) &&
      c - createdMsOf(e) < DUPLICATE_WINDOW_MS &&
      signature(e.get('storeId'), e.get('items')) === sig
    );
  });
  if (realEarlier.length >= MAX_ACTIVE_ORDERS) return cancel('too_many_active');

  // Rate limit. Doesn't count orders the server itself rejected (duplicates,
  // earlier rate-limit hits), or later duplicates of this order that are
  // about to be rejected, so one tap-burst can't lock a student out.
  const since = Date.now() - ORDER_WINDOW_MS;
  // verifiedAt and createTime are the server's clock; createdAt comes from
  // the phone and could be set in the past to dodge the limit.
  const recentCount = 1 + others.filter(d =>
    Number(d.get('verifiedAt') ?? createdMsOf(d)) > since &&
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

  // Delivery fee by walking distance (campus.ts, shared.ts): from the
  // store's food spot to the delivery point the student picked. The label
  // and position come from the campus list, never the phone. Orders from
  // older app versions (a typed address, no point) pay the fallback fee.
  const drop = dropPoint(order.deliveryAddress?.pointId);
  const quote = quoteDelivery(store.pickupPointId, drop?.id);
  const deliveryFee = quote.feeJmd;
  const totalAmount = subtotal + deliveryFee;

  // Payment. Orders from app versions before payments have no method: they
  // are treated as card orders (paid when a dasher accepts).
  const paymentMethod = order.paymentMethod === 'tokens' ? 'tokens' : 'card';

  const verified = {
    items: cleanItems,
    deliveryFee,
    // The split of the fee (shared.ts splitDeliveryFee), fixed on the order.
    dasherPayoutJmd: quote.dasherPayoutJmd,
    platformFeeJmd: quote.platformFeeJmd,
    deliveryDistanceM: quote.distanceM,
    feeBasis: quote.basis,
    ...(drop ? {
      deliveryAddress: {
        pointId: drop.id, area: drop.area ?? 'other', label: drop.name,
        latitude: drop.latitude ?? 0, longitude: drop.longitude ?? 0, hasGpsFix: drop.latitude !== null,
      },
    } : {}),
    totalAmount,
    storeName: String(store.name ?? ''),
    studentName: String(userSnap.data()?.name ?? 'Student'),
    paymentMethod,
    paymentStatus: paymentMethod === 'tokens' ? 'reserved' : 'unpaid',
    verifiedAt: Date.now(),
    ...dispatch, // who may take it when (see planOffer), published in the same write
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

// ─── New order: check it, then offer it to dashers in waves ───────────────
// Used by onOrderStatusChanged and by repairHalfFinishedWork (for an order
// whose trigger failed before it was checked). Safe to run twice: the
// order is only published while it is still pending.
//
// Wave dispatch (OFFER_* in shared.ts): instead of every online dasher
// getting every order (and racing for it), the order goes to the few free
// dashers who were offered one least recently, then to a few more every
// OFFER_WAVE_MS, then to everyone. Later waves are sent by offerNextWave
// through a Cloud Tasks queue. If that queue can't be reached, the order
// opens to everyone at once, so a failure never delays an order.
const WAVE_MS = (Number(process.env.OFFER_WAVE_SECONDS) || OFFER_WAVE_MS / 1000) * 1000;

type OfferPlan = { offerAt: Record<string, number>; openToAllAt: number; first: FreeDasher[]; lastWave: number };

function planOffer(free: FreeDasher[], start: number): OfferPlan {
  // Least recently offered first; a random order among equals, so two
  // dashers who have never had an offer don't always come out the same way.
  const queue = free
    .map(d => ({ d, r: Math.random() }))
    .sort((a, b) => a.d.lastOfferedAt - b.d.lastOfferedAt || a.r - b.r)
    .map(x => x.d);
  const waves = Math.ceil(queue.length / OFFER_WAVE_SIZE);
  const lastWave = Math.max(0, Math.min(waves - 1, OFFER_OPEN_WAVE));
  const offerAt: Record<string, number> = {};
  for (let w = 0; w < lastWave; w++) {
    for (const d of queue.slice(w * OFFER_WAVE_SIZE, (w + 1) * OFFER_WAVE_SIZE)) offerAt[d.uid] = start + w * WAVE_MS;
  }
  return {
    offerAt,
    openToAllAt: start + lastWave * WAVE_MS,
    first: lastWave === 0 ? queue : queue.slice(0, OFFER_WAVE_SIZE),
    lastWave,
  };
}

/** Pushes the new-order alert to these dashers and records when they were offered one. */
async function offerTo(dashers: FreeDasher[], order: admin.firestore.DocumentData, orderId: string): Promise<void> {
  if (!dashers.length) return;
  const now = Date.now();
  const batch = db.batch();
  dashers.forEach(d => batch.update(db.collection('dashers').doc(d.uid), { lastOfferedAt: now }));
  await Promise.all([
    batch.commit().catch(e => logger.warn('Could not record offers', { orderId, message: e?.message })),
    sendPushes(dashers.filter(d => d.token).map(d => ({
      token: d.token!,
      title: `${MARK.newOrder} New run available`,
      body: `${order.storeName} — ${jmd(orderPayoutJmd(order))} to deliver`,
      data: { screen: '/(dasher)/dash', orderId },
      ttlSeconds: 600, // an order alert older than 10 minutes is useless
    })), 'new_order'),
  ]);
}

type WaveTask = { orderId: string; at: number };

/** Schedules the wave due at `at`. False if the queue can't be reached. */
async function scheduleWave(task: WaveTask): Promise<boolean> {
  try {
    await getFunctions().taskQueue('offerNextWave').enqueue(task, {
      scheduleTime: new Date(task.at),
      // One task per order per wave, even if this runs twice.
      id: `${task.orderId}-${task.at}`,
    });
    return true;
  } catch (e: any) {
    if (e?.code === 'functions/task-already-exists') return true;
    logger.error('Could not schedule the next offer wave; opening the order to everyone', {
      orderId: task.orderId, message: e?.message, code: e?.code });
    return false;
  }
}

/** Opens the order to every dasher now and alerts the free ones not yet alerted. */
async function openToEveryone(ref: admin.firestore.DocumentReference, orderId: string): Promise<number> {
  const opened = await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data();
    if (!o || o.status !== 'pending' || !o.verifiedAt) return null;
    if (!(Number(o.openToAllAt) <= Date.now())) tx.update(ref, { openToAllAt: Date.now() });
    return o;
  });
  if (!opened) return 0;
  const offered = opened.offerAt ?? {};
  const rest = (await getFreeDashers(opened.studentId)).filter(d => !(d.uid in offered));
  await offerTo(rest, opened, orderId);
  return rest.length;
}

async function publishNewOrder(
  ref: admin.firestore.DocumentReference, order: admin.firestore.DocumentData,
  orderId: string, lagMs?: number, createdMs?: number,
): Promise<void> {
  const started = Date.now();
  // Start finding dashers while the order is being checked: both only
  // read, so neither slows the other down.
  const freePromise = getFreeDashers(order.studentId);
  freePromise.catch(() => {}); // avoid an unhandled rejection if we bail early
  let plan: OfferPlan | null = null;
  try {
    plan = planOffer(await freePromise, Date.now());
  } catch (e: any) {
    // Can't see who is online: publish it open to everyone (as before waves).
    logger.error('Could not list free runners', { orderId, message: e?.message });
  }
  const checked = await verifyNewOrder(ref, order, plan
    ? { offerAt: plan.offerAt, openToAllAt: plan.openToAllAt }
    : { openToAllAt: Date.now() }, createdMs);
  if (!checked || !plan) return; // cancelled; the cancel write re-triggers and notifies the student

  let notified = plan.first.length;
  if (plan.lastWave > 0 && !(await scheduleWave({ orderId, at: plan.openToAllAt - (plan.lastWave - 1) * WAVE_MS }))) {
    await ref.update({ openToAllAt: Date.now() }).catch(() => {});
    plan.first = await getFreeDashers(order.studentId).catch(() => plan!.first);
    notified = plan.first.length;
  }
  await offerTo(plan.first, checked, orderId);
  logger.info(`New order ${orderId}: offered to ${notified} runners`, {
    orderId, dashers: notified, waves: plan.lastWave + 1, handleMs: Date.now() - started, lagMs,
  });
  // A new open order may complete a group for a dasher's group search.
  await matchGroups().catch(e => logger.error('Group matching failed', { orderId, message: e?.message }));
}

// ─── TASK: THE NEXT OFFER WAVE ─────────────────────────────────────────────
// Sent by the Cloud Tasks queue at the time the wave is due. Does nothing
// once the order is taken or cancelled. The last wave opens the order to
// every free dasher not alerted yet (including ones who came online since).
export const offerNextWave = onTaskDispatched<WaveTask>(
  { retryConfig: { maxAttempts: 5, minBackoffSeconds: 5 }, rateLimits: { maxConcurrentDispatches: 50 } },
  async (req) => {
    const { orderId, at } = req.data ?? ({} as WaveTask);
    if (!orderId || !at) return;
    // Cloud Tasks runs a task at or after its time, but the local emulator
    // may run it at once. A wave that isn't due yet would jump the queue:
    // fail it, and the queue tries again after its backoff.
    if (Date.now() < at - 2000) {
      throw new Error(`Offer wave for ${orderId} arrived ${at - Date.now()} ms early`);
    }
    const ref = db.collection('orders').doc(orderId);
    const o = (await ref.get()).data();
    if (!o || o.status !== 'pending' || !o.verifiedAt || o.dasherId) return;

    if (at >= Number(o.openToAllAt)) {
      const n = await openToEveryone(ref, orderId);
      logger.info(`Order ${orderId}: open to everyone, alerted ${n} more`, { orderId, dashers: n });
      // More dashers may take it now, so more groups may be possible.
      await matchGroups().catch(e => logger.error('Group matching failed', { orderId, message: e?.message }));
      return;
    }
    const offerAt: Record<string, number> = o.offerAt ?? {};
    const due = new Set(Object.keys(offerAt).filter(uid => offerAt[uid] === at));
    // Skip anyone who has gone offline or taken another order since.
    const wave = (await getFreeDashers(o.studentId)).filter(d => due.has(d.uid));
    if (!(await scheduleWave({ orderId, at: at + WAVE_MS }))) {
      const n = await openToEveryone(ref, orderId);
      logger.info(`Order ${orderId}: open to everyone early, alerted ${n} more`, { orderId, dashers: n });
      return;
    }
    await offerTo(wave, o, orderId);
    logger.info(`Order ${orderId}: next wave offered to ${wave.length}`, { orderId, dashers: wave.length });
    if (wave.length) await matchGroups({ dasherIds: wave.map(d => d.uid) }).catch(() => 0);
  },
);

// ─── Accepted card order: open the pay window, tell the student ───────────
// In a transaction, so it happens once even if the trigger and the repair
// sweep both reach it: only an accepted card order that is still 'unpaid'
// moves to 'awaiting_payment' with a fresh PAY_WINDOW_MS deadline.
async function openPayWindow(ref: admin.firestore.DocumentReference, orderId: string): Promise<void> {
  const opened = await db.runTransaction(async tx => {
    const o = (await tx.get(ref)).data();
    if (!o || o.status !== 'accepted' || o.paymentMethod !== 'card' || o.paymentStatus !== 'unpaid') return null;
    tx.update(ref, { paymentStatus: 'awaiting_payment', payDeadline: Date.now() + PAY_WINDOW_MS });
    return o;
  });
  if (!opened) return;
  const token = await getUserToken(opened.studentId);
  if (token) await sendPushNotification(
    token,
    `${MARK.assigned} Pay now to confirm`,
    `${opened.dasherName} accepted your order. Pay ${jmd(opened.totalAmount)} with your tokens or card within ${minutes(PAY_WINDOW_MS)} minutes, or it will be cancelled.`,
    { screen: `/(student)/order/${orderId}`, orderId },
    'accepted_pay_now'
  );
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
      await publishNewOrder(ref, after, orderId, lagMs, event.data?.after?.createTime?.toMillis());
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
      // The dasher is now busy: stop sending them new-order alerts. A dasher
      // already delivering another order (not in the same group) can't take
      // this one: the accept is undone and nobody is told anything.
      if (dasherId && !(await claimDasherForOrder(dasherId, ref))) {
        logger.warn(`Order ${orderId}: second accept by a busy runner undone`, { orderId, dasherId });
        return;
      }
      const busy = Promise.resolve();
      const tokenPromise = getUserToken(studentId);

      if (after.paymentMethod === 'tokens') {
        const [token, charged] = await Promise.all([tokenPromise, chargeTokensOnAccept(ref), busy]);
        // Paid with tokens the moment the dasher accepted: tell the store.
        const storeAlert = charged ? alertStore(after, orderId, 'confirmed') : Promise.resolve();
        if (token) await sendPushNotification(
          token,
          `${MARK.assigned} Runner assigned`,
          `${after.dasherName} accepted your order and is heading to ${after.storeName}. Paid with tokens.`,
          { screen: `/(student)/order/${orderId}`, orderId },
          'accepted'
        );
        await storeAlert;
        return;
      }

      if (after.paymentMethod === 'card' && after.paymentStatus === 'unpaid') {
        tokenPromise.catch(() => {}); // not needed on this path
        await Promise.all([openPayWindow(ref, orderId), busy]);
        return;
      }

      const [token] = await Promise.all([tokenPromise, busy]);
      if (token) await sendPushNotification(
        token,
        `${MARK.assigned} Runner assigned`,
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
        `${MARK.delivered} Food land!`,
        `Your order from ${after.storeName} has arrived. Enjoy.`,
        { screen: `/(student)/order/${orderId}`, orderId },
        'delivered'
      );
      // Free again: their group search can pick up where it left off.
      if (dasherId) await matchGroups({ dasherIds: [dasherId] }).catch(() => 0);
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
        no_dasher: 'No runner was free to take it in time. You were not charged. Please try again later.',
        admin: `Your order from ${after.storeName} was cancelled by Runner support.`,
        insufficient_tokens: 'You don\'t have enough tokens for this order. You were not charged.',
        payment_timeout: `Your order from ${after.storeName} wasn't paid within ${minutes(PAY_WINDOW_MS)} minutes, so it was cancelled. You were not charged.`,
      };
      const refundNote = wasPaid ? ' Your payment was returned to you as Runner tokens.' : '';

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
            ? `The ${after.storeName} order was cancelled by Runner support.`
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
// deliveredAt is sent by the dasher's phone, so it is only trusted between
// the server's verifiedAt and now; anything outside that uses now.
function deliveryMinsOf(order: admin.firestore.DocumentData, now?: number): { deliveryMins?: number } {
  const start = Number(order.verifiedAt ?? order.createdAt);
  let end = Number(order.deliveredAt);
  if (now !== undefined && !(end >= start && end <= now + 60 * 1000)) end = now;
  const ms = end - start;
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
      totalEarnings: FieldValue.increment(orderPayoutJmd(fresh)), // the dasher's share, not the whole fee
    }, { merge: true });
    tx.update(orderRef, { dasherCreditedAt: Date.now(), ...deliveryMinsOf(fresh, Date.now()) });
    return true;
  });
  if (credited) logger.info(`Credited runner ${dasherId} for order ${orderRef.id}`);
  else logger.info(`Runner already credited for order ${orderRef.id}, skipped`);
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

export const deactivateMyAccount = onCall({ ...APP_CHECK }, async (request) => {
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
export const deleteMyAccount = onCall({ ...APP_CHECK }, async (request) => {
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

  // Refuse while money is still attached to the account: prepaid tokens (a
  // student paid real money for them), a dasher's float (DormDash cash they
  // hold), or a card payment that hasn't settled. Deleting would lose it.
  const [walletSnap, dasherSnap, ...paySnaps] = await Promise.all([
    db.collection('wallets').doc(uid).get(),
    db.collection('dashers').doc(uid).get(),
    ...['pending', 'verified', 'review'].map(status => db.collection('payments')
      .where('uid', '==', uid).where('status', '==', status).get()),
  ]);
  const balanceJmd = Number(walletSnap.get('balanceJmd')) || 0;
  if (balanceJmd > 0 || (Number(walletSnap.get('reservedJmd')) || 0) > 0) {
    throw new HttpsError(
      'failed-precondition',
      `You still have ${jmd(balanceJmd)} in Runner tokens. Use them, or email support to have them refunded, then delete your account.`
    );
  }
  if ((Number(dasherSnap.get('floatJmd')) || 0) !== 0) {
    throw new HttpsError(
      'failed-precondition',
      'Your Runner float isn\'t settled yet. Contact support to settle it, then delete your account.'
    );
  }
  const recent = Date.now() - 60 * 60 * 1000; // an abandoned WiPay page older than this can't still charge
  const unsettled = paySnaps.some((snap, i) => snap.docs.some(d =>
    i > 0 || Number(d.get('createdAt')) > recent));
  if (unsettled) {
    throw new HttpsError(
      'failed-precondition',
      'A card payment of yours is still being confirmed. Try again later, or contact support.'
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
          update.dasherName = 'Deleted runner';
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
 
  logger.info(`Account deleted: ${uid} (anonymised ${studentOrders} student / ${dasherOrders} runner orders)`);
  return { ok: true, anonymisedOrders: studentOrders + dasherOrders };
});


// ─── ONLINE DASHER COUNT ───────────────────────────────────────────────────
// dashers/* is private (earnings, floats), so checkout can't count online
// dashers itself. It reads publicStats/app instead, which this keeps current.
// Recounting (rather than +1/-1) means the number can never drift.
//
// One document takes about one write a second. When many dashers switch on
// or off together (a shift change), recounts that land on the same number
// skip the write, a write that loses the race is logged rather than
// retried, and the 5-minute scheduler recounts, so the number is always
// right again within minutes.
async function refreshOnlineDasherCount(): Promise<void> {
  const ref = db.collection('publicStats').doc('app');
  const [agg, current] = await Promise.all([
    db.collection('dashers').where('isOnline', '==', true).count().get(),
    ref.get(),
  ]);
  const count = agg.data().count;
  if (current.get('onlineDashers') === count) return;
  try {
    await ref.set({ onlineDashers: count, updatedAt: Date.now() }, { merge: true });
  } catch (e: any) {
    logger.warn('Online runner count not saved; the scheduler will catch up', { count, message: e?.message });
  }
}

export const onDasherOnlineChanged = onDocumentWritten(
  { document: 'dashers/{uid}', maxInstances: 5 },
  async (event) => {
    const wasOnline = event.data?.before?.data()?.isOnline === true;
    const isOnline = event.data?.after?.data()?.isOnline === true;
    if (wasOnline === isOnline) return; // stat updates, activity, offers
    await refreshOnlineDasherCount();
    // Just came online: look for a group if they have a search saved.
    if (isOnline) await matchGroups({ dasherIds: [event.params.uid] }).catch(() => 0);
  },
);

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

// ─── REPAIR: finish work a failed trigger left half-done ──────────────────
// Triggers are not retried (RETRY_POLICY_DO_NOT_RETRY), and retrying the
// whole trigger would re-send notifications. So instead, every 5 minutes,
// this finds each state a failed trigger can leave behind and completes it
// with the same code the trigger runs. Every step is safe to run twice.
// Only documents unchanged for REPAIR_MIN_AGE_MS are touched, so it never
// races a trigger that is still running.
//   1. pending order never checked      → no dasher could see it
//   2. cancelled with money not returned → tokens held / payment not refunded
//   3. accepted card order still unpaid  → nobody could pay or cancel it
//      (and old tokens-at-checkout orders never charged)
//   4. delivered, dasher never credited  → earnings missing
//   5. dasher still marked busy          → never offered orders again
const DAY_MS = 24 * 60 * 60 * 1000;
const repairMinAgeMs = () => Number(process.env.REPAIR_MIN_AGE_MS ?? 60 * 1000);

async function repairHalfFinishedWork(): Promise<Record<string, number>> {
  const cutoff = Date.now() - repairMinAgeMs();
  const quiet = (d: admin.firestore.QueryDocumentSnapshot) => d.updateTime.toMillis() <= cutoff;
  const orders = db.collection('orders');
  const done: Record<string, number> = { unverified: 0, unsettled: 0, payWindow: 0, uncharged: 0, uncredited: 0, busy: 0 };
  const fix = async (kind: string, id: string, work: () => Promise<unknown>) => {
    try {
      await work();
      done[kind]++;
      logger.warn(`Repaired half-finished work: ${kind}`, { id });
    } catch (e: any) {
      logger.error(`Repair failed: ${kind}`, { id, message: e?.message });
    }
  };

  const [pending, unsettled, accepted, delivered, busy] = await Promise.all([
    orders.where('status', '==', 'pending').get(),
    orders.where('status', '==', 'cancelled').where('paymentStatus', 'in', ['reserved', 'paid']).get(),
    orders.where('status', '==', 'accepted').where('paymentStatus', 'in', ['unpaid', 'reserved']).get(),
    orders.where('status', '==', 'delivered').where('deliveredAt', '>=', Date.now() - DAY_MS).get(),
    db.collection('dashers').where('activeOrderId', '!=', null).get(),
  ]);

  for (const d of pending.docs) {
    if (!d.get('verifiedAt') && quiet(d)) await fix('unverified', d.id, () => publishNewOrder(d.ref, d.data(), d.id, undefined, createdMsOf(d)));
  }
  for (const d of unsettled.docs) {
    if (quiet(d)) await fix('unsettled', d.id, () => settleCancelledOrder(d.ref));
  }
  for (const d of accepted.docs) {
    if (!quiet(d)) continue;
    if (d.get('paymentMethod') === 'card' && d.get('paymentStatus') === 'unpaid') {
      await fix('payWindow', d.id, () => openPayWindow(d.ref, d.id));
    } else if (d.get('paymentMethod') === 'tokens' && d.get('paymentStatus') === 'reserved') {
      await fix('uncharged', d.id, async () => {
        if (await chargeTokensOnAccept(d.ref)) await alertStore(d.data(), d.id, 'confirmed');
      });
    }
  }
  for (const d of delivered.docs) {
    const dasherId = d.get('dasherId');
    if (dasherId && !d.get('dasherCreditedAt') && quiet(d)) {
      await fix('uncredited', d.id, () => creditDasherForDelivery(d.ref, dasherId));
    }
  }
  for (const d of busy.docs) {
    if (!quiet(d)) continue;
    // Every order in the busy list (a group is several).
    for (const orderId of busyIds(d.data())) {
      const o = (await orders.doc(orderId).get()).data();
      const stillDelivering = o && o.dasherId === d.id && IN_DELIVERY_STATUSES.includes(o.status);
      if (!stillDelivering) await fix('busy', d.id, () => setDasherBusy(d.id, orderId, false));
    }
  }

  const total = Object.values(done).reduce((a, b) => a + b, 0);
  if (total) logger.warn('Repair sweep finished', done);
  return done;
}

// ─── IDLE DASHERS ──────────────────────────────────────────────────────────
// Online used to be a sticky switch: a dasher who switched on and walked
// away counted as available forever, so orders were offered to people who
// weren't there. The app records activity (lastSeenAt) whenever DormDash is
// open. A dasher who hasn't opened it for DASHER_IDLE_NUDGE_MS gets a
// "Still dashing?" notification; DASHER_IDLE_GRACE_MS later, if they still
// haven't, they're switched off (offlineReason 'idle', shown in the app).
// Never while they have a delivery in progress. Opening the app at any
// point resets it.
async function retireIdleDashers(now = Date.now()): Promise<{ nudged: number; offline: number }> {
  const online = await db.collection('dashers').where('isOnline', '==', true).get();
  let nudged = 0;
  let offline = 0;
  for (const d of online.docs) {
    try {
      if (d.get('activeOrderId')) continue; // mid-delivery
      const lastSeen = Number(d.get('lastSeenAt')) || 0;
      if (now - lastSeen < DASHER_IDLE_NUDGE_MS) continue;
      const nudgedAt = Number(d.get('idleNudgedAt')) || 0;

      if (nudgedAt <= lastSeen) {
        // Idle, and not nudged since they were last around.
        await d.ref.update({ idleNudgedAt: now });
        const token = await getUserToken(d.id);
        if (token) await sendPushNotification(
          token,
          'Still running?',
          `You're online but haven't opened Runner in a while. Open it to stay online, or we'll switch you off in ${minutes(DASHER_IDLE_GRACE_MS)} minutes.`,
          { screen: '/(dasher)/dash' },
          'idle_nudge'
        );
        nudged++;
        continue;
      }
      if (now - nudgedAt < DASHER_IDLE_GRACE_MS) continue;

      // Still idle after the nudge: switch off, unless anything changed.
      const switchedOff = await db.runTransaction(async tx => {
        const f = (await tx.get(d.ref)).data();
        if (!f || f.isOnline !== true || f.activeOrderId || (Number(f.lastSeenAt) || 0) !== lastSeen) return false;
        tx.update(d.ref, { isOnline: false, currentLocation: null, offlineReason: 'idle', offlineAt: now });
        return true;
      });
      if (!switchedOff) continue;
      const token = await getUserToken(d.id);
      if (token) await sendPushNotification(
        token,
        "You're offline now",
        `We switched you off after ${Math.round(DASHER_IDLE_NUDGE_MS / 3600000)} hours without opening Runner, so orders go to runners who are around. Switch back on any time.`,
        { screen: '/(dasher)/dash' },
        'idle_offline'
      );
      offline++;
    } catch (e: any) {
      logger.error('Idle runner check failed', { dasherId: d.id, message: e?.message });
    }
  }
  if (nudged || offline) logger.info('Idle runners', { nudged, offline });
  return { nudged, offline };
}

// Card payments that need a person: held for review, or still pending long
// after the student left for WiPay (see "Card payments to check" on the
// admin dashboard). The "Card payments need checking" warning is what the
// monitoring alert emails on (scripts/setup-alerts.mjs).
const PAYMENT_CHECK_AFTER_MS = 30 * 60 * 1000;
async function reportPaymentsToCheck(now = Date.now()): Promise<number> {
  const [review, stale] = await Promise.all([
    db.collection('payments').where('status', '==', 'review').count().get(),
    db.collection('payments').where('status', '==', 'pending')
      .where('createdAt', '<', now - PAYMENT_CHECK_AFTER_MS).count().get(),
  ]);
  const n = review.data().count + stale.data().count;
  if (n) logger.warn('Card payments need checking', { review: review.data().count, pending: stale.data().count });
  return n;
}

export const cancelStalePendingOrders = onSchedule('every 5 minutes', async () => {
  // Finish anything a failed trigger left half-done (see above) first, so
  // an order that was never checked is published rather than auto-cancelled.
  await repairHalfFinishedWork();
  await cancelOverdueOrders();
  // Card payments whose WiPay return was verified but not applied yet.
  await retryVerifiedPayments();
  // Online dashers who haven't opened DormDash for hours.
  await retireIdleDashers();
  // Group offers that ran out of time, then a fresh look for groups.
  await expireOldGroups().catch(e => logger.error('Group expiry failed', { message: e?.message }));
  await matchGroups().catch(e => logger.error('Group matching failed', { message: e?.message }));
  // Card payments an admin should look at (monitoring emails on this log).
  await reportPaymentsToCheck().catch(e => logger.error('Payments-to-check count failed', { message: e?.message }));
  // Catch up the public online count (see refreshOnlineDasherCount).
  await refreshOnlineDasherCount().catch(e => logger.error('Online count refresh failed', { message: e?.message }));
});
