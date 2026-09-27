// functions/src/payments.ts
// DormDash payments: DormDash tokens (a prepaid balance) and WiPay card
// payments. Everything that moves money runs here, on the server, inside
// Firestore transactions. The app can only READ balances; it can never write
// them (see firestore.rules).
//
// ─── The rules this file enforces ─────────────────────────────────────────
// • 1 token = J$100 (TOKEN_JMD). Balances are stored in whole J$, never as
//   fractional tokens, so there is no rounding drift.
// • Nobody pays until a dasher accepts. Orders go out unpaid; when a dasher
//   accepts, the student has PAY_WINDOW_MS to pay, and chooses how:
//     tokens → payOrderWithTokens (taken from their balance at once)
//     card   → createPayment, through WiPay
//   The dasher can't start the delivery until it's paid. Unpaid → cancelled
//   automatically.
//   (Older app versions could choose tokens at checkout: those are RESERVED
//   when placed, CHARGED on accept, RELEASED if cancelled first. Still
//   supported below.)
//   (WiPay can't hold a card payment and take it later, and has no refund
//   API, which is why card payment happens at acceptance.)
// • A card payment is only trusted when WiPay's signature checks out:
//   md5(transaction_id + original total + API key) must match, the
//   transaction id must be the one WiPay gave us when the payment was
//   created, and each payment can only be applied once.
// • Money that arrives for an order that was cancelled in the meantime, or
//   a paid order that support cancels, goes back to the student as tokens.
//   No money is ever silently lost.
// • Floats: when an order is paid, its food cost (total minus delivery fee)
//   is taken from the store's float if the store has one, otherwise from
//   the delivering dasher's float. Admins top floats up.
//
// Ledgers (append-only, server-written): walletTx (student tokens) and
// floatTx (store and dasher floats). Every balance change has a ledger line.

import * as admin from 'firebase-admin';
// FieldValue/FieldPath come from the modular import: the namespace versions
// (admin.firestore.FieldValue) are undefined inside the local emulator.
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions/v2';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { TOKEN_JMD, TOKEN_PACKS, PAY_WINDOW_MS, minutes } from './shared';

// ES imports run before index.ts's own code, so this module can load first:
// initialise the app here if nobody has yet (index.ts uses the same guard).
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const APP_URL = 'https://dormdash-71035.web.app';
const RETURN_URL = `${APP_URL}/api/wipay-return`;

// Set once, see PAYMENTS_SETUP.md:
//   firebase functions:secrets:set WIPAY_API_KEY
//   functions/.env → WIPAY_ACCOUNT_NUMBER=… and WIPAY_ENV=sandbox|live
const WIPAY_API_KEY = defineSecret('WIPAY_API_KEY');
const WIPAY_ACCOUNT_NUMBER = defineString('WIPAY_ACCOUNT_NUMBER', { default: '1234567890' });
const WIPAY_ENV = defineString('WIPAY_ENV', { default: 'sandbox' });
const WIPAY_REQUEST_URL = 'https://jm.wipayfinancial.com/plugins/payments/request';

type Tx = admin.firestore.Transaction;

const walletRef = (uid: string) => db.collection('wallets').doc(uid);

function foodCost(order: admin.firestore.DocumentData): number {
  return Math.max(0, (Number(order.totalAmount) || 0) - (Number(order.deliveryFee) || 0));
}

async function requireAdmin(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = (await db.collection('users').doc(uid).get()).data();
  if (!me || me.role !== 'admin' || me.isActive === false) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
}

// ─── Floats ────────────────────────────────────────────────────────────────
// A store's float lives in storeFloats/{storeId}, which only admins can read.
// It used to be a floatJmd field on the store doc itself, which every
// signed-in student can read. moveLegacyStoreFloat moves an old value across
// inside the caller's transaction (the caller must already have read both
// docs). migrateLegacyStoreFloats sweeps every store once after deploy.
const storeFloatRef = (storeId: string) => db.collection('storeFloats').doc(storeId);

