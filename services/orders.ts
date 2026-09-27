// services/orders.ts
// Every order write the app makes. Screens call these and never write
// orders directly, so the order lifecycle lives in one file.
//
// Every write goes through trackWrite (services/liveSync) so a Firestore
// reconnect never cuts one off mid-flight.
//
// These are not the security boundary: firestore.rules decides who may make
// each change, and functions/src/index.ts (verifyNewOrder) re-prices and
// rate-limits every new order on the server.

import {
  collection, doc, addDoc, getDocs, query, where, updateDoc, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { serverNow } from './serverClock';
import { trackWrite } from './liveSync';
import { MAX_ACTIVE_ORDERS, ACTIVE_STATUSES } from '../constants';
import { Order, OrderStatus } from '../types';

export { ACTIVE_STATUSES };

/** The one step a dasher can move an order forward (firestore.rules allows exactly these). */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted:   'picking_up',
  picking_up: 'on_the_way',
  on_the_way: 'delivered',
};

/**
 * Same condition as the student cancel rule in firestore.rules: before a
 * dasher accepts, or after they accept but before anything is paid.
 */
export const canStudentCancel = (order: Order) =>
  order.status === 'pending' ||
  (order.status === 'accepted' && order.paymentStatus === 'awaiting_payment');

// ─── Student ───────────────────────────────────────────────────────────────

export type PlaceOrderResult = { ok: true; id: string } | { ok: false; reason: 'too_many_active' };

/**
 * Places a pending order. Checks the student's in-progress limit first (the
 * server enforces the same limit in verifyNewOrder). Throws on network or
 * rules errors.
 */
export function placeOrder(order: Omit<Order, 'id'>): Promise<PlaceOrderResult> {
  return trackWrite<PlaceOrderResult>(async () => {
    const active = await getDocs(query(
      collection(db, 'orders'),
      where('studentId', '==', order.studentId),
      where('status', 'in', ACTIVE_STATUSES)
    ));
    if (active.size >= MAX_ACTIVE_ORDERS) return { ok: false, reason: 'too_many_active' };
    const ref = await addDoc(collection(db, 'orders'), order);
    return { ok: true, id: ref.id };
  });
}

/** Student cancels their own order. Throws if the rules refuse (e.g. already paid). */
export function cancelOrder(orderId: string): Promise<void> {
  return trackWrite(() => updateDoc(doc(db, 'orders', orderId), {
    status: 'cancelled',
    cancelledAt: Date.now(),
  }));
}

// ─── Dasher ────────────────────────────────────────────────────────────────

export type AcceptOutcome = 'ok' | 'gone' | 'cancelled' | 'taken';

/**
 * Reads and claims the order in one transaction, so the caller can say what
 * really happened instead of always blaming "another dasher". Throws if the
 * rules refuse (e.g. the order isn't server-verified yet).
 */
export async function acceptOrder(orderId: string, dasher: { uid: string; name: string }): Promise<AcceptOutcome> {
  const ref = doc(db, 'orders', orderId);
  return trackWrite(() => runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const cur = snap.data();
    if (!snap.exists() || !cur) return 'gone';
    if (cur.status === 'cancelled') return 'cancelled';
    if (cur.status !== 'pending' || cur.dasherId) return 'taken';
    tx.update(ref, {
      dasherId: dasher.uid,
      dasherName: dasher.name,
      status: 'accepted',
      acceptedAt: serverNow(),
    });
    return 'ok' as const;
  }));
}

/** Moves the dasher's active order one step forward. No-op at the last step. */
export async function advanceOrder(order: Order): Promise<void> {
  const next = NEXT_STATUS[order.status];
  if (!next) return;
  const update: Record<string, unknown> = { status: next };
  if (next === 'delivered') update.deliveredAt = serverNow();
  await trackWrite(() => updateDoc(doc(db, 'orders', order.id), update));
}
