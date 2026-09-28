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
// ─── Delivery fee ──────────────────────────────────────────────────────────
// One delivery fee for every store, charged on every order (J$). The server
// (verifyNewOrder) always uses this, whatever the store doc or the app says.
export const DELIVERY_FEE_JMD = 250;

// At most this many card payments can be started per student per window
// (createPayment). Stops a script from flooding WiPay and payments/*.
export const MAX_PAYMENT_STARTS = 5;
export const PAYMENT_START_WINDOW_MS = 10 * 60 * 1000;
export const minutes = (ms: number) => Math.round(ms / 60000);

// ─── Idle dashers ──────────────────────────────────────────────────────────
// A dasher who stays "online" but hasn't opened DormDash for this long gets
// a "Still dashing?" notification…
export const DASHER_IDLE_NUDGE_MS = 2 * 60 * 60 * 1000;
// …and is taken offline if they still haven't opened it this long after.
export const DASHER_IDLE_GRACE_MS = 30 * 60 * 1000;
// While DormDash is open, the app records activity this often (must be
// well under DASHER_IDLE_NUDGE_MS).
export const DASHER_ACTIVITY_MS = 30 * 60 * 1000;

// ─── Wave dispatch ─────────────────────────────────────────────────────────
// A new order is offered to OFFER_WAVE_SIZE free dashers at a time (those
// offered an order least recently first). If nobody takes it, the next
// few get it every OFFER_WAVE_MS, and from wave OFFER_OPEN_WAVE on it is
// open to every dasher. With OFFER_WAVE_SIZE or fewer free dashers it goes
// to all of them at once. The order carries the schedule (offerAt: when
// each named dasher may take it; openToAllAt: when anyone may), which the
// dasher app and the Firestore rules both follow.
export const OFFER_WAVE_SIZE = 3;
export const OFFER_WAVE_MS = 45 * 1000;
export const OFFER_OPEN_WAVE = 3;

// ─── Group orders (dashers) ────────────────────────────────────────────────
// A dasher can ask DormDash to look for a group: GROUP_SIZES orders at once,
// from the stores they pick (or any store), whose stores are all within one
// of GROUP_DISTANCES_M of each other (0 = one store only). When the open
// orders make such a group, the server numbers it, holds it for that dasher
// for GROUP_OFFER_MS and sends a "Group found" alert. The group isn't
// reserved: if anyone takes one of its orders first, accepting the group
// fails ("no longer available"). See functions/src/groups.ts.
export const GROUP_SIZES = [2, 3];
export const GROUP_DISTANCES_M = [0, 250, 500, 1000];
export const GROUP_OFFER_MS = 2 * 60 * 1000;
/** The same set of orders isn't offered to the same dasher again within this. */
export const GROUP_REOFFER_MS = 10 * 60 * 1000;
/** At most this many stores in a group search filter. */
export const GROUP_MAX_STORES = 10;

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