function moveLegacyStoreFloat(
  tx: Tx, storeRef: admin.firestore.DocumentReference,
  floatSnap: admin.firestore.DocumentSnapshot, legacy: unknown,
) {
  if (typeof legacy !== 'number') return;
  // If both exist, storeFloats is the real balance; the old field is just removed.
  if (!floatSnap.exists) {
    tx.set(floatSnap.ref, { storeId: storeRef.id, floatJmd: legacy, movedAt: Date.now() });
  }
  tx.update(storeRef, { floatJmd: FieldValue.delete() });
}

/** Moves every store's old floatJmd into storeFloats. Safe to run repeatedly. */
export async function migrateLegacyStoreFloats(): Promise<number> {
  const stores = await db.collection('stores').get();
  let moved = 0;
  for (const s of stores.docs) {
    if (typeof s.get('floatJmd') !== 'number') continue;
    const didMove = await db.runTransaction(async tx => {
      const [storeSnap, floatSnap] = await Promise.all([tx.get(s.ref), tx.get(storeFloatRef(s.id))]);
      const legacy = storeSnap.data()?.floatJmd;
      if (typeof legacy !== 'number') return false;
      moveLegacyStoreFloat(tx, s.ref, floatSnap, legacy);
      return true;
    });
    if (didMove) moved++;
  }
  return moved;
}

// Called inside the transaction that marks an order paid (or reverses it).
// sign = -1 takes the food cost out of the float, +1 puts it back.
async function readFloatTarget(tx: Tx, order: admin.firestore.DocumentData) {
  const storeId = String(order.storeId);
  const storeRef = db.collection('stores').doc(storeId);
  const [store, floatSnap] = await Promise.all([tx.get(storeRef), tx.get(storeFloatRef(storeId))]);
  const legacy = store.data()?.floatJmd;
  if (floatSnap.exists || typeof legacy === 'number') {
    moveLegacyStoreFloat(tx, storeRef, floatSnap, legacy);
    return { ref: floatSnap.ref, kind: 'store' as const, id: storeId };
  }
  const dasherRef = db.collection('dashers').doc(String(order.dasherId));
  return { ref: dasherRef, kind: 'dasher' as const, id: dasherRef.id };
}

function writeFloat(
  tx: Tx,
  target: { ref: admin.firestore.DocumentReference; kind: 'store' | 'dasher'; id: string },
  orderId: string, amountJmd: number, sign: 1 | -1, note: string,
) {
  if (amountJmd <= 0) return;
  tx.set(target.ref, { floatJmd: FieldValue.increment(sign * amountJmd) }, { merge: true });
  tx.set(db.collection('floatTx').doc(`${orderId}_${sign < 0 ? 'use' : 'return'}`), {
    kind: target.kind, targetId: target.id, orderId,
    amountJmd: sign * amountJmd, note, createdAt: Date.now(),
  });
}

// ─── Tokens: reserve / charge / release ───────────────────────────────────
/**
 * Reserve tokens for a new order AND write the verified order fields, in one
 * transaction, so a reservation can never exist without the order recording
 * it (e.g. if the student cancels at the same moment).
 * Returns 'ok', 'insufficient', or 'gone' (order no longer pending).
 */
export async function reserveTokensAndVerify(
  orderRef: admin.firestore.DocumentReference, uid: string, amountJmd: number,
  verifiedFields: Record<string, unknown>,
): Promise<'ok' | 'insufficient' | 'gone'> {
  return db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data();
    if (!order || order.status !== 'pending') return 'gone';
    const w = (await tx.get(walletRef(uid))).data() ?? {};
    const balance = Number(w.balanceJmd) || 0;
    const reserved = Number(w.reservedJmd) || 0;
    if (amountJmd <= 0 || balance - reserved < amountJmd) return 'insufficient';
    tx.set(walletRef(uid), { balanceJmd: balance, reservedJmd: reserved + amountJmd, updatedAt: Date.now() }, { merge: true });
    tx.set(db.collection('walletTx').doc(`${orderRef.id}_reserve`), {
      uid, type: 'order_reserve', amountJmd: -amountJmd, orderId: orderRef.id, createdAt: Date.now(),
    });
    tx.update(orderRef, { ...verifiedFields, paymentStatus: 'reserved' });
    return 'ok';
  });
}

