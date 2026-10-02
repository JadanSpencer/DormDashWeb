// functions/src/payments.ts
// Runner payments: Runner tokens (a prepaid balance) and Fygaro card
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
//     card   → createFygaroCheckout, through Fygaro
//   The dasher can't start the delivery until it's paid. Unpaid → cancelled
//   automatically. This is a business rule (don't take money for an order
//   nobody may ever fulfil), independent of what the gateway can or can't do.
//   (Older app versions could choose tokens at checkout: those are RESERVED
//   when placed, CHARGED on accept, RELEASED if cancelled first. Still
//   supported below.)
// • A card payment is only trusted when Fygaro's own HMAC-SHA256 webhook
//   signature checks out (see fygaroWebhook). The browser-redirect "return"
//   step (fygaroReturn) is for navigation only — it never moves money, so a
//   forged or replayed return link can't do anything.
// • Cancelling a paid card order tries a REAL refund through Fygaro's API
//   first (requestFygaroRefund). If that fails — the account doesn't have
//   refund access enabled, a network error, anything — it falls back to the
//   same thing WiPay forced us to do always: credit the student with
//   tokens instead, and flag it in payments/{id} for an admin to check
//   Fygaro's dashboard. So this accommodates both cases: the account having
//   real refund access, and it not having it, without a code change either way.
// • Floats: when an order is paid, its food cost (total minus delivery fee)
//   is taken from the store's float if the store has one, otherwise from
//   the delivering dasher's float. Admins top floats up.
//
// Ledgers (append-only, server-written): walletTx (student tokens) and
// floatTx (store and dasher floats). Every balance change has a ledger line.
//
// ─── One-time setup this file depends on (do this in the Fygaro dashboard,
//     not in code) ──────────────────────────────────────────────────────────
// 1. Create a Fygaro Link ("payment button") for Runner orders/top-ups.
//    Set its Return URL to:  {APP_URL}/api/fygaro-return
//    Set its Webhook URL to: {APP_URL}/api/fygaro-webhook
//    Copy the Link's base URL into FYGARO_LINK_URL (below).
// 2. Settings → API Credentials → Generate New. Copy the Key ID into
//    FYGARO_KEY_ID, and set the secret with:
//      firebase functions:secrets:set FYGARO_API_SECRET
//    Fygaro does not let you recover this secret later — if you lose it,
//    generate a new one and update the secret.
// 3. Ask Fygaro support to confirm (see earlier chat): is the refund API
//    active on this account without a separate unlock, and are partial
//    refunds enabled on this plan. Neither answer changes this file —
//    requestFygaroRefund already degrades gracefully if refunds 403/404.

import * as admin from 'firebase-admin';
// FieldValue/FieldPath come from the modular import: the namespace versions
// (admin.firestore.FieldValue) are undefined inside the local emulator.
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions/v2';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { TOKEN_JMD, TOKEN_PACKS, PAY_WINDOW_MS, MAX_PAYMENT_STARTS, PAYMENT_START_WINDOW_MS, minutes } from './shared';
import { APP_CHECK } from './appCheck';

// ES imports run before index.ts's own code, so this module can load first:
// initialise the app here if nobody has yet (index.ts uses the same guard).
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const APP_URL = 'https://dormdash-71035.web.app';

// Set once, see the setup notes above.
//   firebase functions:secrets:set FYGARO_API_SECRET
const FYGARO_API_SECRET = defineSecret('FYGARO_API_SECRET');
// The Key ID shown next to the secret in Settings → API Credentials.
const FYGARO_KEY_ID = defineString('FYGARO_KEY_ID');
// The base checkout URL of the Fygaro Link created for Runner (no default —
// this is account-specific and must be set before any payment can start).
const FYGARO_LINK_URL = defineString('FYGARO_LINK_URL');
const FYGARO_REFUND_URL = 'https://api.fygaro.com/api/v1/external/payment/refund/';
// How long a checkout JWT is valid for before Fygaro's page will refuse it.
const CHECKOUT_JWT_TTL_MS = 15 * 60 * 1000;
// Fygaro's own replay-protection window for the inbound webhook signature.
const WEBHOOK_REPLAY_WINDOW_S = 300;

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

