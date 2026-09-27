// functions/src/shared.ts
// Business rules and order vocabulary used by BOTH the server (this folder)
// and the app (imported as '../functions/src/shared' via constants/ and
// types/). One copy, so the two can't drift apart.
//
// It lives inside functions/ because `firebase deploy` uploads only this
// folder: the server can't import anything outside it, but the app can
// import from here. Keep this file dependency-free (no firebase-admin, no
// React Native) so it compiles in both.

// ─── Limits ────────────────────────────────────────────────────────────────
/** Orders a student can have in progress at once (verifyNewOrder enforces it). */
export const MAX_ACTIVE_ORDERS = 3;
/** Items (total quantity) allowed in one order. */
export const MAX_ITEMS_PER_ORDER = 20;

// ─── Money ─────────────────────────────────────────────────────────────────
/** 1 DormDash token = J$100. Balances are stored in whole J$. */
export const TOKEN_JMD = 100;
/** Token packs a student can buy by card. */
export const TOKEN_PACKS = [5, 10, 20, 50];

// ─── Time windows ──────────────────────────────────────────────────────────
/** After a dasher accepts, the student has this long to pay. */
export const PAY_WINDOW_MS = 10 * 60 * 1000;
/** A pending order nobody accepts is cancelled after this long. */
export const PENDING_TIMEOUT_MS = 30 * 60 * 1000;
export const minutes = (ms: number) => Math.round(ms / 60000);

// ─── Order vocabulary ──────────────────────────────────────────────────────
export type OrderStatus =
  | 'pending' | 'accepted' | 'picking_up' | 'on_the_way' | 'delivered' | 'cancelled';

/** Not finished yet (counts toward MAX_ACTIVE_ORDERS). */
export const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'accepted', 'picking_up', 'on_the_way'];
/** A dasher has it and is working on it. */
export const IN_DELIVERY_STATUSES: OrderStatus[] = ['accepted', 'picking_up', 'on_the_way'];
/** The happy path, in order (status rails in the app). */
export const STATUS_STEPS: OrderStatus[] = ['pending', 'accepted', 'picking_up', 'on_the_way', 'delivered'];

export type PaymentMethod = 'card' | 'tokens';
export type PaymentStatus =
  | 'unpaid' | 'reserved' | 'awaiting_payment' | 'paid' | 'released' | 'refunded_tokens';

/** Why an order was cancelled (orders/{id}.cancelReason). No reason = the student cancelled. */
export type CancelReason =
  | 'store_not_found' | 'store_closed' | 'item_unavailable' | 'invalid_item' | 'too_many_items'
  | 'empty_order' | 'rate_limited' | 'account_inactive' | 'too_many_active'
  | 'duplicate_order' | 'insufficient_tokens' | 'no_dasher' | 'payment_timeout' | 'admin';