/** Dasher accepted a tokens order: take the reserved tokens. Idempotent. */
export async function chargeTokensOnAccept(orderRef: admin.firestore.DocumentReference): Promise<boolean> {
  return db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data();
    if (!order || order.paymentMethod !== 'tokens' || order.paymentStatus !== 'reserved') return false;
    const amount = Number(order.totalAmount) || 0;
    const wRef = walletRef(order.studentId);
    const w = (await tx.get(wRef)).data() ?? {};
    const target = await readFloatTarget(tx, order);
    tx.set(wRef, {
      balanceJmd: (Number(w.balanceJmd) || 0) - amount,
      reservedJmd: Math.max(0, (Number(w.reservedJmd) || 0) - amount),
      updatedAt: Date.now(),
    }, { merge: true });
    tx.set(db.collection('walletTx').doc(`${orderRef.id}_charge`), {
      uid: order.studentId, type: 'order_charge', amountJmd: 0, orderId: orderRef.id,
      note: 'Reserved tokens used when a dasher accepted', createdAt: Date.now(),
    });
    tx.update(orderRef, { paymentStatus: 'paid', paidAt: Date.now() });
    writeFloat(tx, target, orderRef.id, foodCost(order), -1, 'Tokens order paid');
    return true;
  });
}

/**
 * Order cancelled: give back whatever the student put in.
 *   reserved tokens → released
 *   paid (tokens or card) → refunded as tokens, and the float is restored
 * Idempotent: paymentStatus moves to a final state exactly once.
 */
export async function settleCancelledOrder(orderRef: admin.firestore.DocumentReference): Promise<void> {
  await db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data();
    if (!order || order.status !== 'cancelled') return;
    const amount = Number(order.totalAmount) || 0;
    const wRef = walletRef(order.studentId);

    if (order.paymentStatus === 'reserved') {
      const w = (await tx.get(wRef)).data() ?? {};
      tx.set(wRef, { reservedJmd: Math.max(0, (Number(w.reservedJmd) || 0) - amount), updatedAt: Date.now() }, { merge: true });
      tx.set(db.collection('walletTx').doc(`${orderRef.id}_release`), {
        uid: order.studentId, type: 'order_release', amountJmd: amount, orderId: orderRef.id, createdAt: Date.now(),
      });
      tx.update(orderRef, { paymentStatus: 'released' });
      return;
    }

    if (order.paymentStatus === 'paid') {
      const target = await readFloatTarget(tx, order);
      tx.set(wRef, { balanceJmd: FieldValue.increment(amount), updatedAt: Date.now() }, { merge: true });
      tx.set(db.collection('walletTx').doc(`${orderRef.id}_refund`), {
        uid: order.studentId, type: 'order_refund', amountJmd: amount, orderId: orderRef.id,
        note: 'Paid order cancelled: refunded as tokens', createdAt: Date.now(),
      });
      tx.update(orderRef, { paymentStatus: 'refunded_tokens' });
      writeFloat(tx, target, orderRef.id, foodCost(order), 1, 'Paid order cancelled');
    }
  });
}