// ─── Fygaro JWTs (HS256, hand-rolled) ──────────────────────────────────────
// Used for BOTH the outbound checkout link (amount, currency,
// custom_reference) and the outbound refund call (transactionId, amount).
// No jsonwebtoken dependency: this is exactly what that library does for
// HS256, and the codebase already hand-rolls the WiPay hash the same way.
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signFygaroJwt(payload: Record<string, unknown>, secret: string, keyId: string): string {
  const header = { alg: 'HS256', typ: 'JWT', kid: keyId };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(`${encHeader}.${encPayload}`).digest();
  return `${encHeader}.${encPayload}.${base64url(signature)}`;
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
      note: 'Reserved tokens used when a runner accepted', createdAt: Date.now(),
    });
    tx.update(orderRef, { paymentStatus: 'paid', paidAt: Date.now() });
    writeFloat(tx, target, orderRef.id, foodCost(order), -1, 'Tokens order paid');
    return true;
  });
}

// ─── Fygaro: real refund (used by settleCancelledOrder below) ─────────────
/**
 * Tries a real refund through Fygaro's programmatic refund API. Returns
 * {ok:true} if Fygaro accepted it, {ok:false, reason} for ANY failure
 * (network error, non-2xx response, refunds not enabled on the account,
 * amount already fully refunded, etc.) — the caller always has a fallback
 * for the false case, so this never throws.
 */
