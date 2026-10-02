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
// ─── Delivery fee: by walking distance ─────────────────────────────────────
// The fee depends on how far the dasher walks from the store's food spot to
// the delivery point (functions/src/campus.ts; measured walking routes).
// Up to FEE_BASE_DISTANCE_M costs MIN_DELIVERY_FEE_JMD; every further
// FEE_STEP_M (or part of it) adds FEE_STEP_JMD. On UWI Mona that runs from
// J$300 (next door) to J$600 (across campus). The server (verifyNewOrder)
// prices every order itself; the app only shows the same quote first.
// See PRICING.md for the table and the cost maths.
export const MIN_DELIVERY_FEE_JMD = 300;
export const FEE_BASE_DISTANCE_M = 400;
export const FEE_STEP_M = 200;
export const FEE_STEP_JMD = 50;
/** Safety cap, so a bad distance can never produce a silly fee. */
export const MAX_DELIVERY_FEE_JMD = 800;
/** When the store or the delivery point has no map position yet. */
export const FALLBACK_DELIVERY_FEE_JMD = 400;
/** Walking routes are longer than a straight line; used only for unmeasured pairs. */
export const STRAIGHT_LINE_WALK_FACTOR = 1.4;
/**
 * A measured route is never counted as more than this many times the
 * straight line. On UWI Mona routes are typically 1.44× the straight line;
 * far longer ones usually mean a shortcut is missing from the map, and the
 * student shouldn't pay for the map's gap (scripts/campus-distances.mjs).
 */
export const MAX_WALK_DETOUR = 1.8;

export function deliveryFeeForDistance(distanceM: number): number {
  const m = Math.max(0, Number(distanceM) || 0);
  const steps = Math.ceil(Math.max(0, m - FEE_BASE_DISTANCE_M) / FEE_STEP_M);
  return Math.min(MAX_DELIVERY_FEE_JMD, MIN_DELIVERY_FEE_JMD + steps * FEE_STEP_JMD);
}

// The split is not a fixed percentage: DormDash keeps PLATFORM_TAKE_BASE_JMD
// of the minimum fee plus PLATFORM_TAKE_RATE of every dollar above it
// (rounded to J$5), and the dasher gets the rest. J$300 → DormDash 50,
// dasher 250; J$500 → 90 / 410; J$600 → 110 / 490. Longer walks pay the
// dasher more in dollars and DormDash a little more too.
export const PLATFORM_TAKE_BASE_JMD = 50;
export const PLATFORM_TAKE_RATE = 0.2;

export function splitDeliveryFee(feeJmd: number): { dasherPayoutJmd: number; platformFeeJmd: number } {
  const fee = Math.max(0, Math.round(Number(feeJmd) || 0));
  const raw = PLATFORM_TAKE_BASE_JMD + PLATFORM_TAKE_RATE * Math.max(0, fee - MIN_DELIVERY_FEE_JMD);
  const platformFeeJmd = Math.min(fee, Math.round(raw / 5) * 5);
  return { dasherPayoutJmd: fee - platformFeeJmd, platformFeeJmd };
}

/** What the dasher earns for this order (fixed on the order; older orders: today's split of its fee). */
export const orderPayoutJmd = (o: { dasherPayoutJmd?: number; deliveryFee?: number }) =>
  typeof o.dasherPayoutJmd === 'number' ? o.dasherPayoutJmd : splitDeliveryFee(Number(o.deliveryFee) || 0).dasherPayoutJmd;

// At most this many card payments can be started per student per window
// (createFygaroCheckout). Stops a script from flooding Fygaro and payments/*.
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
  | 'unpaid' | 'reserved' | 'awaiting_payment' | 'paid' | 'released' | 'refunded_tokens'
  // Fygaro's programmatic refund API actually returned the money to the
  // student's card (see requestFygaroRefund in payments.ts). Distinct from
  // 'refunded_tokens', which is the fallback when that call fails or isn't
  // available on the account — never both for the same order.
  | 'refunded_card';

/** Why an order was cancelled (orders/{id}.cancelReason). No reason = the student cancelled. */
export type CancelReason =
  | 'store_not_found' | 'store_closed' | 'item_unavailable' | 'invalid_item' | 'too_many_items'
  | 'empty_order' | 'rate_limited' | 'account_inactive' | 'too_many_active'
  | 'duplicate_order' | 'insufficient_tokens' | 'no_dasher' | 'payment_timeout' | 'admin';