// ─── Pay an accepted order with tokens ────────────────────────────────────
// Once a dasher accepts, the student chooses: tokens (here) or card
// (createPayment). Everything is checked and moved in ONE transaction, so a
// double tap, or tokens and card at the same time, can never charge twice:
// whichever lands first marks the order paid; a card payment that lands
// afterwards is credited back as tokens by wipayReturn.
// invoker 'public' is set explicitly: this function's first deploy timed out,
// and a callable only gets its "anyone signed in may call it" permission on
// a successful first deploy. Saying it here makes every deploy re-apply it.
// (Callers still need to be signed-in students; that's checked below.)
// SPEED: kept warm (minInstances 1) and able to take 40 payments at once per
// copy, so "Pay with tokens" never waits on a cold start.
export const payOrderWithTokens = onCall({
  invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 40, minInstances: 1, maxInstances: 20,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = (await db.collection('users').doc(uid).get()).data();
  if (!me || me.isActive === false) throw new HttpsError('permission-denied', 'Your account is paused.');
  if (me.role !== 'student') throw new HttpsError('permission-denied', 'Only student accounts can pay.');

  const orderId = String(request.data?.orderId ?? '');
  if (!orderId) throw new HttpsError('invalid-argument', 'Order not found.');
  const orderRef = db.collection('orders').doc(orderId);

  let amount: number;
  try {
  amount = await db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data();
    if (!order || order.studentId !== uid) throw new HttpsError('not-found', 'Order not found.');
    if (order.paymentStatus === 'paid') throw new HttpsError('failed-precondition', 'This order is already paid.');
    if (order.status !== 'accepted' || order.paymentStatus !== 'awaiting_payment') {
      throw new HttpsError('failed-precondition', 'You can pay once a dasher accepts your order.');
    }
    if (Number(order.payDeadline) > 0 && Date.now() > Number(order.payDeadline)) {
      throw new HttpsError('deadline-exceeded', `The ${minutes(PAY_WINDOW_MS)} minutes to pay are up, so this order is being cancelled.`);
    }
    const total = Number(order.totalAmount) || 0;
    if (!(total > 0)) throw new HttpsError('failed-precondition', 'Nothing to pay.');

    const wRef = walletRef(uid);
    const w = (await tx.get(wRef)).data() ?? {};
    const balance = Number(w.balanceJmd) || 0;
    const reserved = Number(w.reservedJmd) || 0;
    if (balance - reserved < total) {
      throw new HttpsError('failed-precondition', 'You don\'t have enough tokens for this order. Pay by card instead.');
    }
    const target = await readFloatTarget(tx, order);

    tx.set(wRef, { balanceJmd: balance - total, reservedJmd: reserved, updatedAt: Date.now() }, { merge: true });
    tx.set(db.collection('walletTx').doc(`${orderId}_pay_tokens`), {
      uid, type: 'order_payment', amountJmd: -total, orderId,
      note: 'Paid with tokens after a dasher accepted', createdAt: Date.now(),
    });
    tx.update(orderRef, { paymentMethod: 'tokens', paymentStatus: 'paid', paidAt: Date.now() });
    writeFloat(tx, target, orderId, foodCost(order), -1, 'Order paid with tokens');
    return total;
  });
  } catch (e: any) {
    if (e instanceof HttpsError) throw e; // a clear reason for the student
    // Anything unexpected: log it in full for us, and tell the student plainly.
    // The transaction either fully happened or not at all, so nothing was taken.
    logger.error('payOrderWithTokens failed', { orderId, uid, message: e?.message, stack: e?.stack });
    throw new HttpsError('unavailable', 'Paying with tokens didn\'t work just now. Nothing was taken from your tokens. Try again, or pay by card.');
  }

  logger.info('Order paid with tokens', { orderId, uid, amountJmd: amount });
  return { ok: true };
});