export async function requestFygaroRefund(
  transactionId: string, amountJmd?: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!transactionId) return { ok: false, reason: 'no_transaction_id' };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = { transactionId, iat: now, exp: now + 300 };
  if (typeof amountJmd === 'number' && amountJmd > 0) payload.amount = amountJmd.toFixed(2);
  const token = signFygaroJwt(payload, FYGARO_API_SECRET.value(), FYGARO_KEY_ID.value());

  try {
    const res = await fetch(FYGARO_REFUND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      logger.warn('Fygaro refund rejected', { transactionId, status: res.status, body: bodyText.slice(0, 500) });
      return { ok: false, reason: `fygaro_${res.status}` };
    }
    logger.info('Fygaro refund accepted', { transactionId, amountJmd });
    return { ok: true };
  } catch (e: any) {
    logger.error('Fygaro refund request failed', { transactionId, message: e?.message });
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * Order cancelled: give back whatever the student put in.
 *   reserved tokens → released
 *   paid with tokens → refunded as tokens, float restored
 *   paid with card → tries a REAL refund via Fygaro first; only falls back
 *     to crediting tokens (and flagging payments/{id} for an admin) if that
 *     call fails. Either way the float is restored.
 * Idempotent: paymentStatus moves to a final state exactly once.
 */
export async function settleCancelledOrder(orderRef: admin.firestore.DocumentReference): Promise<void> {
  // The real refund call can't happen inside a Firestore transaction (it's
  // a network call), so: read what we need first, attempt the refund
  // outside any transaction, then commit the result in one transaction.
  const order = (await orderRef.get()).data();
  if (!order || order.status !== 'cancelled' || order.paymentStatus !== 'paid') {
    // Not a paid order (or already settled) — the simple reserved/paid
    // branches below don't need a network call first.
    await db.runTransaction(async tx => {
      const fresh = (await tx.get(orderRef)).data();
      if (!fresh || fresh.status !== 'cancelled') return;
      const amount = Number(fresh.totalAmount) || 0;
      const wRef = walletRef(fresh.studentId);
      if (fresh.paymentStatus === 'reserved') {
        const w = (await tx.get(wRef)).data() ?? {};
        tx.set(wRef, { reservedJmd: Math.max(0, (Number(w.reservedJmd) || 0) - amount), updatedAt: Date.now() }, { merge: true });
        tx.set(db.collection('walletTx').doc(`${orderRef.id}_release`), {
          uid: fresh.studentId, type: 'order_release', amountJmd: amount, orderId: orderRef.id, createdAt: Date.now(),
        });
        tx.update(orderRef, { paymentStatus: 'released' });
      }
    });
    return;
  }

  const amount = Number(order.totalAmount) || 0;
  let refundedOnCard = false;
  let refundFailReason = '';
  if (order.paymentMethod === 'card' && order.transactionId) {
    const result = await requestFygaroRefund(String(order.transactionId), amount);
    if (result.ok === false) {
      refundFailReason = result.reason;
    } else {
      refundedOnCard = true;
    }
  }

  await db.runTransaction(async tx => {
    const fresh = (await tx.get(orderRef)).data();
    if (!fresh || fresh.status !== 'cancelled' || fresh.paymentStatus !== 'paid') return; // already settled
    const wRef = walletRef(fresh.studentId);
    const target = await readFloatTarget(tx, fresh);
    writeFloat(tx, target, orderRef.id, foodCost(fresh), 1, 'Paid order cancelled');

    if (refundedOnCard) {
      tx.update(orderRef, { paymentStatus: 'refunded_card' });
      tx.set(db.collection('walletTx').doc(`${orderRef.id}_refund_card`), {
        uid: fresh.studentId, type: 'order_refund_card', amountJmd: 0, orderId: orderRef.id,
        note: 'Paid order cancelled: refunded to the original card via Fygaro', createdAt: Date.now(),
      });
      return;
    }

    // Fallback: card refund wasn't available/succeeded, or it was a tokens
    // order all along — credit tokens, same as the old WiPay-only design.
    tx.set(wRef, { balanceJmd: FieldValue.increment(amount), updatedAt: Date.now() }, { merge: true });
    tx.set(db.collection('walletTx').doc(`${orderRef.id}_refund`), {
      uid: fresh.studentId, type: 'order_refund', amountJmd: amount, orderId: orderRef.id,
      note: 'Paid order cancelled: refunded as tokens', createdAt: Date.now(),
    });
    tx.update(orderRef, {
      paymentStatus: 'refunded_tokens',
      ...(fresh.paymentMethod === 'card' ? {
        refundAttemptFailed: true,
        refundAttemptReason: refundFailReason,
        // If an admin later also refunds this in the Fygaro dashboard, the
        // student would be paid twice (tokens here + cash there) — this
        // note exists so whoever checks it catches that.
        refundAttemptNote: 'Automatic Fygaro refund failed; student was credited tokens instead. ' +
          'If you also refund this in the Fygaro dashboard, deduct the tokens first.',
      } : {}),
    });
  });
}

// ─── Pay an accepted order with tokens ────────────────────────────────────
// Once a dasher accepts, the student chooses: tokens (here) or card
// (createFygaroCheckout). Everything is checked and moved in ONE
// transaction, so a double tap, or tokens and card at the same time, can
// never charge twice: whichever lands first marks the order paid; a card
// payment that lands afterwards is credited back as tokens by the webhook.
// invoker 'public' is set explicitly: this function's first deploy timed out,
// and a callable only gets its "anyone signed in may call it" permission on
// a successful first deploy. Saying it here makes every deploy re-apply it.
// (Callers still need to be signed-in students; that's checked below.)
// SPEED: kept warm (minInstances 1) and able to take 40 payments at once per
// copy, so "Pay with tokens" never waits on a cold start.
export const payOrderWithTokens = onCall({
  ...APP_CHECK, invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 40, minInstances: 1, maxInstances: 20,
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
      throw new HttpsError('failed-precondition', 'You can pay once a runner accepts your order.');
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
      note: 'Paid with tokens after a runner accepted', createdAt: Date.now(),
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

// Rate limit: MAX_PAYMENT_STARTS card payments per student per
// PAYMENT_START_WINDOW_MS. The recent start times live in paymentStarts/{uid}
// (server only), updated in a transaction so parallel taps can't slip past.
async function countPaymentStart(uid: string): Promise<void> {
  const ref = db.collection('paymentStarts').doc(uid);
  const waitMs = await db.runTransaction(async tx => {
    const now = Date.now();
    const recent = (((await tx.get(ref)).data()?.times ?? []) as number[])
      .filter(t => t > now - PAYMENT_START_WINDOW_MS);
    if (recent.length >= MAX_PAYMENT_STARTS) return Math.min(...recent) + PAYMENT_START_WINDOW_MS - now;
    tx.set(ref, { times: [...recent, now], updatedAt: now });
    return 0;
  });
  if (waitMs > 0) {
    logger.warn('Payment starts rate limited', { uid });
    throw new HttpsError('resource-exhausted',
      `Too many payment attempts. Try again in ${Math.max(1, Math.ceil(waitMs / 60000))} minute${waitMs > 60000 ? 's' : ''}.`);
  }
}

// ─── Fygaro: start a payment ───────────────────────────────────────────────
// purpose 'order': pay for an accepted card order (student only, own order).
// purpose 'tokens': buy one of the TOKEN_PACKS.
// Unlike WiPay, there's no "request" network call to start a payment: the
// signed JWT itself IS the checkout request. We just build the link.
export const createFygaroCheckout = onCall({
  ...APP_CHECK, secrets: [FYGARO_API_SECRET], cpu: 1, memory: '512MiB', concurrency: 40, maxInstances: 20,
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
      throw new HttpsError('failed-precondition', 'You can pay once a runner accepts your order.');
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
  await countPaymentStart(uid);

  const payRef = db.collection('payments').doc();
  const totalSent = amountJmd.toFixed(2); // what we check the webhook's amount against later
  await payRef.set({
    uid, purpose, orderId, tokens, amountJmd, totalSent,
    status: 'pending', gateway: 'fygaro', createdAt: Date.now(),
  });

  const now = Math.floor(Date.now() / 1000);
  const jwt = signFygaroJwt({
    amount: totalSent,
    currency: 'JMD',
    custom_reference: payRef.id,
    nbf: now - 30, // small clock-skew allowance
    exp: now + Math.floor(CHECKOUT_JWT_TTL_MS / 1000),
  }, FYGARO_API_SECRET.value(), FYGARO_KEY_ID.value());

  const linkBase = FYGARO_LINK_URL.value();
  if (!linkBase) {
    logger.error('FYGARO_LINK_URL is not set — create the Fygaro Link in the dashboard first');
    await payRef.update({ status: 'failed', failReason: 'link_url_not_configured' });
    throw new HttpsError('unavailable', 'Card payments aren\'t set up yet. Try again later.');
  }
  const url = `${linkBase}${linkBase.includes('?') ? '&' : '?'}jwt=${jwt}`;

  logger.info('Fygaro checkout created', { paymentId: payRef.id, purpose, amountJmd, uid });
  return { url, paymentId: payRef.id };
});

// ─── Fygaro: the student comes back ────────────────────────────────────────
// Fygaro redirects the student's browser here with ?reference=<fygaro id>
// &custom_reference=<our payment id> after checkout. This endpoint is for
// NAVIGATION ONLY — it never applies a payment itself, because these query
// params aren't signed. The webhook (below) is the only thing that moves
// money; this just decides which screen to send the browser to, reading
// whatever state the webhook (or a fast admin resolution) has already set.
// Served at /api/fygaro-return through a Hosting rewrite (firebase.json).
export const fygaroReturn = onRequest({ invoker: 'public' }, async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const paymentId = String(q.custom_reference ?? '');
  const go = (status: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ status, pid: paymentId, ...extra });
    res.redirect(302, `${APP_URL}/payment-result?${params.toString()}`);
  };

  if (!/^[A-Za-z0-9]{10,40}$/.test(paymentId)) { go('error'); return; }
  const pay = (await db.collection('payments').doc(paymentId).get()).data();
  if (!pay) { go('error'); return; }
  const kind = pay.purpose === 'tokens' ? 'tokens' : 'order';
  const extra = pay.orderId ? { order: String(pay.orderId) } : {};

  if (pay.status === 'paid' || pay.status === 'credited') { go('success', { kind, ...extra }); return; }
  if (pay.status === 'failed') { go('failed', { kind, ...extra }); return; }
  // 'pending' (webhook hasn't arrived yet) or 'verified' (webhook arrived,
  // applying it is in flight or about to retry) — either way, the student
  // sees a "confirming" screen; the webhook (or retryVerifiedPayments) will
  // finish the job within seconds to minutes even if they close this tab.
  go('processing', { kind, ...extra });
});

