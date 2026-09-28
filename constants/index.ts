// constants/index.ts
// App-wide constants. Colours, spacing and type live in constants/theme*.ts.

import { PAY_WINDOW_MS, PENDING_TIMEOUT_MS, minutes } from '../functions/src/shared';

// ─── BUSINESS RULES (shared with the server) ─────────────────────────
// One copy in functions/src/shared.ts, used by the Cloud Functions and
// re-exported here for the app, so limits, prices and time windows can't
// drift between the two. Change them there.
export {
  MAX_ACTIVE_ORDERS, MAX_ITEMS_PER_ORDER, TOKEN_JMD, TOKEN_PACKS, DELIVERY_FEE_JMD,
  PAY_WINDOW_MS, PENDING_TIMEOUT_MS, minutes,
  DASHER_IDLE_NUDGE_MS, DASHER_IDLE_GRACE_MS, DASHER_ACTIVITY_MS,
  OFFER_WAVE_SIZE, OFFER_WAVE_MS, OFFER_OPEN_WAVE,
  ACTIVE_STATUSES, IN_DELIVERY_STATUSES, STATUS_STEPS,
  GROUP_SIZES, GROUP_DISTANCES_M, GROUP_OFFER_MS, GROUP_MAX_STORES,
} from '../functions/src/shared';
/** For copy: "pay within 10 minutes". */
export const PAY_WINDOW_MIN = minutes(PAY_WINDOW_MS);
export const PENDING_TIMEOUT_MIN = minutes(PENDING_TIMEOUT_MS);

// How often the dasher's own map pin refreshes (stays on the phone).
export const LOCATION_UPDATE_INTERVAL_MS = 15000;

// ─── CURRENCY ────────────────────────────────────────────────────────
// All amounts in DormDash are Jamaican dollars.
export const formatJMD = (amount: number): string =>
  `J$${amount.toLocaleString('en-JM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── CAMPUS CONFIG ───────────────────────────────────────────────────
// Default coordinates when a student's GPS is denied/unavailable.
// Update per campus if DormDash expands beyond UWI Mona.
export const CAMPUS_CENTER = { latitude: 18.0179, longitude: -76.8099 };