// ─── WiPay: start a payment ────────────────────────────────────────────────
// purpose 'order': pay for an accepted card order (student only, own order).
// purpose 'tokens': buy one of the TOKEN_PACKS.
export const createPayment = onCall({
  secrets: [WIPAY_API_KEY], cpu: 1, memory: '512MiB', concurrency: 40, maxInstances: 20,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const me = (await db.collection('users').doc(uid).get()).data();
  if (!me || me.isActive === false) throw new HttpsError('permission-denied', 'Your account is paused.');
  if (me.role !== 'student') throw new HttpsError('permission-denied', 'Only student accounts can pay.');

  const purpose = request.data?.purpose;
  let amountJmd = 0;
  let orderId: string | null = null;
  let tokens = 0;

  if (purpose === 'order') {
    orderId = String(request.data?.orderId ?? '');
    const order = (await db.collection('orders').doc(orderId).get()).data();
    if (!order || order.studentId !== uid) throw new HttpsError('not-found', 'Order not found.');
    if (order.paymentStatus === 'paid') throw new HttpsError('failed-precondition', 'This order is already paid.');
    if (order.paymentMethod !== 'card') throw new HttpsError('failed-precondition', 'This order is not a card order.');
    if (order.status !== 'accepted' || order.paymentStatus !== 'awaiting_payment') {
      throw new HttpsError('failed-precondition', 'You can pay once a dasher accepts your order.');
    }
    amountJmd = Number(order.totalAmount) || 0;
  } else if (purpose === 'tokens') {
    tokens = Number(request.data?.tokens);
    if (!TOKEN_PACKS.includes(tokens)) throw new HttpsError('invalid-argument', 'Choose one of the token packs.');
    amountJmd = tokens * TOKEN_JMD;
  } else {
    throw new HttpsError('invalid-argument', 'Unknown payment type.');
  }
  if (!(amountJmd > 0)) throw new HttpsError('failed-precondition', 'Nothing to pay.');

  const payRef = db.collection('payments').doc();
  const totalSent = amountJmd.toFixed(2); // exactly what the hash is checked against later
  await payRef.set({
    uid, purpose, orderId, tokens, amountJmd, totalSent,
    status: 'pending', environment: WIPAY_ENV.value(), createdAt: Date.now(),
  });

  const body = new URLSearchParams({
    account_number: WIPAY_ACCOUNT_NUMBER.value(),
    country_code: 'JM',
    currency: 'JMD',
    environment: WIPAY_ENV.value(),
    fee_structure: 'customer_pay',
    method: 'credit_card',
    order_id: payRef.id,
    origin: 'DormDash',
    response_url: RETURN_URL,
    total: totalSent,
    ...(me.email ? { email: String(me.email) } : {}),
    ...(me.name ? { name: String(me.name) } : {}),
  });

  let result: any;
  try {
    const res = await fetch(WIPAY_REQUEST_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    result = await res.json();
  } catch (e: any) {
    logger.error('WiPay request failed', { paymentId: payRef.id, message: e?.message });
    await payRef.update({ status: 'failed', failReason: 'wipay_unreachable' });
    throw new HttpsError('unavailable', 'The card payment page is not reachable right now. Try again in a minute.');
  }

  if (!result?.url || !result?.transaction_id) {
    logger.error('WiPay rejected payment request', { paymentId: payRef.id, message: result?.message });
    await payRef.update({ status: 'failed', failReason: String(result?.message ?? 'no_url') });
    throw new HttpsError('failed-precondition', 'The payment could not be started. Try again.');
  }

  await payRef.update({ wipayTransactionId: String(result.transaction_id) });
  logger.info('Payment started', { paymentId: payRef.id, purpose, amountJmd, uid });
  return { url: String(result.url), paymentId: payRef.id };
});

// ─── WiPay: the student comes back ────────────────────────────────────────
// WiPay redirects the student's browser here with the result in the query
// string. Served at /api/wipay-return through a Hosting rewrite
// (firebase.json). We verify, apply the payment exactly once, then send the
// student on to the result screen in the app.
export const wipayReturn = onRequest({ secrets: [WIPAY_API_KEY], invoker: 'public' }, async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const paymentId = String(q.order_id ?? '');
  const go = (status: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ status, pid: paymentId, ...extra });
    res.redirect(302, `${APP_URL}/payment-result?${params.toString()}`);
  };

  if (!/^[A-Za-z0-9]{10,40}$/.test(paymentId)) { go('error'); return; }
  const payRef = db.collection('payments').doc(paymentId);
  const pay = (await payRef.get()).data();
  if (!pay) { go('error'); return; }

  const kind = pay.purpose === 'tokens' ? 'tokens' : 'order';
  const txId = String(q.transaction_id ?? '');

  if (q.status !== 'success') {
    // A failed/declined attempt. Never downgrade a payment already applied.
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(payRef)).data();
      if (fresh?.status === 'pending') tx.update(payRef, { status: 'failed', failReason: String(q.message ?? q.status ?? 'failed').slice(0, 300) });
    });
    go('failed', { kind, ...(pay.orderId ? { order: pay.orderId } : {}) });
    return;
  }

  // Verify the signature: md5(transaction_id + ORIGINAL total + API key).
  const expected = crypto.createHash('md5').update(txId + pay.totalSent + WIPAY_API_KEY.value()).digest('hex');
  const hashOk = typeof q.hash === 'string' && q.hash.toLowerCase() === expected;
  const txOk = !pay.wipayTransactionId || pay.wipayTransactionId === txId;
  if (!hashOk || !txOk) {
    logger.error('WiPay return FAILED verification', { paymentId, hashOk, txOk });
    go('error', { kind });
    return;
  }

  let outcome = 'success';
  await db.runTransaction(async tx => {
    const fresh = (await tx.get(payRef)).data();
    if (!fresh || fresh.status === 'paid' || fresh.status === 'credited') return; // already applied

    const paidFields = {
      transactionId: txId,
      chargedTotal: String(q.total ?? ''),
      card: String(q.card ?? '').slice(-4),
      paidAt: Date.now(),
    };

    if (fresh.purpose === 'tokens') {
      tx.set(walletRef(fresh.uid), { balanceJmd: FieldValue.increment(fresh.amountJmd), updatedAt: Date.now() }, { merge: true });
      tx.set(db.collection('walletTx').doc(`${paymentId}_topup`), {
        uid: fresh.uid, type: 'topup_card', amountJmd: fresh.amountJmd, paymentId, createdAt: Date.now(),
      });
      tx.update(payRef, { status: 'paid', ...paidFields });
      return;
    }

    // Order payment.
    const orderRef = db.collection('orders').doc(String(fresh.orderId));
    const order = (await tx.get(orderRef)).data();
    const stillPayable = order && order.status === 'accepted' && order.paymentStatus === 'awaiting_payment';
    if (stillPayable) {
      const target = await readFloatTarget(tx, order!);
      tx.update(orderRef, { paymentStatus: 'paid', paidAt: Date.now(), paymentId });
      tx.update(payRef, { status: 'paid', ...paidFields });
      writeFloat(tx, target, orderRef.id, foodCost(order!), -1, 'Card order paid');
    } else {
      // Order was cancelled (or otherwise moved on) while they were paying.
      // Keep their money: credit it as tokens.
      tx.set(walletRef(fresh.uid), { balanceJmd: FieldValue.increment(fresh.amountJmd), updatedAt: Date.now() }, { merge: true });
      tx.set(db.collection('walletTx').doc(`${paymentId}_late`), {
        uid: fresh.uid, type: 'late_payment_credit', amountJmd: fresh.amountJmd, paymentId, orderId: fresh.orderId,
        note: 'Paid after the order was cancelled: added as tokens', createdAt: Date.now(),
      });
      tx.update(payRef, { status: 'credited', ...paidFields });
      outcome = 'credited';
    }
  });

  logger.info('Payment verified', { paymentId, purpose: pay.purpose, outcome });
  go(outcome, { kind, ...(pay.orderId ? { order: pay.orderId } : {}) });
});