// ─── Fygaro: webhook (the only thing that moves money) ─────────────────────
// Verifies the Fygaro-Signature header: "t=<unix seconds>,v1=<hex hmac>"
// where the hmac is HMAC-SHA256(secret, `${t}.${rawBody}`). Rejects replays
// older than WEBHOOK_REPLAY_WINDOW_S. See PAYMENTS_SETUP.md for the full
// verification writeup.
export const fygaroWebhook = onRequest({ secrets: [FYGARO_API_SECRET], invoker: 'public' }, async (req, res) => {
  const sigHeader = String(req.headers['fygaro-signature'] ?? '');
  const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));

  // Header shape: "t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>...]"
  // (more than one v1 lets Fygaro rotate signing secrets without a gap).
  const tMatch = sigHeader.match(/(?:^|,)\s*t=(\d+)/);
  const timestamp = tMatch ? Number(tMatch[1]) : NaN;
  const hashes = [...sigHeader.matchAll(/(?:^|,)\s*v1=([a-f0-9]+)/g)].map(m => m[1]);

  if (!timestamp || hashes.length === 0) {
    logger.error('Fygaro webhook missing signature header');
    res.status(400).send('missing signature');
    return;
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > WEBHOOK_REPLAY_WINDOW_S) {
    logger.error('Fygaro webhook signature too old', { timestamp });
    res.status(400).send('stale signature');
    return;
  }
  const expected = crypto.createHmac('sha256', FYGARO_API_SECRET.value())
    .update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const signatureOk = hashes.some(h => {
    const hBuf = Buffer.from(h, 'hex');
    return hBuf.length === expectedBuf.length && crypto.timingSafeEqual(hBuf, expectedBuf);
  });
  if (!signatureOk) {
    logger.error('Fygaro webhook FAILED verification — not applying', { timestamp });
    res.status(400).send('bad signature');
    return;
  }

  let body: any;
  try { body = JSON.parse(rawBody.toString('utf8')); } catch { body = req.body ?? {}; }
  const paymentId = String(body.customReference ?? '');
  const transactionId = String(body.transactionId ?? body.reference ?? '');
  const cardLast4 = String(body.card?.last4 ?? '').slice(-4);
  if (!/^[A-Za-z0-9]{10,40}$/.test(paymentId)) {
    // Signed by Fygaro, but we don't recognise the reference — nothing to
    // do, and nothing to retry either. 200 so Fygaro stops redelivering it.
    logger.warn('Fygaro webhook: unknown custom_reference', { paymentId, transactionId });
    res.status(200).send('ok');
    return;
  }

  const payRef = db.collection('payments').doc(paymentId);
  const state = await db.runTransaction(async tx => {
    const fresh = (await tx.get(payRef)).data();
    if (!fresh) return 'missing';
    if (['paid', 'credited', 'verified'].includes(fresh.status)) return fresh.status; // already handled
    tx.update(payRef, {
      status: 'verified',
      returnTransactionId: transactionId,
      returnTotal: String(body.amount ?? ''),
      returnCard: cardLast4,
      returnVerifiedAt: Date.now(),
    });
    return 'verified';
  });

  if (state === 'missing') {
    logger.warn('Fygaro webhook: payment doc missing', { paymentId });
    res.status(200).send('ok');
    return;
  }

  let outcome: string = state;
  if (state === 'verified') {
    try {
      outcome = (await applyVerifiedPayment(paymentId)) ?? 'verified';
    } catch (e: any) {
      // Saved as verified: retryVerifiedPayments applies it shortly.
      logger.error('Applying a verified Fygaro payment failed; will retry', { paymentId, message: e?.message });
    }
  }
  logger.info('Fygaro webhook applied', { paymentId, transactionId, outcome });
  res.status(200).send('ok');
});