// ─── Admin: tokens and floats ──────────────────────────────────────────────
/** Add (positive) or remove (negative) tokens for a student. Up to 2 decimals. */
export const adminAdjustTokens = onCall(async (request) => {
  await requireAdmin(request.auth?.uid);
  const uid = String(request.data?.uid ?? '');
  const tokens = Number(request.data?.tokens);
  const note = String(request.data?.note ?? '').slice(0, 200);
  if (!uid || !Number.isFinite(tokens) || tokens === 0 || Math.abs(tokens) > 10000) {
    throw new HttpsError('invalid-argument', 'Enter a token amount, e.g. 5 or -2.5.');
  }
  const deltaJmd = Math.round(tokens * TOKEN_JMD);
  const target = (await db.collection('users').doc(uid).get()).data();
  if (!target || target.role !== 'student') throw new HttpsError('not-found', 'Student not found.');

  const newBalance = await db.runTransaction(async tx => {
    const w = (await tx.get(walletRef(uid))).data() ?? {};
    const balance = Number(w.balanceJmd) || 0;
    const reserved = Number(w.reservedJmd) || 0;
    const next = balance + deltaJmd;
    if (next < reserved) {
      throw new HttpsError('failed-precondition',
        `That would leave less than the ${reserved / TOKEN_JMD} tokens held for their open orders.`);
    }
    tx.set(walletRef(uid), { balanceJmd: next, reservedJmd: reserved, updatedAt: Date.now() }, { merge: true });
    tx.set(db.collection('walletTx').doc(), {
      uid, type: 'admin_adjust', amountJmd: deltaJmd, by: request.auth!.uid, note, createdAt: Date.now(),
    });
    return next;
  });
  logger.info('Tokens adjusted', { uid, deltaJmd, by: request.auth!.uid });
  return { balanceJmd: newBalance };
});