// ─── Applying a verified payment (exactly once) ────────────────────────────
/**
 * Moves a 'verified' payment to 'paid' (tokens bought, or order paid) or
 * 'credited' (the order moved on while they paid: the money becomes tokens,
 * same fallback as a failed refund — the card was already charged, so this
 * is not itself a refund attempt). Safe to call any number of times: only a
 * 'verified' payment is applied, inside one transaction. Returns the
 * resulting status, or null if there was nothing to apply.
 */
export async function applyVerifiedPayment(paymentId: string): Promise<'paid' | 'credited' | null> {
  const payRef = db.collection('payments').doc(paymentId);
  return db.runTransaction(async tx => {
    const fresh = (await tx.get(payRef)).data();
    if (!fresh || fresh.status !== 'verified') return null;

    const paidFields = {
      transactionId: String(fresh.returnTransactionId ?? ''),
      chargedTotal: String(fresh.returnTotal ?? ''),
      card: String(fresh.returnCard ?? ''),
      paidAt: Date.now(),
    };

    if (fresh.purpose === 'tokens') {
      tx.set(walletRef(fresh.uid), { balanceJmd: FieldValue.increment(fresh.amountJmd), updatedAt: Date.now() }, { merge: true });
      tx.set(db.collection('walletTx').doc(`${paymentId}_topup`), {
        uid: fresh.uid, type: 'topup_card', amountJmd: fresh.amountJmd, paymentId, createdAt: Date.now(),
      });
      tx.update(payRef, { status: 'paid', ...paidFields });
      return 'paid' as const;
    }

    // Order payment.
    const orderRef = db.collection('orders').doc(String(fresh.orderId));
    const order = (await tx.get(orderRef)).data();
    const stillPayable = order && order.status === 'accepted' && order.paymentStatus === 'awaiting_payment';
    if (stillPayable) {
      const target = await readFloatTarget(tx, order!);
      // transactionId is kept on the order itself (not just payments/{id})
      // so settleCancelledOrder can hand it straight to requestFygaroRefund.
      tx.update(orderRef, { paymentStatus: 'paid', paidAt: Date.now(), paymentId, transactionId: paidFields.transactionId });
      tx.update(payRef, { status: 'paid', ...paidFields });
      writeFloat(tx, target, orderRef.id, foodCost(order!), -1, 'Card order paid');
      return 'paid' as const;
    }
    // Order was cancelled (or otherwise moved on) while they were paying.
    // Keep their money: credit it as tokens. (Not a refund attempt — the
    // card payment and the order's cancellation happened independently; the
    // student still gets their money back, just as tokens instead of a
    // card reversal, exactly as the old WiPay path always did.)
    tx.set(walletRef(fresh.uid), { balanceJmd: FieldValue.increment(fresh.amountJmd), updatedAt: Date.now() }, { merge: true });
    tx.set(db.collection('walletTx').doc(`${paymentId}_late`), {
      uid: fresh.uid, type: 'late_payment_credit', amountJmd: fresh.amountJmd, paymentId, orderId: fresh.orderId,
      note: 'Paid after the order was cancelled: added as tokens', createdAt: Date.now(),
    });
    tx.update(payRef, { status: 'credited', ...paidFields });
    return 'credited' as const;
  });
}