/** Top up (positive) or reduce (negative) a store's or dasher's float, in J$. */
export const adminAdjustFloat = onCall(async (request) => {
  await requireAdmin(request.auth?.uid);
  const kind = request.data?.kind;
  const id = String(request.data?.id ?? '');
  const amountJmd = Math.round(Number(request.data?.amountJmd));
  const note = String(request.data?.note ?? '').slice(0, 200);
  if ((kind !== 'store' && kind !== 'dasher') || !id || !Number.isFinite(amountJmd) || amountJmd === 0 || Math.abs(amountJmd) > 1_000_000) {
    throw new HttpsError('invalid-argument', 'Enter a J$ amount, e.g. 5000 or -1000.');
  }
  const ref = db.collection(kind === 'store' ? 'stores' : 'dashers').doc(id);
  const next = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Not found.');
    let value: number;
    if (kind === 'store') {
      // Store floats live in storeFloats; an old value on the store doc is
      // the starting balance if storeFloats doesn't have one yet.
      const floatSnap = await tx.get(storeFloatRef(id));
      const legacy = snap.data()?.floatJmd;
      const current = floatSnap.exists
        ? Number(floatSnap.data()?.floatJmd) || 0
        : (typeof legacy === 'number' ? legacy : 0);
      value = current + amountJmd;
      tx.set(floatSnap.ref, { storeId: id, floatJmd: value }, { merge: true });
      if (typeof legacy === 'number') tx.update(ref, { floatJmd: FieldValue.delete() });
    } else {
      value = (Number(snap.data()?.floatJmd) || 0) + amountJmd;
      tx.set(ref, { floatJmd: value }, { merge: true });
    }
    tx.set(db.collection('floatTx').doc(), {
      kind, targetId: id, amountJmd, note, by: request.auth!.uid, createdAt: Date.now(),
    });
    return value;
  });
  logger.info('Float adjusted', { kind, id, amountJmd, by: request.auth!.uid });
  return { floatJmd: next };
});