/** Scheduler: applies payments that were verified but not applied yet. */
export async function retryVerifiedPayments(): Promise<number> {
  const snap = await db.collection('payments').where('status', '==', 'verified').limit(100).get();
  let applied = 0;
  for (const d of snap.docs) {
    try {
      if (await applyVerifiedPayment(d.id)) applied++;
    } catch (e: any) {
      logger.error('Retrying a verified payment failed', { paymentId: d.id, message: e?.message });
    }
  }
  if (applied) logger.info(`Applied ${applied} verified payment(s) on retry`);
  return applied;
}

// ─── Admin: resolve a card payment Fygaro never confirmed to us ────────────
// Should be rare now that webhooks exist (unlike WiPay, which had no
// webhook at all and relied on this as the primary safety net) — kept as
// the fallback for a webhook that never arrives (an outage on either side,
// a misconfigured webhook URL, etc.). An admin checks the Fygaro dashboard
// and resolves it here:
//   paid: true  → applied exactly like a normal webhook (tokens or order)
//   paid: false → marked failed
// Every resolution records who did it and why.
export const adminResolvePayment = onCall({ ...APP_CHECK }, async (request) => {
  await requireAdmin(request.auth?.uid);
  const paymentId = String(request.data?.paymentId ?? '');
  const paid = request.data?.paid === true;
  const note = String(request.data?.note ?? '').trim().slice(0, 200);
  const fygaroTx = String(request.data?.transactionId ?? '').trim().slice(0, 100);
  if (!/^[A-Za-z0-9]{10,40}$/.test(paymentId)) throw new HttpsError('invalid-argument', 'Payment not found.');
  if (!note) throw new HttpsError('invalid-argument', 'Add a short note (e.g. "Checked Fygaro dashboard").');
  if (paid && !fygaroTx) throw new HttpsError('invalid-argument', 'Enter the Fygaro transaction ID from the Fygaro dashboard.');

  const payRef = db.collection('payments').doc(paymentId);
  const by = request.auth!.uid;
  const result = await db.runTransaction(async tx => {
    const fresh = (await tx.get(payRef)).data();
    if (!fresh) throw new HttpsError('not-found', 'Payment not found.');
    if (!['pending', 'review', 'failed'].includes(fresh.status)) {
      throw new HttpsError('failed-precondition', `This payment is already ${fresh.status}.`);
    }
    const resolution = { resolvedBy: by, resolvedNote: note, resolvedAt: Date.now() };
    if (paid) {
      tx.update(payRef, {
        status: 'verified', ...resolution,
        returnTransactionId: fygaroTx, returnTotal: String(fresh.totalSent ?? ''),
        returnCard: String(fresh.returnCard ?? ''), returnVerifiedAt: Date.now(),
      });
      return 'verified';
    }
    tx.update(payRef, { status: 'failed', failReason: `admin: ${note}`, ...resolution });
    return 'failed';
  });

  const status = result === 'verified' ? await applyVerifiedPayment(paymentId) : 'failed';
  logger.info('Payment resolved by admin', { paymentId, paid, status, by });
  return { status };
});

// ─── Admin: tokens and floats ──────────────────────────────────────────────
/** Add (positive) or remove (negative) tokens for a student. Up to 2 decimals. */
export const adminAdjustTokens = onCall({ ...APP_CHECK }, async (request) => {
  await requireAdmin(request.auth?.uid);
  const uid = String(request.data?.uid ?? '');
  const tokens = Number(request.data?.tokens);
  const note = String(request.data?.note ?? '').trim().slice(0, 200);
  if (!note) throw new HttpsError('invalid-argument', 'Add a short note (e.g. "Cash paid to Spencer").');
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
export const adminAdjustFloat = onCall({ ...APP_CHECK }, async (request) => {
  await requireAdmin(request.auth?.uid);
  const kind = request.data?.kind;
  const id = String(request.data?.id ?? '');
  const amountJmd = Math.round(Number(request.data?.amountJmd));
  const note = String(request.data?.note ?? '').trim().slice(0, 200);
  if (!note) throw new HttpsError('invalid-argument', 'Add a short note (e.g. "Cash paid to Spencer").');
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
